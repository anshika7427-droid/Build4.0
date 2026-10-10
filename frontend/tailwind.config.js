/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
        },
        teal: {
          900: '#134E4A',
          800: '#115E59',
          700: '#0F766E',
          600: '#0D9488',
          500: '#14B8A6',
          100: '#CCFBF1',
          50: '#F0FDFA',
        },
        crimson: {
          800: '#991B1B',
          700: '#B91C1C',
          600: '#DC2626',
          100: '#FEE2E2',
          50: '#FEF2F2',
        },
        emergency: {
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#CBD5E1',
        }
      },
      fontSize: {
        base: ['1rem', { lineHeight: '1.6' }],
        lg: ['1.125rem', { lineHeight: '1.65' }],
        xl: ['1.25rem', { lineHeight: '1.7' }],
        '2xl': ['1.5rem', { lineHeight: '1.75' }],
        '3xl': ['1.875rem', { lineHeight: '1.8' }],
      },
      minHeight: {
        'touch': '48px',
      }
    },
  },
  plugins: [],
}
