'use client';

import { Plus, Target, Info, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function GoalsPage() {
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Goals</span>
          <h1 className="text-3xl font-bold tracking-tight">Execution Goals</h1>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-medium">
            <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-green-500" /> 0 Active</span>
            <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-red-500" /> 0 At Risk</span>
            <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-yellow-500" /> 0 Due Soon</span>
            <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-blue-500" /> 0 Completed</span>
          </div>
        </div>
        <Button className="rounded-full px-6 bg-primary hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" /> Add Goal
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between border-b pb-4">
          <Tabs defaultValue="project" className="w-fit">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="project" className="gap-2">
                <Target className="h-3.5 w-3.5" /> Project <Badge variant="secondary" className="h-4 px-1 text-[8px]">0</Badge>
              </TabsTrigger>
              <TabsTrigger value="personal" className="gap-2">
                <Target className="h-3.5 w-3.5" /> Personal <Badge variant="secondary" className="h-4 px-1 text-[8px]">0</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Filter className="mr-2 h-3.5 w-3.5" /> Filter
          </Button>
        </div>

        <Card className="border-dashed bg-muted/20 py-24">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <div className="mb-6 rounded-full bg-background p-6 shadow-sm border">
              <Target className="h-12 w-12 text-muted-foreground opacity-20" />
            </div>
            <h3 className="text-lg font-bold">No project goals yet</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-[300px]">
              Create one focused outcome so progress, owner attention, and deadline pressure stay visible.
            </p>
            <Button className="mt-8 rounded-full px-8 bg-primary hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> Add Goal
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-6 flex items-start gap-4 hover:border-primary transition-colors cursor-pointer group">
            <div className="rounded-lg bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold">How goals work</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Goals help you track progress toward large outcomes. Connect tasks and projects to goals to see how work impacts your top-level strategy.</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6 flex items-start gap-4 hover:border-primary transition-colors cursor-pointer group">
            <div className="rounded-lg bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold">Set a strategy</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Organize your work into execution cycles. Use goals to define what success looks like for your team this quarter.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}