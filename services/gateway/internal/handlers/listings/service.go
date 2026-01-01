package listings

import (
	"context"
	"encoding/json"
	"fmt"
	"gateway/internal/auth"
	"gateway/internal/database/postgresql"
	repo "gateway/internal/database/postgresql/sqlc"
	"gateway/internal/errors"
	"gateway/internal/events"
	"gateway/internal/storage"
	"log/slog"
	"math/big"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"go.opentelemetry.io/otel/trace"
)

var listings []byte

type ListingsService interface {
	CreateListing(ctx context.Context, userInfo auth.UserInfo, req *CreateListingRequest) (repo.Listing, error)
	GetListingsForUser(ctx context.Context, userInfo auth.UserInfo) ([]ListingResponse, error)
	DeleteListing(ctx context.Context, userInfo auth.UserInfo, listingID string) error
}

type svc struct {
	repo         *repo.Queries
	logger       *slog.Logger
	db           postgresql.DBPool
	storage      storage.Provider
	eventHandler *events.EventHandler
}

func NewListingsService(repo *repo.Queries, db postgresql.DBPool, logger *slog.Logger, storage storage.Provider, eventHandler *events.EventHandler) ListingsService {
	return &svc{
		repo:         repo,
		db:           db,
		logger:       logger,
		storage:      storage,
		eventHandler: eventHandler,
	}
}

type fileEventData struct {
	ListingID string
	FileID    string
	FilePath  string
	FileKey   string
	FileType  string
}

func (s *svc) CreateListing(ctx context.Context, userInfo auth.UserInfo, req *CreateListingRequest) (repo.Listing, error) {
	spanContext := trace.SpanContextFromContext(ctx)
	traceIDVal := ""
	if spanContext.IsValid() {
		traceIDVal = spanContext.TraceID().String()
	}

	s.logger.InfoContext(ctx, "Creating listing", "user", userInfo.ID, "title", req.Title)
	if err := req.Validate(userInfo.ID); err != nil {
		s.logger.WarnContext(ctx, "Validation failed", "error", err)
		return repo.Listing{}, err
	}

	// 1. Convert UserID (String -> UUID)
	var userUUID pgtype.UUID
	if err := userUUID.Scan(userInfo.ID); err != nil {
		s.logger.WarnContext(ctx, "Invalid user ID", "error", err)
		return repo.Listing{}, errors.New(errors.ErrInternal, "Invalid user ID", fmt.Errorf("invalid user uuid: %w", err))
	}

	// 3. Start Transaction
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return repo.Listing{}, errors.New(errors.ErrInternal, "Failed to start transaction. Please try again later.", fmt.Errorf("failed to begin transaction: %w", err))
	}
	defer tx.Rollback(ctx)

	qtx := s.repo.WithTx(tx)

	// 4. Create Listing Record
	listing, err := qtx.CreateListing(ctx, repo.CreateListingParams{
		UserID:         userUUID,
		Title:          req.Title,
		Description:    pgtype.Text{String: req.Description, Valid: true},
		Currency:       req.Currency,
		PriceMinUnit:   pgtype.Numeric{Int: big.NewInt(req.PriceMinUnit), Exp: 0, Valid: true},
		Categories:     req.Categories,
		License:        req.License,
		ClientID:       userInfo.AuthorizedParty,
		TraceID:        traceIDVal,
		SellerName:     userInfo.Email,
		SellerUsername: userInfo.Username,
		ThumbnailPath:  pgtype.Text{String: req.Files[0].Path, Valid: true},
		Status:         repo.NullListingStatus{ListingStatus: repo.ListingStatusPENDINGVALIDATION, Valid: true},
	})

	if err != nil {
		s.logger.ErrorContext(ctx, "Failed to create listing", "error", err)
		return repo.Listing{}, errors.New(errors.ErrInternal, "Failed to create listing. Please try again later.", fmt.Errorf("failed to create listing: %w", err))
	}

	var eventsToPublish []fileEventData

	// 5. Handle File Uploads (Fan-out)
	// Process Models
	for _, file := range req.Files {
		var dbFileType repo.FileType
		switch strings.ToLower(file.Type) {
		case "model":
			dbFileType = repo.FileTypeMODEL
		case "image":
			dbFileType = repo.FileTypeIMAGE
		default:
			return repo.Listing{}, errors.New(errors.ErrInvalidInput, "Unsupported file type: "+file.Type, nil)
		}

		var sizeNumeric pgtype.Int8
		if err := sizeNumeric.Scan(file.Size); err != nil {
			return repo.Listing{}, errors.New(errors.ErrInvalidInput, "Invalid file size.", err)
		}

		fileRecord, err := qtx.CreateListingFile(ctx, repo.CreateListingFileParams{
			ListingID: listing.ID, // Link to the new listing
			FilePath:  file.Path,
			FileType:  dbFileType,
			FileSize:  sizeNumeric,
			Status:    repo.NullFileStatus{FileStatus: repo.FileStatusPENDING, Valid: true},
		})

		if err != nil {
			s.logger.ErrorContext(ctx, "Failed to save listing file", "error", err)
			return repo.Listing{}, errors.New(errors.ErrInternal, "Failed to save model file. Please try again later.", fmt.Errorf("failed to save model file: %w", err))
		}

		eventsToPublish = append(eventsToPublish, fileEventData{
			ListingID: fmt.Sprintf("%x", listing.ID.Bytes),
			FileID:    fmt.Sprintf("%x", fileRecord.ID.Bytes),
			FilePath:  file.Path,
			FileType:  file.Type,
			FileKey:   file.Path,
		})
	}

	// Only commit if everything above succeeded
	if err := tx.Commit(ctx); err != nil {
		s.logger.ErrorContext(ctx, "Failed to commit transaction", "error", err)
		return repo.Listing{}, errors.New(errors.ErrInternal, "Failed to finalise transaction", err)
	}

	// 6. Publish Events to Validate Files
	s.logger.DebugContext(ctx, "Publishing file validation events", "count", len(eventsToPublish))
	for _, evt := range eventsToPublish {
		payload := events.StartFileValidationEvent{
			ListingID: evt.ListingID,
			FileID:    evt.FileID,
			UserID:    userInfo.ID,
			FileType:  evt.FileType,
			FileKey:   evt.FileKey,
			TraceID:   traceIDVal,
		}

		// Note: In production, if this fails, we should rely on a "sweeper" or the user to retry.
		if err := s.eventHandler.RaiseStartFileValidationEvent(payload); err != nil {
			s.logger.ErrorContext(ctx, "Failed to publish file validation event",
				"file_id", evt.FileID,
				"file_type", evt.FileType,
				"file_key", evt.FileKey,
				"listing_id", evt.ListingID,
				"trace_id", traceIDVal,
				"error", err,
			)
		} else {
			s.logger.DebugContext(ctx, "Published file validation event",
				"file_id", evt.FileID,
				"file_type", evt.FileType,
				"file_key", evt.FileKey,
				"listing_id", evt.ListingID,
				"trace_id", traceIDVal,
			)
		}
	}

	return listing, nil
}

