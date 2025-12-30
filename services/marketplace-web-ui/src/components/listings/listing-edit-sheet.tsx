import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Image as ImageIcon, Loader2, Mail, Save, Upload } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import type { ListingViewProps } from "@/lib/api/models"
import { ListingService } from "@/lib/services/listing-service"
import { AnimatedDeleteButton } from "../ui/animated-delete-button"

// Zod Schema for validation
const listingFormSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  price_min_unit: z.number().min(0),
})

type ListingFormValues = z.infer<typeof listingFormSchema>

interface ListingEditSheetProps {
  listing: ListingViewProps
  isOpen: boolean
  onClose: () => void
}

export function ListingEditSheet({ listing, isOpen, onClose }: ListingEditSheetProps) {
  const queryClient = useQueryClient()

  // 1. Setup Form
  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      title: listing.title,
      description: listing.description || "",
      price_min_unit: listing.price_min_unit || 0,
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      
        return await ListingService.deleteListing(id);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["listing", listing.id!] })
    },
    onSuccess: () => {
      toast.success("Listing deleted successfully.")
      queryClient.invalidateQueries({ queryKey: ["listings", "public"] })
      onClose()
    },
    onError: (err) => {
      toast.error("Failed to delete listing. Please try again.")
    }
  });

  const handleDelete = async () => {
    // deleteMutation.mutate(listing.id)
    deleteMutation.mutate({ id: listing.id })
  }

  const updateMutation = useMutation({
    mutationFn: (values: ListingFormValues) => ListingService.updateListing(listing.id!, values),
    onMutate: async (newListing) => {
      await queryClient.cancelQueries({ queryKey: ["listings", "public"] })
      await queryClient.cancelQueries({ queryKey: ["listing", listing.id!] })

      // Snapshot previous value
      const previousListing = queryClient.getQueryData(["listing", listing.id!])

      // Optimistically update the cache
      queryClient.setQueryData(["listing", listing.id!], (old: any) => ({
        ...old,
        ...newListing,
      }))

      return { previousListing }
    },
    onSuccess: () => {
      toast.success("Your listing has been updated.")
      queryClient.invalidateQueries({ queryKey: ["listings", "public"] })
    },
    onError: (err, newListing, context) => {
      // Rollback on error
      queryClient.setQueryData(["listing", listing.id], context?.previousListing)
      toast.error("Failed to update listing. Please try again.")
    },
  })

  const onSubmit = (values: ListingFormValues) => {
    updateMutation.mutate(values)
  }

  const handleContactSupport = () => {
    const subject = `Appeal for Listing ID: ${listing.id}`
    const body = `Hello Support,\n\nI would like to appeal the rejection of my listing "${listing.title}" (${listing.id}).\n\nReason for appeal:\n`
    window.location.href = `mailto:support@pinecone.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  // UI States
  const isDirty = form.formState.isDirty
  const isRejected = listing.status === "REJECTED"
  const isPending = listing.status === "PENDING_VALIDATION"

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        
        {/* Header */}
        <SheetHeader className="sticky top-0 z-10 border-b bg-background px-6 py-6">
          <div className="flex items-center justify-between">
            <SheetTitle>Edit Listing</SheetTitle>
            <Badge variant={isRejected ? "destructive" : "outline"}>
              {listing.status.replace("_", " ")}
            </Badge>
          </div>
          <SheetDescription>
            Manage changes to your listing details.
          </SheetDescription>
        </SheetHeader>

        {/* Content Area */}
        <div className="flex-1 space-y-6 px-6 py-6">
          
          {/* Case 1: Rejected/Flagged */}
          {isRejected && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Listing Flagged</AlertTitle>
              <AlertDescription>
                This listing was flagged during our security check (e.g., potential virus or prohibited content). 
                It is currently not visible to users. If you believe this is an error, please contact support.
              </AlertDescription>
            </Alert>
          )}

          {/* Case 2: Pending */}
          {isPending && (
            <Alert className="border-yellow-200 bg-yellow-500/10 text-yellow-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle className="ml-2">Processing Validation</AlertTitle>
              <AlertDescription className="ml-2 mt-1">
                We are currently scanning your files. You can edit details now, but the listing won't go live until checks complete.
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form id="listing-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <fieldset disabled={isRejected || isPending || deleteMutation.isPending} className="space-y-8 group-disabled:opacity-50">
                
                {/* Images Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-base font-semibold">Listing Images</FormLabel>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-2 text-xs">
                      <Upload className="h-3 w-3" /> Add Image
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {/* Placeholder for upload slot */}
                    <button
                      type="button"
                      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed hover:bg-muted/50 transition-colors"
                    >
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Drop to upload</span>
                    </button>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Text Fields */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-medium" />
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
                        <Textarea {...field} rows={5} className="resize-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price_min_unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price (Cents)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Read Only Field example */}
                  <div className="space-y-2">
                    <FormLabel>Downloads</FormLabel>
                    <Input disabled value={0} className="bg-muted" />
                  </div>
                </div>
              </fieldset>
            </form>
          </Form>
        </div>

        {/* Footer Actions - Sticky Bottom */}
        <SheetFooter className="sticky bottom-0 z-20 flex flex-row items-center justify-between border-t bg-background px-6 py-4">
          {/* Left Side: Delete */}
          <AnimatedDeleteButton 
            onDelete={handleDelete}
            isDeleting={deleteMutation.isPending}
          />

          {/* Right Side: Actions */}
          <div className="flex flex-row gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>

            {/* Dynamic Action Button */}
            {isRejected ? (
              <Button
                variant="destructive"
                onClick={handleContactSupport}
                className="min-w-[100px]"
              >
                <Mail className="mr-2 h-4 w-4" />
                Contact Support
              </Button>
            ) : (
              <Button
                type="submit"
                form="listing-form"
                disabled={!isDirty || updateMutation.isPending || isPending}
                className="min-w-[140px]" // Fixed width prevents jitter on loading state
              >
                {updateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}