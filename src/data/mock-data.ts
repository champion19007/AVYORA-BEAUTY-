import { CATALOGUE_MODE } from '@/lib/catalogue-mode';
import { VERIFIED_PRODUCTS } from './verified-products';

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
  /**
   * Aggregate review score, present only once real reviews exist.
   *
   * These were previously hardcoded (4.8 stars, 1,205 reviews, and so on) for
   * every SKU and rendered into the product page's JSON-LD `aggregateRating`.
   * Publishing invented review data is deceptive advertising and breaches
   * Google's structured-data policy, so the numbers are gone. They will be
   * recomputed from the `reviews` table once customers leave any.
   */
  rating?: number;
  reviewCount?: number;
  isBestSeller: boolean;
  isNewLaunch: boolean;
  category:
    | 'skin'
    | 'hair'
    | 'body'
    | 'lip'
    | 'cleanser'
    | 'toner'
    | 'essence'
    | 'serum'
    | 'moisturizer'
    | 'sun'
    | 'mask'
    | 'exfoliator';
  concerns: string[];
  ingredients: string[];
  sizes: { label: string; price: number }[];
}

const getImg = (id: string) => PlaceHolderImages.find((img) => img.id === id)?.imageUrl || '';

/**
 * SAMPLE CATALOGUE: development and review data, not verified products.
 * Names, prices, images and highlights are placeholders until real products
 * are onboarded through validated records (docs/product-onboarding.md).
 */
