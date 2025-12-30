package storage

import (
	"context"
	"errors"
	"io"
	"time"
)

// Bucket represents a logical storage zone.
// We use a type alias to prevent passing random strings.
type Bucket string

const (
	// BucketIncoming: Private, 24h retention policy.
	// Users upload here directly.
	BucketIncoming Bucket = "incoming-files"

	// BucketPublic: Public Read.
	// Validated files are moved here for permanent hosting.
	BucketPublic Bucket = "public-files"
)

// Wrapper for standard errors so checking them is consistent
var (
	ErrNotFound     = errors.New("storage: file not found")
	ErrAccessDenied = errors.New("storage: access denied")
	ErrUploadFailed = errors.New("storage: upload failed")
)

type UploadConfig struct {
	Bucket      Bucket
	Key         string
	ContentType string
	MaxFileSize int64
	Expiry      time.Duration
}

// Provider abstracts S3, MinIO, or Google Cloud Storage.
type Provider interface {
	GenerateUploadURL(ctx context.Context, cfg UploadConfig) (string, map[string]string, error)

	// PresignGet generates a temporary download URL (if bucket is private).
	PresignGet(ctx context.Context, bucket Bucket, key string, expiry time.Duration) (string, error)

	// Copy moves a file internally (e.g., Quarantine -> Public).
	// This happens on the server side (MinIO/AWS) without downloading the data.
	Copy(ctx context.Context, srcBucket Bucket, srcKey string, destBucket Bucket, destKey string) error

	// Delete removes a file.
	Delete(ctx context.Context, bucket Bucket, key string) error

	// Get returns a stream. IMPORTANT: Use io.ReadCloser, NOT []byte.
	// This allows your Worker to scan a 1GB file without using 1GB RAM.
	Get(ctx context.Context, bucket Bucket, key string) (io.ReadCloser, error)
}
