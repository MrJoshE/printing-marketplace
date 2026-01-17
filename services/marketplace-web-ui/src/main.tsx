import { RouterProvider, createRouter } from '@tanstack/react-router'

import { AuthProvider, useAuth } from '@/lib/auth/useAuth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import { routeTree } from './routeTree.gen'

const queryClient = new QueryClient()


// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  context: {
    queryClient, 
    auth: undefined!, // This will be set after we wrap the app in an AuthProvider
  },
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}


function InnerApp() {

  const auth = useAuth()

  if (auth.isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-muted-foreground">
        {/* You can swap this for a nice Spinner component */}
        Loading application...
      </div>
    )
  }

  return <QueryClientProvider client={queryClient}><RouterProvider router={router} context={{ auth }} /></QueryClientProvider>
}

function App() {
  return (
    <AuthProvider>
      <InnerApp />
      <Toaster />
    </AuthProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
