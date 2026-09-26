import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* Aperçu de la mise en forme des textes (Contenu du site) : polices et textes
   d'origine de la boutique, lus à la source plutôt que copiés — une police ou
   un texte modifié côté boutique est aussitôt à jour ici. */
const shopFonts = fileURLToPath(new URL('../frontend/src/fonts.css', import.meta.url))
const shopFontFiles = fileURLToPath(new URL('../frontend/src/assets/fonts', import.meta.url))
const shopTexts = fileURLToPath(new URL('../frontend/src/i18n/fr/common.json', import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: '/admin',
  resolve: {
    alias: { '@shop-fonts': shopFonts, '@shop-texts': shopTexts },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
  server: {
    port: 5174,
    // Le serveur de dev ne sert par défaut que le dossier admin/
    fs: { allow: ['.', shopFonts, shopFontFiles, shopTexts] },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
