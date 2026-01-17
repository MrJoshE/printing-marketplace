import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FileUpload, { type FileState } from "@/components/ui/file-upload";
import { cn } from "@/lib/utils";
import { Check, FileBox, Image as ImageIcon, Lock } from "lucide-react";
import { useState } from "react";

interface StageAssetsProps {
  productFiles: FileState[];
  setProductFiles: React.Dispatch<React.SetStateAction<FileState[]>>;
  galleryFiles: FileState[];
  setGalleryFiles: React.Dispatch<React.SetStateAction<FileState[]>>;
  onNext: () => void;
  onBack: () => void;
}

export function StageAssets({
  productFiles,
  setProductFiles,
  galleryFiles,
  setGalleryFiles,
  onNext,
  onBack
}: StageAssetsProps) {
  
  const [coverImageId, setCoverImageId] = useState<string | null>(null);

  // Auto-set first image as cover if none selected
  if (galleryFiles.length > 0 && !coverImageId) {
    setCoverImageId(galleryFiles[0].id);
  }

  // --- Handlers (Simplified: No simulation) ---

  const handleProductChange = (newFiles: FileState[]) => {
      setProductFiles(newFiles);
  };

  const handleGalleryChange = (newFiles: FileState[]) => {
    setGalleryFiles(newFiles);
    
    // Reset cover image if current was deleted
    if (coverImageId && !newFiles.find(f => f.id === coverImageId)) {
        setCoverImageId(newFiles.length > 0 ? newFiles[0].id : null);
    }
  };

  // Validation: Need at least 1 product file and 1 image
  const canProceed = productFiles.length > 0 && galleryFiles.length > 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto space-y-8">
            
        {/* 1. PRODUCT FILES */}
        <Card className="overflow-hidden border-muted-foreground/20 shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                            <FileBox className="w-4 h-4 text-amber-600" />
                            Design Files
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Attach your source files (STL). Max 10.
                        </p>
                    </div>
                    <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 gap-1.5">
                        <Lock className="w-3 h-3" /> 
                        Private & Secure
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <FileUpload
                    files={productFiles}
                    setFiles={handleProductChange}
                    validFileTypes={["model/stl", "model/obj", "model/gltf-binary", "application/zip", "model/3mf"]}
                    maxFileSizeInMB={500}
                    maxFiles={10} 
                />
            </CardContent>
        </Card>

        {/* 2. GALLERY IMAGES */}
        <Card className="overflow-hidden border-muted-foreground/20 shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-blue-600" />
                            Gallery Thumbnails
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Attach images to show off your design. Max 5 images.
                        </p>
                    </div>
                    <Badge variant="outline" className="bg-background">Public</Badge>
                </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
                
                <FileUpload
                    files={galleryFiles}
                    setFiles={handleGalleryChange}
                    validFileTypes={["image/png", "image/jpeg", "image/webp"]}
                    maxFileSizeInMB={10}
                    maxFiles={5}
                />

                {/* COVER IMAGE SELECTOR */}
                {galleryFiles.length > 0 && (
                    <div className="rounded-lg border bg-muted/10 p-4 animate-in fade-in">
                        <h4 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Check className="w-3 h-3" /> Select Main Cover
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
                            {galleryFiles.map((img) => (
                                <div 
                                    key={img.id} 
                                    className={cn(
                                        "group relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all bg-background",
                                        coverImageId === img.id 
                                            ? "border-primary ring-2 ring-primary/20 shadow-md scale-[1.02]" 
                                            : "border-transparent hover:border-muted-foreground/30 hover:shadow-sm"
                                    )}
                                    onClick={() => setCoverImageId(img.id)}
                                >   
                                    {/* PREVIEW IMAGE RENDERING */}
                                    <div className="w-full h-full">
                                        <img 
                                            src={URL.createObjectURL(img.file)} 
                                            alt={img.file.name}
                                            className={cn(
                                                "w-full h-full object-cover transition-opacity",
                                                coverImageId === img.id ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                                            )} 
                                        />
                                    </div>
                                    
                                    {/* Cover Badge */}
                                    {coverImageId === img.id && (
                                        <div className="absolute inset-x-0 bottom-0 bg-primary/90 text-primary-foreground text-[9px] font-bold text-center py-1.5 uppercase tracking-wider">
                                            Main Cover
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>

      {/* Navigation Footer */}
      <div className="flex justify-between pt-8 border-t mt-8">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={!canProceed} size="lg" className="px-8 min-w-[140px]">
           Next: Details
        </Button>
      </div>
    </div>
  );
}