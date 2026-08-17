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
    id: 'salicylic-acid-cleanser',
    name: 'Salicylic Acid + LHA 2% Cleanser',
    slug: 'salicylic-acid-cleanser',
    tagline: 'Acne, Breakouts & Oiliness',
    description: 'A daily foaming cleanser with Salicylic acid and LHA to gently exfoliate and control excess sebum.',
    images: [
      'https://picsum.photos/seed/skincare1/800/800',
      'https://picsum.photos/seed/skincare2/800/800'
    ],
    price: 299,
    rating: 4.8,
    reviewCount: 1240,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['Acne', 'Oiliness'],
    ingredients: ['Salicylic Acid', 'LHA'],
    sizes: [{ label: '100ml', price: 299 }, { label: '250ml', price: 499 }]
  },
  {
    id: 'vitamin-c-serum',
    name: 'Vitamin C 16% Serum',
    slug: 'vitamin-c-serum',
    tagline: 'Dullness & Dark Spots',
    description: 'A glow-boosting serum stabilized with pure Vitamin C to brighten skin and reduce sun damage.',
    images: [
      'https://picsum.photos/seed/skincare3/800/800',
      'https://picsum.photos/seed/skincare4/800/800'
    ],
    price: 699,
    salePrice: 599,
    rating: 4.9,
    reviewCount: 850,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['Dullness', 'Pigmentation'],
    ingredients: ['Vitamin C', 'Ferulic Acid'],
    sizes: [{ label: '30ml', price: 699 }]
  },
  {
    id: 'niacinamide-serum',
    name: 'Niacinamide 10% Serum',
    slug: 'niacinamide-serum',
    tagline: 'Oil Control & Blemishes',
    description: 'A lightweight serum formulated with high concentration of Niacinamide to reduce blemishes.',
    images: [
      'https://picsum.photos/seed/skincare5/800/800'
    ],
    price: 599,
    rating: 4.7,
    reviewCount: 2100,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'skin',
    concerns: ['Acne', 'Blemishes'],
    ingredients: ['Niacinamide', 'Zinc'],
    sizes: [{ label: '30ml', price: 599 }]
  },
  {
    id: 'hyaluronic-acid-moisturizer',
    name: 'Hyaluronic Acid 2% + B5',
    slug: 'hyaluronic-acid-moisturizer',
    tagline: 'Hydration & Repair',
    description: 'A hydration support formula with ultra-pure, vegan hyaluronic acid for multi-depth hydration.',
    images: [
      'https://picsum.photos/seed/skincare6/800/800'
    ],
    price: 499,
    rating: 4.9,
    reviewCount: 3400,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['Dryness'],
    ingredients: ['Hyaluronic Acid', 'Vitamin B5'],
    sizes: [{ label: '30ml', price: 499 }, { label: '60ml', price: 899 }]
  }
];

export const CATEGORIES = [
  { id: 'skin', name: 'Skin Care', image: 'https://picsum.photos/seed/cat1/600/800', hint: 'skincare bottle' },
  { id: 'hair', name: 'Hair Care', image: 'https://picsum.photos/seed/cat2/600/800', hint: 'hair bottle' },
  { id: 'body', name: 'Body Care', image: 'https://picsum.photos/seed/cat3/600/800', hint: 'body lotion' },
  { id: 'lip', name: 'Lip Care', image: 'https://picsum.photos/seed/cat4/600/800', hint: 'lip balm' }
];

export const CONCERNS = [
  { id: 'acne', name: 'Acne Control', image: 'https://picsum.photos/seed/con1/600/800', hint: 'skin acne' },
  { id: 'aging', name: 'Fine Lines', image: 'https://picsum.photos/seed/con2/600/800', hint: 'skin aging' },
  { id: 'pigmentation', name: 'Uneven Tone', image: 'https://picsum.photos/seed/con3/600/800', hint: 'skin tone' },
  { id: 'dryness', name: 'Dryness', image: 'https://picsum.photos/seed/con4/600/800', hint: 'dry skin' }
];