func (s *svc) GetListingsForUser(ctx context.Context, userInfo auth.UserInfo) ([]ListingResponse, error) {
	var userUUID pgtype.UUID
	if err := userUUID.Scan(userInfo.ID); err != nil {
		return nil, errors.New(errors.ErrInvalidInput, "Invalid user ID provided", err)
	}

	rows, err := s.repo.GetListingsByUserID(ctx, userUUID)
	if err != nil {
		return nil, errors.New(errors.ErrInternal, "Unable to get the users listings", err)
	}

	// 3. Transform Rows -> Responses
	response := make([]ListingResponse, len(rows))

	for i, row := range rows {
		// A. Unmarshal the files JSON byte array into our Go struct slice
		var files []ListingFileDTO
		if len(row.Files) > 0 {
			if err := json.Unmarshal(row.Files, &files); err != nil {
				// Log this error but don't fail the request? Or fail?
				// Usually safer to just log and return empty files array to keep UI working.
				fmt.Printf("error unmarshaling files for listing %s: %v\n", row.ID, err)
				files = []ListingFileDTO{}
			}

			// Remove the file urls / paths / keyss that have not been approved / validated yet.
			filteredFiles := make([]ListingFileDTO, 0, len(files))
			for _, f := range files {
				if f.Status != "VALID" {
					filteredFiles = append(filteredFiles, ListingFileDTO{
						ID:       f.ID,
						Url:      nil,
						Type:     f.Type,
						Status:   f.Status,
						Size:     f.Size,
						Metadata: f.Metadata,
					})
				} else {
					var path *string
					signedUrl, err := s.storage.PresignGet(ctx, storage.BucketPublic, *f.Url, time.Minute*10)
					if err != nil {
						fmt.Printf("error generating signed url for file %s: %v\n", *f.Url, err)
						path = nil
					} else {
						path = &signedUrl
					}
					filteredFiles = append(filteredFiles, ListingFileDTO{
						ID:       f.ID,
						Url:      path,
						Type:     f.Type,
						Status:   f.Status,
						Size:     f.Size,
						Metadata: f.Metadata,
					})
				}
			}
			files = filteredFiles
		}

		response[i] = ListingResponse{
			ID:           fmt.Sprintf("%x", row.ID.Bytes),
			Title:        row.Title,
			Description:  row.Description.String,
			PriceMinUnit: row.PriceMinUnit.Int.Int64(),
			Files:        files,
			CreatedAt:    row.CreatedAt.Time,
			UpdatedAt:    row.UpdatedAt.Time,
			DeletedAt: func() *time.Time {
				if row.DeletedAt.Valid {
					t := row.DeletedAt.Time
					return &t
				}
				return nil
			}(),
			Categories: row.Categories,
			License:    row.License,
			ThumbnailPath: func() *string {
				if row.ThumbnailPath.Valid {
					return &row.ThumbnailPath.String
				}
				return nil
			}(),
			LastIndexedAt: func() *time.Time {
				if row.LastIndexedAt.Valid {
					t := row.LastIndexedAt.Time
					return &t
				}
				return nil
			}(),
			Status: func() string {
				if row.Status.Valid {
					return string(row.Status.ListingStatus)
				}
				return "UNKNOWN"
			}(),
			SellerName:     row.SellerName,
			SellerUsername: row.SellerUsername,
		}
	}

	return response, nil
}

