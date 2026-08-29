'use client';

import Link from 'next/link';
import {
  CreditCard,
  LogOut,
  Settings,
  User,
  ShieldCheck,
  LayoutDashboard
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApp } from '@/lib/store';

export function UserNav() {
  const { user, isLoggedIn, logout } = useApp();

  if (!isLoggedIn) {
    return (
      <Link href="/login">
        <Button variant="ghost" size="icon" className="group">
          <User className="h-4 w-4 group-hover:text-primary" />
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full border border-border hover:bg-primary hover:border-primary group transition-all">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-transparent text-[10px] font-semibold group-hover:text-white">
              {user?.name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 rounded-md border border-border p-0" align="end" forceMount>
        <DropdownMenuLabel className="font-normal p-6 bg-muted/30 border-b-2 border-foreground">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest">{user?.name}</p>
              {user?.isAdmin && (
                <span className="bg-primary text-white text-[8px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-tighter">Admin</span>
              )}
            </div>
            <p className="text-[10px] leading-none text-muted-foreground uppercase font-bold tracking-widest">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuGroup className="p-2">
          {user?.isAdmin && (
            <Link href="/admin">
              <DropdownMenuItem className="p-3 text-[10px] font-semibold uppercase tracking-widest cursor-pointer focus:bg-primary focus:text-white rounded-md">
                <LayoutDashboard className="mr-3 h-4 w-4" />
                <span>Admin Dashboard</span>
              </DropdownMenuItem>
            </Link>
          )}
          <Link href="/settings">
            <DropdownMenuItem className="p-3 text-[10px] font-semibold uppercase tracking-widest cursor-pointer focus:bg-primary focus:text-white rounded-md">
              <User className="mr-3 h-4 w-4" />
              <span>Profile Settings</span>
            </DropdownMenuItem>
          </Link>
          <Link href="/settings?tab=billing">
            <DropdownMenuItem className="p-3 text-[10px] font-semibold uppercase tracking-widest cursor-pointer focus:bg-primary focus:text-white rounded-md">
              <CreditCard className="mr-3 h-4 w-4" />
              <span>Dermal Credit</span>
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator className="bg-foreground h-0.5" />
        
        <DropdownMenuItem 
          onClick={() => logout()}
          className="p-4 text-[10px] font-semibold uppercase tracking-widest cursor-pointer focus:bg-destructive focus:text-white rounded-md m-2"
        >
          <LogOut className="mr-3 h-4 w-4" />
          <span>Clinical Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
