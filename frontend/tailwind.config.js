/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        headline: ['Newsreader', 'serif'],
        body:     ['Lexend', 'sans-serif'],
        label:    ['Lexend', 'sans-serif'],
        sans:     ['Lexend', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* ── Noir surface scale ── */
        'surface':                   '#121412',
        'surface-dim':               '#121412',
        'surface-bright':            '#383a37',
        'surface-container-lowest':  '#0d0f0d',
        'surface-container-low':     '#1a1c1a',
        'surface-container':         '#1e201e',
        'surface-container-high':    '#282a28',
        'surface-container-highest': '#333533',
        'on-surface':                '#e2e3df',
        'on-surface-variant':        '#bfc9c3',
        'surface-variant':           '#333533',
        'surface-tint':              '#95d3ba',
        'background':                '#121412',
        'on-background':             '#e2e3df',
        /* ── Primary (mint green) ── */
        'primary':              '#95d3ba',
        'primary-fixed':        '#b0f0d6',
        'primary-fixed-dim':    '#95d3ba',
        'primary-container':    '#064e3b',
        'on-primary':           '#003829',
        'on-primary-container': '#80bea6',
        'on-primary-fixed':     '#002117',
        'inverse-primary':      '#2b6954',
        /* ── Secondary (neutral) ── */
        'secondary':                  '#c8c6c5',
        'secondary-container':        '#4a4949',
        'secondary-fixed':            '#e5e2e1',
        'secondary-fixed-dim':        '#c8c6c5',
        'on-secondary':               '#313030',
        'on-secondary-container':     '#bab8b7',
        'on-secondary-fixed':         '#1c1b1b',
        'on-secondary-fixed-variant': '#474646',
        /* ── Tertiary (gold) ── */
        'tertiary':              '#e9c176',
        'tertiary-fixed':        '#ffdea5',
        'tertiary-fixed-dim':    '#e9c176',
        'tertiary-container':    '#5a4000',
        'on-tertiary':           '#412d00',
        'on-tertiary-container': '#d3ac64',
        'on-tertiary-fixed':     '#261900',
        /* ── Outlines & surface inverse ── */
        'outline':          '#89938d',
        'outline-variant':  '#404944',
        'inverse-surface':  '#e2e3df',
        'inverse-on-surface': '#2f312f',
        /* ── Error ── */
        'error':             '#ffb4ab',
        'error-container':   '#93000a',
        'on-error':          '#690005',
        'on-error-container':'#ffdad6',
      },
      animation: {
        'shimmer':       'shimmer 1.8s infinite',
        'fade-up':       'fadeUp 0.4s ease-out forwards',
        'bounce-gentle': 'bounceGentle 2s ease-in-out infinite',
        'pulse-ring':    'pulseRing 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow':     'spin 3s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        pulseRing: {
          '0%':   { transform: 'scale(0.85)', boxShadow: '0 0 0 0 rgba(233,193,118,0.6)' },
          '70%':  { transform: 'scale(1)',    boxShadow: '0 0 0 18px rgba(233,193,118,0)' },
          '100%': { transform: 'scale(0.85)', boxShadow: '0 0 0 0 rgba(233,193,118,0)' },
        },
      },
    },
  },
  plugins: [],
}
