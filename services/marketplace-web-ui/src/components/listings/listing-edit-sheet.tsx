import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Box,
  Loader2,
  Printer,
  Save,
  ShieldAlert,
  X
} from "lucide-react"
import { type KeyboardEvent, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
// Removed ScrollArea import to use native scrolling
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import type { ListingProps, UpdateListingRequest } from "@/lib/api/models"
import { ListingService } from "@/lib/services/listing-service"
import { AnimatedDeleteButton } from "../ui/animated-delete-button"
import { ListingEditImages, ListingEditModels } from "./listing-edit-files"

// --- Helper Component: String List Input (Tags) ---
interface StringListInputProps {
  value: string[]
  onChange: (val: string[]) => void
  placeholder?: string
}

function StringListInput({ value = [], onChange, placeholder }: StringListInputProps) {
  const [inputValue, setInputValue] = useState("")

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      const trimmed = inputValue.trim()
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed])
        setInputValue("")
      }
    }
  }

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove))
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="bg-background"
      />
      <div className="flex flex-wrap gap-2">
        {value?.map((tag) => (
          <Badge key={tag} variant="secondary" className="px-2 py-1 text-sm font-normal">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="ml-2 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  )
}

// --- Zod Schema ---
const listingFormSchema = z.object({
  title: z.string().min(5, "Title too short"),
  description: z.string().optional(),
  price_min_unit: z.coerce.number().min(0),
  
  // Safety
  isNSFW: z.boolean().default(false),
  isAIGenerated: z.boolean().default(false),
  aiModelName: z.string().optional().nullable(),
  
  // Physical
  isPhysical: z.boolean().default(false),
  dimensions: z.object({
    x: z.coerce.number().default(0),
    y: z.coerce.number().default(0),
    z: z.coerce.number().default(0),
  }).optional(),

  // Printer Settings
  printerSettings: z.object({
    nozzleDiameter: z.string().optional().nullable(),
    nozzleTemperature: z.coerce.number().optional().nullable(),
    recommendedMaterials: z.array(z.string()).optional().nullable(),
    isMulticolor: z.boolean().default(false).nullable(),
    isAssemblyRequired: z.boolean().default(false).nullable(),
    isHardwareRequired: z.boolean().default(false).nullable(),
    hardwareRequired: z.array(z.string()).optional().nullable(),
  }).optional(),
})

type ListingFormValues = z.infer<typeof listingFormSchema>

interface ListingEditSheetProps {
  listing: ListingProps
  isOpen: boolean
  onClose: () => void
}

export function ListingEditSheet({ listing, isOpen, onClose }: ListingEditSheetProps) {
  const queryClient = useQueryClient()

  // 1. Initialize Form with Defaults
  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      title: listing.title,
      description: listing.description || "",
      price_min_unit: listing.price_min_unit || 0,
      isNSFW: listing.is_nsfw || false,
      isAIGenerated: listing.is_ai_generated || false,
      aiModelName: listing.ai_model_name || "",
      isPhysical: listing.is_physical || false,
      dimensions: {
        x: listing.dim_x_mm || 0,
        y: listing.dim_y_mm || 0,
        z: listing.dim_z_mm || 0,
      },
      printerSettings: {
        nozzleDiameter: listing.recommended_nozzle_diameter || "",
        nozzleTemperature: listing.recommended_nozzle_temp_c || undefined,
        recommendedMaterials: listing.recommended_materials || [],
        isMulticolor: listing.is_multicolor || false,
        isAssemblyRequired: listing.is_assembly_required || false,
        isHardwareRequired: listing.is_hardware_required || false,
        hardwareRequired: listing.hardware_required || [],
      }
    },
  })

  // Watchers for conditional UI
  const isAIGenerated = form.watch("isAIGenerated")
  const isPhysical = form.watch("isPhysical")
  const isHardwareRequired = form.watch("printerSettings.isHardwareRequired")

  // --- DELETE Mutation ---
  const deleteMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
        return await ListingService.deleteListing(id);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["listing", listing.id!] })
    },
    onSuccess: () => {
      toast.success("Listing deleted successfully.")
      queryClient.invalidateQueries({ queryKey: ["listings", "public"] })
      onClose()
    },
    onError: () => {
      toast.error("Failed to delete listing. Please try again.")
    }
  });

  const handleDelete = async () => {
    deleteMutation.mutate({ id: listing.id! })
  }

  // --- UPDATE Mutation ---
  const updateMutation = useMutation({
    mutationFn: (values: ListingFormValues) => {
        // Ensure we cast to the strict backend type
        return ListingService.updateListing(listing.id!, values as unknown as UpdateListingRequest)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["listings", "public"] })
      const previous = queryClient.getQueryData(["listing", listing.id!])
      return { previous }
    },
    onSuccess: () => {
      toast.success("Listing updated successfully")
      queryClient.invalidateQueries({ queryKey: ["listings", "public"] })
    },
    onError: () => {
      toast.error("Failed to update listing")
    }
  })

  const onSubmit = (values: ListingFormValues) => updateMutation.mutate(values)

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 p-0 sm:w-[700px] sm:max-w-[75vw]">
        
        {/* Header - Sticky Top */}
        <SheetHeader className="border-b px-6 py-6 bg-background">
          <SheetTitle className="flex items-center gap-2">
            Edit Listing
            <Badge variant="outline" className="ml-2 font-normal text-muted-foreground">
                {listing.status}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            Manage files, technical details, and pricing.
          </SheetDescription>
        </SheetHeader>

        {/* Body - Native Scrolling */}
        {/* flex-1: Fills remaining space between header and footer
            overflow-y-auto: Enables native vertical scrolling 
        */}
        <div className="flex-1 overflow-y-auto px-6">
          <div className="py-6">
            <Form {...form}>
              <form id="listing-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                 {/* 1. File Editors */}
                 <div className="grid gap-8">
                    <ListingEditImages 
                        files={listing.files} 
                        onDeleteFile={async (fileId) => console.log("delete", fileId)} 
                        onUploadFile={async (file) => console.log("upload", file)} 
                        valdateUploadFile={(file) => "Not implemented yet!"}
                    />
                    <ListingEditModels 
                        files={listing.files} 
                        onDeleteFile={async (fileId) => console.log("delete", fileId)} 
                        onUploadFile={async (file) => console.log("upload", file)} 
                        valdateUploadFile={(file) => "Not implemented yet!"}
                    />
                </div>

                <Separator />
                
                {/* 2. Core Details */}
                <div className="space-y-4">
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                                <Input {...field} className="text-lg font-medium" />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                                <Textarea {...field} rows={4} className="resize-none" placeholder="Tell the story of this model..." />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <Separator />

                {/* 3. Categorized Sections */}
                <Accordion type="multiple" defaultValue={["pricing", "printer"]} className="w-full">
                    
                    {/* Pricing Section */}
                    <AccordionItem value="pricing" className="border-none">
                        <AccordionTrigger className="hover:no-underline py-2">
                            <div className="flex items-center gap-2 text-base font-semibold">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs">$</span>
                                Pricing
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-4 px-1">
                             <FormField
                                control={form.control}
                                name="price_min_unit"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Price (Cents)</FormLabel>
                                    <FormControl>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                        <Input type="number" {...field} className="pl-7" />
                                    </div>
                                    </FormControl>
                                    <FormDescription>0 for free. Minimum 50 cents for paid.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </AccordionContent>
                    </AccordionItem>

                    {/* Printer Settings */}
                    <AccordionItem value="printer" className="border-t">
                        <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center gap-2 text-base font-semibold">
                                <Printer className="h-4 w-4" />
                                Technical Specs
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 px-1 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="printerSettings.nozzleDiameter"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nozzle (mm)</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder="0.4" value={field.value || ""} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="printerSettings.nozzleTemperature"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Temp (°C)</FormLabel>
                                            <FormControl>
                                                <Input type="number" {...field} placeholder="210" value={field.value || ""} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>

                             <FormField
                                control={form.control}
                                name="printerSettings.recommendedMaterials"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Recommended Materials</FormLabel>
                                        <FormControl>
                                            <StringListInput 
                                                value={field.value || []} 
                                                onChange={field.onChange} 
                                                placeholder="PLA, PETG, ABS (Press Enter)"
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 bg-muted/30">
                                <FormField
                                    control={form.control}
                                    name="printerSettings.isMulticolor"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-lg p-1">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-sm font-medium">Multicolor / MMU</FormLabel>
                                            </div>
                                            <FormControl>
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <Separator />
                                <FormField
                                    control={form.control}
                                    name="printerSettings.isAssemblyRequired"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-lg p-1">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-sm font-medium">Assembly Required</FormLabel>
                                            </div>
                                            <FormControl>
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <Separator />
                                <FormField
                                    control={form.control}
                                    name="printerSettings.isHardwareRequired"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between rounded-lg p-1">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-sm font-medium">Hardware Required</FormLabel>
                                            </div>
                                            <FormControl>
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                {isHardwareRequired && (
                                    <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                                         <FormField
                                            control={form.control}
                                            name="printerSettings.hardwareRequired"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs text-muted-foreground">List Hardware (e.g. M3 Screws)</FormLabel>
                                                    <FormControl>
                                                        <StringListInput 
                                                            value={field.value || []} 
                                                            onChange={field.onChange} 
                                                            placeholder="Type and press Enter..."
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* Dimensions & Physical */}
                    <AccordionItem value="dimensions" className="border-t">
                        <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center gap-2 text-base font-semibold">
                                <Box className="h-4 w-4" />
                                Physical Dimensions
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 px-1">
                             <FormField
                                control={form.control}
                                name="isPhysical"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm mb-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base">Physical Object</FormLabel>
                                            <FormDescription>
                                            Is this intended to be printed?
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {isPhysical && (
                                <div className="grid grid-cols-3 gap-4 animate-in fade-in">
                                    {['x', 'y', 'z'].map((axis) => (
                                         <FormField
                                            key={axis}
                                            control={form.control}
                                            // @ts-ignore
                                            name={`dimensions.${axis}`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="uppercase">{axis}</FormLabel>
                                                    <FormControl>
                                                        <div className="flex">
                                                            <Input type="number" {...field} className="rounded-r-none" />
                                                            <div className="flex items-center justify-center rounded-r-md border border-l-0 bg-muted px-3 text-xs text-muted-foreground">
                                                                mm
                                                            </div>
                                                        </div>
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    ))}
                                </div>
                            )}
                        </AccordionContent>
                    </AccordionItem>

                    {/* Safety & AI */}
                    <AccordionItem value="safety" className="border-t">
                        <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center gap-2 text-base font-semibold">
                                <ShieldAlert className="h-4 w-4" />
                                Safety & AI
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 px-1 space-y-4">
                             <FormField
                                control={form.control}
                                name="isNSFW"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                            <Checkbox checked={field.value} onCheckedChange={field.checked} />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>Mature Content (NSFW)</FormLabel>
                                            <FormDescription>
                                                Mark if this contains nudity or violence.
                                            </FormDescription>
                                        </div>
                                    </FormItem>
                                )}
                            />
                            
                            <div className="rounded-md border p-4 space-y-4">
                                <FormField
                                    control={form.control}
                                    name="isAIGenerated"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center justify-between">
                                            <div className="space-y-0.5">
                                                <FormLabel>AI Generated</FormLabel>
                                                <FormDescription className="text-xs">
                                                    Was this created using GenAI tools?
                                                </FormDescription>
                                            </div>
                                            <FormControl>
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                {isAIGenerated && (
                                     <FormField
                                        control={form.control}
                                        name="aiModelName"
                                        render={({ field }) => (
                                            <FormItem className="animate-in fade-in">
                                                <FormLabel>Model Name</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder="e.g. Midjourney v6" value={field.value || ""} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
              </form>
            </Form>
          </div>
        </div>

        {/* Footer - Sticky Bottom */}
        <SheetFooter className="border-t bg-background px-6 py-4 sm:justify-between flex-row items-center gap-4">
             <div className="flex-1">
                 <AnimatedDeleteButton 
                    onDelete={handleDelete}
                    isDeleting={deleteMutation.isPending}
                 />
             </div>
             <div className="flex gap-2">
                 <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
                 <Button type="submit" form="listing-form" disabled={(!form.formState.isDirty) ||updateMutation.isPending} className="min-w-[120px]">
                    {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save
                 </Button>
             </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}