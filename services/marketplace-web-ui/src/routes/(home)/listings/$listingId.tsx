import { SiteHeader } from '@/components/marketplace-header'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(home)/listings/$listingId')({
  component: RouteComponent,
})

function RouteComponent() {
return (
    <div className="flex flex-1 flex-col">

      {/* Hero */}
      <SiteHeader title='Designs' />
      <div className="@container/main flex flex-col gap-y-6 mt-6 px-8">

        <div className="flex flex-col gap-y-2 py-2">
          <h1 className="text-4xl md:text-5xl font-medium">Discover & Print</h1>
          <p className="max-w-2xl text-md text-muted-foreground md:text-lg">
            Discover, buy and sell premium 3D models for your next project.
          </p>
        </div>
      </div> 
    </div>
  )
}