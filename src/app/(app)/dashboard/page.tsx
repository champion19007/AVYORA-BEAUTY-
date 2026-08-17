'use client';

import { 
  Plus, 
  BarChart3, 
  Clock, 
  CheckCircle2, 
  Users, 
  ChevronRight,
  TrendingUp,
  ArrowUpRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Overview</span>
          <h1 className="text-3xl font-bold tracking-tight">Good morning, John</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your workspace today.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-full px-6">Manage View</Button>
          <Button className="rounded-full px-6 bg-primary hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> Create New
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks', value: '42', delta: '+12%', icon: CheckCircle2, color: 'text-blue-500' },
          { label: 'Team Members', value: '8', delta: '0', icon: Users, color: 'text-purple-500' },
          { label: 'Hours Tracked', value: '128h', delta: '+8%', icon: Clock, color: 'text-orange-500' },
          { label: 'Goal Progress', value: '64%', delta: '+5%', icon: TrendingUp, color: 'text-green-500' },
        ].map((stat) => (
          <Card key={stat.label} className="group hover:border-primary transition-all cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className={stat.color}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-green-500">
                  {stat.delta} <ArrowUpRight className="h-3 w-3" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-bold tracking-tight">{stat.value}</h3>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Recent Projects</CardTitle>
              <CardDescription>You are active in 3 projects this week.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs font-bold uppercase tracking-widest">View All</Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {[
              { name: 'Skincare Campaign Q4', progress: 75, status: 'On Track', color: 'bg-green-500' },
              { name: 'Mobile App Redesign', progress: 45, status: 'At Risk', color: 'bg-yellow-500' },
              { name: 'Brand Identity', progress: 90, status: 'Near Completion', color: 'bg-blue-500' },
            ].map((project) => (
              <div key={project.name} className="flex flex-col gap-3 group cursor-pointer">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm group-hover:text-primary transition-colors">{project.name}</h4>
                  <div className="flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full ${project.color}`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{project.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Progress value={project.progress} className="h-2 flex-1" />
                  <span className="text-xs font-bold w-8">{project.progress}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Tasks</CardTitle>
            <CardDescription>Your tasks for the next 24h.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { title: 'Approve final UI specs', time: '10:00 AM', priority: 'High' },
              { title: 'Team sync', time: '1:30 PM', priority: 'Medium' },
              { title: 'Update project roadmap', time: '4:00 PM', priority: 'Low' },
            ].map((task) => (
              <div key={task.title} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:border-primary transition-all cursor-pointer">
                <div className="space-y-1">
                  <h5 className="text-xs font-bold">{task.title}</h5>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {task.time}
                  </div>
                </div>
                <Badge variant="outline" className="text-[8px] uppercase tracking-widest">{task.priority}</Badge>
              </div>
            ))}
            <Button variant="outline" className="w-full rounded-full text-xs font-bold uppercase tracking-widest py-6">
              Full Task List <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}