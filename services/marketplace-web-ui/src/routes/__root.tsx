import { NotFoundPage } from '@/components/not-found'
import type { AuthContextType } from '@/lib/auth/useAuth'
import type { QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'

interface RouterContext {
  queryClient: QueryClient
  auth: AuthContextType// Make auth available to all routes
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
})

function RootComponent() {
  return (
    <div>
       <Outlet /> {/* The 404 page will render here if no child route matches */}
    </div>
  )
}