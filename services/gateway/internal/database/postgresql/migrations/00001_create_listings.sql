-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create Enums for strict state management
CREATE TYPE listing_status AS ENUM ('PENDING_VALIDATION', 'ACTIVE', 'REJECTED', 'HIDDEN');
CREATE TYPE file_status AS ENUM ('PENDING', 'VALID', 'FAILED');
CREATE TYPE file_type AS ENUM ('MODEL', 'IMAGE');

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Links to Keycloak User UUID
    seller_name TEXT NOT NULL, 
    seller_username TEXT NOT NULL,
    
    title TEXT NOT NULL,
    description TEXT,
     -- Price stored in smallest unit (e.g., cents) to avoid floating point issues
    price_min_unit NUMERIC(12, 0) NOT NULL CHECK (price_min_unit >= 0),
    currency TEXT NOT NULL,
    categories TEXT[] NOT NULL DEFAULT '{}',
    license TEXT NOT NULL,

    client_id TEXT NOT NULL, -- For multi-tenant support
    trace_id TEXT NOT NULL, -- For tracking requests through the system

    -- Optimization: Store the path directly so you don't need a JOIN just to show a thumbnail
    thumbnail_path TEXT, 

    -- Timestamp of the last time this listing was indexed, if updated_at > last_indexed_at, re-index needed
    last_indexed_at TIMESTAMP WITH TIME ZONE,
    
    status listing_status DEFAULT 'PENDING_VALIDATION',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);


CREATE TABLE IF NOT EXISTS listing_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    
    file_path TEXT NOT NULL,
    file_type file_type NOT NULL,
    file_size BIGINT DEFAULT 0,
    
    -- JSONB allows "Schemaless" flexibility for file-specific data.
    -- For Models: {"vertices": 5000, "manifold": true, "format": "stl"}
    -- For Images: {"width": 1024, "height": 1024, "alt": "Front view"}
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Worker Fan-Out State
    status file_status DEFAULT 'PENDING',
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- INDEXES
-- 1. Main Filter: Array contains check
CREATE INDEX idx_listings_categories ON listings USING GIN (categories);

-- 2. Sync Worker: Delta check
CREATE INDEX idx_listings_sync_state ON listings (updated_at) INCLUDE (last_indexed_at); 

-- 3. User Portfolio: Composite sort (Replaces simple user_id index)
CREATE INDEX idx_listings_user_feed ON listings(user_id, created_at DESC) WHERE deleted_at IS NULL;

-- 4. Main Feed: Status + Sort
CREATE INDEX idx_listings_feed_optimization ON listings(status, created_at DESC) WHERE deleted_at IS NULL;

-- 5. FK Constraint Speed
CREATE INDEX idx_listing_files_listing_id ON listing_files(listing_id);

-- 6. Trace ID for debugging
CREATE INDEX idx_listings_trace_id ON listings(trace_id);

-- 7. The "Fan-In" Optimization Index
-- This makes the "Is listing done?" check instant (O(1)) instead of O(N)
CREATE INDEX idx_listing_files_remaining_work 
ON listing_files(listing_id) 
WHERE status = 'PENDING' AND deleted_at IS NULL;

-- TRIGGERS
CREATE TRIGGER update_listings_modtime BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_listing_files_modtime BEFORE UPDATE ON listing_files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_listings_trace_id;
DROP INDEX IF EXISTS idx_listing_files_listing_id;
DROP INDEX IF EXISTS idx_listings_feed_optimization;
DROP INDEX IF EXISTS idx_listings_user_feed;
DROP INDEX IF EXISTS idx_listings_sync_state;
DROP INDEX IF EXISTS idx_listings_categories;
DROP INDEX IF EXISTS idx_listings_status_deleted;
DROP INDEX IF EXISTS idx_listings_user_id;
DROP TABLE IF EXISTS listing_files;
DROP TABLE IF EXISTS listings;
DROP TYPE IF EXISTS file_type;
DROP TYPE IF EXISTS file_status;
DROP TYPE IF EXISTS listing_status;
-- +goose StatementEnd
