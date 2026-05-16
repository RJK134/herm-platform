import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sidebar: '#1a1a2e',
        teal: {
          DEFAULT: '#01696F',
          light: '#018a91',
          dark: '#015559',
        },
        sis: '#2563eb',
        lms: '#7c3aed',
        crm: '#ea580c',
        hcm: '#0891b2',
        sjms: '#01696F',
        // Phase 16.3 — tier-distinctive palette. Three ramps so chrome
        // (login hero, sidebar pill, UpgradeCard accent) can render in
        // a tier-coherent colour without prop-drilling. The 500 shade
        // of each ramp is AAA-contrast against white text. Pro keeps
        // the existing teal so paid users don't experience a re-skin.
        tier: {
          free: {
            50:  '#f8fafc',
            200: '#e2e8f0',
            500: '#64748b', // slate-500
            700: '#334155',
          },
          pro: {
            50:  '#e6f5f6',
            200: '#9fd8db',
            500: '#01696F', // existing teal — Pro keeps brand continuity
            700: '#015559',
          },
          enterprise: {
            50:  '#eef2ff',
            200: '#a5b4fc',
            500: '#3730a3', // indigo-800 — distinctly premium
            700: '#1e1b4b',
          },
        },
        brand: {
          ink:   '#0b1220', // FHE wordmark on light background
          cream: '#f9fafb', // FHE wordmark on dark background
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['DM Sans', 'sans-serif'],
        // Phase 16.3 — display alias for the wordmark + landing hero.
        // Same DM Sans family as `heading` but used semantically for
        // the brand mark + hero typography.
        display: ['DM Sans', 'Inter', 'sans-serif'],
      },
      fontSize: {
        // Phase 16.3 — display sizes for landing/login hero.
        // Tight letter-spacing matches the FHE wordmark lockup.
        'display-1': ['3.25rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-2': ['2.25rem', { lineHeight: '1.1',  letterSpacing: '-0.015em' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
