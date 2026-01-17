

import {
  IconBox,
  IconHelp,
  IconHome,
  IconInnerShadowTop,
  IconNewSection,
  IconPlus,
  IconShoppingBag
} from "@tabler/icons-react"
import { Link, useLocation } from "@tanstack/react-router"
import * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth/useAuth"
import { NavUser } from "./navigation/nav-user"

const data = {
  discover: [
    { title: "Home", url: "/", icon: IconHome },
    { title: "Latest", url: "/latest", icon: IconNewSection },
    { title: "Create Listing", url: "/create-listing", icon: IconPlus },
  ],
  library: [
    { title: "My Listings", url: "/my-listings", icon: IconBox},
    { title: "Purchases", url: "/purchases", icon: IconShoppingBag },
  ],
  support: [
    { title: "Contact Support", url: "/support", icon: IconHelp },
  ],
}

export function MarketplaceSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout, login, register  } = useAuth()
  const location = useLocation()
  const pathname = location.pathname

  const isLinkActive = (url: string) => {
    if (url === "/") return pathname === "/"
    return pathname.startsWith(url)
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              // Kept this one standard size as it's the logo
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
             <Link to="/">
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-medium">Pinecone</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Section 1: Discover */}
        <SidebarGroup>
          <SidebarGroupLabel>Discover</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.discover.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    tooltip={item.title} 
                    isActive={isLinkActive(item.url)}
                    // ADDED: h-auto allows height to grow, py-3 adds the vertical padding
                    className="h-auto py-3" 
                  >
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Section 2: Library */}
        {user && <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.library.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    tooltip={item.title}
                    isActive={isLinkActive(item.url)}
                    // ADDED: h-auto allows height to grow, py-3 adds the vertical padding
                    className="h-auto py-3"
                  >
                   <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
}
        {/* Section 3: Support */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Support</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.support.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    tooltip={item.title}
                    isActive={isLinkActive(item.url)}
                    className="h-auto py-3"
                  >
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          user={user}
          onLogout={() => logout()}
          onLogin={() => login()}
          onRegister={() => register()}
        />
      </SidebarFooter>
    </Sidebar>
  )
}