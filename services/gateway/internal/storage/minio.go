package storage

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var _ Provider = (*MinioProvider)(nil)

type MinioProvider struct {
	client *minio.Client
}

// NewMinioProvider initializes the MinIO client.
// In production, pass 'useSSL: true' for S3/Cloud.
func NewMinioProvider(endpoint, accessKeyID, secretAccessKey string, useSSL bool) (Provider, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKeyID, secretAccessKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create minio client: %w", err)
	}

	return &MinioProvider{client: client}, nil
}

// GenerateUploadURL creates a secure POST Policy for direct uploads.
// This is the "Future Proof" method.
func (m *MinioProvider) GenerateUploadURL(ctx context.Context, cfg UploadConfig) (string, map[string]string, error) {
	// 1. Create a POST Policy
	policy := minio.NewPostPolicy()

	// 2. Apply Security Constraints
	// A. Bucket Constraint
	if err := policy.SetBucket(string(cfg.Bucket)); err != nil {
		return "", nil, fmt.Errorf("failed to set bucket: %w", err)
	}

	// B. Key Constraint (The exact filename)
	if err := policy.SetKey(cfg.Key); err != nil {
		return "", nil, fmt.Errorf("failed to set key: %w", err)
	}

	// C. Expiry Constraint (URL dies in X minutes)
	if err := policy.SetExpires(time.Now().Add(cfg.Expiry).UTC()); err != nil {
		return "", nil, fmt.Errorf("failed to set expiry: %w", err)
	}

	// D. Size Constraint (Prevent DoS / Storage Exhaustion)
	// Min size: 1KB (prevent empty file spam), Max: config limit (e.g. 50MB)
	if err := policy.SetContentLengthRange(1024, cfg.MaxFileSize); err != nil {
		return "", nil, fmt.Errorf("failed to set size limit: %w", err)
	}

	// E. Content-Type Constraint (Prevent MIME-type spoofing)
	// The uploaded file MUST match this type exactly.
	if err := policy.SetContentType(cfg.ContentType); err != nil {
		return "", nil, fmt.Errorf("failed to set content type: %w", err)
	}

	// 3. Generate the Signature
	url, formData, err := m.client.PresignedPostPolicy(ctx, policy)
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate post policy: %w", err)
	}

	// Return the URL and the form fields (Signature, Policy, etc.)
	// The frontend needs ALL of these to construct the FormData.
	return url.String(), formData, nil
}

// PresignGet generates a temporary download URL (for private buckets).
func (m *MinioProvider) PresignGet(ctx context.Context, bucket Bucket, key string, expiry time.Duration) (string, error) {
	// PresignedGetObject generates a GET URL.
	u, err := m.client.PresignedGetObject(ctx, string(bucket), key, expiry, nil)
	if err != nil {
		return "", mapMinioError(err)
	}
	return u.String(), nil
}

// Copy performs a Server-Side Copy.
func (m *MinioProvider) Copy(ctx context.Context, srcBucket Bucket, srcKey string, destBucket Bucket, destKey string) error {
	// Define Source
	srcOpts := minio.CopySrcOptions{
		Bucket: string(srcBucket),
		Object: srcKey,
	}

	// Define Destination
	destOpts := minio.CopyDestOptions{
		Bucket: string(destBucket),
		Object: destKey,
	}

	// Perform the Copy
	_, err := m.client.CopyObject(ctx, destOpts, srcOpts)
	if err != nil {
		return mapMinioError(err)
	}

	return nil
}

// Delete removes a file.
func (m *MinioProvider) Delete(ctx context.Context, bucket Bucket, key string) error {
	opts := minio.RemoveObjectOptions{
		GovernanceBypass: true, // Useful if you have object locking enabled
	}

	err := m.client.RemoveObject(ctx, string(bucket), key, opts)
	if err != nil {
		return mapMinioError(err)
	}
	return nil
}

// Get returns the file stream.
func (m *MinioProvider) Get(ctx context.Context, bucket Bucket, key string) (io.ReadCloser, error) {
	// 1. Get the object handle
	obj, err := m.client.GetObject(ctx, string(bucket), key, minio.GetObjectOptions{})
	if err != nil {
		return nil, mapMinioError(err)
	}

	// 2. IMPORTANT: GetObject does not verify existence immediately.
	// We must call Stat() to ensure the file exists before returning the stream.
	_, err = obj.Stat()
	if err != nil {
		// If Stat fails, the file likely doesn't exist or we can't access it.
		// We define a specific error response for "NoSuchKey".
		return nil, mapMinioError(err)
	}

	// Returns the object which implements io.ReadCloser
	return obj, nil
}

// --- Helper: Error Mapping ---

// mapMinioError translates MinIO SDK errors into our domain errors
func mapMinioError(err error) error {
	if err == nil {
		return nil
	}

	// Check for MinIO specific error response
	errResp := minio.ToErrorResponse(err)

	switch errResp.Code {
	case "NoSuchKey":
		return ErrNotFound
	case "AccessDenied":
		return ErrAccessDenied
	}

	// Also check HTTP status codes if Code is empty
	if errResp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if errResp.StatusCode == http.StatusForbidden {
		return ErrAccessDenied
	}

	// Return the original error if we can't map it
	return fmt.Errorf("storage provider error: %w", err)
}
