package events

import (
	"encoding/json"
	"fmt"
	"log/slog"
)

type EventHandler struct {
	bus    Bus
	config *EventConfig
	logger *slog.Logger
}

func NewEventHandler(bus Bus, config *EventConfig, logger *slog.Logger) *EventHandler {
	return &EventHandler{
		bus:    bus,
		config: config,
		logger: logger,
	}
}

func (h *EventHandler) RaiseStartFileValidationEvent(evt StartFileValidationEvent) error {

	h.logger.Info("Raising ",
		"listing_id", evt.ListingID,
		"user_id", evt.UserID,
		"file_id", evt.FileID,
		"file_type", evt.FileType,
	)

	data, err := json.Marshal(evt)
	if err != nil {
		h.logger.Error("Failed to marshal StartFileValidationEvent", "error", err)
		return err
	}

	msgId := fmt.Sprintf("start.%s.%s.%s", evt.UserID, evt.ListingID, evt.FileID)

	switch evt.FileType {
	case "image":
		h.bus.Publish(h.config.StartImageValidation, data, msgId)
	case "model":
		h.bus.Publish(h.config.StartModelValidation, data, msgId)
	default:
		h.logger.Error("Unsupported file type for validation event", "file_type", evt.FileType)
		return fmt.Errorf("unsupported file type: %s", evt.FileType)
	}

	return nil
}
