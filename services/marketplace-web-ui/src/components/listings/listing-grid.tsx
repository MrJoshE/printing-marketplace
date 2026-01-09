import type { IndexedListingProps } from "@/lib/api/models";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, RefreshCcw } from "lucide-react";
import React from "react";
import { useInView } from "react-intersection-observer";
import { Button } from "../ui/button";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { Skeleton } from "../ui/skeleton";
import { ListingCard } from "./listing-card";
import { ListingGridEmpty } from "./listings-grid-empty";

interface ListingGridProps {
  listings: IndexedListingProps[]
  isLoading: boolean
  isError: boolean
  error?: Error | null
  onRetry?: () => void
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  fetchNextPage?: () => void
  viewMoreHref?: string
  viewMoreLabel?: string
  className?: string
  emptyState?: React.ReactNode
  layoutType?: "grid" | "carousel"
  onListingClicked?: (listing: IndexedListingProps) => void
}

export function ListingGrid({
  listings,
  isLoading,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  viewMoreHref,
  viewMoreLabel = "View All",
  className,
  emptyState,
  layoutType = "grid", 
  onListingClicked, 
}: ListingGridProps) {
  
  const { ref, inView } = useInView()

  React.useEffect(() => {
    if (inView && hasNextPage && fetchNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [inView, hasNextPage, fetchNextPage, isFetchingNextPage])

  // 1. Error State
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <p className="text-muted-foreground">Failed to load listings.</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Try Again
          </Button>
        )}
      </div>
    )
  }

  // 2. Initial Loading State (Skeleton)
  if (isLoading) {
    if (layoutType === "carousel") {
      return (
        <div className="flex gap-4 overflow-hidden pb-4">
          {Array.from({ length: 4 }).map((_, i) => (
             <div key={i} className="w-[280px] shrink-0">
                <ListingCardSkeleton />
             </div>
          ))}
        </div>
      )
    }
    
    // Default Grid Skeleton
    return (
      <div className={cn(
        // UPDATED: Matches the new grid layout below
        "grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6", 
        className
      )}>
        {/* Increased from 8 to 12 to fill larger screens nicely */}
        {Array.from({ length: 12 }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  // 3. Empty State
  if (listings.length === 0) {
    return emptyState || <ListingGridEmpty />
  }

  // 4. Data State
  return (
    <div className="space-y-8">
      
      {/* --- CAROUSEL LAYOUT --- */}
      {layoutType === "carousel" ? (
         <ScrollArea className="w-full whitespace-nowrap pb-4 duration-300">
           <div className="flex w-max space-x-4">
             {listings.map((listing) => (
               <div key={listing.id} className="w-[280px] shrink-0">
                 <ListingCard listing={listing} className="max-h-132" onClick={onListingClicked} />
               </div>
             ))}
             
             {viewMoreHref && (
                <div className="flex w-[150px] shrink-0 items-center justify-center">
                   <Button variant="ghost" asChild className="h-full w-full flex-col gap-2 hover:bg-muted/50">
                      <Link to={viewMoreHref}>
                         <div className="rounded-full bg-muted p-4">
                            <ArrowRight className="h-6 w-6" />
                         </div>
                         <span className="font-semibold">{viewMoreLabel}</span>
                      </Link>
                   </Button>
                </div>
             )}
           </div>
           <ScrollBar orientation="horizontal" />
         </ScrollArea>
      ) : (
        /* --- GRID LAYOUT (Default) --- */
        <div className={cn(
            "grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 duration-200" , 
            className
        )}>
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} onClick={onListingClicked} />
          ))}
          
          {isFetchingNextPage && (
              <>
                  <ListingCardSkeleton />
                  <ListingCardSkeleton />
                  <ListingCardSkeleton />
                  <ListingCardSkeleton />
                  <ListingCardSkeleton />
              </>
          )}
        </div>
      )}

      {/* Infinite Scroll Sentinel (Only for Grid) */}
      {layoutType === 'grid' && fetchNextPage && hasNextPage && (
        <div ref={ref} className="h-4 w-full" />
      )}

      {/* Footer Actions */}
      {layoutType === 'grid' && !fetchNextPage && viewMoreHref && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" asChild>
            <Link to={viewMoreHref}>
              {viewMoreLabel} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

function ListingCardSkeleton() {
  return (
    <div className="flex flex-col space-y-3">
      <Skeleton className="h-[250px] w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex items-center justify-between pt-2">
         <Skeleton className="h-8 w-8 rounded-full" />
         <Skeleton className="h-4 w-16" />
      </div>
    </div>
  )
}