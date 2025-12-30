import { useQuery } from "@tanstack/react-query";

export function useMyListings() {
  return useQuery({
    // The queryKey ensures data refetches whenever 'categories' or 'query' changes
    queryKey: ['listings'],
    queryFn: async () => {
        const response = await fetch('/api/listings/', {
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('Failed to fetch my listings');
        }

        return response.json();
    },
    placeholderData: (previousData) => previousData,
  });
}