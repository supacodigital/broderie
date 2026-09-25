/* Cantons suisses — mêmes codes et libellés que le compte client de la boutique */
export const SWISS_CANTONS = [
  { code: 'AG', name: 'Argovie' }, { code: 'AI', name: 'Appenzell Rh.-Int.' },
  { code: 'AR', name: 'Appenzell Rh.-Ext.' }, { code: 'BE', name: 'Berne' },
  { code: 'BL', name: 'Bâle-Campagne' }, { code: 'BS', name: 'Bâle-Ville' },
  { code: 'FR', name: 'Fribourg' }, { code: 'GE', name: 'Genève' },
  { code: 'GL', name: 'Glaris' }, { code: 'GR', name: 'Grisons' },
  { code: 'JU', name: 'Jura' }, { code: 'LU', name: 'Lucerne' },
  { code: 'NE', name: 'Neuchâtel' }, { code: 'NW', name: 'Nidwald' },
  { code: 'OW', name: 'Obwald' }, { code: 'SG', name: 'Saint-Gall' },
  { code: 'SH', name: 'Schaffhouse' }, { code: 'SO', name: 'Soleure' },
  { code: 'SZ', name: 'Schwytz' }, { code: 'TG', name: 'Thurgovie' },
  { code: 'TI', name: 'Tessin' }, { code: 'UR', name: 'Uri' },
  { code: 'VD', name: 'Vaud' }, { code: 'VS', name: 'Valais' },
  { code: 'ZG', name: 'Zoug' }, { code: 'ZH', name: 'Zurich' },
]

export const CANTON_CODES = SWISS_CANTONS.map(c => c.code)
