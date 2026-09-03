/* ============================================================
 * Correspondance Gamme (marque, colonne NGamme / Nom_Gamme de l'export)
 * → slug de catégorie du projet (catégories seedées dans broderie.sql).
 *
 * Les « gammes » de l'ancien logiciel sont des MARQUES / ÉDITEURS
 * (Lanarte, DMC, Vervaco…), pas des catégories thématiques. La colonne
 * Nom_Collection de l'export est inexploitable (99,5 % = « Divers »).
 * Cette table fait donc le rangement dans l'arborescence du site.
 *
 * ── À faire valider par la cliente ──
 * Chaque marque non listée ici tombe dans DEFAULT_CATEGORY_SLUG
 * (« kits-de-broderie »). La cliente peut reclasser n'importe quel produit
 * ensuite depuis le back-office (champ Catégorie du formulaire produit).
 *
 * Catégories disponibles (slugs, cf. broderie.sql) :
 *   Racines : broderie, fils-a-broder, toiles-et-supports,
 *             accessoires-et-outils, loisirs-et-strass
 *   Sous-cat : kits-de-broderie, canevas-et-coussins, grilles-et-modeles,
 *              kits-enfants, fils-coton, fils-effets-speciaux, autres-fils,
 *              toiles-au-metre-et-coupons, bandes-et-galons,
 *              articles-prets-a-broder, aiguilles-et-rangement,
 *              tambours-et-cadres, confort-et-optique, petite-mercerie,
 *              broderie-diamant, perles-et-tresors
 * ============================================================ */

// Slug de catégorie utilisé quand la marque n'est pas mappée ci-dessous.
const DEFAULT_CATEGORY_SLUG = 'kits-de-broderie';

// Gammes explicitement EXCLUES de l'import (ne sont pas des produits vendables).
// Comparaison sur Nom_Gamme (insensible à la casse / aux espaces).
const EXCLUDED_GAMME_NAMES = [
  'Rabais',
  'Port et emballage',
  'Non classé',
  'Catalogues divers',
  'Livres divers',
  'Divers',
  'Divers Arcalaine',
];

