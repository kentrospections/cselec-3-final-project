"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import {
  IconLayoutDashboard,
  IconTrendingUp,
  IconSchool,
  IconBook,
  IconCalendar,
  IconCommand,
} from "@tabler/icons-react"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import { AppLink } from "@/components/custom/app-link"

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: <IconLayoutDashboard /> },
  { title: "Grades", url: "/grades", icon: <IconTrendingUp /> },
  { title: "Students", url: "/students", icon: <IconSchool /> },
  { title: "Subjects", url: "/subjects", icon: <IconBook /> },
  { title: "Semesters", url: "/semesters", icon: <IconCalendar /> },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<AppLink href="/dashboard" />}
            >
              <IconCommand className="size-5!" />
              <span className="text-base font-semibold">CSElec 3 Final Project</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={pathname === item.url}
                    render={<AppLink href={item.url} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
