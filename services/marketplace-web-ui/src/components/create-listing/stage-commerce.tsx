import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { type ListingDraft } from "@/hooks/use-listing-draft";
import { cn } from "@/lib/utils";
import { IconMoneybag } from "@tabler/icons-react";
import {
    AlertCircle,
    Check,
    DollarSign,
    Globe,
    Info,
    PoundSterling,
    ShieldCheck,
    Sparkles,
    Store
} from "lucide-react";
import { useEffect, useMemo } from "react";

// Update interface to include currency if not already in your ListingDraft
// Make sure your useListingDraft hook provides 'currency'
interface Props {
  draft: ListingDraft & { currency?: "usd" | "gbp" }; 
  update: (d: Partial<ListingDraft> & { currency?: "usd" | "gbp" }) => void;
  onPublish: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  apiError: Error | null;
}

export function StageCommerce({ draft, update, onPublish, onBack, isSubmitting, apiError }: Props) {
  
  // --- CONFIG ---
  // In production, you might fetch this feature flag from an env var or API
  const PAID_LISTINGS_ENABLED = true; 

  // --- Defaults & Init ---
  const currency = draft.currency || "usd";
  const isFree = draft.isFree;

  // Force Free state on mount if paid features are disabled
  useEffect(() => {
    if (!PAID_LISTINGS_ENABLED && !isFree) {
        update({ isFree: true, price: 0.00, license: "open" });
    }
  }, [PAID_LISTINGS_ENABLED, isFree, update]);

  // --- Financial Logic ---
  const price = draft.price || 0.00;

  const financials = useMemo(() => {
    // 5% Platform Fee
    const platformFee = price * 0.05;
    
    // Processing Fee (Stripe Standard: 2.9% + 30c for US, approx 1.5% + 20p for UK domestic)
    // For MVP, we can estimate conservatively or use a fixed rate.
    // Use standard Stripe blended rate for safety: 2.9% + 0.30 units
    const fixedFee = currency === "gbp" ? 0.20 : 0.30;
    const variableRate = 0.029;
    
    const processingFee = price > 0 ? (price * variableRate) + fixedFee : 0;
    const earnings = Math.max(0, price - platformFee - processingFee);

    return { platformFee, processingFee, earnings };
  }, [price, currency]);

  // Currency Formatter
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(currency === "usd" ? 'en-US' : 'en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  // --- Handlers ---

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    
    // Allow empty string to let user delete everything
    if (val === "") {
        update({ price: 0 }); // or undefined if your type allows
        return;
    }

    // Regex to allow only 2 decimal places
    if (!/^\d*\.?\d{0,2}$/.test(val)) return;

    update({ price: parseFloat(val) });
  };

  const handleFreeToggle = (checked: boolean) => {
    if (!PAID_LISTINGS_ENABLED && !checked) return;
    
    // When switching to Paid, default to Standard license if currently Open
    // When switching to Free, default to Open license
    const newLicense = checked ? "open" : (draft.license === "open" ? "standard" : draft.license);

    update({ 
        isFree: checked, 
        price: checked ? 0 : draft.price,
        license: newLicense
    });
  };

  const handleLicenseSelect = (id: string) => {
    // Prevent selecting "Open/CC" for paid items if that's your business rule
    // (Optional: Depends on if you allow selling Open Source items)
    update({ license: id as any });
  };

  const LICENSES = [
    {
        id: "standard",
        title: "Standard Digital License",
        icon: ShieldCheck,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
        disabled: false, // Always available
        description: "Strictly for personal use. Buyers can print the model but cannot sell the physical prints or share the digital file.",
        features: ["Private Use Only", "No Selling Prints", "No Remixing"]
    },
    {
        id: "commercial",
        title: "Commercial Use License",
        icon: Store,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
        disabled: false, // Always available
        description: "Buyers purchase the right to sell physical prints of this model. The digital file itself cannot be resold.",
        features: ["Sell Physical Prints", "No Reselling File", "Higher Value"]
    },
    {
        id: "open",
        title: "Creative Commons (Attribute)",
        icon: Globe,
        color: "text-purple-500",
        bg: "bg-purple-500/10",
        disabled: !isFree, // Only available for free items? (Optional rule)
        description: "Open source. Others can remix, share, and use your work commercially as long as they credit you.",
        features: ["Remixing Allowed", "Sharing Allowed", "Requires Credit"]
    }
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto space-y-8">
       
      {/* 1. PRICING & EARNINGS SECTION */}
      <div className="grid md:grid-cols-3 gap-8">
        
        {/* Left: Input */}
        <Card className="md:col-span-2 shadow-sm">
            <CardHeader className="pb-4">
                <CardTitle className="text-xl flex items-center justify-between">
                    <span>Pricing</span>
                    <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-lg border">
                        <Label htmlFor="free-switch" className="text-sm font-medium cursor-pointer">
                            List for Free
                        </Label>
                        <Switch 
                            id="free-switch"
                            checked={isFree} 
                            onCheckedChange={handleFreeToggle} 
                            disabled={!PAID_LISTINGS_ENABLED}
                        />
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {/* FREEZE NOTICE */}
                {!PAID_LISTINGS_ENABLED && (
                    <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
                        <Sparkles className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-amber-700">Early Access Mode</p>
                            <p className="text-xs text-muted-foreground">
                                Paid features are currently disabled during the beta period.
                            </p>
                        </div>
                    </div>
                )}

                <div className={cn("flex gap-3", (!PAID_LISTINGS_ENABLED || isFree) && "opacity-50 pointer-events-none grayscale")}>
                    
                    {/* Currency Selector */}
                    <div className="w-[100px] shrink-0">
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Currency</Label>
                        <Select 
                            value={currency} 
                            onValueChange={(v: "usd" | "gbp") => update({ currency: v })}
                            disabled={isFree}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="usd">USD ($)</SelectItem>
                                <SelectItem value="gbp">GBP (£)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Price Input */}
                    <div className="relative flex-1">
                         <Label className="text-xs text-muted-foreground mb-1.5 block">Amount</Label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                {currency === 'usd' ? (
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <PoundSterling className="h-4 w-4 text-muted-foreground" />
                                )}
                            </div>
                            <Input 
                                type="number" 
                                min="0"
                                step="0.01"
                                className="pl-9 text-lg font-medium" 
                                placeholder="0.00" 
                                value={draft.price === 0 && isFree ? "" : draft.price} 
                                onChange={handlePriceChange}
                                disabled={isFree || !PAID_LISTINGS_ENABLED}
                            />
                        </div>
                    </div>
                </div>
                
                {isFree && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                        <Info className="w-4 h-4" />
                        Free items will be available to everyone for download.
                    </div>
                )}
            </CardContent>
        </Card>

        {/* Right: Profit Breakdown */}
        <Card className={cn("bg-muted/20 border-dashed shadow-sm", isFree && "opacity-40 grayscale")}>
            <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Breakdown
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">List Price</span>
                    <span>{formatMoney(price)}</span>
                </div>
                
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Platform Fee (5%)</span>
                    <span className="text-red-500/70">- {formatMoney(financials.platformFee)}</span>
                </div>
                
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Payment Proc. (Est)</span>
                    <span className="text-red-500/70">- {formatMoney(financials.processingFee)}</span>
                </div>

                <Separator />

                <div className="flex justify-between items-center pt-1">
                    <span className="font-semibold text-sm flex items-center gap-2">
                        <IconMoneybag className="w-5 h-5 text-emerald-600" />
                        Net Earnings
                    </span>
                    <span className="text-lg font-bold text-emerald-600">
                        {formatMoney(financials.earnings)}
                    </span>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-4">
                    * Final fees may vary slightly based on buyer location.
                </p>
            </CardContent>
        </Card>
      </div>

      {/* 2. LICENSING SECTION */}
      <div className="space-y-4">
        <div>
            <h3 className="text-lg font-semibold">License Type</h3>
            <p className="text-sm text-muted-foreground">Define how buyers can use your files.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
            {LICENSES.map((license) => {
                const isSelected = draft.license === license.id;
                const isDisabled = license.disabled;
                
                return (
                    <div key={license.id} className="relative group">
                        <div 
                            className={cn(
                                "h-full rounded-xl border-2 bg-card p-4 transition-all relative",
                                isDisabled ? "opacity-50 cursor-not-allowed bg-muted" : "cursor-pointer hover:border-muted-foreground/25",
                                isSelected && !isDisabled ? `border-${license.color.split('-')[1]}-500 bg-card ring-1 ring-${license.color.split('-')[1]}-500 shadow-md` : "border-border"
                            )}
                            onClick={() => !isDisabled && handleLicenseSelect(license.id)}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className={cn("p-2 rounded-lg", license.bg)}>
                                    <license.icon className={cn("w-5 h-5", license.color)} />
                                </div>
                                {isSelected && (
                                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-white shadow-sm", `bg-${license.color.split('-')[1]}-500`)}>
                                        <Check className="w-3.5 h-3.5" />
                                    </div>
                                )}
                            </div>
                            
                            <h4 className="font-semibold text-sm mb-1">{license.title}</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed mb-4 min-h-[3rem]">
                                {license.description}
                            </p>

                            <div className="space-y-1.5">
                                {license.features.map((feat, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/90">
                                        <div className={cn("w-1 h-1 rounded-full", isSelected ? `bg-${license.color.split('-')[1]}-500` : "bg-muted-foreground")} />
                                        {feat}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
      </div>

      {/* ERROR ALERT */}
      {apiError && (
        <Alert variant="destructive" className="animate-in zoom-in-95">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to Publish</AlertTitle>
          <AlertDescription>
            {apiError.message || "An unexpected error occurred. Please try again."}
          </AlertDescription>
        </Alert>
      )}

      {/* FOOTER */}
      <div className="flex justify-between pt-6 border-t">
        <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>Back</Button>
        <Button 
            onClick={onPublish} 
            size="lg" 
            className="px-8 min-w-[140px]"
            disabled={isSubmitting || (!isFree && price <= 0)}
        >
           {isSubmitting ? (
             <>
               <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-r-transparent" />
               Publishing...
             </>
           ) : "Publish Listing"}
        </Button>
      </div>
    </div>
  );
}