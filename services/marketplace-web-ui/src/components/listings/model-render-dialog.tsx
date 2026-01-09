import type { ListingFile } from "@/lib/api/models";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "../ui/dialog";
import { ModelRender } from "./model-render"; // Import your existing renderer

export function Model3DDialog({ 
    file, 
    isOpen, 
    onClose 
}: { 
    file: ListingFile | null, 
    isOpen: boolean, 
    onClose: () => void 
}) {
    if (!file) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
                <DialogHeader className="px-4 py-3 border-b bg-background z-10 flex flex-row items-center justify-between">
                    <DialogTitle className="text-base font-medium flex items-center gap-2">
                        Interactive Preview
                        <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {(file.file_size / 1024 / 1024).toFixed(1)} MB
                        </span>
                    </DialogTitle>
                    {/* Close button handled by Dialog primitive usually, but explicit one helps on mobile */}
                </DialogHeader>
                
                <div className="flex-1 relative w-full h-full min-h-0">
                    {/* The 3D Render only lives here now */}
                    <ModelRender file={file} />
                </div>
            </DialogContent>
        </Dialog>
    );
}