// marque (Nom_Gamme, tel quel dans l'export) → slug catégorie.
// Les marques absentes → DEFAULT_CATEGORY_SLUG.
const GAMME_TO_CATEGORY = {
  // ── Kits de broderie (éditeurs de kits au point compté / canevas) ──
  'Lanarte': 'kits-de-broderie',
  'Vervaco': 'kits-de-broderie',
  'Riolis': 'kits-de-broderie',
  'RTO': 'kits-de-broderie',
  'Permin of Copenhagen': 'kits-de-broderie',
  'Bonheur des Dames': 'kits-de-broderie',
  'Oven': 'kits-de-broderie',
  'Thea Gouverneur': 'kits-de-broderie',
  'Bothy Threads': 'kits-de-broderie',
  'Magic Needle': 'kits-de-broderie',
  'Mirabilia': 'kits-de-broderie',
  'Luca-S': 'kits-de-broderie',
  'Wizardi': 'broderie-diamant',
  'Dimensions': 'kits-de-broderie',
  'Panna': 'kits-de-broderie',
  'Marussia': 'kits-de-broderie',
  'Nimuë': 'kits-de-broderie',
  'Chudo Igla (Merejka)': 'kits-de-broderie',
  'Merejka': 'kits-de-broderie',
  'Alisena': 'kits-de-broderie',
  'MP Studia': 'kits-de-broderie',
  'M.P.Studia': 'kits-de-broderie',
  'Golden Fleece': 'kits-de-broderie',
  'Andriana': 'kits-de-broderie',
  'Eva Rosenstand': 'kits-de-broderie',
  'Abris Art': 'kits-de-broderie',
  'Artibalta': 'kits-de-broderie',
  'Orchidea': 'kits-de-broderie',
  'Lindner': 'kits-de-broderie',
  'LetiStitch': 'kits-de-broderie',
  'Derwentwater': 'kits-de-broderie',
  'Graziano': 'kits-de-broderie',
  'La Chiocciolina': 'kits-de-broderie',
  'M&D Créations': 'kits-de-broderie',
  'B.M.Ricami': 'kits-de-broderie',
  'La Cigogne qui brode': 'kits-de-broderie',
  'Milpoint': 'kits-de-broderie',
  'Ajisai': 'kits-de-broderie',
  'Cousines et Compagnie': 'kits-de-broderie',
  "Collection d'Art (diam.)": 'broderie-diamant',

  // ── Grilles & modèles (schémas seuls, sans matériel) ──
  'Renato Parolin': 'grilles-et-modeles',
  'Isabelle Vautier': 'grilles-et-modeles',
  'Lili Points': 'grilles-et-modeles',
  "Couleur d'Etoile": 'grilles-et-modeles',
  'Madame la Fée': 'grilles-et-modeles',
  'Jardin Privé': 'grilles-et-modeles',
  'Sara Guermani': 'grilles-et-modeles',
  'Tralala': 'grilles-et-modeles',
  'Perrette Samouiloff': 'grilles-et-modeles',
  'Véronique Enginger': 'grilles-et-modeles',
  'Marie-Anne Réthoret-Mélin': 'grilles-et-modeles',
  'The Prairie Schooler': 'grilles-et-modeles',
  'Points Com': 'grilles-et-modeles',
  'Soizic': 'grilles-et-modeles',
  'Schwörer': 'grilles-et-modeles',

  // ── Livres & éditions (schémas / catalogues → grilles & modèles) ──
  'Editions de Saxe': 'grilles-et-modeles',
  'Mango': 'grilles-et-modeles',

  // ── Fils coton (mouliné, échevettes) ──
  'DMC Art.117': 'fils-coton',
  'DMC (hors Art. 117)': 'fils-coton',
  'Anchor': 'fils-coton',
  'Cosmo': 'fils-coton',
  'Weeks Dye Works': 'fils-coton',
  'Classic Colorworks': 'fils-coton',

  // ── Fils effets spéciaux (métallisés, soie, dégradés) ──
  'Caron': 'fils-effets-speciaux',
  'Madeira': 'fils-effets-speciaux',
  'Kreinik': 'fils-effets-speciaux',
  'Rico Design': 'fils-effets-speciaux',
  'DMC Coloris': 'fils-effets-speciaux',
  'DMC Etoile': 'fils-effets-speciaux',

  // ── Autres fils (laine, perlé…) ──
  'Anchor Tapisserie': 'autres-fils',
  'DMC Laine': 'autres-fils',

  // ── Toiles au mètre & coupons ──
  'Zweigart': 'toiles-au-metre-et-coupons',
  'DMC Toile': 'toiles-au-metre-et-coupons',
  'Wichelt': 'toiles-au-metre-et-coupons',
  'Permin Toile': 'toiles-au-metre-et-coupons',

  // ── Bandes & galons ──
  'La Stéphanoise': 'bandes-et-galons',
  'Rico Bande': 'bandes-et-galons',
  'Rico': 'bandes-et-galons',

  // ── Articles textiles prêts à broder (bavoirs, linges…) ──
  'Stafil': 'articles-prets-a-broder',

  // ── Articles prêts à broder ──
  'Sudberry': 'articles-prets-a-broder',
  'Vervaco Prêt à broder': 'articles-prets-a-broder',

  // ── Aiguilles & rangement ──
  'Bohin': 'aiguilles-et-rangement',
  'Prym': 'aiguilles-et-rangement',
  'DMC Accessoires': 'aiguilles-et-rangement',
  'Pako': 'aiguilles-et-rangement',

  // ── Tambours & cadres ──
  'Nurge': 'tambours-et-cadres',
  'Elbesee': 'tambours-et-cadres',
  'Siesta Frames': 'tambours-et-cadres',

  // ── Confort & optique (loupes, lampes) ──
  'Daylight': 'confort-et-optique',
  'Lampe & Loupe': 'confort-et-optique',

  // ── Petite mercerie (boutons, breloques) ──
  'Au Ptit Bonheur': 'petite-mercerie',
  'La Mercerie': 'petite-mercerie',
  'Dill Buttons': 'petite-mercerie',

  // ── Perles & trésors ──
  'Mill Hill': 'perles-et-tresors',
  'Miyuki': 'perles-et-tresors',
  'Toho': 'perles-et-tresors',

  // ── Loisirs & strass / broderie diamant ──
  'Diamond Dotz': 'broderie-diamant',
  'Crystal Art': 'broderie-diamant',
};

/**
 * Renvoie le slug de catégorie pour une marque (Nom_Gamme).
 * `null` si la marque doit être exclue de l'import.
 */
const resolveCategorySlug = (gammeName) => {
  if (!gammeName) return DEFAULT_CATEGORY_SLUG;
  const normalized = String(gammeName).trim();

  const isExcluded = EXCLUDED_GAMME_NAMES.some(
    (n) => n.toLowerCase() === normalized.toLowerCase()
  );
  if (isExcluded) return null;

  return GAMME_TO_CATEGORY[normalized] || DEFAULT_CATEGORY_SLUG;
};

module.exports = {
  DEFAULT_CATEGORY_SLUG,
  EXCLUDED_GAMME_NAMES,
  GAMME_TO_CATEGORY,
  resolveCategorySlug,
};
