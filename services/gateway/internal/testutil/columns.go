package testutil

// ListingsCols must match the RETURNING clause order in queries.sql for Listings
var ListingsCols = []string{
	"id", "user_id", "seller_name", "seller_username", "title",
	"description", "price", "categories", "license", "client_id", "trace_id", "thumbnail_path",
	"last_indexed_at", "status", "created_at", "updated_at", "deleted_at",
}

// ListingFileCols must match the RETURNING clause order in queries.sql for ListingFiles
var ListingFileCols = []string{
	"id", "listing_id", "file_path", "file_type", "file_size",
	"metadata", "status", "created_at", "deleted_at",
}
