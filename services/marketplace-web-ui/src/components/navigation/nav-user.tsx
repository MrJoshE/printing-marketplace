"use client"

import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
  IconNotification,
  IconUserCircle,
} from "@tabler/icons-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { User } from "@/lib/auth/useAuth"
import { LogInIcon } from "lucide-react"

export function NavUser({user , onLogout, onLogin, onRegister}: {user: User | null, onLogout: () => void, onLogin : () => void, onRegister: () => void}) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu className="border-t-[0.1px] pt-2 ">

        {user ? (
          <AuthenticatedUserNav onLogout={onLogout} user={user} isMobile={isMobile} />
        ) : (
          <UnauthenticatedUserNav onLogin={onLogin} onRegister={onRegister}/>
        )}

    </SidebarMenu>
  )
}

function UnauthenticatedUserNav({onLogin, onRegister}: {onLogin: () => void, onRegister: () => void}) {
  return (
    <div>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={onLogin}
          size="lg"
          className="p-4 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >

          <div className="grid flex-1 text-left leading-tight">
            <span className="truncate text-muted-foreground ">Login</span>
          </div>
          <LogInIcon className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem className="border-t-[0.1px] pt-2">
        <SidebarMenuButton
          onClick={onRegister}
          size="lg"
          className="p-4 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >

          <div className="grid flex-1 text-left leading-tight">
            <span className="truncate text-muted-foreground ">Register</span>
          </div>
          <LogInIcon className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </div>
  )
}

function AuthenticatedUserNav({onLogout, user, isMobile}: {onLogout: () => void, user: User, isMobile: boolean}) {
  return (
    <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg grayscale">
                  <AvatarImage src={user?.avatar} alt={user?.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user?.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user?.email}
                  </span>
                </div>
                <IconDotsVertical className="ml-auto size-4" />
              </SidebarMenuButton>


          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user?.avatar} alt={user?.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user?.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user?.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <IconUserCircle />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconCreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconNotification />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
  )
}
