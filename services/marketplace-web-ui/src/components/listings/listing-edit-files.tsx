import type { ListingFile } from "@/lib/api/models";
import {
    AlertOctagon,
    AlertTriangle,
    CheckCircle2,
    FileIcon,
    HelpCircle,
    ImageIcon,
    Layers,
    Loader2,
    Maximize2,
    Trash2,
    Upload,
    X,
    XCircle
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "../ui/dialog";
import { FormLabel } from "../ui/form";
import { ScrollArea } from "../ui/scroll-area";
import { Model3DDialog } from "./model-render-dialog";

// --- Types ---
export interface ListingEditFilesProps {
    files: ListingFile[];
    onUploadFile: (file: File) => Promise<void>;
    valdateUploadFile: (file: File) => string | null;
    onDeleteFile: (fileId: string) => Promise<void>;
}

// --- Component: Full Screen Lightbox ---
function ImagePreviewModal({ 
    url, 
    onClose 
}: { 
    url: string | null, 
    onClose: () => void 
}) {
    if (!url) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div className="relative max-h-screen max-w-screen p-4">
                <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute -top-12 right-4 text-white hover:bg-white/20 hover:text-white"
                    onClick={onClose}
                >
                    <X className="h-6 w-6" />
                </Button>
                <img 
                    src={url} 
                    alt="Preview" 
                    className="max-h-[90vh] max-w-[90vw] object-contain rounded-md shadow-2xl"
                    onClick={(e) => e.stopPropagation()} // Prevent closing when clicking image itself
                />
            </div>
        </div>
    );
}
// --- Component: Status Badge ---
function FileStatusBadge({ status, errorMessage }: { status: string, errorMessage?: string | null }) {
    if (status === "PENDING") {
        return (
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Processing
            </div>
        );
    }
    if (status === "INVALID") {
        return (
            <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                <XCircle className="h-3 w-3" /> Invalid
            </div>
        );
    }
    if (status === "FAILED") {
        return (
            <Dialog>
                <DialogTrigger asChild>
                    <button className="flex cursor-pointer items-center gap-1.5 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400">
                        <AlertOctagon className="h-3 w-3" /> System Error <HelpCircle className="h-3 w-3 ml-1" />
                    </button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-orange-600">
                            <AlertOctagon className="h-5 w-5" /> Processing Error
                        </DialogTitle>
                        <DialogDescription className="pt-2">
                             We encountered an issue processing this file. Our team has been notified. You do not need to re-upload.
                        </DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
        );
    }
    if (status === "VALID" && errorMessage) {
         return (
            <div className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                <AlertTriangle className="h-3 w-3" /> Warning
            </div>
        );
    }
    
    return (
        <div className="flex items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" /> Ready
        </div>
    );
}

