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
  category: 'skin' | 'hair' | 'body' | 'lip';
  concerns: string[];
  ingredients: string[];
  sizes: { label: string; price: number }[];
}

export const PRODUCTS: Product[] = [
  {
    id: 'face-wash',
    name: 'Clinical Face Wash',
    slug: 'face-wash',
    tagline: 'Gently cleanses and refreshes without stripping moisture.',
    description: 'A daily pH-balanced cleanser designed for all skin types to remove impurities and excess oil.',
    images: ['https://picsum.photos/seed/fw1/800/800', 'https://picsum.photos/seed/fw2/800/800'],
    price: 299,
    rating: 4.7,
    reviewCount: 1205,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['cleanse'],
    ingredients: ['lha'],
    sizes: [{ label: '100ml', price: 299 }]
  },
  {
    id: 'vitamin-c-serum',
    name: 'Vitamin C 16% Serum',
    slug: 'vitamin-c-serum',
    tagline: 'Brightens skin and reduces the appearance of dark spots.',
    description: 'A potent antioxidant serum to combat dullness and protect against environmental stressors.',
    images: ['https://picsum.photos/seed/vc1/800/800', 'https://picsum.photos/seed/vc2/800/800'],
    price: 249,
    rating: 4.9,
    reviewCount: 2450,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['brightening', 'dullness'],
    ingredients: ['vitamin c'],
    sizes: [{ label: '10ml', price: 249 }, { label: '30ml', price: 499 }]
  },
  {
    id: 'hair-serum',
    name: 'Bond Repair Hair Serum',
    slug: 'hair-serum',
    tagline: 'Strengthens strands and restores shine to damaged hair.',
    description: 'A deep-conditioning serum that targets broken bonds and smoothes frizz.',
    images: ['https://picsum.photos/seed/hs1/800/800'],
    price: 399,
    rating: 4.6,
    reviewCount: 890,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'hair',
    concerns: ['damaged-hair'],
    ingredients: ['peptide'],
    sizes: [{ label: '30ml', price: 399 }, { label: '90ml', price: 899 }]
  },
  {
    id: 'sunscreen',
    name: 'Broad Spectrum Sunscreen',
    slug: 'sunscreen',
    tagline: 'Daily invisible protection against UVA/UVB rays.',
    description: 'A lightweight, non-greasy SPF formula that leaves zero white cast.',
    images: ['https://picsum.photos/seed/ss1/800/800'],
    price: 329,
    rating: 4.8,
    reviewCount: 3100,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['sun-protection'],
    ingredients: ['uv filters'],
    sizes: [{ label: '30ml', price: 329 }, { label: '50ml', price: 449 }]
  },
  {
    id: 'body-lotion',
    name: 'Nourishing Body Lotion',
    slug: 'body-lotion',
    tagline: 'Intense hydration for smooth, healthy-looking skin.',
    description: 'A fast-absorbing lotion that provides long-lasting moisture and barrier repair.',
    images: ['https://picsum.photos/seed/bl1/800/800'],
    price: 349,
    rating: 4.7,
    reviewCount: 1560,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'body',
    concerns: ['dryness'],
    ingredients: ['ceramide'],
    sizes: [{ label: '180ml', price: 349 }]
  }
];

export const CATEGORIES = [
  { id: 'skin', name: 'Skin Care', image: 'https://picsum.photos/seed/cat-skin/600/800', hint: 'skincare bottle' },
  { id: 'hair', name: 'Hair Care', image: 'https://picsum.photos/seed/cat-hair/600/800', hint: 'hair serum' },
  { id: 'body', name: 'Body Care', image: 'https://picsum.photos/seed/cat-body/600/800', hint: 'body lotion' },
  { id: 'lip', name: 'Lip Care', image: 'https://picsum.photos/seed/cat-lip/600/800', hint: 'lip balm' }
];

export const CONCERNS = [
  { id: 'cleanse', name: 'Face Wash', image: 'https://picsum.photos/seed/con-clean/600/800', hint: 'fresh skin' },
  { id: 'brightening', name: 'Vitamin C Serum', image: 'https://picsum.photos/seed/con-bright/600/800', hint: 'glowing skin' },
  { id: 'damaged-hair', name: 'Hair Serum', image: 'https://picsum.photos/seed/con-hair/600/800', hint: 'healthy hair' },
  { id: 'sun-protection', name: 'Sunscreen', image: 'https://picsum.photos/seed/con-sun/600/800', hint: 'sunscreen application' },
  { id: 'dryness', name: 'Body Lotion', image: 'https://picsum.photos/seed/con-dry/600/800', hint: 'hydrated skin' },
  { id: 'acne', name: 'Acne Control', image: 'https://picsum.photos/seed/con-acne/600/800', hint: 'clear skin' },
  { id: 'pigmentation', name: 'Pigmentation', image: 'https://picsum.photos/seed/con-pig/600/800', hint: 'even tone' },
  { id: 'aging', name: 'Fine Lines', image: 'https://picsum.photos/seed/con-age/600/800', hint: 'firm skin' }
];
