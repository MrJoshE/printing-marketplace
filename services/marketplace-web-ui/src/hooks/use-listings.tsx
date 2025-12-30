// import { type CategoryFilter } from '@/lib/api/models'; // Import your types
// import { ListingService } from '@/lib/services/listing-service';
// import { useInfiniteQuery } from '@tanstack/react-query';

// interface SearchFilters {
//   categories: CategoryFilter[]
//   query?: string // For text search later
// }


// export function useListings({ categories, query = '' }: SearchFilters) {
//   return useInfiniteQuery({
//     // The queryKey ensures data refetches whenever 'categories' or 'query' changes
//     queryKey: ['listings', { categories, query }],
//     initialPageParam: 1,
//     getNextPageParam: (lastPage) => 1, 
//     queryFn: async ({pageParam}) => {
//       return ListingService.getListings({categories, query, pageParam});
//     },
//     placeholderData: (previousData) => previousData,
//     // },
//     // placeholderData: (previousData) => previousData, 
//   })
// }