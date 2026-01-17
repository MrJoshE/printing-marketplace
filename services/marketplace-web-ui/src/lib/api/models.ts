
// Standard Backend Error Format
export interface ApiErrorResponse {
  error_code: string;
  message: string;
  request_id: string;
}

// Custom Error Class to throw in your app
export class BackendError extends Error {
  code: string;
  httpStatus: number;
  requestId: string;

  constructor(resp: ApiErrorResponse, httpStatus: number) {
    super(resp.message);
    this.name = "BackendError";
    this.code = resp.error_code;  
    this.httpStatus = httpStatus; 
    this.requestId = resp.request_id;
  }
}

// DTOs based on your Go structs
export interface PresignRequest {
  type: string;
  filename: string;
  content_type: string;
  draft_id: string;
}

export interface PresignResponse {
  uploadUrl: string;
  fields: Record<string, string>; // S3/MinIO specific fields
  key: string;                    // The path to save for later
}

export interface CreateListingFile {
  type: string;
  path: string;
  size: number;
}

export interface ListingDimensions {
  x: number;
  y: number;
  z: number;
}

export interface ListingPrinterSettings {
  nozzleDiameter: string | null;
  nozzleTemperature: number | null;
  recommendedMaterials: string[] | null;
  recommendedNozzleTempC: number | null;
  
  isAssemblyRequired: boolean;
  isHardwareRequired: boolean;
  isMulticolor: boolean;
  
  hardwareRequired: string[] | null;
}

export interface UpdateListingPrinterSettings {
  nozzleDiameter?: string | null;
  nozzleTemperature?: number | null;
  recommendedMaterials?: string[] | null;
  recommendedNozzleTempC?: number | null;
  isAssemblyRequired?: boolean | null;
  isHardwareRequired?: boolean | null;
  isMulticolor?: boolean | null;
  hardwareRequired?: string[] | null;
}

export interface UpdateListingRequest {
  // Core
  title?: string;
  description?: string;
  categories?: string[];
  license?: string;
  
  // Sales
  price_min_unit?: number;
  currency?: string;
  isFree?: boolean;

  // Nested
  printerSettings?: UpdateListingPrinterSettings;
  dimensions?: ListingDimensions;

  // Safety & Meta
  isNSFW?: boolean;
  isPhysical?: boolean;
  isAIGenerated?: boolean;
  aiModelName?: string | null;
  isRemixingAllowed?: boolean;
}

export interface CreateListingRequest {
  // Core Identity
  title: string;
  description: string;
  categories: string[];
  license: string;

  // Sales & Merch
  // Go expects 'price_min_unit' (int64). Ensure you convert 
  // major units (e.g. 10.50) to minor units (e.g. 1050) in the frontend.
  price_min_unit: number; 
  currency: string;
  isFree: boolean;

  // Slicer & Tech Specs
  printerSettings: ListingPrinterSettings;
  dimensions: ListingDimensions | null;

  // Legal, Safety & Content
  isNSFW: boolean;
  isPhysical: boolean;

  // AI Generation
  isAIGenerated: boolean;
  aiModelName: string | null;

  // Community
  isRemixingAllowed: boolean;

  files: CreateListingFile[];
}


// types.ts
export interface CategoryFilter {
  value: string | null;
  label: string;
}
export const AVAILABLE_CATEGORIES: CategoryFilter[] = [
  { value: "functional", label: "Functional Parts" },
  { value: "artistic", label: "Artistic & Miniatures" },
  { value: "prototypes", label: "Prototypes" },
  { value: "spare-parts", label: "Spare Parts" },
];

export interface ListingFile   {
  // Unique identifier of the file, use for deleting or referencing
  id: string;

  // Storage path -> URL to access the file
  file_path: string | null;

  // Type of the file, e.g., "model", "image", etc
  file_type: string;

  file_size: number;

  // Is this file system-generated (like renders) or user-uploaded  
  is_generated: boolean;

  // Optional source file ID if this file was derived from another file
  source_file_id?: string | null; 

  // Current status of the file, e.g. "pending", "valid", "invalid" or "failed"
  status: string;

  // The size of the file in bytes most likely 0 (don't rely on this or show it)
  size: number;

  // Some RAW JSON metadata associated with the file
  metadata: Record<string, any>;

  // Optional error message if the file is in an error state or a warning about the file.
  error_message?: string | null;
}

/**
 * Interface for the properties expected from
 */
export interface ListingProps {
    // The unique identifier of the listing to display
    id: string

    // URL of the cover image for the listing
    thumbnail_path?: string | null

    thumbnail_url?: string | null

    files: ListingFile[]
    
    // Title of the listing
    title: string

    // Description of the listing
    description: string

    // Payment details for the listing
    price_min_unit: number;
    currency: string;

    // Under which license the listing is provided
    license: string;

    // Categories associated with the listing
    categories: string[];

    // If this listing is a remix of another listing, the ID of the parent listing
    parent_listing_id?: string | null;

    // Physical dimensions (in mm) - vital for "Will this fit on my printer?" filters
    is_physical: boolean;
    total_weight_grams: number | null;
    dim_x_mm: number | null;
    dim_y_mm: number | null;
    dim_z_mm: number | null;

    is_assembly_required: boolean;
    is_hardware_required: boolean;
    hardware_required: string[] | null;

    // Remixing and modification permissions
    is_remixing_allowed: boolean;
    
    // Printer settings
    is_multicolor: boolean;
    recommended_materials: string[];
    recommended_nozzle_temp_c: number | null;

    // AI generation flags
    is_ai_generated: boolean;
    ai_model_name: string | null;

    // Legal, Safety & Content Rating
    is_nsfw: boolean;
    
    // Social Signals
    likes_count: number;
    downloads_count: number;
    comments_count: number;

    is_sale_active: boolean;
    sale_name: string | null;
    sale_end_timestamp: string | null; // Millseconds since epoch

    // Seller
    seller_id: string
    seller_name: string
    seller_verified: boolean
    seller_username:string

    // Timestamps
    created_at: string;
    updated_at: string;
    last_indexed_at?: string | null;

    status: "PENDING_VALIDATION" | "ACTIVE" | "INACTIVE" | "REJECTED"

}

export type IndexedListingProps = Omit<ListingProps, "description" | "files">;