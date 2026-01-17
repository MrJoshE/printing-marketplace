package listings

import (
	"gateway/internal/auth"
	"gateway/internal/errors"
	"gateway/internal/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type ListingsHandler struct {
	service ListingsService
}

func NewListingsHandler(svc ListingsService) *ListingsHandler {
	return &ListingsHandler{
		service: svc,
	}
}

func (h *ListingsHandler) CreateListing(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userInfo, err := auth.GetUserInfo(ctx)
	if err != nil {
		slog.WarnContext(ctx, "Unauthorized access attempt", "error", err)
		errors.RespondError(w, r, errors.New(errors.ErrUnauthorized, "Unauthorized access", err))
		return
	}

	slog.DebugContext(ctx, "Creating listing", "user_id", userInfo.ID)

	createListingRequest := CreateListingRequest{}
	if err := json.Read(r, &createListingRequest); err != nil {
		slog.WarnContext(ctx, "Invalid request body", "error", err)
		errors.RespondError(w, r, errors.New(errors.ErrInvalidInput, "Input provided was not in the format expected. Please contact support if this error persists.", err))
		return
	}

	listing, err := h.service.CreateListing(ctx, userInfo, &createListingRequest)
	if err != nil {
		slog.WarnContext(ctx, "Failed to create listing", "error", err)
		errors.RespondError(w, r, err)
		return
	}

	json.Write(w, http.StatusCreated, listing)
}

func (h *ListingsHandler) GetListingsForUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userInfo, err := auth.GetUserInfo(ctx)

	if err != nil {
		slog.WarnContext(ctx, "Unauthorized access attempt", "error", err)
		errors.RespondError(w, r, errors.New(errors.ErrUnauthorized, "Unauthorized access", err))
		return
	}

	slog.DebugContext(ctx, "Fetching listings for user", "user_id", userInfo.ID)

	listings, err := h.service.GetListingsForUser(ctx, userInfo)

	if err != nil {
		slog.WarnContext(ctx, "Failed to fetch listings for user", "error", err)
		errors.RespondError(w, r, err)
		return
	}

	json.Write(w, http.StatusOK, listings)
}

func (h *ListingsHandler) DeleteListing(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// Extract listing ID from URL parameters
	listingID := chi.URLParam(r, "id")
	if listingID == "" {
		slog.WarnContext(ctx, "Missing listing ID in request")
		errors.RespondError(w, r, errors.New(errors.ErrInvalidInput, "Listing ID is required", nil))
		return
	}

	userInfo, err := auth.GetUserInfo(ctx)
	if err != nil {
		slog.WarnContext(ctx, "Unauthorized access attempt", "error", err)
		errors.RespondError(w, r, errors.New(errors.ErrUnauthorized, "Unauthorized access", err))
		return
	}

	slog.DebugContext(ctx, "Deleting listing", "user_id", userInfo.ID, "listing_id", listingID)

	err = h.service.DeleteListing(ctx, userInfo, listingID)
	if err != nil {
		slog.WarnContext(ctx, "Failed to delete listing", "error", err)
		errors.RespondError(w, r, err)
		return
	}

	json.Write(w, http.StatusNoContent, nil)
}

func (h *ListingsHandler) UpdateListings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	listingID := chi.URLParam(r, "id")
	userInfo, err := auth.GetUserInfo(ctx)
	if err != nil {
		slog.WarnContext(ctx, "Unauthorized access attempt", "error", err)
		errors.RespondError(w, r, errors.New(errors.ErrUnauthorized, "Unauthorized access", err))
		return
	}

	slog.DebugContext(ctx, "Updating listing", "user_id", userInfo.ID)
	updateListingRequest := UpdateListingRequest{}

	if err := json.Read(r, &updateListingRequest); err != nil {
		slog.WarnContext(ctx, "Invalid request body", "error", err)
		errors.RespondError(w, r, errors.New(errors.ErrInvalidInput, "Input provided was not in the format expected. Please contact support if this error persists.", err))
		return
	}

	_, err = h.service.UpdateListing(ctx, userInfo, listingID, &updateListingRequest)
	if err != nil {
		slog.WarnContext(ctx, "Failed to update listing", "error", err)
		errors.RespondError(w, r, err)
		return
	}

	json.Write(w, http.StatusOK, nil)
}

// Unauthorized API so we need to make sure there is an API Key check and there is a rate limiter in front of this
func (h *ListingsHandler) GetListingByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	listingID := chi.URLParam(r, "id")
	if listingID == "" {
		slog.WarnContext(ctx, "Missing listing ID in request")
		errors.RespondError(w, r, errors.New(errors.ErrInvalidInput, "Listing ID is required", nil))
		return
	}

	slog.DebugContext(ctx, "Fetching listing by ID", "listing_id", listingID)

	listing, err := h.service.GetListingByID(ctx, listingID)
	if err != nil {
		slog.WarnContext(ctx, "Failed to fetch listing by ID", "error", err)
		errors.RespondError(w, r, err)
		return
	}

	json.Write(w, http.StatusOK, listing)

}
