package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/typesense/typesense-go/typesense"
	"github.com/typesense/typesense-go/typesense/api"
	"github.com/typesense/typesense-go/typesense/api/pointer"
)

func main() {
	url := os.Getenv("TYPESENSE_URL")
	key := os.Getenv("TYPESENSE_API_KEY")

	client := typesense.NewClient(
		typesense.WithServer(url),
		typesense.WithAPIKey(key),
		typesense.WithConnectionTimeout(5*time.Second),
	)

	collectionName := "listings"

	schema := &api.CollectionSchema{
		Name: collectionName,
		Fields: []api.Field{
			{Name: "id", Type: "string"},
			{Name: "title", Type: "string"},
			{Name: "description", Type: "string"},
			{Name: "seller_name", Type: "string"},
			{Name: "seller_username", Type: "string"},
			{Name: "categories", Type: "string[]", Facet: pointer.True()},
			{Name: "license", Type: "string"},
			{Name: "price_min_unit", Type: "int64", Facet: pointer.True(), Sort: pointer.True()},
			{Name: "currency", Type: "string"},
			{Name: "created_at", Type: "int64", Sort: pointer.True()},
			{Name: "thumbnail_url", Type: "string"},
		},
		DefaultSortingField: pointer.String("created_at"),
	}

	// 1. Check if collection exists
	log.Printf("Checking schema for '%s'...", collectionName)
	_, err := client.Collection(collectionName).Retrieve(context.Background())

	if err != nil {
		// 2. CASE: Collection does not exist (404) -> CREATE
		log.Println("Collection not found. Creating new...")
		_, err := client.Collections().Create(context.Background(), schema)
		if err != nil {
			log.Fatalf("Failed to create collection: %v", err)
		}
		log.Println("✅ Collection created successfully.")
	} else {
		// 3. CASE: Collection exists -> UPDATE (Add missing fields)
		// Typesense.Update() will add new fields but CANNOT change existing types.
		// If you change 'price' from string to int, this will fail (which is good safety).
		log.Println("Collection exists. Attempting schema update...")

		// We pass the fields to Update. Typesense ignores fields that already exist matches.
		updateSchema := &api.CollectionUpdateSchema{
			Fields: schema.Fields,
		}

		_, err := client.Collection(collectionName).Update(context.Background(), updateSchema)
		if err != nil {
			log.Fatalf("❌ Schema update failed: %v. (Note: You cannot change existing field types without re-indexing)", err)
		}
		log.Println("✅ Schema updated (synced) successfully.")
	}
}
