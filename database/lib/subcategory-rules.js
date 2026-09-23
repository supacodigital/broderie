/* ============================================================
 * Règles de rangement des articles dans les sous-rayons.
 *
 * L'import du catalogue a rangé presque tous les articles dans leur rayon de
 * tête (« Kits de Broderie », « Fils Coton »…) : les sous-rayons créés ensuite
 * restaient vides ou presque, et une cliente qui cliquait sur « Mouliné
 * (Art. 117) » ne voyait qu'un article sur 505.
 *
 * Chaque article encore rangé en tête reçoit ici un sous-rayon, déduit de :
 *   1. sa gamme (champ `brand`, issu de Nom_Gamme) ;
 *   2. des mots-clés de son nom ;
 *   3. pour les kits, des indices de l'export de la cliente (V_ArticleC_INT) :
 *      toile renseignée (IdTrame ≠ 0) ou case « point de croix » cochée.
 *
 * Aucune règle ne devine : sans indice, l'article reste dans son rayon de tête.
 * La première règle qui s'applique l'emporte — l'ordre compte.
 *
 * Module pur (aucun accès base) — testé dans backend/__tests__/unit.
 * ============================================================ */

// Minuscules sans accents : « Étamine » et « etamine » se valent
const normalize = (text) => String(text ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

const has = (pattern) => (p) => pattern.test(p.name);

/* Gammes de kits de point de croix compté. Vervaco, Orchidea et Abris Art en
   sont exclues : elles mêlent imprimé, canevas, perles et diamants — seul un
   indice explicite (toile, case cochée, mot-clé) les range en « compté ». */
const COUNTED_KIT_BRANDS = new Set([
  'Permin of Copenhagen', 'RTO', 'Riolis', 'Thea Gouverneur', 'Oven', 'Luca-S',
  'Magic Needle', 'Eva Rosenstand', 'Merejka', 'Lanarte', 'Nimuë', 'LetiStitch',
  'Pako', 'Lindner', 'Mirabilia', 'Derwentwater', 'Andriana', 'Bothy Threads',
  'Bonheur des Dames', 'DMC (hors Art. 117)',
]);

// Éditeurs de grilles et fiches (rayon « Grilles & Modèles »)
const CHART_BRANDS = new Set([
  'Renato Parolin', 'Madame la Fée', 'Points Com', 'Soizic', 'Lili Points',
  'Schwörer', 'Mango', "Couleur d'Etoile", 'Isabelle Vautier', 'Ajisai',
  'La Cigogne qui brode',
]);

const isKit        = has(/\bkits?\b/);
const isChart      = has(/\b(grille|fiche|diagramme|chart)s?\b/);
const isPublication = has(/\b(catalogue|livre|magazine|revue|album)s?\b/);
const isPrinted    = has(/imprim/);
const isCanvas     = has(/canevas|demi.?point|point noue|tapisserie|gobelin/);
const isDiamond    = has(/diamant|diamond/);
// « perlé » seul désigne le coton perlé (un fil) : seules les perles comptent.
// Testé sur le nom AVEC accents — sans eux, « perlé » deviendrait « perle ».
const isBeaded     = (p) => /\bperles?\b|perlées?|\bbeads?\b/.test(p.rawName);
const isFreeStitch = has(/points? lances?|hardanger|crewel|broderie traditionnelle|blackwork|punch.?needle|broderie (au )?ruban|point de tige/);
const isForKids    = has(/kits? enfants?|pour enfants?|\bkids\b|\bjunior\b|premier(s)? (point|canevas)/);
const isCounted    = has(/compte|point de croix|points de croix|x-stitch|cross.?stitch/);
const isHoopOrFrame = has(/metier|tambour|support pour tambour/);
const isFinishing  = has(/\bcadres?\b|suspense/);
const isNeedleMinder = has(/magnet pour fixer|porte.?aiguille|organis|rangement|boite|cartes aimantees|anneau|classeur|fourre/);
const isNeedle     = has(/aiguille/);
const isScissors   = has(/ciseau/);
const isKitchen    = has(/linge de cuisine|nappe|chemin de table|set de table|tablier|torchon|essuie.?verre/);
const isBath       = has(/eponge|sortie de bain|gant de toilette|essuie.?main|serviette/);
const isBaby       = has(/bavoir|bebe|doudou|lange|naissance/);

/* Indices de l'export cliente — un kit sur toile (Aïda, lin, étamine) ou dont
   la case « point de croix » est cochée est du point de croix compté */
const hasCountedEvidence = (p) =>
  (p.article?.IdTrame ?? 0) !== 0 || p.article?.pu_pointdecroix === true;

/* Règles par rayon de tête actuel. `target` est le slug du sous-rayon visé ;
   il peut appartenir à un autre rayon (article mal rangé à l'import), auquel
   cas le script l'AJOUTE comme rayon secondaire sans rien retirer. */
const RULES = {
  'kits-de-broderie': [
    { target: 'fiches-point-compte',                  rule: 'grille vendue seule',       test: (p) => isChart(p) && !isKit(p) },
    { target: 'tambours-et-metiers-a-broder',         rule: 'métier ou tambour',          test: (p) => isHoopOrFrame(p) && !isKit(p) },
    { target: 'cuisine-et-maison',                    rule: 'linge prêt à broder',        test: (p) => isKitchen(p) && !isKit(p) },
    { target: 'kits-diamants-adultes',                rule: 'kit diamant',                test: isDiamond },
    { target: 'kits-de-broderie-perlee',              rule: 'kit perles',                 test: isBeaded },
    { target: 'broderie-traditionnelle-points-lances', rule: 'broderie traditionnelle',   test: isFreeStitch },
    { target: 'premiers-canevas',                     rule: 'canevas enfant',             test: (p) => isForKids(p) && isCanvas(p) },
    { target: 'points-de-croix-et-broderie-imprimee-enfants', rule: 'kit enfant',         test: isForKids },
    { target: 'coussins-et-tapis',                    rule: 'coussin/tapis au canevas',   test: (p) => isCanvas(p) && /coussin|tapis/.test(p.name) },
    // Imprimé et canevas ne sont pas du compté : ils restent en tête de rayon
    { target: null,                                   rule: 'imprimé ou canevas',         test: (p) => isPrinted(p) || isCanvas(p) },
    { target: 'point-de-croix-compte',                rule: 'indice export (toile / case)', test: (p) => isKit(p) && hasCountedEvidence(p) },
    { target: 'point-de-croix-compte',                rule: 'mot-clé compté',             test: (p) => isKit(p) && isCounted(p) },
    { target: 'point-de-croix-compte',                rule: 'gamme de kits comptés',      test: (p) => isKit(p) && COUNTED_KIT_BRANDS.has(p.brand) },
  ],

  'grilles-et-modeles': [
    { target: 'livres-et-magazines', rule: 'livre ou catalogue',  test: isPublication },
    { target: 'fiches-point-compte', rule: 'grille ou fiche',     test: isChart },
    { target: 'fiches-point-compte', rule: 'éditeur de grilles',  test: (p) => CHART_BRANDS.has(p.brand) && !/linge|nappe|serviette/.test(p.name) },
  ],

  'fils-coton': [
    { target: 'mouline-art-117',                    rule: 'gamme DMC Art.117', test: (p) => p.brand === 'DMC Art.117' },
    { target: 'mouline-art-117',                    rule: 'mouliné DMC',       test: has(/^dmc,? mouline/) },
    { target: 'coton-retors-et-colbert-tapisserie', rule: 'retors ou Colbert', test: has(/retors|colbert/) },
  ],

  'broderie-diamant': [
    { target: 'magnets-et-autocollants-enfants', rule: 'magnet ou autocollant', test: has(/\bmagnets?\b|autocollant|sticker/) },
    { target: 'kits-diamants-adultes',           rule: 'kit diamant',           test: (p) => isKit(p) && (isDiamond(p) || p.brand === 'Wizardi' || p.brand === 'Diamond Dotz') },
  ],

  'toiles-au-metre-et-coupons': [
    { target: 'livres-et-magazines',                  rule: 'catalogue',        test: isPublication },
    { target: 'bandes-en-lin-a-broder',               rule: 'bande en lin',     test: has(/bande.*\blin\b/) },
    { target: 'bandes-aida-a-broder',                 rule: 'bande Aïda',       test: has(/bande.*aida/) },
    { target: 'toiles-aida',                          rule: 'Aïda',             test: has(/aida/) },
    { target: 'toiles-de-lin',                        rule: 'lin',              test: has(/\blin\b|belfast|cashel|edinburgh|newcastle|dublin|linen/) },
    { target: 'eglantine-etamine-et-trames-diverses', rule: 'étamine ou trame', test: has(/etamine|murano|lugana|floba|linda|brittney|jobelan|evenweave|canevas|trame|dentelle/) },
  ],

  'aiguilles-et-rangement': [
    { target: 'point-de-croix-compte',        rule: 'kit rangé en aiguilles', test: (p) => isKit(p) && !isCanvas(p) && !isPrinted(p) },
    { target: 'boites-organiseurs-et-tri-fils', rule: 'rangement',            test: isNeedleMinder },
    { target: 'aiguilles-coudre-broder',      rule: 'aiguilles',              test: isNeedle },
  ],

  'bandes-et-galons': [
    { target: 'livres-et-magazines',        rule: 'catalogue',     test: isPublication },
    // Galon avant bande : « galon Tresse Lin » est un galon, pas une bande à broder
    { target: 'galons-decoratifs-a-motifs', rule: 'galon ou ruban', test: has(/galon|croquet|ruban|dentelle|guipure/) },
    { target: 'bandes-aida-a-broder',       rule: 'bande Aïda',    test: has(/bande.*aida/) },
    { target: 'bandes-en-lin-a-broder',     rule: 'bande en lin',  test: has(/bande.*\blin\b/) },
  ],

  'articles-prets-a-broder': [
    { target: 'univers-bebe',      rule: 'bébé',         test: isBaby },
    { target: 'linge-de-bain',     rule: 'linge de bain', test: isBath },
    { target: 'cuisine-et-maison', rule: 'cuisine',      test: isKitchen },
  ],

  'tambours-et-cadres': [
    { target: 'tambours-et-metiers-a-broder',     rule: 'métier ou tambour', test: isHoopOrFrame },
    { target: 'cadres-et-suspenses-de-finition',  rule: 'cadre ou suspense', test: isFinishing },
  ],

  'petite-mercerie': [
    { target: 'ciseaux-de-broderie',              rule: 'ciseaux',            test: isScissors },
    { target: 'cadres-et-suspenses-de-finition',  rule: 'cadre ou suspense',  test: isFinishing },
    { target: 'bons-cadeaux-et-accessoires-divers', rule: 'accessoire divers', test: () => true },
  ],

  'perles-et-tresors': [
    { target: 'kits-de-broderie-perlee',          rule: 'kit perles',         test: isKit },
    { target: 'perles-mill-hill-et-accessoires',  rule: 'perles ou accessoire', test: () => true },
  ],

  'confort-et-optique': [
    { target: 'lampes-lumiere-du-jour',       rule: 'lampe',             test: has(/lampe/) },
    { target: 'loupes-de-broderie',           rule: 'loupe',             test: has(/loupe/) },
    { target: 'tambours-et-metiers-a-broder', rule: 'support de tambour', test: isHoopOrFrame },
  ],

  'fils-effets-speciaux': [
    { target: 'fils-metallises-etoile-et-satin', rule: 'métallisé ou satin', test: has(/metal|etoile|satin|kreinik/) },
    { target: 'fils-variations-et-coloris',      rule: 'variation ou coloris', test: () => true },
  ],
};

/**
 * Sous-rayon proposé pour un article rangé en tête de rayon.
 * @param {{ name: string, brand: string, rootSlug: string, article?: object }} product
 * @returns {{ target: string|null, rule: string|null }}
 */
const classify = (product) => {
  const p = { ...product, name: normalize(product.name), rawName: String(product.name ?? '').toLowerCase() };
  for (const r of RULES[product.rootSlug] ?? []) {
    if (r.test(p)) return { target: r.target, rule: r.rule };
  }
  return { target: null, rule: null };
};

module.exports = { classify, normalize, RULES };
