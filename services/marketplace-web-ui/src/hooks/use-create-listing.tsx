import { type CreateListingRequest } from "@/lib/api/models";
import { FileService } from "@/lib/services/file-service";
import { ListingService } from "@/lib/services/listing-service";
import { useMutation } from "@tanstack/react-query";

interface FormValues extends Omit<CreateListingRequest, "files"> {
  files: { type: string; file: File; size: number }[];
  idempotencyKey: string;
}

export function useCreateListing() {
  return useMutation({
    mutationFn: async (values: FormValues) => {
      // 1. Upload Images in parallel
      const filePromises = values.files
        .filter(f => f.type === "image" || f.type === "model")
        .map((file) => 
          FileService.uploadFile(file.file, file.type, values.idempotencyKey)
        );

      // Wait for all uploads
      const files = await Promise.all(filePromises);

      // 3. Create the actual listing with the returned keys
      return ListingService.create({
        title: values.title,
        description: values.description,
        price_min_unit: values.price_min_unit,
        currency: values.currency,
        categories: values.categories,
        license: values.license,
        printerSettings: values.printerSettings,
        dimensions: values.dimensions,
        isNSFW: values.isNSFW,
        isPhysical: values.isPhysical,
        isAIGenerated: values.isAIGenerated,
        isFree: values.isFree,
        aiModelName: values.aiModelName,
        isRemixingAllowed: values.isRemixingAllowed,
        files,
      }, values.idempotencyKey);
    },
  });
}