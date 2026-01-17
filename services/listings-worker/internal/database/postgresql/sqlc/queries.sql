-- name: GetListingByID :one
SELECT 
    *
FROM listings 
WHERE id = $1 AND deleted_at IS NULL;

-- name: MarkListingAsIndexed :exec
-- The worker calls this AFTER successfully pushing to Typesense
UPDATE listings 
SET last_indexed_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: GetFilesByListingID :many
SELECT * FROM listing_files 
WHERE listing_id = $1 AND deleted_at IS NULL;
