import { getImageProps } from 'next/image';
import Link from 'next/link';
import { Eyebrow } from '@/components/nv/primitives';

/**
 * The redesign hero (Nuvē reference, measured 8 Oct 2026 at 1280, 1440 and
 * 1920). Geometry is identical at every width, relative to the viewport:
 *
 * - Full-bleed, 100vh, square edges; the photograph is `cover`, centred.
 * - Supporting copy: 20/26 Inter 500, right-aligned in a 310 px box whose
 *   top is 120 px down and whose right edge sits on the 40 px gutter.
 * - CTA: 49 px white pill, 24 px below the copy, right edge on the gutter.
 * - Eyebrow: 18/23.4 uppercase in a 210 px box, its top at 50% − 20 px.
 * - Headline: 100/100 −6 px, at most 900 px wide, two lines, its bottom
 *   40 px above the fold.
 *
 * A server component: no JavaScript ships for the hero. The photograph is
 * the page's largest paint, so it loads with priority and a 100vw size
 * hint. If it fails, the ink surface behind it keeps the white text legible.
 */

/**
 * No approved Avyora campaign photograph exists yet (prompt 19 asset
 * inventory), and the storefront's stock still lifes show other brands'
 * labels, so none of them can stand in here. Until an approved image is
 * supplied the hero shows a neutral surface.
 *
 * To add the photograph, set HERO_IMAGE. Slot specification: at least
 * 2400×1350, landscape, subject centred (the crop is `cover` from the
 * centre at 1280×800, 1440×900 and 1920×1080), with the top-right (copy and
 * CTA) and lower-left (headline) areas calm enough for white text.
 */
// Placeholder stock (Unsplash License, AJOY DAS) until approved campaign photography exists.
// `src` is the landscape crop for desktop; `mobileSrc` a portrait crop of the same photo, centred on the face.
const HERO_IMAGE: { src: string; mobileSrc: string; alt: string } | null = {
  src: 'https://images.unsplash.com/photo-1770748034186-6d6e5738cddf?auto=format&fit=crop&crop=faces%2Cedges&w=2400&h=1350&q=80',
  mobileSrc: 'https://images.unsplash.com/photo-1770748034186-6d6e5738cddf?auto=format&fit=crop&crop=faces%2Cedges&w=1080&h=1920&q=80',
  alt: 'A young woman smiling softly in warm evening light',
};

/** Art direction: one <picture>, so the browser downloads only the crop for its width. */
function HeroPicture({ image }: { image: NonNullable<typeof HERO_IMAGE> }) {
  const common = { alt: image.alt, fill: true, sizes: '100vw', quality: 80, priority: true } as const;
  const { props: { srcSet: desktop } } = getImageProps({ ...common, src: image.src });
  const { props: { srcSet: mobile, ...rest } } = getImageProps({ ...common, src: image.mobileSrc });
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={desktop} />
      <source srcSet={mobile} />
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img {...rest} fetchPriority="high" className="nv-hero-image object-cover object-center" />
    </picture>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative h-screen min-h-[640px] w-full overflow-hidden bg-nv-ink font-nv text-white">
      {HERO_IMAGE ? (
        <>
          <HeroPicture image={HERO_IMAGE} />
          {/*
            Not in the reference, whose photograph was shot for white type: a
            light scrim behind the copy areas keeps white text at 4.5:1 on any
            replacement image.
          */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,0,0,0.38),transparent_55%),linear-gradient(to_top,rgba(0,0,0,0.5),transparent_45%)]"
          />
        </>
      ) : (
        // Placeholder surface: warm neutral tones from the page palette, no imagery.
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,#4a4642,#1a1a1a_70%)]" />
      )}

      <div className="nv-hero-in absolute right-nv-gutter top-[100px] flex w-[min(310px,calc(100%-2*var(--nv-gutter)))] lg:top-[120px] flex-col items-end gap-6 text-right">
        <p className="text-nv-intro">Answer a few questions and get a weekly routine that fits your skin and your budget.</p>
        <Link
          href="/routine-finder"
          className="nv-focus-light inline-flex h-[49px] items-center rounded-nv-pill bg-white px-6 text-nv-label text-nv-ink transition-colors duration-nv-control ease-nv hover:bg-white/90"
        >
          Find your routine
        </Link>
      </div>

      <Eyebrow className="nv-hero-in absolute left-nv-gutter hidden lg:block top-[calc(50%-20px)] w-[210px]">Cleanse, treat, moisturise and protect</Eyebrow>

      <h1 id="hero-heading" className="nv-hero-in absolute bottom-24 left-nv-gutter lg:bottom-[40px] max-w-[900px] text-balance text-nv-hero font-medium">
        Skincare built around a simple routine
      </h1>
    </section>
  );
}
