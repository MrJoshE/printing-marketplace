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

	req := &CreateListingRequest{
		Title:        "Valid Listing",
		Description:  "A great item",
		PriceMinUnit: 1050,
		Currency:     "gbp",
		Categories:   []string{"Art"},
		License:      "MIT",
		Files: []CreateListingFile{
			{Type: "model", Path: "2025/01/01/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/11111111-1111-1111-1111-111111111111/model/model.stl", Size: 1024},
			{Type: "image", Path: "2025/01/01/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/11111111-1111-1111-1111-111111111111/image/image.jpg", Size: 500},
		},
	}

	// 1. Expect Begin
	mockPool.ExpectBegin()

	mockPool.ExpectQuery(regexp.QuoteMeta(`INSERT INTO listings`)).
		WithArgs(
			pgxmock.AnyArg(),   // UserID
			"test@example.com", // SellerName
			"tester",           // SellerUsername
			"Valid Listing",    // Title
			pgxmock.AnyArg(),   // Description
			pgxmock.AnyArg(),   // PriceMinUnit
			"gbp",              // Currency
			[]string{"Art"},    // Categories
			"MIT",              // License
			"Go-Test",          // ClientID
			pgxmock.AnyArg(),   // TraceID
			pgxmock.AnyArg(),   // ThumbnailPath
			pgxmock.AnyArg(),   // Status
		).
		WillReturnRows(pgxmock.NewRows(testutil.ListingsCols).
			AddRow(
				generatedListingID,
				validUserUUID,
				"test@example.com",
				"tester",
				"Valid Listing",
				"Desc",
				"1050",
				"gbp",
				[]string{"Art"},
				"MIT",
				"Go-Test",
				"trace",
				"path/to/thumb",      // Thumbnail path
				nil,                  // last_indexed_at
				"PENDING_VALIDATION", // Status
				time.Now(),           // created_at
				time.Now(),           // updated_at
				nil,                  // deleted_at
			))

	// Expect: Insert Files (Loop logic is implied in service, explicit in mock)
	// File 1
	// Assumes file path format is YYYY/MM/DD/userId/listingDraftID/fileType/filename.ext
	file1Path := "2025/01/01/" + validUserUUID + "/" + generatedListingID + "/model/model.stl"

	mockPool.ExpectQuery(regexp.QuoteMeta(`INSERT INTO listing_files`)).
		WithArgs(
			expectedListingUUID, // ListingID
			file1Path,           // FilePath
			repo.FileTypeMODEL,  // FileType
			pgxmock.AnyArg(),    // FileSize
			pgxmock.AnyArg(),    // Metadata
			pgxmock.AnyArg(),    // Status
		).
		WillReturnRows(pgxmock.NewRows(testutil.ListingFileCols).AddRow(
			generatedFileID1,
			generatedListingID,
			file1Path,
			repo.FileTypeMODEL,
			int64(1024),
			[]byte("{}"), // Metadata (JSONB)
			"PENDING",    // Status
			nil,          // Error Message
			time.Now(),   // CreatedAt
			time.Now(),   // UpdatedAt (Added this!)
			nil,          // DeletedAt
		))

	// File 2
	// Assumes file path format is YYYY/MM/DD/userId/listingDraftID/fileType/filename.ext
	file2Path := "2025/01/01/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/" + generatedListingID + "/image/image.jpg"
	mockPool.ExpectQuery(regexp.QuoteMeta(`INSERT INTO listing_files`)).
		WithArgs(
			expectedListingUUID, // 1. ListingID
			file2Path,           // 2. FilePath
			repo.FileTypeIMAGE,  // 3. FileType
			pgxmock.AnyArg(),    // 4. FileSize
			pgxmock.AnyArg(),    // 5. Metadata
			pgxmock.AnyArg(),    // 6. Status
		).
		WillReturnRows(pgxmock.NewRows(testutil.ListingFileCols).AddRow(
			generatedFileID2,
			generatedListingID,
			file2Path,
			repo.FileTypeIMAGE,
			int64(500),
			[]byte("{}"),
			"PENDING",
			nil,
			time.Now(),
			time.Now(),
			nil,
		))

	mockPool.ExpectCommit()

	result, err := service.CreateListing(context.Background(), userInfo, req)

	if err != nil {
		t.Logf("Inner Error: %v", err)

	}
	assert.NoError(t, err)
	assert.Equal(t, "Valid Listing", result.Title)
	assert.NoError(t, mockPool.ExpectationsWereMet())
}
