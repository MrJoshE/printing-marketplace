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

	log.Println("Starting Typesense schema migration...")
	log.Printf("Connecting to Typesense at %s", url)

	client := typesense.NewClient(
		typesense.WithServer(url),
		typesense.WithAPIKey(key),
		typesense.WithConnectionTimeout(5*time.Second),
	)

	collectionName := "listings_v1"

	schema := &api.CollectionSchema{
		Name: collectionName,
		Fields: []api.Field{

			// ==================================================
			// CORE IDENTITY & SEARCH
			// ==================================================
			{Name: "id", Type: "string"},
			{Name: "title", Type: "string"},
			{Name: "description", Type: "string"},
			{Name: "thumbnail_url", Type: "string"},
			{Name: "categories", Type: "string[]", Facet: pointer.True()},
			{Name: "license", Type: "string"},

			// AI Semantic Search Vector
			// It stores a 768-dim vector (from OpenAI/Bert) representing the 'meaning' of the model.
			// Allows: "Find similar models", "Search by Image", "Concept Search"
			{Name: "embedding", Type: "float[]", NumDim: pointer.Int(768)}, // Adjust based on your embedding model (e.g., OpenAI is 1536, Bert is 768)

			// ==================================================
			// SLICER & 3D TECH SPECS (Machine Readable)
			// ==================================================
			// Essential for an in-browser slicer to auto-configure settings
			{Name: "is_manifold", Type: "bool", Facet: pointer.True()},      // Is it watertight?
			{Name: "file_formats", Type: "string[]", Facet: pointer.True()}, // e.g. ["stl", "3mf", "obj", "step"]

			// Physical dimensions (in mm) - vital for "Will this fit on my printer?" filters
			{Name: "is_physical", Type: "bool", Facet: pointer.True()}, // Is it a physical object (vs digital art)?
			{Name: "dim_x_mm", Type: "float", Sort: pointer.True()},
			{Name: "dim_y_mm", Type: "float", Sort: pointer.True()},
			{Name: "dim_z_mm", Type: "float", Sort: pointer.True()},

			{Name: "is_assembly_required", Type: "bool", Facet: pointer.True()}, // Does it need assembly after printing?

			{Name: "total_weight_grams", Type: "float", Sort: pointer.True()},        // e.g. 150.5g (optional for digital asset)
			{Name: "recommended_materials", Type: "string[]", Facet: pointer.True()}, // "PLA"
			{Name: "recommended_nozzle_temp_c", Type: "int64", Sort: pointer.True()},
			{Name: "is_hardware_required", Type: "bool", Facet: pointer.True()}, // Does it need extra hardware (screws, etc)?
			{Name: "hardware_required", Type: "string[]"},
			{Name: "is_multicolor", Type: "bool", Facet: pointer.True()}, // Vital for modern AMS/MMU users

			// ==================================================
			// Legal, Safety & Content Rating
			// ==================================================
			// Protects your platform from payment bans and angry parents.
			{Name: "is_nsfw", Type: "bool", Facet: pointer.True()}, // Adult content flag

			// ==================================================
			// AI GENERATION
			// ==================================================
			{Name: "is_ai_generated", Type: "bool", Facet: pointer.True()},
			{Name: "ai_model_name", Type: "string", Facet: pointer.True()},

			// ==================================================
			// COMMUNITY & REMIX CULTURE
			// ==================================================
			// "Remixing" is the lifeblood of 3D printing.
			{Name: "parent_listing_id", Type: "string", Facet: pointer.True()}, // If this is a remix, point to original
			{Name: "is_remix_allowed", Type: "bool", Facet: pointer.True()},

			// Social Signals
			{Name: "likes_count", Type: "int64", Sort: pointer.True()},
			{Name: "downloads_count", Type: "int64", Sort: pointer.True()},
			{Name: "comments_count", Type: "int64", Sort: pointer.True()},
			// ==================================================
			// SALES & MERCHANDISING
			// ==================================================
			{Name: "price_min_unit", Type: "int64", Facet: pointer.True()}, // Base price
			{Name: "sale_price", Type: "int64", Sort: pointer.True()},      // Actual price (base or sale)
			{Name: "currency", Type: "string", Facet: pointer.True()},

			{Name: "is_sale_active", Type: "bool", Facet: pointer.True()},
			{Name: "sale_name", Type: "string"},
			{Name: "sale_end_timestamp", Type: "int64"},

			// ==================================================
			// SELLER & TRUST
			// ==================================================
			{Name: "seller_id", Type: "string"},
			{Name: "seller_username", Type: "string"},
			{Name: "seller_verified", Type: "bool", Facet: pointer.True()},
			{Name: "seller_name", Type: "string"},

			{Name: "created_at", Type: "int64", Sort: pointer.True()},
			{Name: "updated_at", Type: "int64"},
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
