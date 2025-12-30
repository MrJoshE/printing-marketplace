import { UsersListings } from '@/components/listings/users-listings'
import { SiteHeader } from '@/components/marketplace-header'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(home)/my-listings')({
  component: MyListings,
})

const queryClient = new QueryClient()

function MyListings() {
  return (
    <div className="flex flex-1 flex-col">

      {/* Hero */}
      <SiteHeader title='My Listings' />
      <div className="@container/main flex flex-col gap-y-6 mt-6 px-8">

        <div className="flex flex-col gap-y-2 py-2">
          <h1 className="text-4xl md:text-5xl font-medium">My Listings</h1>
          <p className="max-w-2xl text-md text-muted-foreground md:text-lg">
            Manage your 3D model listings, track performance, and update details all in one place.  
          </p>
        </div>

        <QueryClientProvider client={queryClient}>
          <UsersListings />
        </QueryClientProvider>

      </div>
    </div>
  )
}