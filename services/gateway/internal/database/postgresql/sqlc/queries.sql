-- name: GetListingByID :one
SELECT * FROM listings 
    WHERE id = $1 AND deleted_at IS NULL;

-- name: GetListingByIDWithFiles :one
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
WHERE l.id = $1 AND l.deleted_at IS NULL
GROUP BY l.id
ORDER BY l.created_at DESC;

-- name: GetListingByIDAdmin :one
SELECT * FROM listings WHERE id = $1;

-- name: GetListingsBySellerID :many
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
WHERE l.seller_id = $1 AND l.deleted_at IS NULL
GROUP BY l.id
ORDER BY l.created_at DESC;

-- name: CreateListing :one
-- Note: 'categories' and 'recommended_materials' must be passed as string slices (text[]) in Go
INSERT INTO listings (
    seller_id, 
    seller_name, 
    seller_username, 
    seller_verified, 
    
    title, 
    description, 
    price_min_unit, 
    currency, 
    categories, 
    license, 
    
    client_id, 
    trace_id, 
    thumbnail_path, 
    status,

    -- Remixing
    is_remixing_allowed,
    parent_listing_id,

    -- Physical Properties
    is_physical,
    total_weight_grams,
    is_assembly_required,
    is_hardware_required,
    hardware_required,
    is_multicolor,
    dimensions_mm,
    recommended_nozzle_temp_c,
    recommended_materials,
    sale_price,

    -- AI Info
    is_ai_generated,
    ai_model_name,

    is_nsfw
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
    $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
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
    status = $11,
    
    -- Update Remixing
    is_remixing_allowed = $12,

    -- Update Physical Properties
    is_physical = $13,
    total_weight_grams = $14,
    is_assembly_required = $15,
    is_hardware_required = $16,
    hardware_required = $17,
    is_multicolor = $18,
    dimensions_mm = $19,
    recommended_nozzle_temp_c = $20,
    recommended_materials = $21,

    -- Update AI Info
    is_ai_generated = $22,
    ai_model_name = $23,
    
    -- Always update timestamp
    updated_at = CURRENT_TIMESTAMP

WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteListing :one
UPDATE listings 
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND seller_id = $2 -- Ensure seller owns it before deleting
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
-- Used for initial user uploads
INSERT INTO listing_files (
    listing_id, file_path, file_type, file_size, metadata, status, is_generated
) VALUES (
    $1, $2, $3, $4, $5, $6, false
) RETURNING *;

-- name: CreateGeneratedFile :one
-- Used by the worker to save rendered images or derived models
INSERT INTO listing_files (
    listing_id, file_path, file_type, file_size, metadata, status, is_generated, source_file_id
) VALUES (
    $1, $2, $3, $4, $5, $6, true, $7
) RETURNING *;

-- name: GetFilesByListingID :many
SELECT * FROM listing_files 
WHERE listing_id = $1 AND deleted_at IS NULL;

-- name: SoftDeleteFile :exec
UPDATE listing_files
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: UpdateFileStatus :exec
-- Worker updates status (e.g., PENDING -> VALID)
UPDATE listing_files
SET 
    status = $2,
    error_message = $3,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;