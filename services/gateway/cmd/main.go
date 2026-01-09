package main

import (
	"context"
	"gateway/internal/auth"
	"gateway/internal/cache"
	"gateway/internal/events"
	"gateway/internal/handlers/files"
	"gateway/internal/storage"
	"gateway/internal/telemetry"
	"strconv"

	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	// Use JSON traced logging
	baseHandler := slog.NewJSONHandler(os.Stdout, nil)
	logger := slog.New(telemetry.NewTraceHandler(baseHandler))
	slog.SetDefault(logger)

	eventsConfig := events.NewEventConfig()

	config := config{
		events:         eventsConfig,
		frontend:       os.Getenv("DOMAIN_NAME"),
		addr:           ":" + os.Getenv("API_PORT"),
		publicFilesUrl: os.Getenv("PUBLIC_FILES_URL"),
		fileConstraints: map[string]files.FileConstraint{
			"image": {
				MaxSize:          5 * 1024 * 1024, // 5MB
				AllowedMimeTypes: []string{"image/jpeg", "image/png", "image/gif"},
				Prefix:           "images/",
			},
			"model": {
				MaxSize:          50 * 1024 * 1024, // 50MB
				AllowedMimeTypes: []string{"application/vnd.ms-pki.stl", "application/octet-stream", "application/vnd.ms-pki.3mf", "model/stl"},
				Prefix:           "models/",
			},
		},
		fileValidationWindowHours: 1,
	}

	poolSize, _ := strconv.Atoi(os.Getenv("REDIS_POOL_SIZE"))
	MinIdleConns, _ := strconv.Atoi(os.Getenv("REDIS_MIN_IDLE_CONNS"))

	cacheCfg := cache.Config{
		Addr:         os.Getenv("REDIS_ADDR"),
		Password:     os.Getenv("REDIS_PASSWORD"),
		DB:           0,
		PoolSize:     poolSize,
		MinIdleConns: MinIdleConns,
	}
	slog.Info("Connecting to Redis cache", "addr", os.Getenv("REDIS_ADDR"))
	rdb, err := cache.NewRedisClient(cacheCfg)
	if err != nil {
		slog.Error("Failed to connect to Redis", "error", err)
		os.Exit(1)
	}

	dsn := os.Getenv("DB_DSN")
	slog.Info("Connecting to database", "addr", dsn)
	conn, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		slog.Error("Failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer conn.Close()

	slog.Info("Connecting to object storage", "endpoint", os.Getenv("S3_ENDPOINT"))

	storage, err := storage.NewMinioProvider(
		os.Getenv("S3_ENDPOINT"),
		os.Getenv("GATEWAY_S3_ACCESS_KEY_ID"),
		os.Getenv("GATEWAY_S3_SECRET_ACCESS_KEY"),
		os.Getenv("S3_USE_SSL") == "true",
	)
	if err != nil {
		slog.Error("Failed to initialize MinIO provider", "error", err)
		os.Exit(1)
	}

	slog.Info("Connecting to event bus", "endpoint", os.Getenv("NATS_ENDPOINT"))
	eventBus, err := events.NewNATSBus(os.Getenv("NATS_ENDPOINT"), logger)

	if err != nil {
		slog.Error("Failed to initialize event bus", "error", err)
		os.Exit(1)
	}

	authorizationConfig := authorizationConfig{
		url:      os.Getenv("AUTHORIZATION_URL"),
		realm:    os.Getenv("AUTHORIZATION_REALM"),
		clientID: os.Getenv("AUTHORIZATION_CLIENT_ID"),
		secret:   os.Getenv("AUTHORIZATION_CLIENT_SECRET"),
	}
	slog.Info("Connecting to authorization service", "url", authorizationConfig.url)

	authenticator, err := auth.NewAuthenticator(context.Background(), authorizationConfig.url, authorizationConfig.clientID)
	if err != nil {
		// Handle error appropriately, e.g., log and return
		slog.Error("Failed to initialize authenticator", "error", err)
		os.Exit(1)
	}

	app := &application{
		conn:          conn,
		config:        config,
		authenticator: authenticator,
		eventBus:      eventBus,
		storage:       storage,
		logger:        logger,
		cache:         rdb,
	}

	if err := app.run(app.mount()); err != nil {
		slog.Error("Failed to start server", "error", err)
		os.Exit(1)
	}
}
