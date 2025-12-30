package listings

import (
	"context"
	"gateway/internal/auth"
	"gateway/internal/testutil"
	"regexp"
	"testing"
	"time"

	repo "gateway/internal/database/postgresql/sqlc"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
)

func TestCreateListing_Success(t *testing.T) {
	mockPool := testutil.NewMockDB(t)
	logger := testutil.NewTestLogger()

	// Assemble service
	service := &svc{
		repo:   repo.New(mockPool),
		db:     mockPool,
		logger: logger,
	}
	// Use a VALID UUID here for the user
	const validUserUUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
	// Use a VALID UUID for the ID the DB "generates"
	const generatedListingID = "11111111-1111-1111-1111-111111111111"
	const generatedFileID1 = "22222222-2222-2222-2222-222222222222"
	const generatedFileID2 = "33333333-3333-3333-3333-333333333333"

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
		Categories:   []string{"Art"},
		License:      "MIT",
		Files: []CreateListingFile{
			{Type: "model", Path: "s3/model.stl", Size: 1024},
			{Type: "image", Path: "s3/image.jpg", Size: 500},
		},
	}

	// 1. Expect Begin
	mockPool.ExpectBegin()

	mockPool.ExpectQuery(regexp.QuoteMeta(`INSERT INTO listings`)).
		WithArgs(
			pgxmock.AnyArg(), "test@example.com", "tester", "Valid Listing",
			pgxmock.AnyArg(), pgxmock.AnyArg(), []string{"Art"}, pgxmock.AnyArg(),
			"Go-Test", pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(),
		).
		WillReturnRows(pgxmock.NewRows(testutil.ListingsCols). // <--- Clean usage
									AddRow(
				generatedListingID, validUserUUID, "test@example.com", "tester", "Valid Listing",
				"Desc", "10.50", []string{"Art"}, "MIT", "Go-Test", "trace",
				nil, nil, "PENDING_VALIDATION", time.Now(), time.Now(), nil,
			))

	// Expect: Insert Files (Loop logic is implied in service, explicit in mock)
	// File 1
	mockPool.ExpectQuery(regexp.QuoteMeta(`INSERT INTO listing_files`)).
		WithArgs(pgxmock.AnyArg(), "s3/model.stl", repo.FileTypeMODEL, pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnRows(pgxmock.NewRows(testutil.ListingFileCols).AddRow(
			generatedFileID1, generatedListingID, "s3/model.stl", repo.FileTypeMODEL, int64(1024), []byte("{}"), "PENDING", time.Now(), nil,
		))

	// File 2
	mockPool.ExpectQuery(regexp.QuoteMeta(`INSERT INTO listing_files`)).
		WithArgs(pgxmock.AnyArg(), "s3/image.jpg", repo.FileTypeIMAGE, pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnRows(pgxmock.NewRows(testutil.ListingFileCols).AddRow(
			generatedFileID2, generatedListingID, "s3/image.jpg", repo.FileTypeIMAGE, int64(500), []byte("{}"), "PENDING", time.Now(), nil,
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
