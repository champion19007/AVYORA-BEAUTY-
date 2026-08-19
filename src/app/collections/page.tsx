
'use client';

import { useState, useMemo, useEffect } from 'react';
import { PRODUCTS, CONCERNS, Product } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Filter, SlidersHorizontal, X } from 'lucide-react';

// Mapping helper to group products into "Steps"
const getStepForCategory = (category: string): string => {
  switch (category) {
    case 'cleanser': return 'Cleanse';
    case 'toner': return 'Tone';
    case 'exfoliator':
    case 'essence':
    case 'serum':
    case 'mask': return 'Treat';
    case 'moisturizer':
    case 'body':
    case 'lip': return 'Moisturize';
    case 'sun': return 'SPF';
    default: return 'Other';
  }
};

const STEPS = ['Cleanse', 'Tone', 'Treat', 'Moisturize', 'SPF'];
const TYPES = ['Cleanser', 'Exfoliator', 'Toner', 'Essence', 'Serum', 'Mask', 'Moisturizer', 'SPF'];

export default function CollectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filter States
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState([0, 2000]);
  const [sortBy, setSortBy] = useState('best-selling');

  // Initializing from URL
  useEffect(() => {
    const step = searchParams.get('step');
    const type = searchParams.get('type');
    const concern = searchParams.get('concern') || searchParams.get('cat');
    const filter = searchParams.get('filter');

    if (step) setSelectedSteps([step]);
    if (type) setSelectedTypes([type]);
    if (concern) setSelectedConcerns([concern]);
    if (filter === 'bestsellers') setSortBy('best-selling');
  }, [searchParams]);

  // Filtering Logic
  const filteredProducts = useMemo(() => {
    let result = [...PRODUCTS];

    if (selectedSteps.length > 0) {
      result = result.filter(p => selectedSteps.includes(getStepForCategory(p.category)));
    }

    if (selectedTypes.length > 0) {
      result = result.filter(p => selectedTypes.includes(p.category.charAt(0).toUpperCase() + p.category.slice(1)));
    }

    if (selectedConcerns.length > 0) {
      result = result.filter(p => p.concerns.some(c => selectedConcerns.includes(c)));
    }

    result = result.filter(p => p.price >= priceRange[0] && p.price <= priceRange[1]);

    // Sorting
    switch (sortBy) {
      case 'price-low':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'best-selling':
      default:
        result.sort((a, b) => (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0));
        break;
    }

    return result;
  }, [selectedSteps, selectedTypes, selectedConcerns, priceRange, sortBy]);

  // Helper to toggle filter items
  const toggleFilter = (item: string, state: string[], setState: (val: string[]) => void) => {
    setState(state.includes(item) ? state.filter(i => i !== item) : [...state, item]);
  };

  const clearAll = () => {
    setSelectedSteps([]);
    setSelectedTypes([]);
    setSelectedConcerns([]);
    setPriceRange([0, 2000]);
    setSortBy('best-selling');
    router.push('/collections');
  };

  const FilterSidebar = () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-muted-foreground">Step</h3>
        <div className="space-y-3">
          {STEPS.map(step => {
            const count = PRODUCTS.filter(p => getStepForCategory(p.category) === step).length;
            return (
              <div key={step} className="flex items-center space-x-3 group cursor-pointer" onClick={() => toggleFilter(step, selectedSteps, setSelectedSteps)}>
                <Checkbox id={`step-${step}`} checked={selectedSteps.includes(step)} />
                <label className="text-[11px] font-bold uppercase tracking-widest cursor-pointer flex-1 group-hover:text-primary transition-colors">
                  {step} <span className="text-muted-foreground opacity-50 ml-1">({count})</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-muted-foreground">Type of Product</h3>
        <div className="space-y-3">
          {TYPES.map(type => {
            const count = PRODUCTS.filter(p => p.category.toLowerCase() === type.toLowerCase()).length;
            if (count === 0) return null;
            return (
              <div key={type} className="flex items-center space-x-3 group cursor-pointer" onClick={() => toggleFilter(type, selectedTypes, setSelectedTypes)}>
                <Checkbox id={`type-${type}`} checked={selectedTypes.includes(type)} />
                <label className="text-[11px] font-bold uppercase tracking-widest cursor-pointer flex-1 group-hover:text-primary transition-colors">
                  {type} <span className="text-muted-foreground opacity-50 ml-1">({count})</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-muted-foreground">Concern</h3>
        <div className="space-y-3">
          {CONCERNS.map(concern => {
            const count = PRODUCTS.filter(p => p.concerns.includes(concern.id)).length;
            return (
              <div key={concern.id} className="flex items-center space-x-3 group cursor-pointer" onClick={() => toggleFilter(concern.id, selectedConcerns, setSelectedConcerns)}>
                <Checkbox id={`concern-${concern.id}`} checked={selectedConcerns.includes(concern.id)} />
                <label className="text-[11px] font-bold uppercase tracking-widest cursor-pointer flex-1 group-hover:text-primary transition-colors">
                  {concern.name} <span className="text-muted-foreground opacity-50 ml-1">({count})</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-muted-foreground">Price</h3>
        <div className="px-2">
          <Slider
            defaultValue={[0, 2000]}
            max={2000}
            step={50}
            value={priceRange}
            onValueChange={setPriceRange}
            className="mb-4"
          />
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
            <span>₹{priceRange[0]}</span>
            <span>₹{priceRange[1]}</span>
          </div>
        </div>
      </div>

      <Button 
        variant="outline" 
        onClick={clearAll}
        className="w-full rounded-none border-2 text-[9px] font-black uppercase tracking-widest py-6"
      >
        Clear Filters
      </Button>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-16 text-center space-y-4">
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter">Shop All</h1>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Efficacious, transparent, and research-backed skincare formulations. Each phase is meticulously built to target your specific skin concerns.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-12">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-32 h-fit overflow-y-auto no-scrollbar pb-20">
          <FilterSidebar />
        </aside>

        {/* Main Content */}
        <div className="flex-1 space-y-8">
          {/* Controls Bar */}
          <div className="flex items-center justify-between border-b-2 border-foreground pb-6">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Showing {filteredProducts.length} Products
              </span>
              
              {/* Mobile Filter Trigger */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden rounded-none text-[8px] font-black uppercase tracking-widest h-8 px-4 border-2">
                    <Filter className="mr-2 h-3 w-3" /> Filters
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] p-8 overflow-y-auto bg-background">
                  <SheetHeader className="mb-8">
                    <SheetTitle className="text-sm font-black uppercase tracking-[0.2em]">Refine Search</SheetTitle>
                  </SheetHeader>
                  <FilterSidebar />
                </SheetContent>
              </Sheet>
            </div>

            <div className="flex items-center gap-4">
              <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sort By:</span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px] rounded-none border-2 border-foreground h-10 text-[10px] font-black uppercase tracking-widest focus:ring-0">
                  <SelectValue placeholder="Best Selling" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-2 border-foreground">
                  <SelectItem value="best-selling" className="text-[10px] font-black uppercase tracking-widest">Best Selling</SelectItem>
                  <SelectItem value="price-low" className="text-[10px] font-black uppercase tracking-widest">Price: Low to High</SelectItem>
                  <SelectItem value="price-high" className="text-[10px] font-black uppercase tracking-widest">Price: High to Low</SelectItem>
                  <SelectItem value="rating" className="text-[10px] font-black uppercase tracking-widest">Top Rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filter Chips */}
          {(selectedSteps.length > 0 || selectedTypes.length > 0 || selectedConcerns.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {[...selectedSteps, ...selectedTypes, ...selectedConcerns].map(tag => (
                <div key={tag} className="bg-primary/10 text-primary border-primary/20 border-2 px-3 py-1 flex items-center gap-2 group">
                  <span className="text-[8px] font-black uppercase tracking-widest">{tag}</span>
                  <button onClick={() => {
                    if (selectedSteps.includes(tag)) toggleFilter(tag, selectedSteps, setSelectedSteps);
                    if (selectedTypes.includes(tag)) toggleFilter(tag, selectedTypes, setSelectedTypes);
                    if (selectedConcerns.includes(tag)) toggleFilter(tag, selectedConcerns, setSelectedConcerns);
                  }}>
                    <X className="h-3 w-3 hover:scale-125 transition-transform" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-16">
            {filteredProducts.length > 0 ? (
              filteredProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))
            ) : (
              <div className="col-span-full py-32 text-center">
                <h3 className="text-lg font-black uppercase tracking-widest mb-4">No products found</h3>
                <p className="text-muted-foreground uppercase tracking-[0.2em] text-[10px] font-bold max-w-md mx-auto leading-relaxed mb-8">
                  Try adjusting your filters or search terms to find what you're looking for.
                </p>
                <Button onClick={clearAll} className="rounded-none bg-foreground text-background text-[10px] font-black uppercase tracking-widest px-8 py-6">
                  Clear All Filters
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
