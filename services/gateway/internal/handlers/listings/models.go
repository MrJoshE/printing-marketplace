package listings

import (
	"encoding/json"
	"time"
)

type CreateListingRequest struct {
	// Core Identity
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Categories  []string `json:"categories"`
	License     string   `json:"license"`

	// Sales & Merch
	// Note: TS sends 'price' as a number (float), likely in major units (e.g., 10.50).
	// We will convert this to 'PriceMinUnit' in the service logic.
	PriceMinUnit int64  `json:"price_min_unit"`
	Currency     string `json:"currency"`
	IsFree       bool   `json:"isFree"`

	// Slicer & Tech Specs
	PrinterSettings ListingPrinterSettings `json:"printerSettings"`
	Dimensions      *ListingDimensions     `json:"dimensions"`

	// Legal, Safety & Content
	IsNSFW     bool `json:"isNSFW"`
	IsPhysical bool `json:"isPhysical"`

	// AI Generation
	IsAIGenerated bool    `json:"isAIGenerated"`
	AIModelName   *string `json:"aiModelName"` // Nullable

	// Community
	IsRemixingAllowed bool `json:"isRemixingAllowed"`

	Files []CreateListingFile `json:"files"`
}

type UpdateListingRequest struct {
	// Core Identity
	Title       *string  `json:"title"` // Pointer allows distinguishing "" from nil
	Description *string  `json:"description"`
	Categories  []string `json:"categories"` // Slices are nil by default, so this works fine
	License     *string  `json:"license"`

	// Sales
	PriceMinUnit *int64  `json:"price_min_unit"`
	Currency     *string `json:"currency"`
	IsFree       *bool   `json:"isFree"`

	// Nested Structs (Make the struct itself a pointer)
	PrinterSettings *UpdateListingPrinterSettings `json:"printerSettings"`
	Dimensions      *ListingDimensions            `json:"dimensions"`

	// Safety
	IsNSFW     *bool `json:"isNSFW"`
	IsPhysical *bool `json:"isPhysical"`

	IsAIGenerated *bool   `json:"isAIGenerated"`
	AIModelName   *string `json:"aiModelName"`

	// Community
	IsRemixingAllowed *bool `json:"isRemixingAllowed"`
}
type UpdateListingPrinterSettings struct {
	NozzleDiameter         *string   `json:"nozzleDiameter"`
	NozzleTemperature      *float64  `json:"nozzleTemperature"` // Pointer for null
	RecommendedMaterials   *[]string `json:"recommendedMaterials"`
	RecommendedNozzleTempC *float64  `json:"recommendedNozzleTempC"`
	IsAssemblyRequired     *bool     `json:"isAssemblyRequired"`
	IsHardwareRequired     *bool     `json:"isHardwareRequired"`
	IsMulticolor           *bool     `json:"isMulticolor"`
	HardwareRequired       *[]string `json:"hardwareRequired"`
}

type ListingDimensions struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}
type ListingPrinterSettings struct {
	NozzleDiameter         *string   `json:"nozzleDiameter"`
	NozzleTemperature      *float64  `json:"nozzleTemperature"` // Pointer for null
	RecommendedMaterials   *[]string `json:"recommendedMaterials"`
	RecommendedNozzleTempC *float64  `json:"recommendedNozzleTempC"`
	IsAssemblyRequired     bool      `json:"isAssemblyRequired"`
	IsHardwareRequired     bool      `json:"isHardwareRequired"`
	IsMulticolor           bool      `json:"isMulticolor"`
	HardwareRequired       *[]string `json:"hardwareRequired"`
}

type CreateListingFile struct {
	Type string `json:"type"` // e.g. "model" or "image"
	Path string `json:"path"` // e.g. "incoming/user_123/uuid.stl"
	Size int64  `json:"size"` // in bytes
}

type ListingFileDTO struct {
	ID           string          `json:"id"`
	FilePath     *string         `json:"file_path"` // Presigned URL for accessing the file if the file has been validated
	FileType     string          `json:"file_type"`
	Status       string          `json:"status"`
	Size         int64           `json:"size"`
	Metadata     json.RawMessage `json:"metadata"`
	ErrorMessage *string         `json:"error_message"`
	IsGenerated  bool            `json:"is_generated"`
	SourceFileID *string         `json:"source_file_id,omitempty"`
}

// ListingResponse maps to the TypeScript interface 'ListingProps'
type ListingResponse struct {
	ID string `json:"id"`

	// --- Seller Info ---
	SellerID       string `json:"seller_id"`
	SellerName     string `json:"seller_name"`
	SellerUsername string `json:"seller_username"`
	SellerVerified bool   `json:"seller_verified"`

	// --- Core Info ---
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	PriceMinUnit int64    `json:"price_min_unit"`
	Currency     string   `json:"currency"`
	Categories   []string `json:"categories"`
	License      string   `json:"license"`

	// --- Files & Images ---
	ThumbnailPath *string          `json:"thumbnail_path"`
	Files         []ListingFileDTO `json:"files"`

	// --- Remixing ---
	IsRemixingAllowed bool    `json:"is_remixing_allowed"`
	ParentListingID   *string `json:"parent_listing_id"`

	// --- Physical Properties ---
	IsPhysical       bool `json:"is_physical"`
	TotalWeightGrams *int `json:"total_weight_grams"`

	// Dimensions (Flattened for Client from DB JSONB)
	// Note: Map DB "width" -> DimX, "depth" -> DimY, "height" -> DimZ
	DimXMM *int `json:"dim_x_mm"`
	DimYMM *int `json:"dim_y_mm"`
	DimZMM *int `json:"dim_z_mm"`

	// Assembly Hardware
	IsAssemblyRequired bool      `json:"is_assembly_required"`
	IsHardwareRequired bool      `json:"is_hardware_required"`
	HardwareRequired   *[]string `json:"hardware_required"`

	// --- Printer Settings ---
	IsMulticolor           bool     `json:"is_multicolor"`
	RecommendedMaterials   []string `json:"recommended_materials"`
	RecommendedNozzleTempC *int     `json:"recommended_nozzle_temp_c"`

	// --- AI Info ---
	IsAIGenerated bool    `json:"is_ai_generated"`
	AIModelName   *string `json:"ai_model_name"`

	// --- Legal & Safety ---
	IsNSFW bool `json:"is_nsfw"`

	// --- Social Signals ---
	LikesCount     int `json:"likes_count"`
	DownloadsCount int `json:"downloads_count"`
	CommentsCount  int `json:"comments_count"`

	// --- Sales ---
	IsSaleActive     bool       `json:"is_sale_active"`
	SaleName         *string    `json:"sale_name"`
	SaleEndTimestamp *time.Time `json:"sale_end_timestamp"`

	// --- Metadata ---
	Status        string     `json:"status"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	LastIndexedAt *time.Time `json:"last_indexed_at"`
	DeletedAt     *time.Time `json:"deleted_at,omitempty"` // omitempty is useful here
}

// Helper struct for unmarshalling the DB JSONB column internally
// Usage: json.Unmarshal(dbListing.DimensionsMm, &dims)
type ListingDimensionsJSON struct {
	Width  int `json:"width"`  // Maps to DimX
	Depth  int `json:"depth"`  // Maps to DimY
	Height int `json:"height"` // Maps to DimZ
}
