import { MOCK_TRENDING_LISTINGS } from "@/components/listings/trending-listings";
import { apiClient, publicRoutesApiClient } from "@/lib/api/http";
import { type CategoryFilter, type CreateListingRequest, type IndexedListingProps, type ListingProps } from "@/lib/api/models";
import type { SearchResponse } from "typesense/lib/Typesense/Documents";
import { typesenseClient } from "../typesense/typesense";

export const ListingService = {
 async create(payload: CreateListingRequest, idempotencyKey: string) {
    const { data } = await apiClient.post("/listings", payload, {
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    });
    return data;
  },
  async getUsersListings() : Promise<ListingProps[]>{
    const { data } = await apiClient.get("/listings");
    return data;
  },
  async updateListing(id: string, payload: Partial<CreateListingRequest>){
    const { data } = await apiClient.put(`/listings/${id}`, payload);
    return data;
  },
  async deleteListing(id: string){
    const { data } = await apiClient.delete(`/listings/${id}`);
    return data;
  },
  async getListingById(id: string) : Promise<ListingProps>{
    console.log("Fetching listing by ID:", id);
    const { data } = await publicRoutesApiClient.get(`/listings/${id}`);
    console.log("Received listing data:", data);
    return data;
  },
  async getListings({
    categories, 
    query, 
    pageParam = 1
  }: {categories: CategoryFilter[], query: string, pageParam: number}) : Promise<SearchResponse<IndexedListingProps>> {
      // 1. Construct Typesense filter string
      // Format: category:=[value1, value2]
      const activeCategories = categories
        .map((c) => c.value)
        .filter((v): v is string => v !== null) // Exclude null ('All Categories')

      let filterBy = ''
      if (activeCategories.length > 0) {
        filterBy = `category:=[${activeCategories.join(',')}]`
      }

      // 2. Perform the search
      const searchParameters = {
        q: query || '*',
        query_by: 'title,description,categories',
        filter_by: filterBy,
        page: pageParam,
        collection: 'listings', // Typesense collection name
        per_page: 20,
      }

      const results = await typesenseClient
        .collections<IndexedListingProps>('listings')
        .documents()
        .search(searchParameters)

      return results
}
  // async getListings({
  //   categories, 
  //   query, 
  //   pageParam = 1
  // }: {categories: CategoryFilter[], query: string, pageParam: number}) {
  //     // For now, return mock data
  //     return {
  //       hits: MOCK_LISTINGS.slice((pageParam - 1) * 10, pageParam * 10).map(document => ({ document })),
  //       page: pageParam < Math.ceil(MOCK_LISTINGS.length / 10) ? pageParam + 1 : undefined,
  //     };  
  //   },
  //   async getTrendingListings(){
  //     return MOCK_LISTINGS;
  //   }
}


const MOCK_LISTINGS: IndexedListingProps[] = MOCK_TRENDING_LISTINGS.concat(MOCK_TRENDING_LISTINGS).concat(MOCK_TRENDING_LISTINGS)