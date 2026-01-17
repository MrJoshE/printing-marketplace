import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Download, Heart, ShieldCheck, ShoppingCart } from "lucide-react"

interface ListingPurchaseCardProps {
  price: number
  currency?: string
  licenseType?: string
  onBuy: () => void
  onSave: () => void
}

export function ListingPurchaseCard({ 
  price, 
  currency = "$", 
  licenseType = "Standard License",
  onBuy,
  onSave
}: ListingPurchaseCardProps) {
  return (
    <Card className="overflow-hidden border-border shadow-lg shadow-black/5">
      <CardContent className="p-6">
        <div className="mb-6 flex items-baseline justify-between">
          <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {licenseType} License
          </span>
          {price > 0 && <span className="text-4xl font-bold text-primary">
            {currency}{price.toFixed(2)}
          </span>}

        </div>

        <div className="mb-6 flex flex-col gap-3">
          <Button size="lg" className="w-full text-md font-semibold shadow-md" onClick={onBuy}>
            {price > 0 && <ShoppingCart className="mr-2 h-5 w-5" />}
            {price === 0 && <Download className="mr-2 h-5 w-5" />}
            {price > 0 ? "Purchase Model" : "Download"}
          </Button>
          <Button variant="outline" size="lg" className="w-full font-medium" onClick={onSave}>
            <Heart className="mr-2 h-5 w-5" />
            Save for Later
          </Button>
        </div>

        <div className="text-center text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-1 mb-1">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <span>Secure checkout via Stripe</span>
          </div>
          <p>Includes STL, OBJ, and 3MF files.</p>
        </div>
      </CardContent>
    </Card>
  )
}