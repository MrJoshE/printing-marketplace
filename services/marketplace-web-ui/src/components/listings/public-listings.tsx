import { ListingService } from "@/lib/services/listing-service";

import { useInfiniteQuery } from "@tanstack/react-query";
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
        getNextPageParam: (lastPage) => lastPage.page ?? undefined,
    })

    const allListings = data?.pages.flatMap(page => page.hits?.flatMap(hit => hit.document) || []) || []

    return <ListingGrid 
        listings={allListings}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
    />
}
