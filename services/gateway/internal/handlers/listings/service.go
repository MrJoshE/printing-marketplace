package listings

import (
	"context"
	"encoding/json"
	"fmt"
	"gateway/internal/auth"
	"gateway/internal/cache"
	"gateway/internal/database/postgresql"
	repo "gateway/internal/database/postgresql/sqlc"
	"gateway/internal/errors"
	"gateway/internal/events"
	"gateway/internal/storage"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"go.opentelemetry.io/otel/trace"
)

var listings []byte

// Standard TTL: 30 mins to 1 hour is usually fine for Listings
const ListingCacheTTL = time.Hour * 1

type ListingsService interface {
	CreateListing(ctx context.Context, userInfo auth.UserInfo, req *CreateListingRequest) (repo.Listing, error)
	GetListingsForUser(ctx context.Context, userInfo auth.UserInfo) ([]ListingResponse, error)
	DeleteListing(ctx context.Context, userInfo auth.UserInfo, listingID string) error
	UpdateListing(ctx context.Context, userInfo auth.UserInfo, listingID string, req *UpdateListingRequest) (*repo.Listing, error)
	GetListingByID(ctx context.Context, listingID string) (*ListingResponse, error)
}

type svc struct {
	repo           *repo.Queries
	logger         *slog.Logger
	db             postgresql.DBPool
	storage        storage.Provider
	eventHandler   *events.EventHandler
	cache          *cache.RedisClient
	publicFilesURL string
}

