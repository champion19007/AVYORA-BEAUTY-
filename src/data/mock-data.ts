
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
  category: 'skin' | 'hair' | 'body' | 'lip' | 'cleanser' | 'toner' | 'essence' | 'serum' | 'moisturizer' | 'sun' | 'mask' | 'exfoliator';
  concerns: string[];
  ingredients: string[];
  sizes: { label: string; price: number }[];
}

const getImg = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const PRODUCTS: Product[] = [
  // PHASE 1: FOUNDATIONAL CLEANSING & PREP
  {
    id: 'rice-bran-cleansing-oil',
    name: 'Rice Bran Cleansing Oil',
    slug: 'rice-bran-cleansing-oil',
    tagline: 'Melt away sebum and waterproof SPF with zero residue.',
    description: 'An ultra-lightweight, high-slip emulsifying oil that rinses completely clean.',
    images: [getImg('cleansing-oil')],
    price: 649,
    rating: 4.8,
    reviewCount: 420,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'cleanser',
    concerns: ['first-cleanse', 'makeup-removal', 'spf-removal'],
    ingredients: ['Rice Bran Oil', 'Jojoba Oil'],
    sizes: [{ label: '150ml', price: 649 }]
  },
  {
    id: 'centella-cleansing-balm',
    name: 'Centella Cleansing Balm',
    slug: 'centella-cleansing-balm',
    tagline: 'Soothe red, reactive skin while melting away impurities.',
    description: 'A sorbet-textured solid balm that melts into a luxurious oil upon skin contact.',
    images: [getImg('cleansing-balm')],
    price: 799,
    rating: 4.9,
    reviewCount: 310,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'cleanser',
    concerns: ['first-cleanse', 'sensitivity', 'redness'],
    ingredients: ['Centella Asiatica'],
    sizes: [{ label: '100ml', price: 799 }]
  },
  {
    id: 'face-wash',
    name: 'Low-pH Amino Acid Gel Cleanser',
    slug: 'face-wash',
    tagline: 'The gold standard in non-stripping daily cleansing.',
    description: 'A water-based daily cleanser formulated at pH 5.5 using coconut-derived surfactants.',
    images: [getImg('fw-1'), getImg('fw-2')],
    price: 349,
    rating: 4.8,
    reviewCount: 1205,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'cleanser',
    concerns: ['face-wash', 'cleanse', 'barrier-support'],
    ingredients: ['Amino Acids', 'LHA'],
    sizes: [{ label: '150ml', price: 349 }]
  },
  {
    id: 'papaya-enzyme-powder',
    name: 'Papaya Enzyme Powder Wash',
    slug: 'papaya-enzyme-powder',
    tagline: 'Mild, non-abrasive daily enzymatic exfoliation.',
    description: 'A water-activated granular powder that turns into a creamy foam for smoother texture.',
    images: [getImg('powder-wash')],
    price: 549,
    rating: 4.7,
    reviewCount: 560,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'cleanser',
    concerns: ['texture', 'dullness', 'exfoliation'],
    ingredients: ['Papain', 'Rice Starch'],
    sizes: [{ label: '60g', price: 549 }]
  },

  // PHASE 2: EXFOLIATION & SURFACE POLISHING
  {
    id: 'pha-refining-fluid',
    name: 'PHA Refining Fluid',
    slug: 'pha-refining-fluid',
    tagline: 'Gently dissolve dead skin without stinging or redness.',
    description: 'A daily leave-on surface refiner built with large-molecule Gluconolactone.',
    images: [getImg('pha-fluid')],
    price: 499,
    rating: 4.6,
    reviewCount: 230,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'exfoliator',
    concerns: ['exfoliation', 'texture', 'sensitive-skin'],
    ingredients: ['Gluconolactone (PHA)'],
    sizes: [{ label: '30ml', price: 499 }]
  },
  {
    id: 'lha-sebum-control',
    name: 'LHA Sebum-Control Liquid',
    slug: 'lha-sebum-control',
    tagline: 'Target oil glands directly for clear, tight pores.',
    description: 'A lipophilic, ultra-gentle acid fluid designed specifically for acne-prone skin.',
    images: [getImg('lha-liquid')],
    price: 449,
    rating: 4.8,
    reviewCount: 340,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'exfoliator',
    concerns: ['acne', 'oiliness', 'pore-care'],
    ingredients: ['LHA'],
    sizes: [{ label: '30ml', price: 449 }]
  },
  {
    id: 'bifida-exfoliating-pads',
    name: 'Bifida Exfoliating Toner Pads',
    slug: 'bifida-exfoliating-pads',
    tagline: 'Protect the barrier while clearing dead skin cells.',
    description: 'Dual-textured cotton pads soaked in Bifida Ferment for gentle physical/chemical logic.',
    images: [getImg('toner-pads')],
    price: 899,
    rating: 4.9,
    reviewCount: 150,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'exfoliator',
    concerns: ['texture', 'barrier-repair'],
    ingredients: ['Bifida Ferment', 'AHA'],
    sizes: [{ label: '60 Pads', price: 899 }]
  },

  // PHASE 3: HIGH-VOLUME DEEP HYDRATION
  {
    id: 'ha-toner',
    name: 'Multi-Molecular Hyaluronic Toner',
    slug: 'ha-toner',
    tagline: 'Flood your cells with 5 weights of Hyaluronic Acid.',
    description: 'A bouncy, viscous water-gel toner that plumps up fine lines caused by dehydration.',
    images: [getImg('ha-toner')],
    price: 399,
    rating: 4.8,
    reviewCount: 1100,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'toner',
    concerns: ['dryness', 'dehydration', 'plumping'],
    ingredients: ['Hyaluronic Acid (5 Weights)'],
    sizes: [{ label: '200ml', price: 399 }]
  },
  {
    id: 'rice-toner',
    name: 'Milky Ceramides & Rice Toner',
    slug: 'rice-toner',
    tagline: 'Traditional Rice Extract meets skin-identical lipids.',
    description: 'A comforting, opaque fluid that targets dullness and flaky dry patches.',
    images: [getImg('rice-toner')],
    price: 549,
    rating: 4.9,
    reviewCount: 670,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'toner',
    concerns: ['dullness', 'barrier-repair', 'dryness'],
    ingredients: ['Rice Extract', 'Ceramides'],
    sizes: [{ label: '150ml', price: 549 }]
  },
  {
    id: 'heartleaf-liquid',
    name: 'Heartleaf Calming Skin Liquid',
    slug: 'heartleaf-liquid',
    tagline: 'Instantly cool down irritation and clinical heat.',
    description: 'A watery, herbal fluid packed with 77% Houttuynia Cordata extract.',
    images: [getImg('heartleaf-liquid')],
    price: 499,
    rating: 4.7,
    reviewCount: 420,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'toner',
    concerns: ['redness', 'irritation', 'sensitivity'],
    ingredients: ['Heartleaf Extract'],
    sizes: [{ label: '200ml', price: 499 }]
  },

  // PHASE 4: CELLULAR REPAIR & BRIGHTENING ESSENCES
  {
    id: 'galacto-essence',
    name: 'Galactomyces Ferment Essence',
    slug: 'galacto-essence',
    tagline: 'Achieve a translucent, light-reflective glow.',
    description: 'A watery 95% fermented fluid that refines uneven tone and imparts immediate luminosity.',
    images: [getImg('galacto-essence')],
    price: 749,
    rating: 4.9,
    reviewCount: 280,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'essence',
    concerns: ['glass-skin', 'dullness', 'texture'],
    ingredients: ['Galactomyces Ferment'],
    sizes: [{ label: '100ml', price: 749 }]
  },
  {
    id: 'snail-essence',
    name: 'Advanced Snail Mucin Essence',
    slug: 'snail-essence',
    tagline: 'Repair tissue and build a bouncy, resilient texture.',
    description: 'A rich, high-slip elastic fluid excellent for fading post-acne marks.',
    images: [getImg('snail-essence')],
    price: 849,
    rating: 4.9,
    reviewCount: 2100,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'essence',
    concerns: ['scar-healing', 'repair', 'bounciness'],
    ingredients: ['Snail Secretion Filtrate 96%'],
    sizes: [{ label: '100ml', price: 849 }]
  },
  {
    id: 'kombucha-essence',
    name: 'Kombucha Probiotic Essence',
    slug: 'kombucha-essence',
    tagline: 'Feed your microbiome for resilient, healthy skin.',
    description: 'A nutrient-dense, tea-fermented liquid that protects against environmental stressors.',
    images: [getImg('kombucha-essence')],
    price: 699,
    rating: 4.7,
    reviewCount: 340,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'essence',
    concerns: ['barrier-support', 'microbiome', 'resilience'],
    ingredients: ['Kombucha', 'Probiotics'],
    sizes: [{ label: '150ml', price: 699 }]
  },

  // PHASE 5: TARGETED ACTIVE SERUMS & AMPOULES
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
    category: 'serum',
    concerns: ['uneven', 'dullness', 'brightening'],
    ingredients: ['vitamin c'],
    sizes: [{ label: '10ml', price: 249 }, { label: '30ml', price: 499 }]
  },
  {
    id: 'niacinamide-drops',
    name: '10% Niacinamide Glow Drops',
    slug: 'niacinamide-drops',
    tagline: 'Shrink enlarged pores and block dark spot formation.',
    description: 'A water-light serum that regulates excess oil production and boosts clarity.',
    images: [getImg('niacinamide-drops')],
    price: 449,
    rating: 4.8,
    reviewCount: 1560,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'serum',
    concerns: ['pores', 'oil-control', 'dark-spots'],
    ingredients: ['Niacinamide 10%', 'Zinc PCA'],
    sizes: [{ label: '30ml', price: 449 }]
  },
  {
    id: 'retinol',
    name: 'Encapsulated Retinal Ampoule',
    slug: 'retinol',
    tagline: 'Fast-acting Vitamin A with zero irritation.',
    description: 'Uses lipid capsules to deliver deep anti-wrinkle results and boost collagen.',
    images: [getImg('retinal-ampoule'), getImg('hs-1')],
    price: 399,
    rating: 4.9,
    reviewCount: 1100,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'serum',
    concerns: ['aging', 'lines', 'texture', 'deep-wrinkles'],
    ingredients: ['Retinaldehyde', 'Retinol'],
    sizes: [{ label: '30ml', price: 399 }, { label: '90ml', price: 899 }]
  },
  {
    id: 'copper-peptide',
    name: 'Copper Peptide Plumping Fluid',
    slug: 'copper-peptide',
    tagline: 'Signal immediate tissue remodeling and smoothing.',
    description: 'An advanced peptide concentrate that targets expression creases and fine lines.',
    images: [getImg('copper-peptide')],
    price: 1199,
    rating: 5.0,
    reviewCount: 90,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'serum',
    concerns: ['expression-lines', 'plumping', 'firming'],
    ingredients: ['Copper Tripeptide-1'],
    sizes: [{ label: '30ml', price: 1199 }]
  },
  {
    id: 'pdrn-booster',
    name: 'Salmon DNA Cellular Booster',
    slug: 'pdrn-booster',
    tagline: 'Repair sagging skin at a structural level.',
    description: 'A premium cellular-recovery fluid for a remarkably smooth, glassy finish.',
    images: [getImg('pdrn-booster')],
    price: 1499,
    rating: 5.0,
    reviewCount: 45,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'serum',
    concerns: ['sagging', 'cellular-repair', 'premium'],
    ingredients: ['PDRN (Salmon DNA)'],
    sizes: [{ label: '30ml', price: 1499 }]
  },
  {
    id: 'propolis-ampoule',
    name: '70% Propolis Boosting Ampoule',
    slug: 'propolis-ampoule',
    tagline: 'Deep nutrition for an intense, glass-like shine.',
    description: 'A golden, honey-like fluid rich in bee propolis and royal jelly.',
    images: [getImg('propolis-ampoule')],
    price: 649,
    rating: 4.8,
    reviewCount: 520,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'serum',
    concerns: ['glass-skin', 'nutrition', 'glow'],
    ingredients: ['Propolis Extract 70%', 'Honey'],
    sizes: [{ label: '30ml', price: 649 }]
  },

  // PHASE 6: SHEET MASKS & EXPRESS TREATMENTS
  {
    id: 'collagen-mask',
    name: 'Hydrogel Collagen Melting Mask',
    slug: 'collagen-mask',
    tagline: 'Solid collagen that thins out as your skin drinks it in.',
    description: 'A gelatinous sheet mask for a smooth, tight, red-carpet ready finish.',
    images: [getImg('collagen-mask')],
    price: 199,
    rating: 4.9,
    reviewCount: 780,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'mask',
    concerns: ['elasticity', 'instant-glow'],
    ingredients: ['Hydrolyzed Collagen'],
    sizes: [{ label: '1 Mask', price: 199 }]
  },
  {
    id: 'eye-patches',
    name: 'Caffeine & Peptide Eye Patches',
    slug: 'eye-patches',
    tagline: 'Drain puffiness and plump fine lines in 10 minutes.',
    description: 'Cooling hydrogel half-moons designed for the delicate eye area.',
    images: [getImg('eye-patches')],
    price: 749,
    rating: 4.8,
    reviewCount: 430,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'mask',
    concerns: ['puffiness', 'eye-lines', 'dark-circles'],
    ingredients: ['Caffeine', 'Peptides'],
    sizes: [{ label: '60 Patches', price: 749 }]
  },

  // PHASE 7: MOISTURE LOCKING & SUN BARRIERS
  {
    id: 'ceramide-cream',
    name: '5x Essential Ceramide Cream',
    slug: 'ceramide-cream',
    tagline: 'Securely lock in all preceding treatment layers.',
    description: 'A skin-identical lipid cream that mimics the natural moisture barrier.',
    images: [getImg('ceramide-cream')],
    price: 549,
    rating: 4.8,
    reviewCount: 920,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'moisturizer',
    concerns: ['barrier-repair', 'dryness', 'locking'],
    ingredients: ['5 Types Ceramides'],
    sizes: [{ label: '50ml', price: 549 }]
  },
  {
    id: 'sorbet-moisturizer',
    name: 'Water-Gel Sorbet Moisturizer',
    slug: 'sorbet-moisturizer',
    tagline: 'Flood skin with hydration without the weight.',
    description: 'An oil-free, cooling gel-cream that absorbs instantly with a zero-grease finish.',
    images: [getImg('sorbet-moisturizer')],
    price: 499,
    rating: 4.7,
    reviewCount: 650,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'moisturizer',
    concerns: ['oil-control', 'dehydration', 'lightweight'],
    ingredients: ['Glacier Water', 'Betaine'],
    sizes: [{ label: '50ml', price: 499 }]
  },
  {
    id: 'sunscreen',
    name: 'Probiotics Relief Sun Cream',
    slug: 'sunscreen',
    tagline: 'Daily invisible protection that feels like a lightweight lotion.',
    description: 'Leaves behind absolutely zero white cast and a highly radiant, glossy glow.',
    images: [getImg('relief-sun-cream'), getImg('ss-1')],
    price: 329,
    rating: 4.9,
    reviewCount: 3200,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'moisturizer',
    concerns: ['sunscreen', 'protect', 'uv-protection', 'brightening'],
    ingredients: ['Rice Extract', 'Probiotics', 'uv filters'],
    sizes: [{ label: '30ml', price: 329 }, { label: '50ml', price: 649 }]
  },
  {
    id: 'sun-stick',
    name: 'Cica Calming Sun Stick',
    slug: 'sun-stick',
    tagline: 'Portable, hands-free sun protection for on-the-go.',
    description: 'Designed for convenient reapplication throughout the day without moving makeup.',
    images: [getImg('sun-stick')],
    price: 599,
    rating: 4.8,
    reviewCount: 410,
    isBestSeller: false,
    isNewLaunch: true,
    category: 'moisturizer',
    concerns: ['reapplication', 'calming'],
    ingredients: ['Cica', 'Mugwort'],
    sizes: [{ label: '20g', price: 599 }]
  },
  {
    id: 'lip-mask',
    name: 'Ceramide Lip Sleeping Mask',
    slug: 'lip-mask',
    tagline: 'Melt away dead skin flakes overnight.',
    description: 'A dense, conditioning balm that ensures lips match the plump texture of the face.',
    images: [getImg('lip-mask')],
    price: 299,
    rating: 4.9,
    reviewCount: 890,
    isBestSeller: true,
    isNewLaunch: false,
    category: 'moisturizer',
    concerns: ['dry-lips', 'flaking'],
    ingredients: ['Ceramides', 'Shea Butter'],
    sizes: [{ label: '20g', price: 299 }]
  },

  // BODY CARE (STAYS SEPARATE)
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
    concerns: ['body-lotion', 'dryness'],
    ingredients: ['ceramide'],
    sizes: [{ label: '180ml', price: 349 }]
  }
];

