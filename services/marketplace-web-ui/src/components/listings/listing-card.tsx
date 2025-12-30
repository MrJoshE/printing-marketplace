import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ListingSummary } from "@/lib/api/models";
import { cn, formatCurrency } from "@/lib/utils";
import { Loader2, MoreHorizontal, ShieldAlert } from "lucide-react";

interface ListingCardProps {
  listing: ListingSummary;
  onClick?: (listing: ListingSummary) => void; 
  className?: string;
}

export function ListingCard({ listing, onClick, className }: ListingCardProps) {
  const isPending = listing.status === "PENDING_VALIDATION";
  const isRejected = listing.status === "REJECTED";
  const isActive = listing.status === "ACTIVE";

  return (
    <div 
      onClick={( )=> onClick && onClick(listing)}
      className={cn(
        "group relative h-full flex flex-col outline-none cursor-pointer", 
        className
      )}
    >
      <Card 
        className={cn(
          "h-full overflow-hidden border-border bg-card transition-all duration-300",
          // Hover Effects based on status
          isActive && "hover:shadow-lg hover:-translate-y-1 hover:border-primary/50",
          isPending && "hover:border-yellow-500/50 cursor-wait",
          isRejected && "border-destructive/30 hover:border-destructive hover:shadow-destructive/10"
        )}
      >
        {/* --- Image Area --- */}
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          
          {/* Base Image */}
          {listing.coverImageUrl ? (
            <img
              src={listing.coverImageUrl}
              alt={listing.title}
              className={cn(
                "h-full w-full object-cover transition-transform duration-700",
                isActive && "group-hover:scale-105",
                // If not active, we dim the background image significantly
                !isActive && "opacity-40 grayscale scale-100" 
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/50 text-muted-foreground">
               {/* Fallback Icon if no image at all */}
               <MoreHorizontal className="h-8 w-8 opacity-20" />
            </div>
          )}

          {/* --- STATE OVERLAYS --- */}

          {/* 1. Pending Overlay */}
          {isPending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/20 backdrop-blur-[2px] p-4 text-center animate-in fade-in duration-300">
               <div className="relative">
                 <div className="absolute inset-0 animate-ping rounded-full bg-yellow-500/20 duration-1000" />
                 <div className="relative rounded-full bg-background p-2 shadow-sm ring-1 ring-yellow-500/30">
                   <Loader2 className="h-5 w-5 animate-spin text-yellow-600" />
                 </div>
               </div>
               <div className="space-y-0.5">
                 <p className="text-sm font-semibold text-foreground">Processing</p>
                 <p className="text-[10px] text-muted-foreground">Validating files...</p>
               </div>
            </div>
          )}

          {/* 2. Rejected Overlay */}
          {isRejected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-destructive/5 backdrop-blur-[1px] p-4 animate-in fade-in duration-300">
               <div className="rounded-full bg-background p-2 shadow-sm ring-1 ring-destructive/30">
                 <ShieldAlert className="h-6 w-6 text-destructive" />
               </div>
               <Badge variant="destructive" className="shadow-sm">
                 Action Required
               </Badge>
            </div>
          )}

          {/* 3. Active Details (Price/License) - Only show when Active */}
          {isActive && (
            <>
              <div className="absolute left-2 top-2">
                 <Badge variant="secondary" className="bg-background/80 text-[10px] backdrop-blur-sm">
                    {listing.license}
                 </Badge>
              </div>
              <div className="absolute bottom-2 right-2">
                <Badge variant="secondary" className="font-semibold shadow-sm backdrop-blur-md">
                   {formatCurrency(listing.price_min_unit || 0, "USD")}
                </Badge>
              </div>
            </>
          )}
        </div>

        {/* --- Card Content --- */}
        <CardContent className="flex flex-col gap-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className={cn(
                "line-clamp-1 text-base font-semibold tracking-tight transition-colors",
                isActive ? "group-hover:text-primary" : "text-muted-foreground"
            )}>
              {listing.title}
            </h3>
            
            {/* Status Indicator Dot (Red/Yellow/Green) for quick scanning */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                   <div className={cn(
                     "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                     isActive && "bg-emerald-500/50",
                     isPending && "bg-yellow-500 animate-pulse",
                     isRejected && "bg-destructive"
                   )} />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{listing.status.replace("_", " ")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <p className="line-clamp-1 text-xs text-muted-foreground">
             {isRejected 
               ? <span className="text-destructive font-medium">Security check failed</span>
               : listing.categories?.join(", ") || "No category"
             }
          </p>
        </CardContent>
      </Card>
    </div>
  );
}