func (req *CreateListingRequest) Validate(userId string) *errors.AppError {
	// A. Price & Currency Validation
	// 1. Sanity Check: Price cannot be negative.
	// We ALLOW 0 because that represents a "Free" listing.
	if req.PriceMinUnit < 0 {
		return errors.New(errors.ErrInvalidInput, "Price cannot be negative", nil)
	}

	// 2. Currency Validation
	// Only validate currency if price > 0 (Free items might default to USD or have no currency)
	if req.PriceMinUnit > 0 {
		switch strings.ToLower(req.Currency) {
		case "usd", "gbp":
			// valid
		default:
			return errors.New(errors.ErrInvalidInput, "Currency must be 'usd' or 'gbp'", nil)
		}
	}

	// B. Basic Fields
	titleLen := len(strings.TrimSpace(req.Title))
	if titleLen < 5 || titleLen > 100 {
		return errors.New(errors.ErrInvalidInput, "Title must be between 5 and 100 characters", nil)
	}

	if len(req.Categories) == 0 {
		return errors.New(errors.ErrInvalidInput, "At least one category is required", nil)
	}

	// C. Validate Files
	if len(req.Files) == 0 {
		return errors.New(errors.ErrInvalidInput, "At least one file is required", nil)
	}

	// Track if we have the required file types
	hasModel := false
	hasImage := false

	for _, f := range req.Files {
		if !checkUserOwnsFile(userId, f.Path) {
			fmt.Printf("User %s does not own file %s\n", userId, f.Path)

			return errors.New(errors.ErrInvalidInput, "User does not own the file", nil)
		}

		if f.Path == "" {
			return errors.New(errors.ErrInvalidInput, "File path cannot be empty", nil)
		}
		if f.Size <= 0 {
			return errors.New(errors.ErrInvalidInput, "File size must be positive", nil)
		}

		t := strings.ToLower(f.Type)
		if t == "model" {
			hasModel = true
		} else if t == "image" {
			hasImage = true
		} else {
			return errors.New(errors.ErrInvalidInput, fmt.Sprintf("Invalid file type '%s'. Must be 'model' or 'image'", f.Type), nil)
		}
	}

	// D. Strict Requirement: Must have at least 1 Model AND 1 Image
	// (This matches your frontend toast: "Please upload at least one product file and one gallery image")
	if !hasModel {
		return errors.New(errors.ErrInvalidInput, "You must upload at least one 3D model file", nil)
	}
	if !hasImage {
		return errors.New(errors.ErrInvalidInput, "You must upload at least one image", nil)
	}

	return nil
}

/**
 * checkUserOwnsFile checks if the given user ID matches the owner ID extracted from the file path.
 * Assumes file path format is YYYY/MM/DD/userId/listingDraftID/fileType/filename.ext
 */
func checkUserOwnsFile(userID string, filePath string) bool {
	parts := strings.SplitN(filePath, "/", 6)
	if len(parts) < 6 {
		return false
	}

	ownerID := parts[3]
	return ownerID == userID
}

func (s *svc) DeleteListing(ctx context.Context, userInfo auth.UserInfo, listingID string) error {

	var id pgtype.UUID
	if err := id.Scan(listingID); err != nil {
		return fmt.Errorf("invalid listing id: %w", err)
	}

	var userID pgtype.UUID
	if err := userID.Scan(userInfo.ID); err != nil {
		return fmt.Errorf("invalid user id: %w", err)
	}

	// Delete the listing from the database for the user
	_, err := s.repo.SoftDeleteListing(ctx, repo.SoftDeleteListingParams{
		UserID: userID,
		ID:     id,
	})
	if err != nil {
		return fmt.Errorf("failed to delete listing: %w", err)
	}

	return nil
}
