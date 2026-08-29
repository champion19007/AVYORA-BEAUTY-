
'use client';

import { useApp } from '@/lib/store';
import { CATEGORIES } from '@/data/mock-data';
import { ProductService } from '@/services/product-service';
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
  Edit3,
  Check,
  ChevronRight,
  Maximize2
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
import { useEffect, useMemo, useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';

/**
 * AdminDashboard provides a comprehensive clinical interface for managing
 * Avyora's inventory, pricing, and member analytics.
 */
export default function AdminDashboard() {
  const { user, isLoggedIn } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  // State Management
  const [products, setProducts] = useState(ProductService.getAllProducts());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [newPrice, setNewPrice] = useState<string>('');

  // Access Control: Ensure only administrators can view this panel.
  useEffect(() => {
    if (!isLoggedIn || !user?.isAdmin) {
      router.push('/login');
    }
  }, [isLoggedIn, user, router]);

  /**
   * Derived Data: Phase distribution analysis for portfolio visualization.
   */
  const phaseData = useMemo(() => {
    return CATEGORIES.map((cat, index) => {
      const catProducts = products.filter(p => p.category === cat.id);
      return {
        name: `Phase ${index + 1}`,
        fullName: cat.name,
        count: catProducts.length,
        avgPrice: Math.round(
          catProducts.reduce((acc, p) => acc + p.price, 0) / 
          (catProducts.length || 1)
        )
      };
    });
  }, [products]);

  const growthData = [
    { month: 'Jan', members: 400 },
    { month: 'Feb', members: 600 },
    { month: 'Mar', members: 850 },
    { month: 'Apr', members: 1100 },
    { month: 'May', members: 1248 },
  ];

  /**
   * Price editing is disabled until there is a database behind it.
   *
   * It previously mutated an in-memory singleton. On serverless that edit
   * lands on one instance only: invisible to other instances, lost when the
   * instance recycles, and capable of showing two customers two different
   * prices. Rather than leave a control that appears to work and does not,
   * it reports the limitation. See docs/scaling.md.
   */
  const handleUpdatePrice = () => {
    setIsEditingPrice(false);
    toast({
      variant: 'destructive',
      title: 'Price editing unavailable',
      description:
        'Prices are read from the build-time catalogue. Connect a database before enabling edits.',
    });
  };

  const selectedProduct = useMemo(() => 
    products.find(p => p.id === selectedProductId), 
    [products, selectedProductId]
  );

  const selectedPerformanceData = useMemo(() => 
    selectedProductId ? ProductService.getProductSimulatedPerformance(selectedProductId) : [],
    [selectedProductId]
  );

  if (!isLoggedIn || !user?.isAdmin) return null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl space-y-12 animate-in fade-in duration-700">
      {/* Clinical Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-4 border-foreground pb-12">
        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.4em] text-primary">Intelligence Hub</span>
          <h1 className="text-4xl md:text-6xl font-semibold uppercase tracking-tight leading-none">Clinical Analysis</h1>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" className="border border-border rounded-md font-semibold uppercase tracking-widest text-[10px] px-8 h-12 hover:bg-muted transition-all">Export JSON</Button>
          <Button className="bg-foreground text-background rounded-md font-semibold uppercase tracking-widest text-[10px] px-8 h-12 hover:bg-primary transition-all">Sync Cloud</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Intelligence Grid */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Inventory Table with Interactive Rows */}
          <Card className="rounded-md border border-border overflow-hidden">
            <CardHeader className="border-b-2 border-foreground bg-muted/30">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <CardTitle className="text-xl font-semibold uppercase tracking-tight">Formulation Index</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Select a product for granular SKU intelligence</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent border-b-2 border-foreground">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-foreground h-14 pl-8">Formulation</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-foreground h-14">Phase</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-foreground h-14 text-right pr-8">Unit Price</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow 
                      key={product.id} 
                      className={`cursor-pointer transition-all border-b border-muted hover:bg-primary/5 ${selectedProductId === product.id ? 'bg-primary/10' : ''}`}
                      onClick={() => {
                        setSelectedProductId(product.id);
                        setNewPrice(product.price.toString());
                        setIsEditingPrice(false);
                      }}
                    >
                      <TableCell className="py-6 pl-8">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold uppercase tracking-widest">{product.name}</span>
                          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{product.id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-md border border-border text-[8px] font-semibold uppercase tracking-widest py-1 px-3">
                          {product.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <span className="text-[11px] font-semibold tracking-tight">₹{product.price.toLocaleString()}</span>
                      </TableCell>
                      <TableCell className="pr-4">
                        <ChevronRight className={`h-4 w-4 transition-transform ${selectedProductId === product.id ? 'translate-x-1 text-primary' : 'text-muted-foreground/30'}`} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Aggregate Phase Analysis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="rounded-md border border-border">
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-widest flex items-center gap-2">
                  <BarChart4 className="h-4 w-4 text-primary" /> SKU Volume by Phase
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={phaseData}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                      content={({ active, payload }) => (
                        active && payload && payload.length ? (
                          <div className="bg-foreground text-background p-3 rounded-md border border-primary">
                            <p className="text-[9px] font-semibold uppercase">{payload[0].payload.fullName}</p>
                            <p className="text-lg font-semibold">{payload[0].value} SKUs</p>
                          </div>
                        ) : null
                      )}
                    />
                    <Bar dataKey="count" radius={[0, 0, 0, 0]} fill="#000" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-md border border-border">
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Growth Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthData}>
                    <defs>
                      <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tick={{ fontSize: 9, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                    <Area type="monotone" dataKey="members" stroke="#f97316" strokeWidth={3} fill="url(#growthGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sidebar: Deep SKU Intelligence & Pricing */}
        <div className="space-y-8">
          {selectedProduct ? (
            <div className="space-y-8 sticky top-32 animate-in slide-in-from-right-4 duration-500">
              <Card className="rounded-md border border-border bg-accent/5 overflow-hidden">
                <CardHeader className="border-b-2 border-foreground bg-background">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-primary">{selectedProduct.category} Intelligence</span>
                      <CardTitle className="text-xl font-semibold uppercase tracking-tight leading-none">{selectedProduct.name}</CardTitle>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-md border border-foreground/10">
                      <Maximize2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                  {/* Detailed Performance Chart */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-semibold uppercase tracking-widest flex items-center justify-between">
                      30-Day Dermal Volume <span>{selectedPerformanceData.reduce((acc, curr) => acc + curr.volume, 0)} Total</span>
                    </h4>
                    <div className="h-[120px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsLineChart data={selectedPerformanceData}>
                          <Line type="step" dataKey="volume" stroke="#000" strokeWidth={3} dot={false} />
                        </RechartsLineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Pricing Management Logic */}
                  <div className="pt-6 border-t border-foreground/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-semibold uppercase tracking-widest">Clinical Unit Pricing</h4>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 text-[8px] font-semibold uppercase rounded-md px-4"
                        onClick={() => setIsEditingPrice(!isEditingPrice)}
                      >
                        {isEditingPrice ? "Cancel" : <><Edit3 className="h-3 w-3 mr-2" /> Adjust</>}
                      </Button>
                    </div>
                    
                    {isEditingPrice ? (
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold opacity-40">₹</span>
                          <Input 
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            className="rounded-md border border-border h-12 pl-8 text-xs font-semibold focus-visible:ring-0"
                            placeholder="Set price..."
                          />
                        </div>
                        <Button 
                          onClick={handleUpdatePrice}
                          className="bg-foreground text-background rounded-md h-12 px-4 hover:bg-primary transition-all"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="p-4 bg-background border border-border shadow-luxe">
                        <span className="text-3xl font-semibold tracking-tight">₹{selectedProduct.price.toLocaleString()}</span>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Current MRP for {selectedProduct.sizes[0].label}</p>
                      </div>
                    )}
                  </div>

                  {/* SKU Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-background border border-foreground/10">
                      <p className="text-[8px] font-semibold uppercase opacity-40">Rating</p>
                      <p className="text-xl font-semibold">{selectedProduct.rating}</p>
                    </div>
                    <div className="p-4 bg-background border border-foreground/10">
                      <p className="text-[8px] font-semibold uppercase opacity-40">Reviews</p>
                      <p className="text-xl font-semibold">{selectedProduct.reviewCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-md border border-border bg-primary text-white">
                <CardContent className="p-6">
                  <div className="flex gap-4 items-start">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest leading-tight">Clinical Optimization Insight</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest opacity-80 mt-2 leading-relaxed">
                        This SKU has high conversion in Phase {selectedProduct.id.includes('oil') ? '1' : '5'} clusters. Consider price bundling for loyalty program members.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="h-full min-h-[400px] border-2 border-dashed border-foreground/10 flex flex-col items-center justify-center text-center p-12 bg-muted/10">
              <Package className="h-12 w-12 text-muted-foreground opacity-20 mb-6" />
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Select a Formulation</h4>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mt-2 max-w-[200px]">
                Select any SKU from the formulation index to view deep clinical intelligence.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
