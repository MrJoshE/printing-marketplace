"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Check,
  File,
  FileBox,
  Trash2,
  UploadCloud
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface FileState {
  id: string;
  file: File;
  // We keep progress/status types for compatibility, but status will essentially jump to success
  progress: number; 
  status: "idle" | "uploading" | "success" | "error";
  error?: string;
  key?: string; 
  preview?: string; 
  size: number;
}

interface FileUploadProps {
  files: FileState[];
  setFiles: (files: FileState[]) => void;
  validFileTypes: string[]; 
  maxFileSizeInMB?: number;
  maxFiles?: number;
  onError?: (error: Error) => boolean | void;
  disabled?: boolean;
}

export default function FileUpload({
  files,
  setFiles,
  validFileTypes,
  maxFileSizeInMB = 10,
  maxFiles = 5,
  onError,
  disabled = false,
}: FileUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    if (file.size > maxFileSizeInMB * 1024 * 1024) {
      toast.error(`File ${file.name} exceeds ${maxFileSizeInMB}MB limit.`);
      return false;
    }

    const mimeToExt: Record<string, string[]> = {
      "model/stl": ["stl"],
      "model/obj": ["obj"],
      "model/gltf-binary": ["glb", "gltf"],
      "model/3mf": ["3mf"],
      "application/zip": ["zip", "rar", "7z"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
      "image/webp": ["webp"],
    };

    const fileExt = file.name.split(".").pop()?.toLowerCase();
    
    if (validFileTypes.includes(file.type)) return true;

    const allowedExtensions = validFileTypes.flatMap((type) => mimeToExt[type] || []);
    if (fileExt && allowedExtensions.includes(fileExt)) return true;

    toast.error(`File type "${file.name}" is not supported.`);
    return false;
  };

  const handleFiles = (newFiles: File[]) => {
    if (disabled) return;
    
    if (files.length + newFiles.length > maxFiles) {
      toast.error(`Limit reached: You can only upload ${maxFiles} files here.`);
      return;
    }

    // CHANGE: Mark as "success" immediately upon passing validation
    const validNewFiles = newFiles.filter(validateFile).map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 100, // Instant 100%
      status: "success" as const, 
      size: file.size,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
    }));

    if (validNewFiles.length > 0) {
      setFiles([...files, ...validNewFiles]);
    }
  };

  useEffect(() => {
    return () => {
      files.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, []); 

  const removeFile = (id: string) => {
    setFiles(files.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const renderPreview = (fileState: FileState) => {
    if (fileState.preview) {
      return (
        <div className="relative h-10 w-10 overflow-hidden rounded bg-muted">
           <img 
             src={fileState.preview} 
             alt="Preview" 
             className="h-full w-full object-cover" 
           />
        </div>
      );
    }
    
    if (fileState.file.name.match(/\.(stl|obj|glb|gltf|3mf)$/i)) {
        return (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-amber-100/50 text-amber-600">
                <FileBox className="h-5 w-5" />
            </div>
        );
    }

    return (
        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-muted-foreground">
            <File className="h-5 w-5" />
        </div>
    );
  };

  return (
    <div className="w-full space-y-4">
      {/* 1. DROP ZONE */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center w-full rounded-lg border-2 border-dashed px-6 py-8 transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20",
          disabled && "opacity-60 cursor-not-allowed",
          files.length >= maxFiles ? "hidden" : "flex" 
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragActive(false);
          if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
        }}
      >
         <UploadCloud className="h-8 w-8 text-muted-foreground mb-3" />
         <div className="text-center space-y-1">
            <label htmlFor="file-upload" className="relative cursor-pointer text-primary hover:underline font-semibold text-sm">
                <span>Click to attach</span>
                <input 
                  id="file-upload" 
                  type="file" 
                  className="sr-only" 
                  multiple 
                  accept={validFileTypes.join(",")} 
                  onChange={(e) => {
                      if(e.target.files) handleFiles(Array.from(e.target.files));
                      if (fileInputRef.current) fileInputRef.current.value = "";
                  }} 
                  ref={fileInputRef} 
                  disabled={disabled} 
                />
            </label>
            <span className="text-sm text-muted-foreground"> or drag files here</span>
            <p className="text-xs text-muted-foreground pt-1">
                {files.length} / {maxFiles} files attached. (Max {maxFileSizeInMB}MB each)
            </p>
         </div>
      </div>

      {/* 2. TABLE LIST */}
      {files.length > 0 && (
        <div className="rounded-md border border-border divide-y divide-border bg-card">
            {files.map((fileState) => {
                return (
                    <div key={fileState.id} className="flex items-center gap-4 p-3 hover:bg-muted/30 transition-colors">
                        {/* Column 1: Preview Icon */}
                        <div className="shrink-0">
                            {renderPreview(fileState)}
                        </div>

                        {/* Column 2: File Info */}
                        <div className="flex-1 min-w-0 grid gap-0.5">
                            <p className="text-sm font-medium truncate text-foreground">
                                {fileState.file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {formatFileSize(fileState.file.size)}
                            </p>
                        </div>

                        {/* Column 3: Status (Ready / Error) */}
                        <div className="w-[100px] shrink-0 flex justify-end">
                            {fileState.status === "error" ? (
                                <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                                    Error
                                </Badge>
                            ) : (
                                // CHANGE: Static "Ready" badge instead of Progress Bar
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 gap-1 px-2 h-6 font-medium">
                                    <Check className="w-3 h-3" />
                                    Ready
                                </Badge>
                            )}
                        </div>

                        {/* Column 4: Actions */}
                        <div className="shrink-0">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => removeFile(fileState.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
      )}
    </div>
  );
}