'use client';

import { useApp } from '@/lib/store';
import { PRODUCTS, CATEGORIES } from '@/data/mock-data';
import { 
  Package, 
  TrendingUp, 
  Users, 
  AlertCircle, 
  Search,
  Filter,
  Clock,
  BarChart4,
  LineChart,
  PieChart as PieChartIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { 
  Bar, 
  BarChart, 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Area,
  AreaChart,
  CartesianGrid
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export default function AdminDashboard() {
  const { user, isLoggedIn } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn || !user?.isAdmin) {
      router.push('/login');
    }
  }, [isLoggedIn, user, router]);

  // Analysis Data Preparation
  const phaseData = useMemo(() => {
    return CATEGORIES.map((cat, index) => ({
      name: `Phase ${index + 1}`,
      fullName: cat.name,
      count: PRODUCTS.filter(p => p.category === cat.id).length,
      avgPrice: Math.round(
        PRODUCTS.filter(p => p.category === cat.id).reduce((acc, p) => acc + p.price, 0) / 
        (PRODUCTS.filter(p => p.category === cat.id).length || 1)
      )
    }));
  }, []);

  const growthData = [
    { month: 'Jan', members: 400 },
    { month: 'Feb', members: 600 },
    { month: 'Mar', members: 850 },
    { month: 'Apr', members: 1100 },
    { month: 'May', members: 1248 },
  ];

  if (!isLoggedIn || !user?.isAdmin) return null;

  const totalSKUs = PRODUCTS.length;
  const bestSellers = PRODUCTS.filter(p => p.isBestSeller).length;
  const avgRating = (PRODUCTS.reduce((acc, p) => acc + p.rating, 0) / totalSKUs).toFixed(1);

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl space-y-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-4 border-foreground pb-12">
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Intelligence Hub</span>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none">Clinical Analysis</h1>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" className="border-2 border-foreground rounded-none font-black uppercase tracking-widest text-[10px] px-8 h-12">Download Report</Button>
          <Button className="bg-foreground text-background rounded-none font-black uppercase tracking-widest text-[10px] px-8 h-12 hover:bg-primary transition-all">Update API</Button>
        </div>
      </div>

      {/* Analytics Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SKU Distribution Chart */}
        <Card className="rounded-none border-2 border-foreground col-span-1 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
                <BarChart4 className="h-5 w-5 text-primary" /> SKU Distribution by Phase
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase">Volume Analysis across clinical categories</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={phaseData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 'bold', fill: '#666' }} 
                />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-foreground text-background p-4 rounded-none border-2 border-primary shadow-[8px_8px_0px_0px_rgba(249,115,22,0.2)]">
                          <p className="text-[10px] font-black uppercase tracking-widest mb-1">{payload[0].payload.fullName}</p>
                          <p className="text-xl font-black">{payload[0].value} Formulations</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[0, 0, 0, 0]}>
                  {phaseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#000' : '#f97316'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Membership Growth Chart */}
        <Card className="rounded-none border-2 border-foreground">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Circle Growth
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase">Membership acquisition trends</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthData}>
                <defs>
                  <linearGradient id="colorMembers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 'bold' }} 
                />
                <Tooltip 
                   content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white p-4 border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                          <p className="text-[8px] font-black uppercase tracking-widest">{payload[0].payload.month}</p>
                          <p className="text-sm font-black">{payload[0].value} Members</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="members" 
                  stroke="#f97316" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorMembers)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Analysis Chart */}
      <Card className="rounded-none border-2 border-foreground">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" /> Pricing Strategy Matrix
          </CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase">Average Unit Price per Clinical Phase (INR)</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={phaseData}>
              <CartesianGrid strokeDasharray="10 10" vertical={false} stroke="#eee" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 'bold' }} 
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 'bold' }}
                tickFormatter={(value) => `₹${value}`}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-foreground text-background p-4 rounded-none">
                        <p className="text-[10px] font-bold uppercase">{payload[0].payload.fullName}</p>
                        <p className="text-lg font-black tracking-tighter">Avg: ₹{payload[0].value}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line 
                type="stepAfter" 
                dataKey="avgPrice" 
                stroke="#000" 
                strokeWidth={4} 
                dot={{ r: 6, fill: '#f97316', strokeWidth: 0 }}
                activeDot={{ r: 8, fill: '#000', strokeWidth: 0 }}
              />
            </RechartsLineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Active SKUs', value: totalSKUs, delta: '+4 New', icon: Package, color: 'text-blue-500' },
          { label: 'Best Sellers', value: bestSellers, delta: `${((bestSellers/totalSKUs)*100).toFixed(0)}% Portfolio`, icon: TrendingUp, color: 'text-green-500' },
          { label: 'Clinical Rating', value: avgRating, delta: 'Top Tier', icon: AlertCircle, color: 'text-orange-500' },
          { label: 'Circle Members', value: '1,248', delta: '+12% Monthly', icon: Users, color: 'text-purple-500' },
        ].map((stat) => (
          <Card key={stat.label} className="rounded-none border-2 border-foreground shadow-[6px_6px_0px_0px_rgba(0,0,0,0.05)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                <span className="text-[8px] font-black uppercase tracking-widest bg-muted px-2 py-0.5">{stat.delta}</span>
              </div>
              <h3 className="text-3xl font-black tracking-tighter">{stat.value}</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inventory Management Table */}
      <Card className="rounded-none border-2 border-foreground">
        <CardHeader className="border-b-2 border-foreground bg-muted/30 p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <CardTitle className="text-xl font-black uppercase tracking-tighter">Clinical Formulation Index</CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Global inventory of all Avyora syntheses</CardDescription>
            </div>
            <div className="flex gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-40" />
                <Input 
                  placeholder="Search formulations..." 
                  className="rounded-none border-2 border-foreground h-10 pl-10 text-[10px] font-bold uppercase tracking-widest w-64 bg-background"
                />
              </div>
              <Button variant="outline" size="icon" className="rounded-none border-2 border-foreground"><Filter className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50 border-b-2 border-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground h-14 pl-8">Formulation</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground h-14">Phase</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground h-14">Rating</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground h-14">Sizes</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-foreground h-14 text-right pr-8">Unit Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PRODUCTS.map((product) => (
                <TableRow key={product.id} className="border-b border-muted hover:bg-muted/10 transition-colors">
                  <TableCell className="py-6 pl-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-black uppercase tracking-widest">{product.name}</span>
                      <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{product.id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-none border-2 border-foreground/10 text-[8px] font-black uppercase tracking-widest py-1 px-3">
                      {product.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black">{product.rating}</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <div key={s} className={`h-1.5 w-1.5 rounded-full ${s <= Math.floor(product.rating) ? 'bg-primary' : 'bg-muted'}`} />
                        ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {product.sizes.map(s => (
                        <span key={s.label} className="text-[8px] font-bold uppercase tracking-widest bg-foreground text-background px-2 py-0.5">{s.label}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <span className="text-[11px] font-black">₹{product.price.toLocaleString()}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Logistics & Phase Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 rounded-none border-2 border-foreground">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase tracking-tighter">Recent Logistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { id: 'ORD-9938', status: 'Shipped', user: 'Max Robinson', time: '2 mins ago' },
              { id: 'ORD-9937', status: 'Processing', user: 'Sarah Chen', time: '14 mins ago' },
              { id: 'ORD-9936', status: 'Delivered', user: 'Alex Thorne', time: '1 hour ago' },
              { id: 'ORD-9935', status: 'Shipped', user: 'David Kim', time: '3 hours ago' },
            ].map((order, i) => (
              <div key={order.id} className="flex items-center justify-between p-4 border-2 border-foreground/5 hover:border-primary/20 transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-muted flex items-center justify-center rounded-none group-hover:bg-primary group-hover:text-white transition-colors">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest">{order.id}</p>
                    <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">{order.user}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className="bg-foreground text-background rounded-none text-[7px] font-black uppercase tracking-widest px-2">{order.status}</Badge>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{order.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-none border-2 border-foreground bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase tracking-tighter">Phase Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {CATEGORIES.map(cat => (
              <div key={cat.id} className="space-y-2">
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                  <span>{cat.name}</span>
                  <span className="text-primary">{PRODUCTS.filter(p => p.category === cat.id).length} Products</span>
                </div>
                <div className="h-1.5 w-full bg-muted overflow-hidden">
                  <div 
                    className="h-full bg-primary" 
                    style={{ width: `${(PRODUCTS.filter(p => p.category === cat.id).length / PRODUCTS.length) * 100}%` }} 
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}