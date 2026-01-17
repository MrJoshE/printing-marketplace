package events

import (
	"os"
)

type ReIndexListingEvent struct {
	ListingID string `json:"listing_id"`
	TraceID   string `json:"trace_id"`
}

type StartFileValidationEvent struct {
	ListingID string `json:"listing_id"` // This is the database ID of the listing the file is associated with
	UserID    string `json:"user_id"`    // This is the database ID of the user who uploaded the file
	TraceID   string `json:"trace_id"`   // This is used for tracing requests across services
	FileID    string `json:"file_id"`    // This is the database ID of the file record
	FileKey   string `json:"file_key"`   // This is the object location in S3 storage
	FileType  string `json:"file_type"`  // This is the file type, e.g., "image" | "model"
}

type EventConfig struct {
	StartImageValidation string
	StartModelValidation string
	IndexListingEvent    string
}

func NewEventConfig() *EventConfig {
	return &EventConfig{
		StartImageValidation: os.Getenv("EVENT_VALIDATE_IMAGE_START"),
		StartModelValidation: os.Getenv("EVENT_VALIDATE_MODEL_START"),
		IndexListingEvent:    os.Getenv("EVENT_INDEX_LISTING"),
	}
}
