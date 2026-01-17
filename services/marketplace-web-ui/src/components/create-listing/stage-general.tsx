"use client"

import { Check, ChevronsUpDown, X } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { type ListingDraft } from "@/hooks/use-listing-draft"
import { cn } from "@/lib/utils"

// Define your categories here (or import from a constant file)
const CATEGORIES = [
  { value: "3d-printing", label: "3D Printing Models" },
  { value: "laser-cutting", label: "Laser Cutting" },
  { value: "cnc", label: "CNC Routing" },
  { value: "woodworking", label: "Woodworking" },
  { value: "electronics", label: "Electronics" },
]

interface Props {
  // Assuming 'categories' is now a string[] in your draft type
  draft: ListingDraft & { categories: string[] }; 
  update: (d: Partial<ListingDraft>) => void;
  onNext: () => void;
}

export function StageGeneral({ draft, update, onNext }: Props) {
  const [open, setOpen] = React.useState(false)

  // Validation: Title length > 5 AND at least one category selected
  const isValid = draft.title.length > 5 && draft.categories.length > 0

  const handleUnselect = (categoryValue: string) => {
    update({
      categories: draft.categories.filter((s) => s !== categoryValue),
    })
  }

  const handleSelect = (categoryValue: string) => {
    const isSelected = draft.categories.includes(categoryValue)
    if (isSelected) {
      handleUnselect(categoryValue)
    } else {
      update({
        categories: [...draft.categories, categoryValue],
      })
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold">Let's start with the basics</h2>
        <p className="text-muted-foreground">What are you creating today?</p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        {/* Title Input */}
        <div className="space-y-2">
          <Label htmlFor="title">Listing Title</Label>
          <Input 
            id="title" 
            placeholder="e.g. Articulated Dragon - Print in Place"
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            className="text-lg md:text-xl p-6"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Use words people would search for.
          </p>
        </div>

        {/* Multi-Select Category Input */}
        <div className="space-y-3">
          <Label>Categories</Label>
          
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between h-12 text-base px-3"
              >
                {draft.categories.length > 0 
                  ? `${draft.categories.length} selected`
                  : "Select categories..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search categories..." />
                <CommandList>
                  <CommandEmpty>No category found.</CommandEmpty>
                  <CommandGroup>
                    {CATEGORIES.map((category) => {
                      const isSelected = draft.categories.includes(category.value)
                      return (
                        <CommandItem
                          key={category.value}
                          value={category.label} // Filtering by label usually feels better
                          onSelect={() => handleSelect(category.value)}
                        >
                          <div className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                          )}>
                            <Check className={cn("h-4 w-4")} />
                          </div>
                          {category.label}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Selected Chips Area */}
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {draft.categories.length > 0 ? (
              draft.categories.map((catValue) => {
                const catLabel = CATEGORIES.find((c) => c.value === catValue)?.label || catValue
                return (
                  <Badge 
                    key={catValue} 
                    variant="secondary"
                    className="text-sm py-1 pl-3 pr-1 gap-1"
                  >
                    {catLabel}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
                      onClick={() => handleUnselect(catValue)}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove {catLabel}</span>
                    </Button>
                  </Badge>
                )
              })
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No categories selected yet.
              </p>
            )}
          </div>
        </div>
      </div>


      <div className="pt-6 flex justify-end">
        <Button onClick={onNext} disabled={!isValid} size="lg">
          Next: Upload Assets
        </Button>
      </div>
    </div>
  )
}