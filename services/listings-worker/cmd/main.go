package main

import (
	"context"
	"errors"
	"fmt"
	repo "indexer/internal/database/postgresql/sqlc"
	"indexer/internal/events"
	"indexer/internal/indexing"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	Env          string
	Port         string
	DatabaseURL  string
	NatsURL      string
	TypesenseURL string
	TypesenseKey string
	EventsConfig *events.EventConfig
}

func main() {
	handler := slog.NewJSONHandler(os.Stdout, nil)
	logger := slog.New(handler)
	slog.SetDefault(logger) // Set global logger

	if err := run(logger); err != nil {
		slog.Error("Application terminated with error", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 2. Load Configuration
	cfg := loadConfig()
	logger.Info("Starting Listings Worker", "env", cfg.Env)

	// 3. Initialize Database (Postgres)
	dbPool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("failed to connect to db: %w", err)
	}
	defer dbPool.Close()

	if err := dbPool.Ping(ctx); err != nil {
		return fmt.Errorf("failed to ping db: %w", err)
	}

	// 4. Initialize NATS (Event Bus)
	bus, err := events.NewNATSBus(cfg.NatsURL, logger)
	if err != nil {
		return fmt.Errorf("failed to connect to nats: %w", err)
	}

	// 5. Initialize Search Indexer (Typesense)
	indexer := indexing.NewClient(cfg.TypesenseKey, cfg.TypesenseURL)

	// 6. Initialize Service Layer
	// Wire up the SQLC repository and the Indexer
	queries := repo.New(dbPool)
	svc := indexing.NewService(indexer, queries, logger)

	reader := events.NewEventReader(bus, cfg.EventsConfig, logger)

	// 8. Start Subscriptions
	// This starts the background workers processing messages
	err = reader.SubscribeToIndexListingEvents(func(evt events.IndexListingEvent) error {
		// Bridge the event payload to the service logic
		return svc.IndexListing(context.Background(), evt.ListingID)
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to events: %w", err)
	}

	logger.Info("Worker is running and listening for events...")

	// 9. Start Health Check Server (For Kubernetes)
	// Run in a goroutine so it doesn't block
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: healthHandler(dbPool, bus), // Simple handler checking DB/NATS ping
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("Health server failed", "error", err)
		}
	}()

	// 10. Graceful Shutdown Handler
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Block until signal received
	sig := <-quit
	logger.Info("Shutting down worker...", "signal", sig.String())

	// Create a timeout context for cleanup (e.g. 10 seconds)
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	// A. Stop accepting HTTP health checks
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("Health server shutdown error", "error", err)
	}

	// B. Drain NATS connection (Finish processing in-flight messages)
	// This is CRITICAL: It ensures we don't kill a job halfway through indexing
	if err := bus.Close(); err != nil {
		logger.Error("NATS drain error", "error", err)
	}

	// C. Close DB Pool (handled by defer, but explicit here for clarity order)
	dbPool.Close()

	logger.Info("Shutdown complete.")
	return nil
}

func loadConfig() Config {
	// Helper to get env with fallback
	get := func(key, fallback string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		return fallback
	}

	return Config{
		Env:          get("INDEX_WORKER_ENV", "production"),
		Port:         get("INDEX_WORKER_PORT", "8081"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		NatsURL:      os.Getenv("NATS_URL"),
		TypesenseURL: os.Getenv("TYPESENSE_URL"),
		TypesenseKey: os.Getenv("TYPESENSE_API_KEY"),
		EventsConfig: events.NewEventConfig(),
	}
}

// healthHandler provides a simple /healthz endpoint
func healthHandler(db *pgxpool.Pool, bus events.Bus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		// Check DB
		if err := db.Ping(ctx); err != nil {
			http.Error(w, "Database unavailable", http.StatusServiceUnavailable)
			return
		}

		// (Optional) Check NATS status if exposed by your Bus struct
		// if !bus.IsConnected() { ... }

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}
}
