import { Input } from "@/components/ui/input"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Search, X } from "lucide-react"
import * as React from "react"

interface SearchBarProps extends React.HTMLAttributes<HTMLDivElement> {
  placeholder?: string
}

export function SearchBar({ placeholder = "Search for models, STL files, designers...", className, ...props }: SearchBarProps) {
  const navigate = useNavigate()
  
  // 1. Read the current query from URL (if any)
  // Note: Adjust the path '/(home)/' to match your actual route definition
  const searchParams = useSearch({ from: '/(home)/' })
  const initialQuery = (searchParams as any).query || ""

  // 2. Local state for immediate UI feedback
  const [value, setValue] = React.useState(initialQuery)
  
  // 3. Debounce the value (wait 500ms after typing stops)
  const debouncedValue = useDebounce(value, 500)

  // 4. Sync with URL when debounced value changes
  React.useEffect(() => {
    // Only navigate if the value is different from what's already in the URL
    if (debouncedValue !== initialQuery) {
      navigate({
        // search: (prev) => ({
        //   ...prev,
        //   query: debouncedValue || undefined, // Remove param if empty
        // }),
      })
    }
  }, [debouncedValue, navigate, initialQuery])

  // Clear handler
  const handleClear = () => {
    setValue("")
    // Optional: Focus the input back after clearing?
  }

  return (
    <div className={cn("relative w-full max-w-xl", className)} {...props}>
      {/* Icon (Left) */}
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 w-full rounded-lg bg-secondary/50 pl-10 pr-20 text-lg ring-offset-background placeholder:text-muted-foreground focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary"
        placeholder={placeholder}
      />

      {/* Right Side Actions */}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
        
        {/* Clear Button (only show if there is text) */}
        {value && (
          <button 
            onClick={handleClear}
            className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Keyboard Shortcut Hint (Visual Only) */}
        {!value && (
            <kbd className="hidden select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
            </kbd>
        )}
      </div>
    </div>
  )
}