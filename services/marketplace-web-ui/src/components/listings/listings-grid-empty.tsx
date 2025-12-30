import { cn } from "@/lib/utils"
import { PackageOpen, type LucideIcon } from "lucide-react"
import React from "react"

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  icon?: LucideIcon
  action?: React.ReactNode
  animate?: boolean
}

export function ListingGridEmpty({
  title = "No items found",
  description = "There are no items to display at this time.",
  icon: Icon = PackageOpen,
  action,
  animate = true,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-[400px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted bg-muted/5 p-8 text-center",
        // Micro-interaction: Smooth entrance animation
        animate && "animate-in fade-in zoom-in-95 duration-500 slide-in-from-bottom-2",
        className
      )}
      {...props}
    >
      {/* Decorative Background Glow (Subtle) */}
      <div className="absolute inset-0 bg-gradient-to-tr from-background via-muted/10 to-background opacity-50" />

      {/* Icon Container with specific styling */}
      <div className="relative z-10 mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border transition-transform duration-500 hover:scale-110 hover:ring-primary/20">
        <Icon className="h-10 w-10 text-muted-foreground/50 transition-colors duration-300 group-hover:text-primary" />
      </div>

      {/* Text Content */}
      <div className="relative z-10 max-w-sm space-y-2">
        <h3 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="text-muted-foreground">
          {description}
        </p>
      </div>

      {/* Call to Action */}
      {action && (
        <div className="relative z-10 mt-8">
          {action}
        </div>
      )}
    </div>
  )
}