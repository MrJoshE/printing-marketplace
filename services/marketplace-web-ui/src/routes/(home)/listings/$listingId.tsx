import { ListingCreator } from '@/components/listing-summary/listing-creator'
import { ListingGallery } from '@/components/listing-summary/listing-gallery'
import { ListingPurchaseCard } from '@/components/listing-summary/listing-purchase-card'
import { ListingSummary } from '@/components/listing-summary/listing-summary'
import { ListingInfoTabs } from '@/components/listing-summary/listing-summary-tabs'
import { ListingTechSpecs } from '@/components/listing-summary/listing-technical-details'
import { SiteHeader } from '@/components/marketplace-header'
import { Badge } from '@/components/ui/badge'
import type { ListingFile } from '@/lib/api/models'
import { IconRobot } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { File, Printer, Ruler, Settings, Star, ToolCase } from 'lucide-react'

export const Route = createFileRoute('/(home)/listings/$listingId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { listingId } = Route.useParams()

  return  <ListingSummary
      listingId={listingId}
      emptyBuilder={() => <div>Loading skeleton...</div>}
      contentBuilder={(listing, isPlaceholderData) =>  
        <div className="flex flex-1 flex-col pb-20">

          <SiteHeader title={listing.title} />
          <div className="@container/main flex flex-col gap-y-6 mt-6 px-8">

            {/* <p>
              {JSON.stringify(listing)}
            </p> */}

            <div className="text-muted-foreground">
              {listing.seller_username} / <span className="text-foreground font-medium">{listing.title}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">

              {/* Left Column */}
              <div className="lg:col-span-8 flex flex-col gap-8">
            
                {/* Mobile Header (Only visible on small screens) */}
                <div className="block lg:hidden">
                    <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">{listing.title}</h1>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="flex items-center text-primary text-sm">
                            {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 fill-primary" />)}
                        </div>
                        <span className="text-sm text-muted-foreground">({listing.reviewCount} reviews)</span>
                    </div>
                </div>

                {/* Gallery */}
                <ListingGallery images={listing.files.filter((file: ListingFile) => file.file_type.toLowerCase() === 'image')} />

                <ListingInfoTabs
                  defaultTab='description'
                  tabs={[
                    {
                      label: 'Description',
                      value: 'description',
                      renderContent: () => <div className="prose max-w-none">{listing.description}</div>,
                    },
                    {
                      label: 'Printer Settings',
                      value: 'printer_recommendations',
                      renderContent: () => <div>Printer Recommendations Section (Coming Soon)</div>,
                    },
                    {
                      label: 'Comments',
                      value: 'comments',
                      renderContent: () => <div>Comments Section (Coming Soon)</div>,
                    }
                  ]}
                />

                <ListingCreator 
                  name={listing.seller_username}
                  avatarUrl={""}
                  bio={listing.seller_bio || "This user has not set up a bio yet."}
                  followers={3}
                  rating={4.9}
                />
              </div>

              {/* Right Column */}
              <div className="lg:col-span-4 relative">
             <div className="lg:sticky lg:top-24 flex flex-col gap-6">
                
                {/* Desktop Header */}
                <div className="hidden lg:block">
                    <h1 className="text-3xl xl:text-4xl font-bold leading-tight mb-2">{listing.title}</h1>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="flex items-center text-primary text-sm">
                             <Star className="h-5 w-5 fill-primary" />
                             <span className="ml-1 font-bold text-lg">{4.9}</span>
                        </div>
                        <span className="text-sm text-muted-foreground hover:text-primary cursor-pointer underline-offset-4 hover:underline">
                            ({10} reviews)
                        </span>
                    </div>
                </div>

                {/* Purchase Card */}
                <ListingPurchaseCard 
                    price={listing.price_min_unit} 
                    currency={listing.currency.toLowerCase() == "gbp" ? "£" : "$"}
                    licenseType={listing.license}
                    onBuy={() => console.log("Buy clicked")}
                    onSave={() => console.log("Save clicked")}
                />

                {/* Tech Specs */}
                <ListingTechSpecs specs={[
                  {label: "Dimensions", value: `${listing.dimensions }`, icon: <Ruler className='w-4 h-4'/>},
                  {label: "Material", value: `${listing.recommended_material }`, icon: <Star className='w-4 h-4'/>},
                  {label: "Files", value: `${listing.files.filter((file: ListingFile) => file.file_type.toLowerCase() == "model").length   }`, icon: <File className='w-4 h-4'/>},
                  {label: "Physical?", value: listing.is_physical ? "Yes" : "No", icon: <Printer className='w-4 h-4'/>},
                  {label: "AI Generated?", value: listing.is_ai_generated ? "Yes" : "No", icon: <IconRobot className='w-4 h-4'/>},  
                  {label: "Hardware Required?", value: listing.is_hardware_required ? "Yes" : "No", icon: <ToolCase className='w-4 h-4'/>},
                  {label: "Assembly Required?", value: listing.is_assembly_required ? "Yes" : "No", icon: <Settings className='w-4 h-4'/>}
                ]} />

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                    {listing.categories.map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="px-3 py-1 text-xs font-normal text-muted-foreground hover:text-foreground cursor-pointer">
                            #{tag}
                        </Badge>
                    ))}
                </div>
              </div>
             </div>

            </div>
          </div> 
        </div>
      }
    />
}
