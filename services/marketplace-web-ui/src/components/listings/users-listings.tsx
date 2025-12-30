import { ListingService } from "@/lib/services/listing-service";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { ListingViewProps } from "@/lib/api/models";
import { ListingEditSheet } from "./listing-edit-sheet";
import { ListingGrid } from "./listing-grid";

export function UsersListings() {
    // 1. Local state to track which listing is currently being edited
    const [selectedListingId, setSelectedListingId] = useState<ListingViewProps | null>(null);

    const { 
        data, 
        isLoading, 
        isError,
        refetch
    } = useQuery({
        queryKey: ['listings', 'public'],
        queryFn: () => ListingService.getUsersListings(),
        placeholderData: (data) => data,
        refetchInterval: 10_000, // Optional: refetch every 10 seconds
        refetchIntervalInBackground: false,
    })

    return (
        <>
            <ListingGrid 
                listings={data || []} // Ensure array fallback
                isLoading={isLoading}
                isError={isError}
                onRetry={refetch}
                // 2. When clicked, set the ID. This triggers the Sheet to open.
                onListingClicked={(listing) => setSelectedListingId(listing as ListingViewProps)}
            />

            {selectedListingId && (
                <ListingEditSheet 
                    listing={selectedListingId!}
                    isOpen={!!selectedListingId} // Open if ID exists
                    onClose={() => setSelectedListingId(null)} // Reset on close
                />
            )}
        </>
    )
}

/**
 * Invalidates the users listings cache, forcing a refetch on next access.
 */
// Note: You need access to the queryClient instance here usually, 
// or export a hook that returns this function.
export function invalidateUsersListingsCache(queryClient: any) {
    queryClient.invalidateQueries({ queryKey: ['listings', 'public'] });
}