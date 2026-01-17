package listings

import (
	"context"
	"gateway/internal/auth"
	"gateway/internal/events"
	"gateway/internal/testutil"
	"regexp"
	"testing"
	"time"

	repo "gateway/internal/database/postgresql/sqlc"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

type MockBus struct {
	mock.Mock
}

func (m *MockBus) Publish(subject string, data []byte, msgId string) error {
	args := m.Called(subject, data, msgId)
	return args.Error(0)
}

func (m *MockBus) Drain() error {
	return nil
}

func TestCreateListing_Success(t *testing.T) {
	mockPool := testutil.NewMockDB(t)
	logger := testutil.NewTestLogger()
	mockBus := new(MockBus)
	eventConfig := events.EventConfig{
		StartImageValidation: "file.image.start",
		StartModelValidation: "file.model.start",
	}
	// We expect 2 publish events (one for model, one for image)
	mockBus.On("Publish", mock.Anything, mock.Anything, mock.Anything).Return(nil).Times(2)
	evtHandler := events.NewEventHandler(mockBus, &eventConfig, logger)

	// Assemble service
	service := &svc{
		repo:         repo.New(mockPool),
		db:           mockPool,
		logger:       logger,
		eventHandler: evtHandler,
	}

	const validUserUUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
	const generatedListingID = "11111111-1111-1111-1111-111111111111"
	const generatedFileID1 = "22222222-2222-2222-2222-222222222222"
	const generatedFileID2 = "33333333-3333-3333-3333-333333333333"

	var expectedListingUUID pgtype.UUID
	if err := expectedListingUUID.Scan(generatedListingID); err != nil {
		t.Fatal(err)
	}

	userInfo := auth.UserInfo{
		ID:              validUserUUID,
		Email:           "test@example.com",
		Username:        "tester",
		AuthorizedParty: "Go-Test",
	}

	// Input files (as they come from the Controller/Request)
	inputFile1Path := "2025/01/01/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/11111111-1111-1111-1111-111111111111/model/model.stl"
	inputFile2Path := "2025/01/01/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/11111111-1111-1111-1111-111111111111/image/image.jpg"

	req := &CreateListingRequest{
		Title:        "Valid Listing",
		Description:  "A great item",
		PriceMinUnit: 1050,
		Currency:     "gbp",
		Categories:   []string{"Art"},
		License:      "MIT",
		Files: []CreateListingFile{
			{Type: "model", Path: inputFile1Path, Size: 1024},
			{Type: "image", Path: inputFile2Path, Size: 500},
		},
		// We assume defaults for the new physical/AI fields in this specific test
	}

	// 1. Expect Begin Transaction
	mockPool.ExpectBegin()

	// 2. Expect Listing Insert
	// Arguments must match the order in queries.sql -> CreateListing
	mockPool.ExpectQuery(regexp.QuoteMeta(`INSERT INTO listings`)).
		WithArgs(
			pgxmock.AnyArg(),   // 1. seller_id
			"test@example.com", // 2. seller_name
			"tester",           // 3. seller_username
			false,              // 4. seller_verified (Default)

			"Valid Listing",  // 5. title
			pgxmock.AnyArg(), // 6. description
			pgxmock.AnyArg(), // 7. price_min_unit
			"gbp",            // 8. currency
			[]string{"Art"},  // 9. categories
			"MIT",            // 10. license

			"Go-Test",        // 11. client_id
			pgxmock.AnyArg(), // 12. trace_id
			pgxmock.AnyArg(), // 13. thumbnail_path
			pgxmock.AnyArg(), // 14. status

			true, // 15. is_remixing_allowed (Default)
			nil,  // 16. parent_listing_id (Default)

			true,  // 17. is_physical (Default)
			nil,   // 18. total_weight_grams
			false, // 19. is_assembly_required
			false, // 20. is_hardware_required
			nil,   // 21. hardware_required
			false, // 22. is_multicolor
			nil,   // 23. dimensions_mm
			nil,   // 24. recommended_nozzle_temp_c
			nil,   // 25. recommended_materials

			false, // 26. is_ai_generated
			nil,   // 27. ai_model_name
		).
		WillReturnRows(pgxmock.NewRows(testutil.ListingsCols).
			AddRow(
				generatedListingID,
				validUserUUID, "test@example.com", "tester", false, // Seller
				"Valid Listing", "Desc", int64(1050), "gbp", []string{"Art"}, "MIT", // Core
				"Go-Test", "trace", "path/to/thumb", nil, "PENDING_VALIDATION", // Sys
				true, nil, // Remix
				true, nil, false, false, nil, false, nil, nil, nil, // Physical
				false, nil, // AI
				0, 0, 0, false, nil, nil, 0.0, 0, 0, false, // Stats
				time.Now(), time.Now(), nil, // Timestamps
			))

	// 3. Expect File Inserts
	// File 1 (Model)
	mockPool.ExpectQuery(regexp.QuoteMeta(`INSERT INTO listing_files`)).
		WithArgs(
			expectedListingUUID, // 1. ListingID
			inputFile1Path,      // 2. FilePath
			repo.FileTypeMODEL,  // 3. FileType
			pgxmock.AnyArg(),    // 4. FileSize
			pgxmock.AnyArg(),    // 5. Metadata
			pgxmock.AnyArg(),    // 6. Status
			false,               // 7. is_generated (Default for uploads)
		).
		WillReturnRows(pgxmock.NewRows(testutil.ListingFileCols).AddRow(
			generatedFileID1,
			generatedListingID,
			inputFile1Path,
			repo.FileTypeMODEL,
			int64(1024),
			[]byte("{}"), // Metadata
			"PENDING",    // Status
			nil,          // Error
			false,        // is_generated
			nil,          // source_file_id
			time.Now(), time.Now(), nil,
		))

	// File 2 (Image)
	mockPool.ExpectQuery(regexp.QuoteMeta(`INSERT INTO listing_files`)).
		WithArgs(
			expectedListingUUID, // 1. ListingID
			inputFile2Path,      // 2. FilePath
			repo.FileTypeIMAGE,  // 3. FileType
			pgxmock.AnyArg(),    // 4. FileSize
			pgxmock.AnyArg(),    // 5. Metadata
			pgxmock.AnyArg(),    // 6. Status
			false,               // 7. is_generated
		).
		WillReturnRows(pgxmock.NewRows(testutil.ListingFileCols).AddRow(
			generatedFileID2,
			generatedListingID,
			inputFile2Path,
			repo.FileTypeIMAGE,
			int64(500),
			[]byte("{}"),
			"PENDING",
			nil,
			false,
			nil,
			time.Now(), time.Now(), nil,
		))

	// 4. Expect Commit
	mockPool.ExpectCommit()

	result, err := service.CreateListing(context.Background(), userInfo, req)

	if err != nil {
		t.Logf("Inner Error: %v", err)
	}
	assert.NoError(t, err)
	assert.Equal(t, "Valid Listing", result.Title)
	assert.NoError(t, mockPool.ExpectationsWereMet())
}