export const CATEGORIES = [
  { id: 'cleanser', name: 'Phase 1: Cleansing & Prep', image: getImg('gel-cleanser'), hint: 'cleansing gel' },
  { id: 'exfoliator', name: 'Phase 2: Exfoliation', image: getImg('pha-fluid'), hint: 'exfoliating fluid' },
  { id: 'toner', name: 'Phase 3: Deep Hydration', image: getImg('ha-toner'), hint: 'hydrating toner' },
  { id: 'essence', name: 'Phase 4: Repair Essences', image: getImg('galacto-essence'), hint: 'skin essence' },
  { id: 'serum', name: 'Phase 5: Targeted Serums', image: getImg('niacinamide-drops'), hint: 'clinical serum' },
  { id: 'mask', name: 'Phase 6: Treatments', image: getImg('collagen-mask'), hint: 'sheet mask' },
  { id: 'moisturizer', name: 'Phase 7: Moisture & Sun', image: getImg('ceramide-cream'), hint: 'barrier cream' }
];

export const CONCERNS = [
  { id: 'face-wash', name: 'Daily Cleansing', image: getImg('fw-1'), hint: 'fresh skin' },
  { id: 'glass-skin', name: 'Glass Skin Glow', image: getImg('galacto-essence'), hint: 'radiant skin' },
  { id: 'barrier-repair', name: 'Barrier Support', image: getImg('ceramide-cream'), hint: 'healthy skin' },
  { id: 'aging', name: 'Anti-Aging', image: getImg('retinal-ampoule'), hint: 'youthful skin' },
  { id: 'acne', name: 'Acne Control', image: getImg('lha-liquid'), hint: 'clear skin' },
  { id: 'texture', name: 'Texture Smoothing', image: getImg('pha-fluid'), hint: 'smooth skin' },
  { id: 'dryness', name: 'Deep Hydration', image: getImg('ha-toner'), hint: 'plump skin' },
  { id: 'eye-care', name: 'Under-Eye Help', image: getImg('eye-patches'), hint: 'eye patches' }
];
