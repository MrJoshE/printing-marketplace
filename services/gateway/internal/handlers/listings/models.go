package listings

import (
	"encoding/json"
	"time"
)

type CreateListingRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Categories  []string `json:"categories"`
	License     string   `json:"license"`

	PriceMinUnit int64  `json:"price_min_unit"` // in minimum currency unit (e.g., cents)
	Currency     string `json:"currency"`

	Files []CreateListingFile `json:"files"`
}

type CreateListingFile struct {
	Type string `json:"type"` // e.g. "model" or "image"
	Path string `json:"path"` // e.g. "incoming/user_123/uuid.stl"
	Size int64  `json:"size"` // in bytes
}

type ListingFileDTO struct {
	ID           string          `json:"id"`
	FilePath     *string         `json:"file_path"` // Presigned URL for accessing the file if the file has been validated
	FileType     string          `json:"file_type"`
	Status       string          `json:"status"`
	Size         int64           `json:"size"`
	Metadata     json.RawMessage `json:"metadata"`
	ErrorMessage *string         `json:"error_message"`
	IsGenerated  bool            `json:"is_generated"`
	SourceFileID *string         `json:"source_file_id,omitempty"`
}

type ListingResponse struct {
	ID             string           `json:"id"`
	SellerName     string           `json:"seller_name"`
	SellerUsername string           `json:"seller_username"`
	Title          string           `json:"title"`
	Description    string           `json:"description"`
	PriceMinUnit   int64            `json:"price_min_unit"`
	Categories     []string         `json:"categories"`
	License        string           `json:"license"`
	ThumbnailPath  *string          `json:"thumbnail_path"`
	LastIndexedAt  *time.Time       `json:"last_indexed_at"`
	Status         string           `json:"status"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
	DeletedAt      *time.Time       `json:"deleted_at"`
	Files          []ListingFileDTO `json:"files"`
}
