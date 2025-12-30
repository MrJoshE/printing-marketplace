// components/landing/trending-section.tsx
import { ListingGrid } from "@/components/listings/listing-grid";
import type { ListingSummary } from "@/lib/api/models";
import { useQuery } from "@tanstack/react-query";

export function TrendingSection() {
    // Only fetch the top 4
    const { data, isLoading, isError } = useQuery({
        queryKey: ['listings', 'trending'],
        queryFn: () => MOCK_TRENDING_LISTINGS,
        throwOnError: true,
    })

    return (
        <section className="pt-4">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-medium lg:text-3xl duration-200" >Trending Now</h2>
            </div>
            
            <ListingGrid 
              
                layoutType="carousel"
                listings={data || []}
                isLoading={isLoading}
                isError={isError}
                // We do NOT pass fetchNextPage here, making it static
                viewMoreHref="/latest"
                viewMoreLabel="View All Trending"
            />
        </section>
    )
}

export const MOCK_TRENDING_LISTINGS: ListingSummary[] = [
  {
    id: "1",
    title: "Articulated Crystal Dragon",
    coverImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuAxkkSljWjil_JFzhtKkSyg-WUGaCQz9iHlOz1f2T7ndNybf3C1d6ygYZ0X7oYZ3BZY2NgJnilrm1s_w_BG9YEn-cQSMeCXzaR3k18SIGuzyn4Apid6taATn5Oo34R1DMNS92MJ1sHOo8sVQSz-3sjDsymC2_dOsz_tX_OB3yeYhqt8XIhri9kJvn0onuhKRI4rlw__-5CtAXipGeb05RjliGRRWAcK6bhJr83h5qh8WPKo-zFfM53KZIXfIdV5peNNB_O0KlmnkQbA",
    categories: ["3D Printing", "Artistic"],
    price_min_unit: 499, // $4.99
    currency: "USD",
    seller_username: "hex3d",
    seller_name: "Hex3D Creations",
    license: "Standard",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_indexed_at: new Date().toISOString(),
    status:  "ACTIVE"
  },
{
    id: "2",
    title: "Planetary Gear Fidget Set",
    coverImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCJBNIGWjnsygw2AQM-u6xoP6SRp4Ne9N2TZwGDNB-WLTxdClJYu24-m7E2JBYMYAaPnW3l-wqtrD72MD8oLsu-sd_p97jE0FZSNAtUTI6kQiLTiu5eDJO_fMNnGqXVg_obR1WGPKCnmT0_nt_-T0PpmXR54ddMtvvFb3ia4KoM5e_QlLgRsMcF1XDcVZKwUAUuewGHukbwR3kRRxCxJkiVFKir3rkN_-EdVJ_v6mYUHN6-EDlaRrDe-AXSP658KZgEnziKn0Dj2BYb",
    categories: ["3D Printing", "Toys"],
    price_min_unit: 0, // Free
    currency: "USD",
    seller_username: "engineerd",
    seller_name: "EngineerD",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_indexed_at: new Date().toISOString(),
    status: "ACTIVE",
    license: "Standard"
  },
  {
    id: "3",
    title: "Phone Stand",
    coverImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCT1S_85TxL_-aNAVv5MFz91NL76Bd7f3btzrwTuMK_Y9o2BgLLD-KEreV4SAHwYkBQLJzuaDahCjGbSQz0euZfgtw2P3hidWfB-JoWBBvk9G6D6Z4Obl8TKxbwFrGoVkAlNfP1Qck0A45rlyv6ehwIqqN2sXLWJiKXLlBvJ2lp0-VczxxuB6yAaWhBI50kvInZ4p4Xfa3oCNZkDHIVoxgidKLR3G6-xhfs6COTnw5fFdHoNHddnKMrBpqWkl3wGhkcg3NZ5zAwbU0Q",
    categories: ["Home Decor", "3D Printing"],
    price_min_unit: 850, // $8.50
    currency: "USD",
    seller_username: "artsymaker",
    seller_name: "Artsy Maker",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_indexed_at: new Date().toISOString(),
    status: "ACTIVE",
    license: "Open Source"
  },
  {
    id: "4",
    title: "Mechanical Cyberpunk Mask",
    coverImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuAI4YPkHzmjzEdyQCZsfKgGEcq3hOTxY3W1JqTw7Ivb83ApPtAZFL4Oc6rTwNZruUXFfyxcUX4HzJxbzweMeLsmUJjEARcPLslcWCG69iFCWaTPi5UUmKQMGQz6CS6dbvLh5FoQdmEXjA6comF9kGObatO8DO3ZT0nZakdksDseyKimUdFD2DE9s2rkgUDV9T3uNmoz2AOhL0oUW61id7YQOcNPVRBoqChvPEMC-cj05fL-R5boioC69QtlEyB4X7g1Wc2JJIH663SA",
    categories: ["Cosplay", "Wearable"],

    price_min_unit: 1500, // $15.00
    currency: "USD",
    seller_username: "cosplayforge",
    seller_name: "Cosplay Forge",
    license: "Extended",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_indexed_at: new Date().toISOString(),
    status: "PENDING_VALIDATION"
  }
];