const SAMPLE_PRODUCTS: Product[] = [
  // PHASE 1: FOUNDATIONAL CLEANSING & PREP
  {
    id: 'rice-bran-cleansing-oil',
    name: 'Rice Bran Cleansing Oil',
    slug: 'rice-bran-cleansing-oil',
    tagline: 'A cleansing oil for removing sunscreen and makeup.',
    description: 'A lightweight, high-slip emulsifying oil.',
    images: [getImg('cleansing-oil')],
    price: 649,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'cleanser',
    concerns: ['first-cleanse', 'makeup-removal', 'spf-removal'],
    ingredients: ['Rice Bran Oil', 'Jojoba Oil'],
    sizes: [{ label: '150ml', price: 649 }],
  },
  {
    id: 'centella-cleansing-balm',
    name: 'Centella Cleansing Balm',
    slug: 'centella-cleansing-balm',
    tagline: 'A centella cleansing balm that melts into an oil.',
    description: 'A sorbet-textured solid balm that melts into a luxurious oil upon skin contact.',
    images: [getImg('cleansing-balm')],
    price: 799,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'cleanser',
    concerns: ['first-cleanse', 'sensitivity', 'redness'],
    ingredients: ['Centella Asiatica'],
    sizes: [{ label: '100ml', price: 799 }],
  },
  {
    id: 'face-wash',
    name: 'Low-pH Amino Acid Gel Cleanser',
    slug: 'face-wash',
    tagline: 'A low-pH, water-based gel cleanser.',
    description: 'A water-based daily cleanser formulated at pH 5.5 using coconut-derived surfactants.',
    images: [getImg('fw-1'), getImg('fw-2')],
    price: 349,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'cleanser',
    concerns: ['face-wash', 'cleanse', 'barrier-support'],
    ingredients: ['Amino Acids', 'LHA'],
    sizes: [{ label: '150ml', price: 349 }],
  },
  {
    id: 'papaya-enzyme-powder',
    name: 'Papaya Enzyme Powder Wash',
    slug: 'papaya-enzyme-powder',
    tagline: 'An enzyme powder wash that foams with water.',
    description: 'A water-activated granular powder that turns into a creamy foam.',
    images: [getImg('powder-wash')],
    price: 549,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'cleanser',
    concerns: ['texture', 'dullness', 'exfoliation'],
    ingredients: ['Papain', 'Rice Starch'],
    sizes: [{ label: '60g', price: 549 }],
  },

  // PHASE 2: EXFOLIATION & SURFACE POLISHING
  {
    id: 'pha-refining-fluid',
    name: 'PHA Refining Fluid',
    slug: 'pha-refining-fluid',
    tagline: 'A leave-on PHA fluid for surface exfoliation.',
    description: 'A leave-on surface refiner built with large-molecule gluconolactone.',
    images: [getImg('pha-fluid')],
    price: 499,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'exfoliator',
    concerns: ['exfoliation', 'texture', 'sensitive-skin'],
    ingredients: ['Gluconolactone (PHA)'],
    sizes: [{ label: '30ml', price: 499 }],
  },
  {
    id: 'lha-sebum-control',
    name: 'LHA Sebum-Control Liquid',
    slug: 'lha-sebum-control',
    tagline: 'An LHA fluid made for oily, acne-prone skin.',
    description: 'A lipophilic acid fluid designed for acne-prone skin.',
    images: [getImg('lha-liquid')],
    price: 449,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'exfoliator',
    concerns: ['acne', 'oiliness', 'pore-care'],
    ingredients: ['LHA'],
    sizes: [{ label: '30ml', price: 449 }],
  },
  {
    id: 'bifida-exfoliating-pads',
    name: 'Bifida Exfoliating Toner Pads',
    slug: 'bifida-exfoliating-pads',
    tagline: 'Dual-textured exfoliating pads with bifida ferment.',
    description: 'Dual-textured cotton pads soaked in a bifida ferment solution.',
    images: [getImg('toner-pads')],
    price: 899,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'exfoliator',
    concerns: ['texture', 'barrier-repair'],
    ingredients: ['Bifida Ferment', 'AHA'],
    sizes: [{ label: '60 Pads', price: 899 }],
  },

  // PHASE 3: HIGH-VOLUME DEEP HYDRATION
  {
    id: 'ha-toner',
    name: 'Multi-Molecular Hyaluronic Toner',
    slug: 'ha-toner',
    tagline: 'A hydrating toner with five weights of hyaluronic acid.',
    description: 'A bouncy, viscous water-gel toner.',
    images: [getImg('ha-toner')],
    price: 399,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'toner',
    concerns: ['dryness', 'dehydration', 'plumping'],
    ingredients: ['Hyaluronic Acid (5 Weights)'],
    sizes: [{ label: '200ml', price: 399 }],
  },
  {
    id: 'rice-toner',
    name: 'Milky Ceramides & Rice Toner',
    slug: 'rice-toner',
    tagline: 'Traditional Rice Extract meets skin-identical lipids.',
    description: 'A comforting, opaque milky fluid.',
    images: [getImg('rice-toner')],
    price: 549,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'toner',
    concerns: ['dullness', 'barrier-repair', 'dryness'],
    ingredients: ['Rice Extract', 'Ceramides'],
    sizes: [{ label: '150ml', price: 549 }],
  },
  {
    id: 'heartleaf-liquid',
    name: 'Heartleaf Calming Skin Liquid',
    slug: 'heartleaf-liquid',
    tagline: 'A light, watery heartleaf liquid.',
    description: 'A watery, herbal fluid packed with 77% Houttuynia Cordata extract.',
    images: [getImg('heartleaf-liquid')],
    price: 499,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'toner',
    concerns: ['redness', 'irritation', 'sensitivity'],
    ingredients: ['Heartleaf Extract'],
    sizes: [{ label: '200ml', price: 499 }],
  },

  // PHASE 4: CELLULAR REPAIR & BRIGHTENING ESSENCES
  {
    id: 'galacto-essence',
    name: 'Galactomyces Ferment Essence',
    slug: 'galacto-essence',
    tagline: 'A watery galactomyces ferment essence.',
    description: 'A watery, 95% fermented fluid.',
    images: [getImg('galacto-essence')],
    price: 749,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'essence',
    concerns: ['glass-skin', 'dullness', 'texture'],
    ingredients: ['Galactomyces Ferment'],
    sizes: [{ label: '100ml', price: 749 }],
  },
  {
    id: 'snail-essence',
    name: 'Advanced Snail Mucin Essence',
    slug: 'snail-essence',
    tagline: 'A snail mucin essence with a high-slip texture.',
    description: 'A rich, high-slip elastic fluid.',
    images: [getImg('snail-essence')],
    price: 849,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'essence',
    concerns: ['scar-healing', 'repair', 'bounciness'],
    ingredients: ['Snail Secretion Filtrate 96%'],
    sizes: [{ label: '100ml', price: 849 }],
  },
  {
    id: 'kombucha-essence',
    name: 'Kombucha Probiotic Essence',
    slug: 'kombucha-essence',
    tagline: 'A tea-fermented kombucha essence.',
    description: 'A tea-fermented liquid essence.',
    images: [getImg('kombucha-essence')],
    price: 699,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'essence',
    concerns: ['barrier-support', 'microbiome', 'resilience'],
    ingredients: ['Kombucha', 'Probiotics'],
    sizes: [{ label: '150ml', price: 699 }],
  },

  // PHASE 5: TARGETED ACTIVE SERUMS & AMPOULES
  {
    id: 'vitamin-c-serum',
    name: 'Vitamin C Serum',
    slug: 'vitamin-c-serum',
    tagline: 'A vitamin C serum for dull-looking skin.',
    description: 'A serum built around vitamin C, an antioxidant.',
    images: [getImg('vc-1'), getImg('vc-2')],
    price: 249,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'serum',
    concerns: ['uneven', 'dullness', 'brightening'],
    ingredients: ['vitamin c'],
    sizes: [
      { label: '10ml', price: 249 },
      { label: '30ml', price: 499 },
    ],
  },
  {
    id: 'niacinamide-drops',
    name: '10% Niacinamide Glow Drops',
    slug: 'niacinamide-drops',
    tagline: 'A water-light niacinamide serum.',
    description: 'A water-light serum with 10% niacinamide.',
    images: [getImg('niacinamide-drops')],
    price: 449,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'serum',
    concerns: ['pores', 'oil-control', 'dark-spots'],
    ingredients: ['Niacinamide 10%', 'Zinc PCA'],
    sizes: [{ label: '30ml', price: 449 }],
  },
  {
    id: 'retinol',
    name: 'Encapsulated Retinal Ampoule',
    slug: 'retinol',
    tagline: 'An encapsulated retinal (vitamin A) ampoule.',
    description: 'Retinal held in lipid capsules.',
    images: [getImg('retinal-ampoule'), getImg('hs-1')],
    price: 399,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'serum',
    concerns: ['aging', 'lines', 'texture', 'deep-wrinkles'],
    ingredients: ['Retinaldehyde', 'Retinol'],
    sizes: [
      { label: '30ml', price: 399 },
      { label: '90ml', price: 899 },
    ],
  },
  {
    id: 'copper-peptide',
    name: 'Copper Peptide Plumping Fluid',
    slug: 'copper-peptide',
    tagline: 'A copper peptide fluid.',
    description: 'A peptide concentrate with copper peptides.',
    images: [getImg('copper-peptide')],
    price: 1199,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'serum',
    concerns: ['expression-lines', 'plumping', 'firming'],
    ingredients: ['Copper Tripeptide-1'],
    sizes: [{ label: '30ml', price: 1199 }],
  },
  {
    id: 'pdrn-booster',
    name: 'Salmon DNA Cellular Booster',
    slug: 'pdrn-booster',
    tagline: 'A salmon DNA booster fluid.',
    description: 'A booster fluid with a smooth, glassy finish.',
    images: [getImg('pdrn-booster')],
    price: 1499,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'serum',
    concerns: ['sagging', 'cellular-repair', 'premium'],
    ingredients: ['PDRN (Salmon DNA)'],
    sizes: [{ label: '30ml', price: 1499 }],
  },
  {
    id: 'propolis-ampoule',
    name: '70% Propolis Boosting Ampoule',
    slug: 'propolis-ampoule',
    tagline: 'A propolis ampoule with a glossy finish.',
    description: 'A golden, honey-like fluid rich in bee propolis and royal jelly.',
    images: [getImg('propolis-ampoule')],
    price: 649,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'serum',
    concerns: ['glass-skin', 'nutrition', 'glow'],
    ingredients: ['Propolis Extract 70%', 'Honey'],
    sizes: [{ label: '30ml', price: 649 }],
  },

  // PHASE 6: SHEET MASKS & EXPRESS TREATMENTS
  {
    id: 'collagen-mask',
    name: 'Hydrogel Collagen Melting Mask',
    slug: 'collagen-mask',
    tagline: 'A hydrogel collagen mask that thins out on the skin.',
    description: 'A gelatinous hydrogel sheet mask.',
    images: [getImg('collagen-mask')],
    price: 199,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'mask',
    concerns: ['elasticity', 'instant-glow'],
    ingredients: ['Hydrolyzed Collagen'],
    sizes: [{ label: '1 Mask', price: 199 }],
  },
  {
    id: 'eye-patches',
    name: 'Caffeine & Peptide Eye Patches',
    slug: 'eye-patches',
    tagline: 'Cooling hydrogel eye patches with caffeine and peptides.',
    description: 'Cooling hydrogel half-moons designed for the delicate eye area.',
    images: [getImg('eye-patches')],
    price: 749,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'mask',
    concerns: ['puffiness', 'eye-lines', 'dark-circles'],
    ingredients: ['Caffeine', 'Peptides'],
    sizes: [{ label: '60 Patches', price: 749 }],
  },

  // PHASE 7: MOISTURE LOCKING & SUN BARRIERS
  {
    id: 'ceramide-cream',
    name: '5x Essential Ceramide Cream',
    slug: 'ceramide-cream',
    tagline: 'A ceramide moisturising cream.',
    description: 'A cream made with skin-identical lipids.',
    images: [getImg('ceramide-cream')],
    price: 549,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'moisturizer',
    concerns: ['barrier-repair', 'dryness', 'locking'],
    ingredients: ['5 Types Ceramides'],
    sizes: [{ label: '50ml', price: 549 }],
  },
  {
    id: 'sorbet-moisturizer',
    name: 'Water-Gel Sorbet Moisturizer',
    slug: 'sorbet-moisturizer',
    tagline: 'A lightweight, oil-free gel moisturiser.',
    description: 'An oil-free, cooling gel-cream.',
    images: [getImg('sorbet-moisturizer')],
    price: 499,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'moisturizer',
    concerns: ['oil-control', 'dehydration', 'lightweight'],
    ingredients: ['Glacier Water', 'Betaine'],
    sizes: [{ label: '50ml', price: 499 }],
  },
  {
    id: 'sunscreen',
    name: 'Probiotics Relief Sun Cream',
    slug: 'sunscreen',
    tagline: 'A sunscreen with a lightweight lotion texture.',
    description: 'Finishes with a glossy glow.',
    images: [getImg('relief-sun-cream'), getImg('ss-1')],
    price: 329,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'moisturizer',
    concerns: ['sunscreen', 'protect', 'uv-protection', 'brightening'],
    ingredients: ['Rice Extract', 'Probiotics', 'uv filters'],
    sizes: [
      { label: '30ml', price: 329 },
      { label: '50ml', price: 649 },
    ],
  },
  {
    id: 'sun-stick',
    name: 'Cica Calming Sun Stick',
    slug: 'sun-stick',
    tagline: 'A portable stick sunscreen.',
    description: 'A solid stick format that is easy to carry.',
    images: [getImg('sun-stick')],
    price: 599,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'moisturizer',
    concerns: ['reapplication', 'calming'],
    ingredients: ['Cica', 'Mugwort'],
    sizes: [{ label: '20g', price: 599 }],
  },
  {
    id: 'lip-mask',
    name: 'Ceramide Lip Sleeping Mask',
    slug: 'lip-mask',
    tagline: 'An overnight ceramide lip mask.',
    description: 'A dense, conditioning lip balm.',
    images: [getImg('lip-mask')],
    price: 299,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'moisturizer',
    concerns: ['dry-lips', 'flaking'],
    ingredients: ['Ceramides', 'Shea Butter'],
    sizes: [{ label: '20g', price: 299 }],
  },

  // BODY CARE (STAYS SEPARATE)
  {
    id: 'body-lotion',
    name: 'Body Lotion',
    slug: 'body-lotion',
    tagline: 'A moisturising body lotion.',
    description: 'A fast-absorbing body lotion.',
    images: [getImg('bl-1')],
    price: 349,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'body',
    concerns: ['body-lotion', 'dryness'],
    ingredients: ['ceramide'],
    sizes: [{ label: '180ml', price: 349 }],
  },
];

