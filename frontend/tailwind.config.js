/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        saffron: {
          50:  '#fffbeb',
          100: '#fef3c7',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-pattern': "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2322c55e' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,0.04), 0 4px 16px 0 rgba(0,0,0,0.06)',
        'card-hover': '0 4px 6px -1px rgba(0,0,0,0.06), 0 10px 30px -3px rgba(0,0,0,0.1)',
        'green-glow': '0 0 20px rgba(34,197,94,0.25)',
        'brand-lg': '0 10px 25px -3px rgba(34,197,94,0.3)',
      },
      animation: {
        'shimmer': 'shimmer 1.8s infinite',
        'fade-up': 'fadeUp 0.4s ease-out forwards',
        'scale-in': 'scaleIn 0.2s ease-out forwards',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
        'pulse-ring': 'pulseRing 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'bounce-gentle': 'bounceGentle 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseRing: {
          '0%':   { transform: 'scale(0.85)', boxShadow: '0 0 0 0 rgba(239,68,68,0.6)' },
          '70%':  { transform: 'scale(1)',    boxShadow: '0 0 0 18px rgba(239,68,68,0)' },
          '100%': { transform: 'scale(0.85)', boxShadow: '0 0 0 0 rgba(239,68,68,0)' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
}
