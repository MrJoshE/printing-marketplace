import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type ListingDraft } from "@/hooks/use-listing-draft";

interface Props {
  draft: ListingDraft;
  update: (d: Partial<ListingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StageDetails({ draft, update, onNext, onBack }: Props) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
       <div>
        <h2 className="text-xl font-semibold">Technical Details</h2>
        <p className="text-muted-foreground">Help makers print this successfully.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left Col: Description */}
        <div className="space-y-4 md:col-span-2">
            <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                    placeholder="Describe your model, assembly instructions, and lore..."
                    className="min-h-[200px] resize-y font-mono text-sm"
                    value={draft.description}
                    onChange={(e) => update({ description: e.target.value })}
                />
            </div>
        </div>

        {/* Right Col: Printer Settings */}
        <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
            <h3 className="font-medium flex items-center gap-2">
                 🖨️ Printer Recommendations
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs">Nozzle Size</Label>
                    <Input 
                        value={draft.printerSettings.nozzleDiameter}
                        onChange={(e) => update({ printerSettings: { ...draft.printerSettings, nozzleDiameter: e.target.value }})}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Material</Label>
                    <Input 
                         value={draft.printerSettings.material}
                         onChange={(e) => update({ printerSettings: { ...draft.printerSettings, material: e.target.value }})}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between pt-2">
                <Label className="text-sm">Supports Required?</Label>
                <Switch 
                    checked={draft.printerSettings.supports}
                    onCheckedChange={(c) => update({ printerSettings: { ...draft.printerSettings, supports: c }})}
                />
            </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext}>Next: Pricing</Button>
      </div>
    </div>
  );
}