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
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
