package indexing

import "context"

// Indexer defines the contract for any search engine we support.
// This allows us to swap Typesense for Algolia/Elasticsearch later,
// and makes unit testing trivial.
type Indexer interface {
	// Upsert adds or updates a document.
	// We use 'any' to allow flexibility, but you could restrict this to a specific interface.
	Upsert(ctx context.Context, collectionName string, document any) error

	// Delete removes a document by ID.
	Delete(ctx context.Context, collectionName string, id string) error

	// Get retrieves a document by ID.
	Get(ctx context.Context, collectionName string, id string) (any, bool, error)

	// Count returns the number of documents in a collection.
	Count(ctx context.Context, collectionName string) (int64, error)

	// HealthCheck checks the health of the indexer.
	HealthCheck(ctx context.Context) error

	// Close cleans up any resources held by the indexer.
	Close() error
}
