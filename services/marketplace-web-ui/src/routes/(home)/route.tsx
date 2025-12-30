import { MarketplaceSidebar } from '@/components/marketplace-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/(home)')({
  component: RouteComponent,
})

function RouteComponent() {
 return <SidebarProvider
   style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 15)",
        } as React.CSSProperties
      }
  >
     <MarketplaceSidebar variant="inset" />
      <SidebarInset>
            <Outlet />
      </SidebarInset>
  </SidebarProvider>
}
