package events

import (
	"os"
)

type IndexListingEvent struct {
	ListingID string `json:"listing_id"` // This is the database ID of the listing the file is associated with
}

type EventConfig struct {
	IndexListing string
}

func NewEventConfig() *EventConfig {
	return &EventConfig{
		IndexListing: os.Getenv("EVENT_INDEX_LISTING"),
	}
}
