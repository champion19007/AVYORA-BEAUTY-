export interface Product {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  images: string[];
  price: number;
  salePrice?: number;
  rating: number;
  reviewCount: number;
  isBestSeller: boolean;
  isNewLaunch: boolean;
  category: 'skin' | 'hair' | 'body' | 'lip' | 'baby';
  concerns: string[];
  ingredients: string[];
  sizes: { label: string; price: number }[];
}

export const PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Salicylic Acid + LHA 2% Cleanser',
    slug: 'salicylic-acid-cleanser',
    tagline: 'Acne, Breakouts & Oiliness',
    description: 'A daily foaming cleanser with Salicylic acid and LHA to gently exfoliate and control excess sebum.',
    images: ['https://picsum.photos/seed/p1/800/800', 'https://picsum.photos/seed/p1b/800/800'],
    price: 299,
    rating: 4.8,
    reviewCount: 1830,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['acne', 'oiliness'],
    ingredients: ['salicylic acid'],
    sizes: [{ label: '100ml', price: 299 }, { label: '250ml', price: 499 }]
  },
  {
    id: '2',
    name: 'Vitamin C 16% Serum',
    slug: 'vitamin-c-serum',
    tagline: 'Dullness & Dark Spots',
    description: 'A glow-boosting serum stabilized with pure Vitamin C to brighten skin and reduce sun damage.',
    images: ['https://picsum.photos/seed/p2/800/800', 'https://picsum.photos/seed/p2b/800/800'],
    price: 699,
    salePrice: 599,
    rating: 4.9,
    reviewCount: 2450,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['dullness', 'pigmentation'],
    ingredients: ['vitamin c'],
    sizes: [{ label: '30ml', price: 699 }]
  },
  {
    id: '3',
    name: 'Niacinamide 10% Serum',
    slug: 'niacinamide-serum',
    tagline: 'Oil Control & Blemishes',
    description: 'A lightweight serum formulated with high concentration of Niacinamide to reduce blemishes.',
    images: ['https://picsum.photos/seed/p3/800/800'],
    price: 599,
    rating: 4.7,
    reviewCount: 3100,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['oiliness', 'blemishes'],
    ingredients: ['niacinamide'],
    sizes: [{ label: '30ml', price: 599 }]
  },
  {
    id: '4',
    name: 'Hyaluronic Acid 2% + B5',
    slug: 'hyaluronic-acid',
    tagline: 'Hydration & Repair',
    description: 'A hydration support formula with ultra-pure, vegan hyaluronic acid.',
    images: ['https://picsum.photos/seed/p4/800/800'],
    price: 499,
    rating: 4.9,
    reviewCount: 4200,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['dryness'],
    ingredients: ['hyaluronic acid'],
    sizes: [{ label: '30ml', price: 499 }]
  },
  {
    id: '5',
    name: 'Maleic Bond Repair Complex 5%',
    slug: 'hair-bond-repair',
    tagline: 'Damaged & Frizzy Hair',
    description: 'A pre-shampoo hair treatment that repairs damaged hair bonds.',
    images: ['https://picsum.photos/seed/p5/800/800'],
    price: 499,
    rating: 4.6,
    reviewCount: 950,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'hair',
    concerns: ['damaged hair', 'frizzy hair'],
    ingredients: ['maleic acid'],
    sizes: [{ label: '200ml', price: 499 }]
  },
  {
    id: '6',
    name: 'Retinol 0.3% + Q10',
    slug: 'retinol-serum',
    tagline: 'Fine Lines & Aging',
    description: 'A potent anti-aging serum with Retinol and Coenzyme Q10.',
    images: ['https://picsum.photos/seed/p6/800/800'],
    price: 599,
    rating: 4.8,
    reviewCount: 1500,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'skin',
    concerns: ['aging', 'fine lines'],
    ingredients: ['retinol'],
    sizes: [{ label: '30ml', price: 599 }]
  }
];

export const CATEGORIES = [
  { id: 'skin', name: 'Skin Care', image: 'https://picsum.photos/seed/cat-skin/600/800', hint: 'skincare bottle' },
  { id: 'hair', name: 'Hair Care', image: 'https://picsum.photos/seed/cat-hair/600/800', hint: 'hair serum' },
  { id: 'body', name: 'Body Care', image: 'https://picsum.photos/seed/cat-body/600/800', hint: 'body lotion' },
  { id: 'lip', name: 'Lip Care', image: 'https://picsum.photos/seed/cat-lip/600/800', hint: 'lip balm' }
];

export const CONCERNS = [
  { id: 'acne', name: 'Acne Control', image: 'https://picsum.photos/seed/con-acne/600/800', hint: 'acne skin' },
  { id: 'aging', name: 'Fine Lines', image: 'https://picsum.photos/seed/con-aging/600/800', hint: 'aging skin' },
  { id: 'pigmentation', name: 'Uneven Tone', image: 'https://picsum.photos/seed/con-tone/600/800', hint: 'pigmented skin' },
  { id: 'dryness', name: 'Dryness', image: 'https://picsum.photos/seed/con-dry/600/800', hint: 'dry skin' }
];
