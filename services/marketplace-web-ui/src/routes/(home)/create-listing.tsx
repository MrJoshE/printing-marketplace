import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AuthenticationRequired } from '@/components/authentication-required';
import { ListingStepper } from "@/components/create-listing/listing-stepper";
import { SiteHeader } from '@/components/marketplace-header';
import { type FileState } from "@/components/ui/file-upload";
import { useCreateListing } from '@/hooks/use-create-listing';
import { useListingDraft } from "@/hooks/use-listing-draft";
import { BackendError } from '@/lib/api/models';
import { useAuth } from '@/lib/auth/useAuth';

// Import Stages
import { StageAssets } from "@/components/create-listing/stage-assets";
import { StageCommerce } from "@/components/create-listing/stage-commerce";
import { StageDetails } from "@/components/create-listing/stage-details";
import { StageGeneral } from "@/components/create-listing/stage-general";

export const Route = createFileRoute('/(home)/create-listing')({
  component: CreateListingPage,
});
const queryClient = new QueryClient()
function CreateListingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <SiteHeader title='Create Listing' />
      <div className="container max-w-5xl mx-auto py-8 px-4 md:py-12">
        {isAuthenticated ? (
            <QueryClientProvider client={queryClient}> 
                <CreateListingFlow /> 
            </QueryClientProvider>
        ) : (
            <AuthenticationRequiredView />
        )}
      </div>
    </div>
  );
}

function CreateListingFlow() {
  const [currentStep, setCurrentStep] = useState(1);
  
  // Destructure clearDraft
  const { draft, updateDraft, isSaving, lastSaved, clearDraft, draftId, rotateDraftId } = useListingDraft();
  
  // Destructure mutationError to pass to the UI
  const { mutate, isPending, error: mutationError } = useCreateListing(); 

  const [productFiles, setProductFiles] = useState<FileState[]>([]);
  const [galleryFiles, setGalleryFiles] = useState<FileState[]>([]);

  const steps = [
    { id: 1, label: "Basics", description: "Title & Category" },
    { id: 2, label: "Assets", description: "Models & Images" },
    { id: 3, label: "Details", description: "Specs & Info" },
    { id: 4, label: "Commerce", description: "Price & License" },
  ];

  const next = () => {
      setCurrentStep(p => Math.min(p + 1, 4));
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const back = () => {
      setCurrentStep(p => Math.max(p - 1, 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePublish = async () => {
    // 1. Client-Side Validation
    if (productFiles.length === 0 || galleryFiles.length === 0) {
        toast.error("Missing Files", { 
            description: "Please upload at least one product file and one gallery image." 
        });
        return;
    }

    const finalPrice = draft.isFree ? 0 : Number(draft.price);

    const data = {
      idempotencyKey: draftId,
      ...draft,
        files: [
          ...galleryFiles.map(f => ({type: "image", file: f.file, size: f.size})),
           ...productFiles.map(f => ({type: "model", file: f.file, size: f.size}))
        ],
        price: finalPrice,
    };

    mutate(data, {
      onSuccess: (_) => {
        clearDraft(); 

        toast.success("Upload successful", {
            description: "Your design is now being processed and will be live shortly!",
            duration: 5000,
        });

      },
      onError: (err) => {
        console.error("Submission failed", err);
        
        let title = "Failed to create listing";
        let description = "Something went wrong. Please try again.";

        if (err instanceof BackendError) {
            title = "Validation Error";
            description = err.message; 
            if ( err.httpStatus > 299){
              rotateDraftId();
            }
        } else if (err.message.includes("Network")) {
            title = "Connection Error";
            description = "Could not reach the server.";
        }

        toast.error(title, { description });
      },
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
         <ListingStepper steps={steps} currentStep={currentStep} />
         
         {/* Auto-save indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-[100px] justify-end">
            {isSaving ? (
                <>
                    <Loader2 className="w-3 h-3 animate-spin" /> 
                    <span>Saving...</span>
                </>
            ) : lastSaved ? (
                <>
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span>Saved</span>
                </>
            ) : null}
         </div>
      </div>

      <div className="bg-card border rounded-xl p-6 md:p-8 shadow-sm transition-all">
        {currentStep === 1 && (
            <StageGeneral draft={draft} update={updateDraft} onNext={next} />
        )}
        
        {currentStep === 2 && (
            <StageAssets 
                productFiles={productFiles} setProductFiles={setProductFiles}
                galleryFiles={galleryFiles} setGalleryFiles={setGalleryFiles}
                onNext={next} onBack={back}
            />
        )}
        
        {currentStep === 3 && (
            <StageDetails draft={draft} update={updateDraft} onNext={next} onBack={back} />
        )}
        
        {currentStep === 4 && (
            <StageCommerce 
                draft={draft} update={updateDraft} 
                onPublish={handlePublish} onBack={back}
                isSubmitting={isPending}
                apiError={mutationError} // Pass error down
            />
        )}
      </div>
    </div>
  );
}

function AuthenticationRequiredView() {
    return (
        <div className="flex justify-center items-center h-[50vh] bg-muted/30 border rounded-lg">
            <AuthenticationRequired message="You must be logged in to list an item." />
        </div>
    );
}