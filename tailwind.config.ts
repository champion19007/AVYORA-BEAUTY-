import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        /* Foglihten is the display serif; Jost carries everything else.
           Prices deliberately use the body face — Foglihten has no rupee
           glyph, which is the same trap Cinzel fell into. */
        sans: ['var(--font-jost)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['var(--font-jost)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        headline: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        /* Redesign (Nuvē reference): Inter for everything, Instrument Serif for the wordmark only. */
        nv: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        wordmark: ['var(--font-wordmark)', 'ui-serif', 'Georgia', 'serif'],
      },
      /* Measured type scale: [size, { lineHeight, letterSpacing, fontWeight }]. Identical at 1280, 1440 and 1920. */
      fontSize: {
        'nv-hero': ['clamp(48px, 12vw, 100px)', { lineHeight: '1', letterSpacing: '-6px', fontWeight: '500' }],
        'nv-display': ['clamp(42px, 10vw, 80px)', { lineHeight: '1.1', letterSpacing: '-3.2px', fontWeight: '500' }],
        'nv-figure': ['48px', { lineHeight: '48px', letterSpacing: '-1.92px', fontWeight: '500' }],
        'nv-statement': ['clamp(28px, 6vw, 40px)', { lineHeight: '1.3', letterSpacing: '-1.6px', fontWeight: '500' }],
        'nv-title': ['clamp(26px, 5vw, 32px)', { lineHeight: '1.1', letterSpacing: '-1.28px', fontWeight: '500' }],
        'nv-lead': ['clamp(22px, 5vw, 28px)', { lineHeight: '1.1', letterSpacing: '-1.12px', fontWeight: '500' }],
        'nv-contact': ['24px', { lineHeight: '28.8px', letterSpacing: '-0.96px', fontWeight: '500' }],
        'nv-quote': ['22px', { lineHeight: '28.6px', letterSpacing: '-0.66px', fontWeight: '500' }],
        'nv-intro': ['20px', { lineHeight: '26px', letterSpacing: '-0.6px', fontWeight: '500' }],
        'nv-body': ['18px', { lineHeight: '23.4px', letterSpacing: '-0.3px' }],
        'nv-label': ['16px', { lineHeight: '20.8px', letterSpacing: '-0.64px', fontWeight: '500' }],
        'nv-small': ['14px', { lineHeight: '19.6px', letterSpacing: '-0.56px' }],
        'nv-wordmark': ['28px', { lineHeight: '33.6px', letterSpacing: '-0.8px', fontWeight: '400' }],
        'nv-wordmark-lg': ['48px', { lineHeight: '48px', letterSpacing: '-0.8px', fontWeight: '400' }],
      },
      maxWidth: {
        'nv-container': 'var(--nv-container)',
      },
      spacing: {
        'nv-gutter': 'var(--nv-gutter)',
        'nv-gap': 'var(--nv-gap)',
        'nv-header': 'var(--nv-header-height)',
      },
      transitionTimingFunction: {
        nv: 'var(--nv-ease)',
      },
      transitionDuration: {
        'nv-control': '300ms',
        'nv-overlay': '500ms',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          // Gold that is legible as small text on a light surface. See the
          // token's comment in globals.css for why it is not just --primary.
          text: 'hsl(var(--primary-text))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        leaf: 'hsl(var(--leaf))',
        nv: {
          page: 'var(--nv-page)',
          ink: 'var(--nv-ink)',
          muted: 'var(--nv-muted)',
          faint: 'var(--nv-faint)',
          card: 'var(--nv-card)',
          line: 'var(--nv-line)',
          glass: 'var(--nv-glass)',
          danger: 'var(--nv-danger)',
          accent: 'var(--nv-accent)',
          'accent-soft': 'var(--nv-accent-soft)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        'nv-card': 'var(--nv-radius-card)',
        'nv-inner': 'var(--nv-radius-inner)',
        'nv-pill': 'var(--nv-radius-pill)',
      },
      letterSpacing: {
        luxe: '0.28em',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'ken-burns': {
          from: { transform: 'scale(1)' },
          to: { transform: 'scale(1.08)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'ken-burns': 'ken-burns 12s ease-out both',
        'nv-overlay-in': 'nv-overlay-in var(--nv-duration-overlay) var(--nv-ease) both',
        'nv-overlay-out': 'nv-overlay-out 350ms var(--nv-ease) both',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
