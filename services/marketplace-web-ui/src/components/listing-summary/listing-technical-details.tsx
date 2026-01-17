import type { ReactNode } from "react"

export interface TechSpecItem {
  label: string
  value: string
  icon: ReactNode
}

interface ListingTechSpecsProps {
  specs: TechSpecItem[]
}

export function ListingTechSpecs({ specs }: ListingTechSpecsProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-3">
        <h3 className="font-bold">Key Information</h3>
  
      </div>
      <div className="divide-y">
        {specs.map((spec, i) => (
          <div key={i} className="grid grid-cols-2 px-5 py-3 transition-colors hover:bg-muted/20">
            <span className="flex items-center gap-4  text-sm text-muted-foreground">
              {spec.icon}

              {spec.label}
            </span>
            <span className="text-right text-sm font-medium">{spec.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}