package files

import (
	"gateway/internal/auth"
	"gateway/internal/errors"
	"gateway/internal/json"
	"net/http"
)

type FileHandler struct {
	svc *service
}

func NewFileHandler(svc *service) *FileHandler {
	return &FileHandler{
		svc: svc,
	}
}

func (h *FileHandler) PresignUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userId, err := auth.GetUserID(ctx)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	preSignedRequest := PresignRequest{}
	if err := json.Read(r, &preSignedRequest); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	response, err := h.svc.PresignUpload(r.Context(), userId, preSignedRequest)
	if err != nil {
		errors.RespondError(w, r, err)
		return
	}

	json.Write(w, http.StatusCreated, response)
}
