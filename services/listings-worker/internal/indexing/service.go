package indexing

import (
	"context"
	"errors"
	repo "indexer/internal/database/postgresql/sqlc"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// Handles the business logic
type svc struct {
	indexer Indexer
	repo    repo.Querier
	logger  *slog.Logger
}

func NewService(indexer Indexer, repo repo.Querier, logger *slog.Logger) *svc {
	return &svc{
		indexer: indexer,
		repo:    repo,
		logger:  logger,
	}
}

func (s *svc) IndexListing(ctx context.Context, listingID string) error {
	s.logger.Info("Indexing listing", "listing_id", listingID)

	var listingUUID pgtype.UUID
	if err := listingUUID.Scan(listingID); err != nil {
		// PERMANENT ERROR: This UUID will never be valid.
		// Return nil to Ack/Discard.
		s.logger.Error("Invalid UUID format, discarding", "id", listingID)
		return nil
	}

	// Fetch listing from DB
	listing, err := s.repo.GetListingByID(ctx, listingUUID)
	if err != nil {

		if errors.Is(err, pgx.ErrNoRows) {
			s.logger.Warn("Listing not found in DB (might be deleted), skipping index", "id", listingID)
			// Return nil to Ack. We can't index what doesn't exist.
			return nil
		}

		s.logger.Error("Failed to fetch listing from DB", "error", err, "listing_id", listingID)
		return err
	}

	document := map[string]interface{}{
		"id":              listingID,
		"title":           listing.Title,
		"description":     listing.Description,
		"categories":      listing.Categories,
		"license":         listing.License,
		"thumbnail_url":   listing.ThumbnailPath,
		"price":           listing.PriceMinUnit.Int.Int64(),
		"currency":        listing.Currency,
		"seller_username": listing.SellerUsername,
		"seller_name":     listing.SellerName,
		"created_at":      listing.CreatedAt.Time.Unix(),

		// Add other relevant fields
	}

	if err := s.indexer.Upsert(ctx, "listings", document); err != nil {
		// TRANSIENT ERROR: Search Engine is down. Return err to Retry.
		s.logger.Error("Failed to upsert listing", "error", err)
		return err
	}

	return nil
}
