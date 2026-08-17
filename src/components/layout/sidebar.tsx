'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  CheckSquare,
  Target,
  Bot,
  Users,
  FolderKanban,
  Layers,
  MessageSquare,
  Zap,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Command,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';

const PERSONAL_ITEMS = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'My Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'Goals', href: '/goals', icon: Target },
  { name: 'My Assistant', href: '/assistant', icon: Bot },
];

const COMPANY_ITEMS = [
  { name: 'Teams', href: '/teams', icon: Users },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Groups', href: '/groups', icon: Layers },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'External Apps', href: '/integrations', icon: Zap },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="h-16 flex items-center px-4">
        <div className="flex items-center gap-3 w-full">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Command className="h-5 w-5" />
          </div>
          <div className="flex flex-col gap-0.5 truncate group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-sm tracking-tight">LTD DASHBOARD</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Personal Workspace</span>
              <Badge variant="secondary" className="h-3 px-1 text-[8px] uppercase">Free</Badge>
            </div>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">Personal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PERSONAL_ITEMS.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.name}
                    className={cn(
                      "transition-all",
                      pathname === item.href && "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon className={cn("h-4 w-4", pathname === item.href && "text-primary")} />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-2 opacity-50" />

        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">Company</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {COMPANY_ITEMS.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.name}
                    className={cn(
                      "transition-all",
                      pathname === item.href && "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon className={cn("h-4 w-4", pathname === item.href && "text-primary")} />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <div className="flex flex-col gap-2">
          <Link href="/upgrade" className="group-data-[collapsible=icon]:hidden">
             <div className="relative overflow-hidden rounded-xl bg-primary p-4 text-primary-foreground transition-all hover:bg-primary/90">
              <div className="relative z-10 flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-tight">Upgrade to Pro</span>
                <span className="text-[10px] opacity-80">Get advanced analytics & more</span>
              </div>
              <Sparkles className="absolute -right-2 -top-2 h-12 w-12 opacity-20" />
            </div>
          </Link>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Report Issue">
                <AlertCircle className="h-4 w-4" />
                <span>Report an Issue</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}