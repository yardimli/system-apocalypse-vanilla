import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Added vite.config.js to enable Tailwind CSS v4 integration with Vite [1]
export default defineConfig({
  plugins: [
    tailwindcss()
  ]
});