// --- Section: Gallery Images (Marketing) ---
export function ListingEditImages(props: ListingEditFilesProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            await props.onUploadFile(e.target.files[0]);
            e.target.value = ""; 
        }
    };

    // Filter: Images created by USER (not generated)
    const images = props.files.filter(f => f.file_type.toUpperCase() === "IMAGE" && !f.is_generated);

    return (
        <>
            <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <FormLabel className="text-base font-semibold">Gallery Images</FormLabel>
                        <p className="text-sm text-muted-foreground">User-uploaded marketing images.</p>
                    </div>
                    <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        className="gap-2"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="h-4 w-4" /> Upload
                    </Button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileChange}
                    />
                </div>

                {/* GRID LAYOUT FOR LARGER IMAGES */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {images.map((file) => (
                        <div key={file.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted shadow-sm hover:shadow-md transition-all">
                            
                            {/* Image */}
                            {file.file_path ? (
                                <img 
                                    src={file.file_path} 
                                    alt="Gallery" 
                                    className="h-full w-full cursor-pointer object-cover transition-transform duration-300 group-hover:scale-105"
                                    onClick={() => setPreviewUrl(file.file_path)}
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                                </div>
                            )}

                            {/* Overlay Actions */}
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                {file.file_path && (
                                    <Button type="button" size="icon" variant="secondary" className="h-7 w-7 rounded-full shadow-sm" onClick={() => setPreviewUrl(file.file_path!)}>
                                        <Maximize2 className="h-3 w-3" />
                                    </Button>
                                )}
                                <Button type="button" size="icon" variant="destructive" className="h-7 w-7 rounded-full shadow-sm" onClick={() => props.onDeleteFile(file.id)}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>

                            {/* Bottom Status Bar */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                                <div className="flex items-center justify-between">
                                    <FileStatusBadge status={file.status} errorMessage={file.error_message} />
                                    {file.size > 0 && <span className="text-[10px] text-white/80">{(file.size / 1024 / 1024).toFixed(1)}MB</span>}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Empty State / Upload Placeholder */}
                    {images.length === 0 && (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 hover:bg-muted/50"
                        >
                            <Upload className="h-8 w-8 text-muted-foreground/50" />
                            <span className="mt-2 text-sm font-medium text-muted-foreground">Upload Image</span>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

export function ListingEditModels(props: ListingEditFilesProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // State to track which model is currently open in the 3D modal
    const [activeModel, setActiveModel] = useState<ListingFile | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            await props.onUploadFile(e.target.files[0]);
            e.target.value = "";
        }
    };

    // 1. Get Models
    const models = useMemo(() => 
        props.files.filter(f => f.file_type.toUpperCase() === "MODEL" && !f.is_generated),
    [props.files]);

    // 2. Get Renders helper
    const getRendersForModel = (modelId: string) => 
        props.files.filter(f => f.is_generated && f.source_file_id === modelId);

    return (
        <>
            {/* The Interactive Modal */}
            <Model3DDialog 
                file={activeModel} 
                isOpen={!!activeModel} 
                onClose={() => setActiveModel(null)} 
            />

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <FormLabel className="text-base font-semibold">3D Models</FormLabel>
                        <p className="text-sm text-muted-foreground">Upload your STL files.</p>
                    </div>
                    <div>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".stl"
                            onChange={handleFileChange}
                        />
                        <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            className="gap-2"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="h-4 w-4" /> Add Model
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {models.map(model => {
                        const renders = getRendersForModel(model.id);

                        return (
                            <div key={model.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                                {/* Header */}
                                <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <FileStatusBadge status={model.status} errorMessage={model.error_message} />
                                        </div>
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="text-muted-foreground hover:text-red-600"
                                        onClick={() => props.onDeleteFile(model.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>

                                {/* Body */}
                                <div className="grid grid-cols-1">
                                    {/* Render List */}
                                    <div className="flex flex-col bg-background p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Layers className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                    Generated Renders
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground">{renders.length} files</span>
                                        </div>

                                        <ScrollArea className="flex-1 -mx-4 px-4 h-full max-h-[200px]">
                                            <div className="grid grid-cols-3 gap-2 pb-2">
                                                {renders.map(render => (
                                                    <div 
                                                        key={render.id} 
                                                        className="group relative aspect-square cursor-default overflow-hidden rounded-md border bg-muted"
                                                    >
                                                        {render.file_path ? (
                                                            <img src={render.file_path} className="h-full w-full object-cover" alt="Render" />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center">
                                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                                {renders.length === 0 && (
                                                    <div className="col-span-3 flex h-24 flex-col items-center justify-center rounded border border-dashed text-muted-foreground">
                                                        <span className="text-xs">No renders yet</span>
                                                    </div>  
                                                )}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </div>

                                {/* Footer: View 3D Button */}
                                <div className="flex items-center justify-end border-t bg-muted/30 px-4 py-3">
                                    {model.file_path && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            // Blue tint styling
                                            className="gap-2 border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/40"
                                            onClick={() => setActiveModel(model)}
                                            disabled={model.status !== "VALID"}
                                        >
                                            <Maximize2 className="h-4 w-4" />
                                            View Interactive 3D
                                        </Button>
                                    )}
                                </div>  
                            </div>
                        );
                    })}

                    {models.length === 0 && (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 hover:bg-muted/50"
                        >
                             <FileIcon className="h-8 w-8 text-muted-foreground/40" />
                             <span className="mt-2 font-medium text-muted-foreground">No models uploaded yet</span>
                             <span className="text-xs text-muted-foreground">Click to upload STL files</span>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}