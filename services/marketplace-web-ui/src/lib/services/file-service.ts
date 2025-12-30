import { apiClient } from "@/lib/api/http";
import { type CreateListingFile, type PresignRequest, type PresignResponse } from "@/lib/api/models";
import axios from "axios";

export const FileService = {
  /**
   * Orchestrates the full upload flow:
   * 1. Ask Backend for permission (Presign)
   * 2. Upload file directly to Cloud/MinIO
   * 3. Return the storage Key
   */
  async uploadFile(
    file: File, 
    type: string,
    draftId: string,
    onProgress?: (percent: number) => void,
): Promise<CreateListingFile> {
    // Step 1: Get Presigned URL
    const preSignPayload: PresignRequest = {
      type,
      filename: file.name,
      content_type: file.type,
      draft_id: draftId,
    };

    const { data: presign } = await apiClient.post<PresignResponse>(
      "/files/presign", 
      preSignPayload
    );

    // Step 2: Prepare the upload to MinIO/S3
    // MUST append 'fields' before the 'file' in FormData
    const formData = new FormData();
    Object.entries(presign.fields).forEach(([k, v]) => {
      formData.append(k, v);
    });
    formData.append("file", file);

    // Step 3: Direct Upload to MinIO/S3
    // We use a plain axios instance here to avoid sending Auth headers to S3
    await axios.post(presign.uploadUrl, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      }
    });

    return {
      path: presign.key,
      type,
      size: file.size
    }; // Return the path for the next step
  },
};