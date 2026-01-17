import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { type ReactNode, Suspense } from "react"

export interface ListingTabItem {
  value: string
  label: string
  /** * A function that returns the content. 
   * This ensures the component is not instantiated (and queries don't run)
   * until the tab is actually active.
   */
  renderContent: () => ReactNode
}

interface ListingInfoTabsProps {
  tabs: ListingTabItem[]
  defaultTab?: string
  className?: string
}

export function ListingInfoTabs({ 
  tabs, 
  defaultTab, 
  className 
}: ListingInfoTabsProps) {
  const activeTab = defaultTab || tabs[0]?.value

  return (
    <Tabs defaultValue={activeTab} className={cn("w-full mt-8", className)}>
      <div className="overflow-x-auto pb-2 scrollbar-hide">
        <TabsList className="w-full justify-start bg-transparent p-0 border-b h-auto rounded-none gap-6">
          {tabs.map((tab) => (
            <TabsTrigger 
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent px-0 py-3 font-medium uppercase tracking-wide text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none hover:text-foreground transition-colors"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Radix UI (Shadcn) unmounts TabsContent when hidden by default.
            However, by using a render prop, we ensure the JS execution 
            of the child only happens right here, right now.
          */}
          <Suspense fallback={
            <div className="flex h-20 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
            </div>
          }>
            {tab.renderContent()}
          </Suspense>
        </TabsContent>
      ))}
    </Tabs>
  )
}