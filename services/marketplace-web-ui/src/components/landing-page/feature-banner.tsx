import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowRight, Star, UserPlus } from "lucide-react"
import React from "react"

interface FeaturedBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  badgeText?: string
  title: string
  description: string
  imageUrl: string
  imageAlt?: string
  
  /**
   * Number of lines to clamp the description to.
   * Pass a tailwind line-clamp class like "line-clamp-3" or "line-clamp-4".
   * Defaults to "line-clamp-3".
   */
  textClamp?: "line-clamp-1" | "line-clamp-2" | "line-clamp-3" | "line-clamp-4" | "line-clamp-5" | "line-clamp-none"
  
  primaryAction?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
}

export function FeaturedBanner({
  badgeText = "Designer of the Week",
  title,
  description,
  imageUrl,
  imageAlt = "Featured Image",
  textClamp = "line-clamp-4", // Default to 4 lines
  primaryAction,
  secondaryAction,
  className,
  ...props
}: FeaturedBannerProps) {
  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border border-border bg-background shadow-2xl",
        "min-h-[300px] md:max-h-[450px]", 
        className
      )}
      {...props}
    >
      {/* 1. IMAGE LAYER */}
      <div className="absolute right-0 top-0 bottom-0 z-0 h-full w-full md:w-2/3 lg:w-3/5">
        <img
          src={imageUrl}
          alt={imageAlt}
          className="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
        />
      </div>

      {/* 2. GRADIENT LAYER */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-background via-background/80 to-transparent md:bg-gradient-to-r md:from-background md:via-background/90 md:to-transparent" />

      {/* 3. CONTENT LAYER */}
      <div className="relative z-20 flex h-full flex-col justify-center p-8 md:p-12 md:w-2/3 lg:w-1/2">
        <div className="flex flex-col items-start gap-4">
          
          {badgeText && (
            <Badge 
              variant="outline" 
              className="backdrop-blur-sm border-primary/20 bg-primary/20 px-3 py-1 text-primary hover:bg-primary/25"
            >
              <Star className="mr-1 h-3.5 w-3.5 fill-current" />
              <span className="text-xs font-medium uppercase tracking-wider">
                {badgeText}
              </span>
            </Badge>
          )}

          <h2 className="text-4xl font-medium tracking-tight text-foreground md:text-5xl lg:text-6xl">
            {title}
          </h2>

          <p 
            className={cn(
              "max-w-lg text-base leading-relaxed text-muted-foreground",
              // Apply the configurable clamp class here
              textClamp 
            )}
          >
            {description}
          </p>

          <div className="flex flex-wrap gap-4 pt-4">
            {primaryAction && (
              <Button 
                size="lg" 
                variant={"default"}
                onClick={primaryAction.onClick} 
                className="gap-2  px-6 font-medium  hover:bg-primary/90"
              >
                {primaryAction.label}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            
            {secondaryAction && (
              <Button 
                variant="outline" 
                size="lg" 
                onClick={secondaryAction.onClick}
                className="gap-2 border-input bg-background/50 font-bold backdrop-blur-sm hover:bg-accent hover:text-accent-foreground"
              >
                <UserPlus className="h-5 w-5" />
                {secondaryAction.label}
              </Button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}