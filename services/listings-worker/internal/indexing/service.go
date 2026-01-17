package indexing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	repo "indexer/internal/database/postgresql/sqlc"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// Handles the business logic
type svc struct {
	indexer           Indexer
	repo              repo.Querier
	logger            *slog.Logger
	publicFilesBucket string
}

func NewService(indexer Indexer, repo repo.Querier, logger *slog.Logger, publicFilesBucket string) *svc {
	return &svc{
		indexer:           indexer,
		repo:              repo,
		logger:            logger,
		publicFilesBucket: publicFilesBucket,
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

	if !listing.ThumbnailPath.Valid {
		s.logger.Warn("Listing missing thumbnail URL, cannot index", "id", listingID)
		return nil
	}

	// Add the location of the public-files bucket to the thumbnail path
	listing.ThumbnailPath.String = s.publicFilesBucket + listing.ThumbnailPath.String

	var listingDimensions ListingDimensionsJSON
	if err := json.Unmarshal(listing.DimensionsMm, &listingDimensions); err != nil {
		s.logger.Error("Failed to unmarshal listing dimensions", "error", err, "listing_id", listingID)
		return err
	}

	document := map[string]interface{}{
		"id":            listingID,
		"title":         listing.Title,
		"description":   listing.Description,
		"thumbnail_url": listing.ThumbnailPath.String,
		"categories":    listing.Categories,
		"license":       listing.License,

		// TODO Properties
		"is_manifold":  false,
		"file_formats": []string{"stl"},
		// "embedding":    []float32{}, // Empty for now

		// Physical Properties
		"is_physical": listing.IsPhysical,
		"dim_x_mm":    listingDimensions.Width,
		"dim_y_mm":    listingDimensions.Height,
		"dim_z_mm":    listingDimensions.Depth,
		"total_weight_grams": func() *int64 {
			if listing.TotalWeightGrams.Valid {
				weight := int64(listing.TotalWeightGrams.Int32)
				return &weight
			}
			return nil
		}(),

		// Assembly
		"is_assembly_required":  listing.IsAssemblyRequired,
		"is_hardware_required":  listing.IsHardwareRequired,
		"recommended_materials": listing.RecommendedMaterials,
		"is_multicolor":         listing.IsMulticolor,
		"recommended_nozzle_temp_c": func() *int64 {
			if listing.RecommendedNozzleTempC.Valid {
				temp := int64(listing.RecommendedNozzleTempC.Int32)
				return &temp
			}
			return nil
		}(),
		"hardware_required": listing.HardwareRequired,

		"is_nsfw": listing.IsNsfw,

		// AI
		"is_ai_generated": listing.IsAiGenerated,
		"ai_model_name": func() *string {
			if listing.AiModelName.Valid {
				return &listing.AiModelName.String
			}
			return nil
		}(),

		// Remixing
		"parent_listing_id": func() *string {
			if listing.ParentListingID.Valid {
				// Option A: Use the String() method if your pgx version supports it
				s := fmt.Sprintf("%x-%x-%x-%x-%x",
					listing.ParentListingID.Bytes[0:4],
					listing.ParentListingID.Bytes[4:6],
					listing.ParentListingID.Bytes[6:8],
					listing.ParentListingID.Bytes[8:10],
					listing.ParentListingID.Bytes[10:16])
				return &s
			}
			return nil
		}(),
		"is_remix_allowed": listing.IsRemixingAllowed,

		// Social Signals
		"likes_count":     listing.LikesCount,
		"downloads_count": listing.DownloadsCount,
		"comments_count":  listing.CommentsCount,

		// Sales
		"price_min_unit": listing.PriceMinUnit,
		"sale_price":     listing.SalePrice,
		"sale_end_timestamp": func() *int64 {
			if listing.SaleEndTimestamp.Valid {
				timestamp := listing.SaleEndTimestamp.Time.Unix()
				return &timestamp
			}
			return nil
		}(),
		"is_sale_active": listing.IsSaleActive,
		"sale_name": func() *string {
			if listing.SaleName.Valid {
				return &listing.SaleName.String
			}
			return nil
		}(),
		"currency":        listing.Currency,
		"seller_username": listing.SellerUsername,
		"seller_name":     listing.SellerName,
		"seller_id":       listing.SellerID.String(),
		"seller_verified": listing.SellerVerified,
		"created_at":      listing.CreatedAt.Time.Unix(),
		"updated_at":      listing.UpdatedAt.Time.Unix(),
	}

	if err := s.indexer.Upsert(ctx, "listings", document); err != nil {
		// TRANSIENT ERROR: Search Engine is down. Return err to Retry.
		s.logger.Error("Failed to upsert listing", "error", err)
		return err
	}

	s.logger.Info("Successfully indexed listing", "listing_id", listingID)
	// Update the indexed_at timestamp in the DB
	if err := s.repo.MarkListingAsIndexed(ctx, listingUUID); err != nil {
		s.logger.Error("Failed to update listing indexed_at timestamp", "error", err, "listing_id", listingID)
		return err
	}

	return nil
}

type ListingDimensionsJSON struct {
	Width  int `json:"width"`  // Maps to DimX
	Depth  int `json:"depth"`  // Maps to DimY
	Height int `json:"height"` // Maps to DimZ
}
