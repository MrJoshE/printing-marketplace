import Categories from '@/components/landing-page/categories'
import { FeaturedBanner } from '@/components/landing-page/feature-banner'
import { SearchBar } from '@/components/landing-page/search-bar'
import { PublicListings } from '@/components/listings/public-listings'
import { TrendingSection } from '@/components/listings/trending-listings'
import { SiteHeader } from '@/components/marketplace-header'
import type { CategoryFilter } from '@/lib/api/models'
import { createFileRoute } from '@tanstack/react-router'
import React from 'react'

export const Route = createFileRoute('/(home)/')({
  component: MarketplacePage,
})

function MarketplacePage() {
  const [categories, setCategories] = React.useState<CategoryFilter[]>([])
  return (
    <div className="flex flex-1 flex-col">

      {/* Hero */}
      <SiteHeader title='Designs'  children={<SearchBar />} />
      <div className="@container/main flex flex-col gap-y-6 mt-6 px-8">

        <div className="flex flex-col gap-y-2 py-2">
          <h1 className="text-4xl md:text-5xl font-medium">Discover & Print</h1>
          <p className="max-w-2xl text-md text-muted-foreground md:text-lg">
            Discover, buy and sell premium 3D models for your next project.
          </p>
        </div>

        <Categories selected={categories} onSelect={setCategories} />  

        {/* Trending */}
        <TrendingSection/>

        

        <FeaturedBanner 
          title={'Animatronic Industries'} 
          description={'Discover the magic of mechanized art with our exclusive collection of 3D printed animatronic models. From intricate dragons to lifelike creatures, bring your projects to life with precision-engineered designs.'} 
          //  data-alt="Detailed 3D printed mechanical dragon close up">
          imageUrl={"https://lh3.googleusercontent.com/aida-public/AB6AXuBPDbKYGJ6_ny061otdonbHyJQT73tugnrQ1g5kEYG1z3x_6EbbX1ImUJYkQhPsr797g-R-xtjnGmujnmvRbsjleDRWYRrq59-d2cKo8gt_j8IUdgwFP1CUWFGKB0-Frv3zI8dvR5mqe2CoOBrZyS0AgCqZQKhx-9MTDqmfqueF1cUCZ0VIty0Oe8SQc3ie2ewQRCf3hWK7bgRVgZsoaZgS6z4kvO4vSaotypO7thdWS_tslSSK-NQy0KhCfvsX7kQ_9EWs5xkvkdju"} 
          primaryAction={{ label: 'View Josh\'s Store', onClick: () => {}}}
        />

          <PublicListings />

      </div>
    </div>
  )
}