/**
 * The catalogue the site shows. `NEXT_PUBLIC_CATALOGUE_MODE=verified` shows
 * only products whose records passed onboarding (none yet, so the shop is
 * empty and says so); anything else shows the sample catalogue, labelled as
 * samples, with orders refused in production builds (lib/catalogue-mode.ts).
 */
export const PRODUCTS: Product[] = CATALOGUE_MODE === 'verified' ? [...VERIFIED_PRODUCTS] : SAMPLE_PRODUCTS;

export const CATEGORIES = [
  { id: 'cleanser', name: 'Phase 1: Cleansing & Prep', image: getImg('gel-cleanser'), hint: 'cleansing gel' },
  { id: 'exfoliator', name: 'Phase 2: Exfoliation', image: getImg('pha-fluid'), hint: 'exfoliating fluid' },
  { id: 'toner', name: 'Phase 3: Deep Hydration', image: getImg('ha-toner'), hint: 'hydrating toner' },
  { id: 'essence', name: 'Phase 4: Repair Essences', image: getImg('galacto-essence'), hint: 'skin essence' },
  { id: 'serum', name: 'Phase 5: Targeted Serums', image: getImg('niacinamide-drops'), hint: 'clinical serum' },
  { id: 'mask', name: 'Phase 6: Treatments', image: getImg('collagen-mask'), hint: 'sheet mask' },
  { id: 'moisturizer', name: 'Phase 7: Moisture & Sun', image: getImg('ceramide-cream'), hint: 'barrier cream' },
];

export const CONCERNS = [
  { id: 'face-wash', name: 'Daily Cleansing', image: getImg('fw-1'), hint: 'fresh skin' },
  { id: 'glass-skin', name: 'Glass Skin Glow', image: getImg('galacto-essence'), hint: 'radiant skin' },
  { id: 'barrier-repair', name: 'Barrier Support', image: getImg('ceramide-cream'), hint: 'healthy skin' },
  { id: 'aging', name: 'Anti-Aging', image: getImg('retinal-ampoule'), hint: 'youthful skin' },
  { id: 'acne', name: 'Acne Control', image: getImg('lha-liquid'), hint: 'clear skin' },
  { id: 'texture', name: 'Texture Smoothing', image: getImg('pha-fluid'), hint: 'smooth skin' },
  { id: 'dryness', name: 'Deep Hydration', image: getImg('ha-toner'), hint: 'plump skin' },
  { id: 'eye-care', name: 'Under-Eye Help', image: getImg('eye-patches'), hint: 'eye patches' },
];
