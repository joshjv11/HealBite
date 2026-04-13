import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Guarantee only one copy of React is ever bundled — prevents the
    // "Invalid hook call" crash from react-hot-toast and framer-motion
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-hot-toast', 'framer-motion'],
  },
})
