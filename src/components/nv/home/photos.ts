/**
 * Homepage photography: one matched set of AI-generated campaign stills
 * (golden-hour light, open blue sky, white linen) until photographed campaign
 * images exist. Files live in `public/images/home/`; a test checks each one is
 * there.
 *
 * Filenames are versioned (`campaign-*`): the image optimiser and the CDN
 * cache by URL for 30 days, so replacing a picture means a new filename, not
 * overwriting the old one.
 *
 * The wide shots keep the subject in the right third and leave the left side
 * as open sky, which is where the section text sits.
 */

export type PhotoSlot = {
  src: string;
  alt: string;
  /** Darkens the photo where white text sits on it, keeping it at 4.5:1. */
  scrim?: string;
  /** Focal point, so narrow (mobile) crops keep the subject in frame. */
  pos?: string;
};

const TEXT_ON_LEFT = 'bg-[linear-gradient(to_right,rgba(0,0,0,0.6),rgba(0,0,0,0.2)_55%,transparent)]';

/** A portrait file on a landscape screen: `center_30%` keeps the face, not the forehead, in frame. */
export const HERO_IMAGE: PhotoSlot = {
  src: '/images/home/campaign-about.jpg',
  pos: 'object-[center_30%]',
  alt: 'A woman with long blonde hair and glowing skin in golden sunlight against a blue sky',
};

export const PHOTO_SLOTS = {
  about: { src: '/images/home/campaign-about.jpg', pos: 'object-top', alt: 'A woman with long blonde hair and glowing skin in golden sunlight' },
  aboutCard: { src: '/images/home/campaign-about-card.jpg', pos: 'object-top', alt: '', scrim: 'bg-[linear-gradient(to_top,rgba(0,0,0,0.6),transparent_60%)]' },
  vision: { src: '/images/home/campaign-vision.jpg', pos: 'object-right', alt: '', scrim: TEXT_ON_LEFT },
  services: { src: '/images/home/campaign-services.jpg', pos: 'object-right', alt: '', scrim: TEXT_ON_LEFT },
  testimonial: { src: '/images/home/campaign-testimonial.jpg', pos: 'object-top', alt: 'A smiling woman with curly hair touching her cheek in the sun' },
  imageBreak: { src: '/images/home/campaign-image-break.jpg', pos: 'object-[center_25%]', alt: 'A woman with a blonde bob in a white shirt under a blue sky' },
  consultation: { src: '/images/home/campaign-consultation.jpg', pos: 'object-right', alt: '', scrim: TEXT_ON_LEFT },
} satisfies Record<string, PhotoSlot>;