func NewListingsService(repo *repo.Queries, db postgresql.DBPool, logger *slog.Logger, storage storage.Provider, eventHandler *events.EventHandler, cache *cache.RedisClient, publicFilesURL string) ListingsService {
	return &svc{
		repo:           repo,
		db:             db,
		logger:         logger,
		storage:        storage,
		eventHandler:   eventHandler,
		cache:          cache,
		publicFilesURL: publicFilesURL,
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

	s.logger.DebugContext(ctx, "Request validated successfully: \n%+v", req)

	// 1. Convert UserID (String -> UUID)
	var userUUID pgtype.UUID
	if err := userUUID.Scan(userInfo.ID); err != nil {
		s.logger.WarnContext(ctx, "Invalid user ID", "error", err)
		return repo.Listing{}, errors.New(errors.ErrInternal, "Invalid user ID", fmt.Errorf("invalid user uuid: %w", err))
	}

	var dimensionsJSON []byte
	var err error
	if req.Dimensions != nil {
		dimensionsJSON, err = json.Marshal(req.Dimensions)
		if err != nil {
			return repo.Listing{}, errors.New(errors.ErrInvalidInput, "Invalid dimensions", err)
		}
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
		SellerID:             userUUID,
		Title:                req.Title,
		Description:          pgtype.Text{String: req.Description, Valid: true},
		Currency:             req.Currency,
		PriceMinUnit:         req.PriceMinUnit,
		Categories:           req.Categories,
		License:              req.License,
		ClientID:             userInfo.AuthorizedParty,
		TraceID:              traceIDVal,
		SellerName:           userInfo.Email,
		SellerUsername:       userInfo.Username,
		ThumbnailPath:        pgtype.Text{String: req.Files[0].Path, Valid: true},
		Status:               repo.NullListingStatus{ListingStatus: repo.ListingStatusPENDINGVALIDATION, Valid: true},
		IsNsfw:               req.IsNSFW,
		IsPhysical:           req.IsPhysical,
		IsAiGenerated:        req.IsAIGenerated,
		AiModelName:          pgtype.Text{String: getValue(req.AIModelName), Valid: req.AIModelName != nil},
		IsRemixingAllowed:    req.IsRemixingAllowed,
		HardwareRequired:     getStringSlice(req.PrinterSettings.HardwareRequired),
		DimensionsMm:         dimensionsJSON, // Handle null/nil logic in DB driver or pass []byte("null") if needed
		IsAssemblyRequired:   req.PrinterSettings.IsAssemblyRequired,
		IsHardwareRequired:   req.PrinterSettings.IsHardwareRequired,
		RecommendedMaterials: getStringSlice(req.PrinterSettings.RecommendedMaterials),
		RecommendedNozzleTempC: func() pgtype.Int4 {
			if req.PrinterSettings.RecommendedNozzleTempC != nil {
				var temp pgtype.Int4
				temp.Int32 = int32(*req.PrinterSettings.RecommendedNozzleTempC)
				temp.Valid = true
				return temp
			}
			return pgtype.Int4{Valid: false}
		}(),
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

	rows, err := s.repo.GetListingsBySellerID(ctx, userUUID)
	if err != nil {
		return nil, errors.New(errors.ErrInternal, "Unable to get the users listings", err)
	}

	// 3. Transform Rows -> Responses
	response := make([]ListingResponse, len(rows))
	for i, row := range rows {
		response[i] = s.toListingResponse(ctx, repo.GetListingByIDWithFilesRow{
			ID:                     row.ID,
			SellerID:               row.SellerID,
			Title:                  row.Title,
			Description:            row.Description,
			PriceMinUnit:           row.PriceMinUnit,
			Currency:               row.Currency,
			Categories:             row.Categories,
			License:                row.License,
			ClientID:               row.ClientID,
			TraceID:                row.TraceID,
			ThumbnailPath:          row.ThumbnailPath,
			Status:                 row.Status,
			Files:                  row.Files,
			DownloadsCount:         row.DownloadsCount,
			CommentsCount:          row.CommentsCount,
			SellerName:             row.SellerName,
			SellerUsername:         row.SellerUsername,
			SellerVerified:         row.SellerVerified,
			DeletedAt:              row.DeletedAt,
			HardwareRequired:       row.HardwareRequired,
			IsAssemblyRequired:     row.IsAssemblyRequired,
			IsHardwareRequired:     row.IsHardwareRequired,
			IsMulticolor:           row.IsMulticolor,
			IsAiGenerated:          row.IsAiGenerated,
			CreatedAt:              row.CreatedAt,
			UpdatedAt:              row.UpdatedAt,
			IsRemixingAllowed:      row.IsRemixingAllowed,
			IsPhysical:             row.IsPhysical,
			TotalWeightGrams:       row.TotalWeightGrams,
			IsNsfw:                 row.IsNsfw,
			AiModelName:            row.AiModelName,
			DimensionsMm:           row.DimensionsMm,
			RecommendedNozzleTempC: row.RecommendedNozzleTempC,
			RecommendedMaterials:   row.RecommendedMaterials,
		}, s.publicFilesURL)

	}

	return response, nil
}

func (req *CreateListingRequest) Validate(userId string) *errors.AppError {
	// ----------------------------------
	// A. Core Identity & Quality Control
	// ----------------------------------

	// 1. Title
	titleLen := len(strings.TrimSpace(req.Title))
	if titleLen < 5 || titleLen > 100 {
		return errors.New(errors.ErrInvalidInput, "Title must be between 5 and 100 characters", nil)
	}

	// 2. Description (New)
	// Enforce a minimum length to ensure quality listings
	descLen := len(strings.TrimSpace(req.Description))
	if descLen < 20 {
		return errors.New(errors.ErrInvalidInput, "Description must be at least 20 characters", nil)
	}
	if descLen > 5000 {
		return errors.New(errors.ErrInvalidInput, "Description cannot exceed 5000 characters", nil)
	}

	// 3. Categories
	if len(req.Categories) == 0 {
		return errors.New(errors.ErrInvalidInput, "At least one category is required", nil)
	}
	// Optional: Validate that categories exist in your allowed list if you have one hardcoded or cached

	// 4. License (New)
	if strings.TrimSpace(req.License) == "" {
		return errors.New(errors.ErrInvalidInput, "A valid license type is required", nil)
	}

	// ----------------------------------
	// B. Sales & Currency
	// ----------------------------------

	// 1. Price Sanity
	if req.PriceMinUnit < 0 {
		return errors.New(errors.ErrInvalidInput, "Price cannot be negative", nil)
	}

	// 2. Currency Validation (Only if not free)
	if req.PriceMinUnit > 0 {
		switch strings.ToLower(req.Currency) {
		case "usd", "gbp":
			// valid
		default:
			return errors.New(errors.ErrInvalidInput, "Currency must be 'usd' or 'gbp'", nil)
		}
	}

	// ----------------------------------
	// C. Technical Specs (New)
	// ----------------------------------

	// 1. Dimensions
	if req.Dimensions != nil {
		if req.Dimensions.X < 0 || req.Dimensions.Y < 0 || req.Dimensions.Z < 0 {
			return errors.New(errors.ErrInvalidInput, "Dimensions cannot be negative", nil)
		}
		// Optional: Check for '0' if IsPhysical is true, but often 0 is just "unknown"
	}

	// 2. Printer Settings - Temperature
	if req.PrinterSettings.RecommendedNozzleTempC != nil {
		temp := *req.PrinterSettings.RecommendedNozzleTempC
		// Sanity range for consumer 3D printing (e.g., 180°C - 450°C)
		if temp < 180 || temp > 450 {
			return errors.New(errors.ErrInvalidInput, "Recommended nozzle temperature must be within a realistic range (180-450°C)", nil)
		}
	}

	// 3. Printer Settings - Materials
	// Ensure no empty strings in the list
	for _, mat := range *req.PrinterSettings.RecommendedMaterials {
		if strings.TrimSpace(mat) == "" {
			return errors.New(errors.ErrInvalidInput, "Material list cannot contain empty entries", nil)
		}
	}

	// ----------------------------------
	// D. Legal & AI Compliance (New)
	// ----------------------------------

	// 1. AI Disclosure Policy
	// If marked as AI Generated, we strictly require the Model Name for transparency
	if req.IsAIGenerated {
		if req.AIModelName == nil || strings.TrimSpace(*req.AIModelName) == "" {
			return errors.New(errors.ErrInvalidInput, "AI Model Name is required for AI-generated content", nil)
		}
	}

	// ----------------------------------
	// E. File Validation (Existing)
	// ----------------------------------

	if len(req.Files) == 0 {
		return errors.New(errors.ErrInvalidInput, "At least one file is required", nil)
	}

	hasModel := false
	hasImage := false

	for _, f := range req.Files {
		// 1. Ownership Check
		if !checkUserOwnsFile(userId, f.Path) {
			// Log this security event?
			fmt.Printf("Security Alert: User %s attempted to use unowned file %s\n", userId, f.Path)
			return errors.New(errors.ErrInvalidInput, "You do not have permission to use this file", nil)
		}

		// 2. Basic Integrity
		if f.Path == "" {
			return errors.New(errors.ErrInvalidInput, "File path cannot be empty", nil)
		}
		if f.Size <= 0 {
			return errors.New(errors.ErrInvalidInput, "File size must be positive", nil)
		}

		// 3. Type Check
		t := strings.ToLower(f.Type)
		if t == "model" {
			hasModel = true
		} else if t == "image" {
			hasImage = true
		} else {
			return errors.New(errors.ErrInvalidInput, fmt.Sprintf("Invalid file type '%s'. Must be 'model' or 'image'", f.Type), nil)
		}
	}

	// 4. Composition Check
	if !hasModel {
		return errors.New(errors.ErrInvalidInput, "You must upload at least one 3D model file", nil)
	}
	if !hasImage {
		return errors.New(errors.ErrInvalidInput, "You must upload at least one gallery image", nil)
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

func (s *svc) UpdateListing(ctx context.Context, userInfo auth.UserInfo, listingID string, req *UpdateListingRequest) (*repo.Listing, error) {
	spanContext := trace.SpanContextFromContext(ctx)
	traceIDVal := ""
	if spanContext.IsValid() {
		traceIDVal = spanContext.TraceID().String()
	}

	var userUUID pgtype.UUID
	if err := userUUID.Scan(userInfo.ID); err != nil {
		return nil, errors.New(errors.ErrInvalidInput, "Invalid user ID provided", err)
	}

	var listingUUID pgtype.UUID
	if err := listingUUID.Scan(listingID); err != nil {
		return nil, errors.New(errors.ErrInvalidInput, "Invalid listing ID provided", err)
	}

	// 1. Fetch Existing Listing
	existing, err := s.repo.GetListingByID(ctx, listingUUID)
	if err != nil {
		if pgx.ErrNoRows.Error() == err.Error() {
			return nil, errors.New(errors.ErrNotFound, "Listing not found", fmt.Errorf("Listing %v not found", listingID))
		}

		return nil, errors.New(errors.ErrInternal, "Failed to fetch existing listing", fmt.Errorf("Failed to fetch listing %v: %w", listingID, err))
	}

	// Validate the request fits the required datatypes & sanitise if required.
	if existing.SellerID != userUUID {
		return nil, errors.New(errors.ErrUnauthorized, "You do not own this listing", fmt.Errorf("User %v doesn't own listing %v", userInfo.ID, existing.ID.String()))
	}

	// 2. Apply Updates
	listing, appErr := req.CreateUpdatedListing(userUUID, existing)
	if appErr != nil {
		return nil, appErr
	}

	updatedListing, err := s.repo.UpdateListing(ctx, repo.UpdateListingParams{
		ID:                     listing.ID,
		Title:                  listing.Title,
		Description:            listing.Description,
		PriceMinUnit:           listing.PriceMinUnit,
		Currency:               listing.Currency,
		Categories:             listing.Categories,
		License:                listing.License,
		ClientID:               listing.ClientID,
		TraceID:                listing.TraceID,
		ThumbnailPath:          listing.ThumbnailPath,
		Status:                 listing.Status,
		IsRemixingAllowed:      listing.IsRemixingAllowed,
		IsPhysical:             listing.IsPhysical,
		TotalWeightGrams:       listing.TotalWeightGrams,
		IsAssemblyRequired:     listing.IsAssemblyRequired,
		IsHardwareRequired:     listing.IsHardwareRequired,
		HardwareRequired:       listing.HardwareRequired,
		IsMulticolor:           listing.IsMulticolor,
		DimensionsMm:           listing.DimensionsMm,
		RecommendedNozzleTempC: listing.RecommendedNozzleTempC,
		RecommendedMaterials:   listing.RecommendedMaterials,
		IsAiGenerated:          listing.IsAiGenerated,
		AiModelName:            listing.AiModelName,
	})

	if err != nil {
		s.logger.ErrorContext(ctx, "Failed to update listing in database", "listing_id", listingID, "error", err)
		return nil, errors.New(errors.ErrInternal, "Failed to save listing updates", err)
	}

	cacheKey := "listing:" + listingID
	cache.Del(s.cache, ctx, cacheKey)

	err = s.eventHandler.RaiseListingIndexEvent(events.ReIndexListingEvent{
		ListingID: listingID,
		TraceID:   traceIDVal,
	})

	if err != nil {
		s.logger.ErrorContext(ctx, "Failed to raise listing re-index event", "listing_id", listingID, "error", err)
		// Non-critical error, so we log it but don't fail the whole operation
	}

	return &updatedListing, nil
}

func (req *UpdateListingRequest) CreateUpdatedListing(userID pgtype.UUID, listing repo.Listing) (repo.Listing, *errors.AppError) {
	if req.Title != nil {
		listing.Title = *req.Title
	}

	if req.Description != nil {
		// Handle sql.NullString logic if using sqlc's pgtype
		listing.Description = pgtype.Text{String: *req.Description, Valid: true}
	}
	if req.Currency != nil {
		listing.Currency = *req.Currency
	}
	if req.License != nil {
		listing.License = *req.License
	}
	if req.PriceMinUnit != nil {
		if *req.PriceMinUnit < 0 {
			return listing, errors.New(errors.ErrInvalidInput, "Price cannot be negative", nil)
		}

		listing.PriceMinUnit = *req.PriceMinUnit
	}

	if req.AIModelName != nil {
		// If empty string is passed, we treat it as NULL/Invalid
		isValid := strings.TrimSpace(*req.AIModelName) != ""
		listing.AiModelName = pgtype.Text{String: *req.AIModelName, Valid: isValid}
	}

	// --- JSON Columns ---
	if req.Dimensions != nil {
		bytes, err := json.Marshal(req.Dimensions)
		if err != nil {
			return listing, errors.New(errors.ErrInvalidInput, "Invalid dimensions format", err)
		}
		listing.DimensionsMm = bytes
	}

	if req.IsRemixingAllowed != nil {
		listing.IsRemixingAllowed = *req.IsRemixingAllowed
	}
	if req.IsPhysical != nil {
		listing.IsPhysical = *req.IsPhysical
	}
	if req.IsNSFW != nil {
		listing.IsNsfw = *req.IsNSFW
	}
	if req.IsAIGenerated != nil {
		listing.IsAiGenerated = *req.IsAIGenerated
	}

	if req.PrinterSettings != nil {
		ps := req.PrinterSettings

		if ps.IsAssemblyRequired != nil {
			listing.IsAssemblyRequired = *ps.IsAssemblyRequired
		}
		if ps.IsHardwareRequired != nil {
			listing.IsHardwareRequired = *ps.IsHardwareRequired
		}
		if ps.HardwareRequired != nil {
			listing.HardwareRequired = *ps.HardwareRequired
		}
		if ps.RecommendedMaterials != nil {
			listing.RecommendedMaterials = *ps.RecommendedMaterials
		}
		if ps.RecommendedNozzleTempC != nil {
			// Convert int64/int to int32 for Postgres
			listing.RecommendedNozzleTempC = pgtype.Int4{
				Int32: int32(*ps.RecommendedNozzleTempC),
				Valid: true,
			}
		}
	}
	return listing, nil
}

func (s *svc) UpdateFilesForListing(ctx context.Context, userInfo auth.UserInfo, listingID string, files []ListingFileDTO) error {

	// TOOD: Handling updating files should follow this logic:
	// 1. If there is a new file - we need to raise a validation event for this file. (with some sort of property making the validation worker know this is just an update - no need to raise a new indexing event at the end.)
	// 2. If a file has been deleted - make sure this isn't the only image they uploaded - if it's not we can just remove this from the table.
	return nil
}

func (s *svc) GetListingByID(ctx context.Context, listingID string) (*ListingResponse, error) {
	s.logger.DebugContext(ctx, "Get listing: %s", listingID)

	cacheKey := "listing:" + listingID

	// check redis cache first (TODO)
	cachedListing, found, err := cache.Get[ListingResponse](s.cache, ctx, cacheKey)
	if err != nil {
		s.logger.ErrorContext(ctx, "Failed to get listing from cache", "listing_id", listingID, "error", err)
	} else if found {
		s.logger.DebugContext(ctx, "Listing found in cache", "listing_id", listingID)
		return cachedListing, nil
	}

	// fetch from db if not found in cache
	var listingUUID pgtype.UUID
	if err := listingUUID.Scan(listingID); err != nil {
		return nil, errors.New(errors.ErrInvalidInput, "Invalid listing ID provided", err)
	}

	listing, err := s.repo.GetListingByIDWithFiles(ctx, listingUUID)
	if err != nil {
		if pgx.ErrNoRows.Error() == err.Error() {
			return nil, errors.New(errors.ErrNotFound, "Listing not found", fmt.Errorf("Listing %v not found", listingID))
		}

		s.logger.ErrorContext(ctx, "Failed to fetch listing from database", "listing_id", listingID, "error", err)
		return nil, errors.New(errors.ErrInternal, "Failed to fetch listing", fmt.Errorf("Failed to fetch listing %v: %w", listingID, err))
	}

	listingResponse := s.toListingResponse(ctx, listing, s.publicFilesURL)

	go func(data ListingResponse) {
		// Marshal to JSON
		bytes, _ := json.Marshal(data)
		// Set with TTL
		cache.Set(s.cache, context.Background(), cacheKey, bytes, ListingCacheTTL)
	}(listingResponse)

	return &listingResponse, nil
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
		SellerID: userID,
		ID:       id,
	})
	if err != nil {
		return fmt.Errorf("failed to delete listing: %w", err)
	}

	return nil
}

func getValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func getStringSlice(s *[]string) []string {
	if s == nil {
		return []string{}
	}
	return *s
}

func (s *svc) toListingResponse(ctx context.Context, row repo.GetListingByIDWithFilesRow, publicFilesURL string) ListingResponse {

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
					ID:           f.ID,
					FilePath:     nil,
					FileType:     f.FileType,
					Status:       f.Status,
					Size:         f.Size,
					IsGenerated:  f.IsGenerated,
					ErrorMessage: f.ErrorMessage,
					SourceFileID: f.SourceFileID,
					Metadata:     f.Metadata,
				})
			} else {
				var finalPath *string
				if f.FilePath == nil {
					// This should not happen, but just in case...
					s.logger.WarnContext(ctx, "Skipping VALID file with missing path", "file_id", f.ID)
					continue
				}

				// LOGIC SPLIT: Private vs Public
				if strings.ToUpper(f.FileType) == "MODEL" {
					// 1. MODELS -> PRIVATE BUCKET (product-files)
					// We MUST generate a temporary Pre-Signed URL
					// Ensure you have `storage.BucketProduct` constant defined as "product-files"
					signedUrl, err := s.storage.PresignGet(ctx, storage.BucketProduct, *f.FilePath, time.Minute*15)

					if err != nil {
						s.logger.ErrorContext(ctx, "Failed to sign model url", "file_id", f.ID, "error", err)
						finalPath = nil
					} else {
						finalPath = &signedUrl
					}

				} else {
					// 2. IMAGES -> PUBLIC BUCKET (public-files)
					// No need to hit S3. Just construct the permanent URL.
					// This is faster and lets the browser cache the image.
					// Ensure publicFilesURL doesn't have trailing slash
					// and f.FilePath doesn't have leading slash if you want to be safe
					url := fmt.Sprintf("%s/%s", strings.TrimRight(s.publicFilesURL, "/"), *f.FilePath)
					finalPath = &url
				}

				filteredFiles = append(filteredFiles, ListingFileDTO{
					ID:           f.ID,
					FilePath:     finalPath,
					FileType:     f.FileType,
					Status:       f.Status,
					Size:         f.Size,
					IsGenerated:  f.IsGenerated,
					SourceFileID: f.SourceFileID,
					ErrorMessage: f.ErrorMessage,
					Metadata:     f.Metadata,
				})
			}
		}
		files = filteredFiles
	}

	var dimX, dimY, dimZ *int
	if len(row.DimensionsMm) > 0 {
		var dims ListingDimensionsJSON
		if err := json.Unmarshal(row.DimensionsMm, &dims); err == nil {
			x, y, z := dims.Width, dims.Depth, dims.Height
			dimX, dimY, dimZ = &x, &y, &z
		}
	}

	return ListingResponse{
		ID: fmt.Sprintf("%x", row.ID.Bytes),

		// Seller Info
		SellerID:       fmt.Sprintf("%x", row.SellerID.Bytes),
		SellerName:     row.SellerName,
		SellerUsername: row.SellerUsername,
		SellerVerified: row.SellerVerified,

		// Core Info
		Title:        row.Title,
		Description:  row.Description.String, // Assumes pgtype.Text
		PriceMinUnit: row.PriceMinUnit,       // Assumes sqlc override to int64
		Currency:     row.Currency,
		Categories:   row.Categories,
		License:      row.License,

		Files: files,
		ThumbnailPath: func() *string {
			if row.ThumbnailPath.Valid {
				url := publicFilesURL + row.ThumbnailPath.String
				return &url
			}
			return nil
		}(),

		// Remixing
		IsRemixingAllowed: row.IsRemixingAllowed,
		ParentListingID: func() *string {
			if row.ParentListingID.Valid {
				id := fmt.Sprintf("%x", row.ParentListingID.Bytes)
				return &id
			}
			return nil
		}(),

		// Physical Properties
		IsPhysical: row.IsPhysical,
		TotalWeightGrams: func() *int {
			if row.TotalWeightGrams.Valid {
				val := int(row.TotalWeightGrams.Int32)
				return &val
			}
			return nil
		}(),
		IsAssemblyRequired: row.IsAssemblyRequired,
		IsHardwareRequired: row.IsHardwareRequired,
		HardwareRequired:   &row.HardwareRequired,

		// Dimensions
		DimXMM: dimX,
		DimYMM: dimY,
		DimZMM: dimZ,

		// Printer Settings
		IsMulticolor:         row.IsMulticolor,
		RecommendedMaterials: row.RecommendedMaterials,
		RecommendedNozzleTempC: func() *int {
			if row.RecommendedNozzleTempC.Valid {
				val := int(row.RecommendedNozzleTempC.Int32)
				return &val
			}
			return nil
		}(),

		// AI Info
		IsAIGenerated: row.IsAiGenerated,
		AIModelName: func() *string {
			if row.AiModelName.Valid {
				return &row.AiModelName.String
			}
			return nil
		}(),

		// Legal
		IsNSFW: row.IsNsfw,

		// Social Signals (Handle Nullables by defaulting to 0 if null)
		LikesCount:     int(row.LikesCount.Int32), // Assumes pgtype.Int4
		DownloadsCount: int(row.DownloadsCount.Int32),
		CommentsCount:  int(row.CommentsCount.Int32),

		// Sales
		IsSaleActive: row.IsSaleActive,
		SaleName: func() *string {
			if row.SaleName.Valid {
				return &row.SaleName.String
			}
			return nil
		}(),
		SaleEndTimestamp: func() *time.Time {
			if row.SaleEndTimestamp.Valid {
				t := row.SaleEndTimestamp.Time
				return &t
			}
			return nil
		}(),

		// Metadata
		Status: func() string {
			if row.Status.Valid {
				return string(row.Status.ListingStatus)
			}
			return "UNKNOWN"
		}(),
		CreatedAt: row.CreatedAt.Time,
		UpdatedAt: row.UpdatedAt.Time,
		LastIndexedAt: func() *time.Time {
			if row.LastIndexedAt.Valid {
				t := row.LastIndexedAt.Time
				return &t
			}
			return nil
		}(),
		DeletedAt: func() *time.Time {
			if row.DeletedAt.Valid {
				t := row.DeletedAt.Time
				return &t
			}
			return nil
		}(),
	}
}
