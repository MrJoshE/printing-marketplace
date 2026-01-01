package indexing

import (
	"context"
	"fmt"
	"time"

	"github.com/typesense/typesense-go/typesense"
)

type TypesenseClient struct {
	client *typesense.Client
}

func NewClient(apiKey, url string) Indexer {
	client := typesense.NewClient(
		typesense.WithServer(url),
		typesense.WithAPIKey(apiKey),
	)
	return &TypesenseClient{client: client}
}

func (t *TypesenseClient) Upsert(ctx context.Context, collectionName string, document any) error {
	// Typesense "Upsert" logic
	_, err := t.client.Collection(collectionName).Documents().Upsert(ctx, document)
	if err != nil {
		// Wrap errors so the caller knows it came from the search layer
		return fmt.Errorf("typesense upsert failed: %w", err)
	}
	return nil
}

func (t *TypesenseClient) Delete(ctx context.Context, collectionName string, id string) error {
	_, err := t.client.Collection(collectionName).Document(id).Delete(ctx)
	if err != nil {
		return fmt.Errorf("typesense delete failed: %w", err)
	}
	return nil
}

func (t *TypesenseClient) Close() error {
	// Typesense client does not require explicit closure
	return nil
}

func (t *TypesenseClient) Get(ctx context.Context, collectionName string, id string) (any, bool, error) {
	document, err := t.client.Collection(collectionName).Document(id).Retrieve(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("typesense get failed: %w", err)
	}
	return document, true, nil
}

func (t *TypesenseClient) Count(ctx context.Context, collectionName string) (int64, error) {
	resp, err := t.client.Collection(collectionName).Retrieve(ctx)
	if err != nil {
		return 0, fmt.Errorf("typesense count failed: %w", err)
	}
	return *resp.NumDocuments, nil
}

func (t *TypesenseClient) HealthCheck(ctx context.Context) error {
	isHealthy, err := t.client.Health(ctx, time.Second*5)
	if err != nil {
		return fmt.Errorf("typesense health check failed: %w", err)
	}
	if !isHealthy {
		return fmt.Errorf("typesense is unhealthy")
	}

	return nil
}
