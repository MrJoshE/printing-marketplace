-- name: GetListingByID :one
SELECT * FROM listings 
    WHERE id = $1 AND deleted_at IS NULL;

-- name: GetListingByIDAdmin :one
SELECT * FROM listings WHERE id = $1;

-- name: GetListingsByUserID :many
SELECT 
    l.*,
    COALESCE(
        json_agg(
            json_build_object(
                'id', f.id,
                'file_path', f.file_path,
                'file_type', f.file_type,
                'status', f.status,
                'error_message', f.error_message,
                'is_generated', f.is_generated,
                'source_file_id', f.source_file_id,
                'size', f.file_size,
                'metadata', f.metadata
            )
        ) FILTER (WHERE f.id IS NOT NULL), 
        '[]'
    )::jsonb AS files
FROM listings l
LEFT JOIN listing_files f ON l.id = f.listing_id AND f.deleted_at IS NULL
WHERE l.user_id = $1 AND l.deleted_at IS NULL
GROUP BY l.id
ORDER BY l.created_at DESC;

-- name: CreateListing :one
-- Note: 'categories' param must be passed as a string slice (text[]) in Go
INSERT INTO listings (
    user_id, seller_name, seller_username, title, description, price_min_unit, currency, categories, license, client_id, trace_id, thumbnail_path, status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
) RETURNING *;

-- name: UpdateListing :one
UPDATE listings SET
    title = $2,
    description = $3,
    price_min_unit = $4,
    currency = $5,
    categories = $6,
    license = $7,
    client_id = $8,
    trace_id = $9,
    thumbnail_path = $10,
    status = $11
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteListing :one
UPDATE listings 
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2 -- Ensure user owns it before deleting
    RETURNING *;

-- name: MarkListingAsIndexed :exec
-- The worker calls this AFTER successfully pushing to Typesense
UPDATE listings 
SET last_indexed_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: GetListingsForSync :many
-- Finds all listings that are new OR have been updated since the last sync
SELECT * FROM listings
WHERE (last_indexed_at IS NULL OR updated_at > last_indexed_at)
LIMIT $1;

-- name: CreateListingFile :one
INSERT INTO listing_files (
    listing_id, file_path, file_type, file_size, metadata, status
) VALUES (
    $1, $2, $3, $4, $5, $6
) RETURNING *;

-- name: GetFilesByListingID :many
SELECT * FROM listing_files 
WHERE listing_id = $1 AND deleted_at IS NULL;

-- name: SoftDeleteFile :exec
UPDATE listing_files
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = $1;