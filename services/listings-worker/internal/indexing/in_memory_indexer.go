package indexing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
)

// InMemoryIndexer is a thread-safe Fake for testing.
// It stores documents in a map: store[collectionName][documentID] = document
type InMemoryIndexer struct {
	mu    sync.RWMutex
	store map[string]map[string]any
}

func NewInMemoryIndexer() Indexer {
	return &InMemoryIndexer{
		store: make(map[string]map[string]any),
	}
}

func (i *InMemoryIndexer) Ping(ctx context.Context) error {
	// Always healthy
	return nil
}

func (i *InMemoryIndexer) HealthCheck(ctx context.Context) error {
	// Always healthy
	return nil
}

// Upsert mimics the "Update or Insert" behavior of search engines.
func (i *InMemoryIndexer) Upsert(ctx context.Context, collectionName string, document any) error {
	log.Printf("InMemoryIndexer Upsert called for collection %s", collectionName)
	i.mu.Lock()
	defer i.mu.Unlock()

	// 1. Initialize collection if missing
	if i.store[collectionName] == nil {
		log.Printf("Creating collection %s", collectionName)
		i.store[collectionName] = make(map[string]any)
	}

	// 2. Extract ID (Critical Step)
	// Search engines require a document ID. We need to extract it to store it in our map key.
	id, err := i.extractID(document)
	if err != nil {
		return fmt.Errorf("in-memory upsert failed: %w", err)
	}

	log.Printf("Upserting document with ID %s into collection %s", id, collectionName)

	// 3. Store the document
	i.store[collectionName][id] = document
	log.Printf("Store: %v", i.store)
	return nil
}

func (i *InMemoryIndexer) Delete(ctx context.Context, collectionName string, id string) error {
	i.mu.Lock()
	defer i.mu.Unlock()

	if bucket, exists := i.store[collectionName]; exists {
		delete(bucket, id)
	}
	// Most search engines don't error if you delete a non-existent ID, they just return success.
	return nil
}

func (i *InMemoryIndexer) Count(ctx context.Context, collectionName string) (int64, error) {
	i.mu.RLock()
	defer i.mu.RUnlock()

	if bucket, exists := i.store[collectionName]; exists {
		return int64(len(bucket)), nil
	}
	return 0, nil
}

// --- Test Helper Methods (Not part of Indexer interface) ---

// Get allows your tests to inspect the state of the index
func (i *InMemoryIndexer) Get(ctx context.Context, collectionName string, id string) (any, bool, error) {
	i.mu.RLock()
	defer i.mu.RUnlock()

	log.Printf("InMemoryIndexer Get called for collection %s, id %s", collectionName, id)
	log.Printf("Store state: %v", i.store)

	if bucket, exists := i.store[collectionName]; exists {
		log.Printf("Bucket state: %v", bucket)
		doc, found := bucket[id]

		log.Printf("Doc: %v", doc)
		return doc, found, nil
	}
	return nil, false, nil
}

// Clear resets the storage (useful for `defer cleanup()`)
func (i *InMemoryIndexer) Clear() {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.store = make(map[string]map[string]any)
}

// --- Internal Helper ---

func (i *InMemoryIndexer) extractID(doc any) (string, error) {
	// 1. Try Map
	if m, ok := doc.(map[string]any); ok {
		if idVal, ok := m["id"]; ok {
			return fmt.Sprintf("%v", idVal), nil
		}
	}

	// 2. Try Struct (via JSON round-trip)
	// This covers the case where the user passes a struct `type Doc struct { ID string ... }`
	// This is inefficient but perfect for tests.
	b, err := json.Marshal(doc)
	if err != nil {
		return "", errors.New("cannot marshal document")
	}

	var tempMap map[string]any
	if err := json.Unmarshal(b, &tempMap); err != nil {
		return "", errors.New("cannot unmarshal document to map")
	}

	if idVal, ok := tempMap["id"]; ok {
		return fmt.Sprintf("%v", idVal), nil
	}

	return "", errors.New("document missing 'id' field")
}

func (i *InMemoryIndexer) Close() error {
	// No resources to clean up in this in-memory implementation
	return nil
}
