import type { ListingFile } from "@/lib/api/models"
import { cn } from "@/lib/utils"
import { Cuboid } from "lucide-react"
import { useState } from "react"

interface ListingGalleryProps {
  images: ListingFile[]
  className?: string
}

export function ListingGallery({ images, className }: ListingGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (!images.length) return null

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Main Image */}
      <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted sm:aspect-video">
        <img
          src={images[selectedIndex].file_path || images[selectedIndex].file_url}
          alt="Main product view"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        
        {/* 3D Badge Overlay */}
        <button className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-md transition-colors hover:bg-black/80">
          <Cuboid className="h-4 w-4" />
          View 3D
        </button>
      </div>

      {/* Thumbnails */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {images.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedIndex(idx)}
            className={cn(
              "shrink-0 w-24 aspect-square rounded-lg border-2 overflow-hidden bg-muted transition-all",
              selectedIndex === idx 
                ? "border-primary ring-2 ring-primary/20" 
                : "border-transparent opacity-70 hover:opacity-100 hover:border-muted-foreground/30"
            )}
          >
            <img src={img.file_path || img.file_url} alt={`Thumbnail ${idx}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}