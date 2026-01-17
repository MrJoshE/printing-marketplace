package main

import (
	"context"
	"gateway/internal/auth"
	"gateway/internal/cache"
	"gateway/internal/events"
	"gateway/internal/handlers/files"
	"gateway/internal/handlers/listings"
	"gateway/internal/idempotency"
	"gateway/internal/storage"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	repo "gateway/internal/database/postgresql/sqlc"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
)

type application struct {
	config        config
	conn          *pgxpool.Pool
	cache         *cache.RedisClient
	authenticator *auth.Authenticator
	storage       storage.Provider
	eventBus      events.Bus
	logger        *slog.Logger
}

type config struct {
	events                    *events.EventConfig
	frontend                  string
	addr                      string
	fileConstraints           map[string]files.FileConstraint
	fileValidationWindowHours int
	publicFilesUrl            string
}

type databaseConfig struct {
	addr string
}

type authorizationConfig struct {
	url      string
	realm    string
	clientID string
	secret   string
}

type eventBusConfig struct{}

func (app *application) mount() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{app.config.frontend},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "Idempotency-Key"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))
	slog.Info("Allowed origins", "origin", app.config.frontend)

	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("looking gud bruv"))
	})

	idempotencyStore := idempotency.NewStore(app.cache)

	repo := repo.New(app.conn)
	filesService := files.NewFileService(app.storage, app.config.fileValidationWindowHours, app.config.fileConstraints, app.eventBus)
	filesHandler := files.NewFileHandler(filesService)

	eventHandler := events.NewEventHandler(app.eventBus, app.config.events, app.logger)

	listingsService := listings.NewListingsService(repo, app.conn, app.logger, app.storage, eventHandler, app.cache, app.config.publicFilesUrl)
	listingsHandler := listings.NewListingsHandler(listingsService)

	r.Group(func(r chi.Router) {
		// Public routes
		r.Use(middleware.Recoverer)

		r.Get("/listings/{id}", listingsHandler.GetListingByID)
	})

	r.Group(func(r chi.Router) {
		r.Use(middleware.Recoverer)
		r.Use(idempotency.Idempotency(idempotencyStore))

		// Authenticated routes
		r.Use(app.authenticator.Middleware)
		r.Post("/files/presign", filesHandler.PresignUpload)

		r.Post("/listings", listingsHandler.CreateListing)
		r.Get("/listings", listingsHandler.GetListingsForUser)
		r.Delete("/listings/{id}", listingsHandler.DeleteListing)
		r.Put("/listings/{id}", listingsHandler.UpdateListings)

		// Needs rate limiting in future

		r.Get("/authenticated", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("you are authenticated!"))
		})
	})

	return r
}

func (app *application) run(h http.Handler) error {
	svr := &http.Server{
		Addr:         app.config.addr,
		Handler:      h,
		WriteTimeout: time.Second * 30,
		ReadTimeout:  time.Second * 10,
		IdleTimeout:  time.Minute * 1,
	}

	slog.Info("Starting server on " + app.config.addr)
	go func() {
		if err := svr.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Listen: %s\n", err)
		}
	}()

	// Wait for Interrupt Signal (Ctrl+C or Docker Stop)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Create a deadline to wait for active requests (e.g. 10 seconds)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Shutdown HTTP
	if err := svr.Shutdown(ctx); err != nil {
		log.Fatal("Server Forced to Shutdown:", err)
		return err
	}

	// Shutdown NATS (Drain is better than Close)
	// Drain allows in-flight messages to finish processing
	if err := app.eventBus.Drain(); err != nil {
		log.Fatal("NATS Drain failed:", err)
		return err
	}

	// Close DB Connection Pool
	app.conn.Close()

	// Close Redis Client
	if err := app.cache.Close(); err != nil {
		log.Fatal("Redis Close failed:", err)
		return err
	}

	log.Println("Server Exited Properly")
	return nil
}
