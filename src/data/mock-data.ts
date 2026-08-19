import { PlaceHolderImages } from '@/lib/placeholder-images';

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

const getImg = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const PRODUCTS: Product[] = [
  {
    id: 'face-wash',
    name: 'Face Wash',
    slug: 'face-wash',
    tagline: 'Gently cleanses and refreshes without stripping moisture.',
    description: 'A daily pH-balanced cleanser designed for all skin types to remove impurities and excess oil.',
    images: [getImg('fw-1'), getImg('fw-2')],
    price: 299,
    rating: 4.7,
    reviewCount: 1205,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['face-wash'],
    ingredients: ['lha'],
    sizes: [{ label: '100ml', price: 299 }]
  },
  {
    id: 'vitamin-c-serum',
    name: 'Vitamin C Serum',
    slug: 'vitamin-c-serum',
    tagline: 'Brightens skin and reduces the appearance of dark spots.',
    description: 'A potent antioxidant serum to combat dullness and protect against environmental stressors.',
    images: [getImg('vc-1'), getImg('vc-2')],
    price: 249,
    rating: 4.9,
    reviewCount: 2450,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['vitamin-c-serum'],
    ingredients: ['vitamin c'],
    sizes: [{ label: '10ml', price: 249 }, { label: '30ml', price: 499 }]
  },
  {
    id: 'retinol',
    name: 'Retinol',
    slug: 'retinol',
    tagline: 'Accelerates skin renewal for smoother, youthful-looking skin.',
    description: 'A stable, clinical-grade retinol formulation to reduce fine lines and improve texture.',
    images: [getImg('hs-1')],
    price: 399,
    rating: 4.8,
    reviewCount: 1100,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['aging'],
    ingredients: ['retinol'],
    sizes: [{ label: '30ml', price: 399 }, { label: '50ml', price: 599 }]
  },
  {
    id: 'sunscreen',
    name: 'Sunscreen',
    slug: 'sunscreen',
    tagline: 'Daily invisible protection against UVA/UVB rays.',
    description: 'A lightweight, non-greasy SPF formula that leaves zero white cast.',
    images: [getImg('ss-1')],
    price: 329,
    rating: 4.8,
    reviewCount: 3100,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'skin',
    concerns: ['sunscreen'],
    ingredients: ['uv filters'],
    sizes: [{ label: '30ml', price: 329 }, { label: '50ml', price: 449 }]
  },
  {
    id: 'body-lotion',
    name: 'Body Lotion',
    slug: 'body-lotion',
    tagline: 'Intense hydration for smooth, healthy-looking skin.',
    description: 'A fast-absorbing lotion that provides long-lasting moisture and barrier repair.',
    images: [getImg('bl-1')],
    price: 349,
    rating: 4.7,
    reviewCount: 1560,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'body',
    concerns: ['body-lotion'],
    ingredients: ['ceramide'],
    sizes: [{ label: '180ml', price: 349 }]
  }
];

export const CATEGORIES = [
  { id: 'skin', name: 'Skin Care', image: getImg('cat-skin'), hint: 'skincare bottle' },
  { id: 'hair', name: 'Hair Care', image: getImg('cat-hair'), hint: 'hair serum' },
  { id: 'body', name: 'Body Care', image: getImg('cat-body'), hint: 'body lotion' },
  { id: 'lip', name: 'Lip Care', image: getImg('cat-lip'), hint: 'lip balm' }
];

export const CONCERNS = [
  { id: 'face-wash', name: 'Face Wash', image: getImg('fw-1'), hint: 'fresh skin' },
  { id: 'vitamin-c-serum', name: 'Vitamin C Serum', image: getImg('vc-1'), hint: 'glowing skin' },
  { id: 'retinol', name: 'Retinol', image: getImg('hs-1'), hint: 'anti aging' },
  { id: 'sunscreen', name: 'Sunscreen', image: getImg('ss-1'), hint: 'sun protection' },
  { id: 'body-lotion', name: 'Body Lotion', image: getImg('bl-1'), hint: 'hydrated skin' },
  { id: 'acne', name: 'Acne Control', image: 'https://picsum.photos/seed/con-acne/600/800', hint: 'clear skin' },
  { id: 'pigmentation', name: 'Pigmentation', image: 'https://picsum.photos/seed/con-pig/600/800', hint: 'even tone' },
  { id: 'aging', name: 'Fine Lines', image: 'https://picsum.photos/seed/con-age/600/800', hint: 'firm skin' }
];