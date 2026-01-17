import { ListingService } from "@/lib/services/listing-service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";


interface ListingSummaryProps {
    listingId: string;
    emptyBuilder: () => React.ReactNode;
    contentBuilder: (listing: any, isPlaceholderData: boolean) => React.ReactNode;
}

export function ListingSummary(props : ListingSummaryProps) {
    const { listingId, emptyBuilder, contentBuilder } =  props;

    const queryClient = useQueryClient();
    const { data: listing, isPlaceholderData } = useQuery({
        queryKey: ['listing', listingId],
        queryFn: () => ListingService.getListingById(listingId),
        
        placeholderData: () => {
            // 1. Get ALL queries that start with this key (Fuzzy Match)
            // Returns an array of [queryKey, data] tuples
            const matchingQueries = queryClient.getQueriesData({ 
                queryKey: ['listings', 'public'] 
            });

            // 2. Iterate through every matching feed (e.g., "All", "Category: Scifi", "Search: Tank")
            for (const [_key, cache] of matchingQueries) {
                const infiniteData = cache as any;
                
                if (!infiniteData?.pages) continue;

                // 3. Search inside this specific feed's pages
                for (const page of infiniteData.pages) {
                    const found = page.hits?.find((hit: any) => hit.document.id === listingId);
                    if (found) {
                        return found.document; // Found it! Return immediately.
                    }
                }
            }

            return undefined;
        },
        throwOnError: true,
    });

    if (!listing) {
        return <>{emptyBuilder()}</>
    }

    return <>{contentBuilder(listing, isPlaceholderData)}</>
}