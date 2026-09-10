/* Site 100 % francophone (marché Suisse romand). Cette fonction est conservée
   pour ne pas toucher tous ses appelants et rester prête si une langue est
   ajoutée un jour — elle renvoie toujours 'fr' aujourd'hui. */
export function normalizeLocale() {
  return 'fr'
}
