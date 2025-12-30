package files

import (
	"context"
	"crypto/sha256"
	"fmt"
	"gateway/internal/errors"
	"gateway/internal/events"
	"gateway/internal/storage"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

type PresignRequest struct {
	Type        string `json:"type"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	DraftId     string `json:"draft_id"`
}

type PresignResponse struct {
	UploadURL string            `json:"uploadUrl"`
	FormData  map[string]string `json:"fields"`
	Key       string            `json:"key"`
}

/**
 * File constraints based on type (e.g., image, model, etc).
 */
type FileConstraint struct {
	MaxSize          int64
	AllowedMimeTypes []string
	Prefix           string
}

type service struct {
	storage               storage.Provider
	constraints           map[string]FileConstraint
	bus                   events.Bus
	fileExtensionMappings map[string]string
	validationWindowHours int
}

func NewFileService(storage storage.Provider, validationWindowHours int, constraints map[string]FileConstraint, bus events.Bus) *service {

	fileExtensionMappings := map[string]string{
		".stl": "model/stl",
		".3mf": "model/3mf",
		".obj": "application/octet-stream",
	}

	return &service{
		storage:               storage,
		constraints:           constraints,
		bus:                   bus,
		fileExtensionMappings: fileExtensionMappings,
		validationWindowHours: validationWindowHours,
	}
}

const bucket = storage.BucketIncoming

func (s *service) PresignUpload(ctx context.Context, userID string, req PresignRequest) (*PresignResponse, error) { // 1. Constraints based on file type
	// Get the constraints for this file type
	constraints, exists := s.constraints[req.Type]
	if !exists {
		return nil, errors.New(errors.ErrInvalidInput, "Unknown file_type. Must be 'model' or 'image'", nil)
	}

	// 2. Validate Mime Type
	var mimeType string = req.ContentType
	if mimeType == "" {
		extension := filepath.Ext(req.Filename)
		mimeType, exists = s.fileExtensionMappings[extension]
		if !exists && extension != "" && req.Type == "model" {
			mimeType = "application/octet-stream"
		}
	}

	if !slices.Contains(constraints.AllowedMimeTypes, mimeType) {
		return nil, errors.New(errors.ErrInvalidInput, fmt.Sprintf("File type '%s' is not allowed for %s uploads", mimeType, req.Type), nil)
	}

	// 3. Generate Secure Path (Key)
	// Pattern: incoming/YYYY/MM/DD/userID/draftID/type/uuid.ext
	ext := strings.ToLower(filepath.Ext(req.Filename))
	if ext == "" {
		return nil, errors.New(errors.ErrInvalidInput, "Filename must have an extension", nil)
	}

	key := generateStorageKey(userID, req.DraftId, req.Filename, constraints.Prefix, ext)

	// 4. Ask Provider for the POST Policy
	config := storage.UploadConfig{
		Bucket:      bucket,
		Key:         key,
		ContentType: mimeType,
		MaxFileSize: constraints.MaxSize,
		Expiry:      time.Duration(s.validationWindowHours) * time.Hour,
	}

	url, formData, err := s.storage.GenerateUploadURL(ctx, config)
	if err != nil {
		return nil, errors.New(errors.ErrInternal, "Failed to generate upload signature", err)
	}

	return &PresignResponse{
		UploadURL: url,
		FormData:  formData,
		Key:       key,
	}, nil
}

func generateStorageKey(userID, draftID, filename string, prefix, ext string) string {
	now := time.Now()
	// Create the date prefix: 2025/12/12
	datePrefix := fmt.Sprintf("%d/%02d/%02d", now.Year(), now.Month(), now.Day())

	// path.Join automatically removes double slashes (//) and empty strings
	return path.Join(datePrefix, userID, draftID, prefix, generateFilenameHash(filename)+ext)
}

func generateFilenameHash(filename string) string {
	sha256Hasher := sha256.New()
	sha256Hasher.Write([]byte(filename))
	return fmt.Sprintf("%x", sha256Hasher.Sum(nil))
}
