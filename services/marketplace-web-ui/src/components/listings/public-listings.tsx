import { ListingService } from "@/lib/services/listing-service";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ListingGrid } from "./listing-grid";

export function PublicListings() {
    const { 
        data, 
        fetchNextPage, 
        hasNextPage, 
        isFetchingNextPage, 
        isLoading, 
        isError,
        refetch
    } = useInfiniteQuery({
        queryKey: ['listings', 'public'],
        queryFn: ({ pageParam }) => ListingService.getListings({ pageParam, query: '', categories: [] }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            if ((lastPage.hits?.length || 0) < 20) {
                return undefined;
            }
            return lastPage.page + 1;
        },
    })

    const allListings = data?.pages.flatMap(page => page.hits?.flatMap(hit => hit.document) || []) || []
    const navigate = useNavigate();
    return <ListingGrid 
        listings={allListings}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
        onListingClicked={(listing) => navigate({to: `/listings/${listing.id}`})}
    />
}
