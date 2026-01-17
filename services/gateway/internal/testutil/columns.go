package testutil

// ListingsCols must match the RETURNING clause order in queries.sql for Listings
// This order corresponds to: SELECT * FROM listings
var ListingsCols = []string{
	"id",
	// Seller Info
	"seller_id", "seller_name", "seller_username", "seller_verified",

	// Core Info
	"title", "description", "price_min_unit", "currency", "categories", "license",
	"client_id", "trace_id", "thumbnail_path", "last_indexed_at", "status",

	// Remixing
	"is_remixing_allowed", "parent_listing_id",

	// Physical
	"is_physical", "total_weight_grams", "is_assembly_required",
	"is_hardware_required", "hardware_required", "is_multicolor",
	"dimensions_mm", "recommended_nozzle_temp_c", "recommended_materials",

	// AI
	"is_ai_generated", "ai_model_name",

	// Social & Stats (Default 0/Null)
	"likes_count", "downloads_count", "comments_count",
	"is_sale_active", "sale_name", "sale_end_timestamp",
	"seller_rating_average", "seller_total_ratings", "seller_total_sales",
	"is_nsfw",

	// Timestamps
	"created_at", "updated_at", "deleted_at",
}

// ListingFileCols must match the RETURNING clause order in queries.sql for ListingFiles
var ListingFileCols = []string{
	"id", "listing_id", "file_path", "file_type", "file_size",
	"metadata", "status", "error_message",
	"is_generated", "source_file_id", // Newly added columns
	"created_at", "updated_at", "deleted_at",
}
