import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type ListingDraft } from "@/hooks/use-listing-draft";
import { StringListInput } from "../ui/string-list-input";

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
            <div className="space-y-3">
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
        <div className="space-y-4  p-4 bg-muted/20 rounded-lg border border-muted">
            <h3 className="font-medium flex items-center gap-2">
                 🖨️ Printer Recommendations
            </h3>
            <div className="border border-muted"/>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs">Nozzle Size</Label>
                    <Input 
                        value={draft.printerSettings.nozzleDiameter}
                        onChange={(e) => update({ printerSettings: { ...draft.printerSettings, nozzleDiameter: e.target.value }})}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs">Nozzle Temperature (°C)</Label>
                    <Input 
                    placeholder="37"
                        type="number"
                         value={draft.printerSettings.nozzleTemperature?.toString()}
                         onChange={(e) => update({ printerSettings: { ...draft.printerSettings, nozzleTemperature: Number(e.target.value) }})}
                    />
                </div>
            </div>

             <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs">Material</Label>
                    <StringListInput 
                        // Ensure we handle the case where it might be undefined/null
                        value={draft.printerSettings.recommendedMaterials || []}
                        onChange={(newList) => update({ 
                            printerSettings: { 
                                ...draft.printerSettings, 
                                recommendedMaterials: newList 
                            }
                        })}
                        placeholder="e.g. PLA"
                    />
                </div>
                
            </div>


            <div className="flex items-center justify-between pt-2">
                <div>
                    <Label className="text-sm">Multicolour / MMU?</Label>
                    <p className="text-xs text-muted-foreground">Does this model require multiple colors or materials?</p>
                </div>

                <Switch 
                    checked={draft.printerSettings.isMulticolor}
                    onCheckedChange={(c) => update({ printerSettings: { ...draft.printerSettings, isMulticolor: c }})}
                />
            </div>
      </div>
       <div className="space-y-4  p-4 bg-muted/20 rounded-lg border border-muted">
            <h3 className="font-medium flex items-center gap-2">
                  🛠️ Assembly
            </h3>
            <div className="border border-muted"/>
            
            <div className="flex items-center justify-between pt-2">
                
                <div>
                    <Label className="text-sm">Assembly Required?</Label>
                    <p className="text-xs text-muted-foreground">Does this model require assembly after printing?</p>
                </div>
                <Switch 
                    checked={draft.printerSettings.isAssemblyRequired}
                    onCheckedChange={(c) => update({ printerSettings: { ...draft.printerSettings, isAssemblyRequired: c }})}
                />
            </div>

            <div className="flex items-center justify-between pt-2">
                
                <p>
                    <Label className="text-sm">Hardware Required?</Label>
                    <p className="text-xs text-muted-foreground">Does this model require additional hardware to assemble after printing (screws, nuts, bearings)?</p>
                </p>
                <Switch 
                    checked={draft.printerSettings.isHardwareRequired}
                    onCheckedChange={(c) => update({ printerSettings: { ...draft.printerSettings, isHardwareRequired: c }})}
                />
            </div>

            {draft.printerSettings.isHardwareRequired && (
                <div className="space-y-2">
                    <Label className="text-sm">List Required Hardware</Label>
                    <StringListInput 
                        placeholder="e.g. M3 screws, nuts, bearings..."
                        // className="min-h-[80px] resize-y font-mono text-sm"
                        value={draft.printerSettings.hardwareRequired || []}
                        // value={draft.printerSettings.hardwareRequired || ""}
                         onChange={(newList) => update({ 
                            printerSettings: { 
                                ...draft.printerSettings, 
                                hardwareRequired: newList 
                            }
                        })}
                    />
                </div>
            )}
      </div>
      <div className="space-y-4 md:col-span-2">
        <div>
            <h2 className="text-xl font-semibold">Additional Details</h2>
            <p className="text-muted-foreground">Make sure your content is seen by the right audience.</p>

        </div>
        <div className="space-y-2 p-4 border rounded-md border-muted bg-muted/20 flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="is-nsfw">Mature Content?</Label>
            <p className="text-xs text-muted-foreground">Marking your listing as mature content will restrict its visibility to users who have opted in to view such content.</p>
          </div>
          <Switch 
            checked={draft.isNSFW}
            onCheckedChange={(c) => update({ isNSFW: c })}
          />
        </div>

        {/* Is digital only */}
        <div className="p-4 border rounded-md border-muted bg-muted/20 space-y-3">
            <div className="space-y-2 flex items-center justify-between">
            <div className="space-y-1">
                <Label htmlFor="is-physical">Can this be printed?</Label>
                <p className="text-xs text-muted-foreground">Whether the assets part of this listing are intended to be printed opposed to being digital only.</p>
            </div>
            <Switch 
                checked={draft.isPhysical}
                onCheckedChange={(c) => update({ isPhysical: c })}
            />
            </div>

            {draft.isPhysical && <div className="space-y-3">
                <Label className="text-sm">Physical Dimensions (in mm)</Label>
                <div className="grid grid-cols-3 gap-4">
                    <div className='flex rounded-md'>
                        <span className='border-input bg-background text-muted-foreground z-1 inline-flex items-center rounded-l-md border px-3 text-sm'>
                        X
                        </span>
                        <Input  type='text' placeholder='0.00mm' className='ms-px rounded-l-none shadow-none' value={draft.dimensions?.x.toString() || ""}
                            onChange={(e) => update({ dimensions: { ...draft.dimensions ?? { x: 0, y: 0, z: 0 }, x: Number(e.target.value) || 0 }})} />
                    </div>
                    <div className='flex rounded-md'>
                        <span className='border-input bg-background text-muted-foreground z-1 inline-flex items-center rounded-l-md border px-3 text-sm'>
                        Y
                        </span>
                        <Input  type='text' placeholder='0.00mm' className='ms-px rounded-l-none shadow-none' value={draft.dimensions?.y.toString() || ""}
                            onChange={(e) => update({ dimensions: { ...draft.dimensions ?? { x: 0, y: 0, z: 0 }, y: Number(e.target.value) || 0 }})} />
                    </div>
                    <div className='flex rounded-md'>
                        <span className='border-input bg-background text-muted-foreground z-1 inline-flex items-center rounded-l-md border px-3 text-sm'>
                        Z
                        </span>
                        <Input  type='text' placeholder='0.00mm' className='ms-px rounded-l-none shadow-none' value={draft.dimensions?.z.toString() || ""}
                            onChange={(e) => update({ dimensions: { ...draft.dimensions ?? { x: 0, y: 0, z: 0 }, z: Number(e.target.value) || 0 }})} />
                    </div>
                </div>
            </div>}
        </div>

          {/* Is AI Generated */}
        <div className="space-y-4 p-4 border rounded-md border-muted bg-muted/20">
            <div className="flex items-center justify-between space-y-2">
            <div className="space-y-1">
            <Label htmlFor="is-ai-generated">AI Generated?</Label>
            <p className="text-xs text-muted-foreground">Indicates whether this listing was generated using AI tools or models.</p>
            </div>
            <Switch 
            checked={draft.isAIGenerated}
            onCheckedChange={(c) => update({ isAIGenerated: c })}
            />
        </div>
        { draft.isAIGenerated && (
            <div className="grid gap-2 max-w-2xl">
            <Label htmlFor="ai-model-name">AI Model Name</Label>
            <Input 
                id="ai-model-name"
                placeholder="e.g. Midjourney v5, DALL·E 3, Stable Diffusion"
                value={draft.aiModelName || ""}
                onChange={(e) => update({ aiModelName: e.target.value })}
                />
            </div>
        )}
        </div>
      </div>

    </div>
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext}>Next: Pricing</Button>
      </div>
  </div>);
}