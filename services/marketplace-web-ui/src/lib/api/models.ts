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
  type:string;  
  path: string;
  size: number;
}

export interface CreateListingRequest {
  title: string;
  description: string;
  price: number;
  categories: string[];
  license: string;
  
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

    files: ListingFile[]
    
    // Title of the listing
    title: string

    // Description of the listing
    description: string

    // Information about the seller of the listing
    seller_name: string
    seller_username:string

    // Payment details for the listing
    price_min_unit: number;
    currency: string;

    // Under which license the listing is provided
    license: string;

    // Tags or categories associated with the listing
    categories: string[];

    created_at: string;
    updated_at: string;
    last_indexed_at: string;

    status: "PENDING_VALIDATION" | "ACTIVE" | "INACTIVE" | "REJECTED"

}

export type IndexedListingProps = Omit<ListingProps, "description" | "files">;