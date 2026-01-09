package indexing_test

import (
	"context"
	"errors"
	"log/slog"
	"math/big"
	"os"
	"testing"
	"time"

	repo "indexer/internal/database/postgresql/sqlc"
	"indexer/internal/indexing"

	// "indexer/internal/search/memory" // Import where you put InMemoryIndexer

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// --- MOCKS ---

// MockRepo simulates the SQLC generated interface
type MockRepo struct {
	mock.Mock
}

func (m *MockRepo) GetListingByID(ctx context.Context, id pgtype.UUID) (repo.GetListingByIDRow, error) {
	args := m.Called(ctx, id)
	return args.Get(0).(repo.GetListingByIDRow), args.Error(1)
}

// Stub for interface compliance
func (m *MockRepo) GetFilesByListingID(ctx context.Context, id pgtype.UUID) ([]repo.ListingFile, error) {
	return nil, nil
}
func (m *MockRepo) GetListingByIDAdmin(ctx context.Context, id pgtype.UUID) (repo.Listing, error) {
	return repo.Listing{}, nil
}
func (m *MockRepo) MarkListingAsIndexed(ctx context.Context, id pgtype.UUID) error {
	return nil
}

// --- TESTS ---

func TestIndexListing_HappyPath(t *testing.T) {
	// 1. Setup
	mockRepo := new(MockRepo)
	// NOTE: We cast to concrete type to access .Get() helper if it's not in the interface
	fakeIndexer := indexing.NewInMemoryIndexer()
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	svc := indexing.NewService(fakeIndexer, mockRepo, logger, "http://s3.amazonaws.com/public-files")

	// 2. Data Setup
	idStr := "550e8400-e29b-41d4-a716-446655440000"
	var uuid pgtype.UUID
	uuid.Scan(idStr)

	// ... (dbListing setup remains the same) ...
	dbListing := repo.GetListingByIDRow{
		ID:             uuid,
		SellerName:     "John Doe",
		SellerUsername: "johndoe",
		Title:          "Production Asset",
		Description:    pgtype.Text{String: "High quality model", Valid: true},
		PriceMinUnit:   pgtype.Numeric{Int: big.NewInt(5000), Valid: true},
		Currency:       "USD",
		CreatedAt:      pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}

	// 3. Expectation
	mockRepo.On("GetListingByID", mock.Anything, uuid).Return(dbListing, nil)

	// 4. Execute
	err := svc.IndexListing(context.Background(), idStr)
	require.NoError(t, err)

	// 5. Verification
	// Use type assertion to access the test helper .Get() if NewInMemoryIndexer returns the Interface
	// (Assuming NewInMemoryIndexer returns *InMemoryIndexer or interface has Get)
	concreteIndexer, ok := fakeIndexer.(*indexing.InMemoryIndexer)
	if !ok {
		// Fallback if your factory returns the interface but you need concrete methods
		t.Fatal("Indexer is not InMemoryIndexer")
	}

	doc, found, _ := concreteIndexer.Get(context.Background(), "listings", idStr)

	// ✅ Use Require here. If not found, STOP. Do not try to cast nil to map.
	require.True(t, found, "Document ID %s not found in indexer", idStr)
	require.NotNil(t, doc)

	docMap := doc.(map[string]interface{})
	assert.Equal(t, "Production Asset", docMap["title"])
	// Note: Verify the ID matches the string, not a pointer address!
	assert.Equal(t, idStr, docMap["id"])
}

func TestIndexListing_GhostRecord_Acknowledges(t *testing.T) {
	// SCENARIO: ID is valid UUID, but not found in DB.
	// EXPECT: Return nil (Ack) to stop retry loop.

	mockRepo := new(MockRepo)
	fakeIndexer := indexing.NewInMemoryIndexer()
	svc := indexing.NewService(fakeIndexer, mockRepo, slog.Default(), "http://s3.amazonaws.com/public-files")

	idStr := "550e8400-e29b-41d4-a716-446655440000"

	// Mock DB returning ErrNoRows
	mockRepo.On("GetListingByID", mock.Anything, mock.Anything).
		Return(repo.GetListingByIDRow{}, pgx.ErrNoRows)

	err := svc.IndexListing(context.Background(), idStr)
	count, err := fakeIndexer.Count(context.Background(), "listings")

	assert.NoError(t, err)           // Must be nil!
	assert.Equal(t, int64(0), count) // Nothing indexed
}

func TestIndexListing_DBError_Retries(t *testing.T) {
	// SCENARIO: DB Connection fails.
	// EXPECT: Return error (Nack) to retry.

	mockRepo := new(MockRepo)
	fakeIndexer := indexing.NewInMemoryIndexer()
	svc := indexing.NewService(fakeIndexer, mockRepo, slog.Default(), "http://s3.amazonaws.com/public-files")

	mockRepo.On("GetListingByID", mock.Anything, mock.Anything).
		Return(repo.GetListingByIDRow{}, errors.New("connection refused"))

	err := svc.IndexListing(context.Background(), "550e8400-e29b-41d4-a716-446655440000")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "connection refused")
}

func TestIndexListing_InvalidUUID_Acknowledges(t *testing.T) {
	// SCENARIO: Malformed ID string.
	// EXPECT: Return nil (Ack) immediately.

	svc := indexing.NewService(nil, nil, slog.Default(), "http://s3.amazonaws.com/public-files")

	err := svc.IndexListing(context.Background(), "not-a-uuid")

	assert.NoError(t, err)
}
