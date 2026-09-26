/* Mise en forme des textes du site, réglée par le super-administrateur
   (Contenu du site → « Mise en forme » sous chaque texte).

   Une mise en forme est un objet par texte, dont chaque propriété est
   facultative : absente, le texte garde l'apparence prévue par la feuille de
   style de la boutique. Rien n'est donc figé en base tant qu'on n'y touche pas.
     font           clé du catalogue ci-dessous
     weight         graisse (100 à 900), parmi celles de la police
     size           taille en px sur grand écran — la boutique la réduit sur Natel
     color          #rrggbb
     align          left | center | right | justify
     italic, uppercase, underline   true/false (false retire un effet prévu par le site)
     lineHeight     interligne, sans unité (1.5 = une fois et demie la taille)
     letterSpacing  espacement des lettres, en em

   Catalogue fermé : seules des polices servies par broderie.ch elles-mêmes
   (frontend/src/fonts.css), jamais Google Fonts à la volée — l'adresse IP des
   visiteurs n'a pas à partir chez Google (audit LPD du 25.09), et une police
   inconnue ralentirait la page. Graisses = celles réellement déclarées. */

const FONT_CATALOG = [
  // Sans empattement
  { key: 'montserrat',       label: 'Montserrat',       family: 'Montserrat',       fallback: 'sans-serif', category: 'sans',   weights: [300, 400, 500, 600],                italic: false },
  { key: 'raleway',          label: 'Raleway',          family: 'Raleway',          fallback: 'sans-serif', category: 'sans',   weights: [300, 400, 500, 600, 700],           italic: true },
  { key: 'nunito',           label: 'Nunito',           family: 'Nunito',           fallback: 'sans-serif', category: 'sans',   weights: [300, 400, 500, 600, 700, 800],      italic: true },
  { key: 'josefin-sans',     label: 'Josefin Sans',     family: 'Josefin Sans',     fallback: 'sans-serif', category: 'sans',   weights: [300, 400, 500, 600, 700],           italic: true },
  // Avec empattement
  { key: 'cormorant-infant', label: 'Cormorant Infant', family: 'Cormorant Infant', fallback: 'serif',      category: 'serif',  weights: [300, 400, 500, 600],                italic: true },
  { key: 'lora',             label: 'Lora',             family: 'Lora',             fallback: 'serif',      category: 'serif',  weights: [400, 500, 600, 700],                italic: true },
  { key: 'eb-garamond',      label: 'EB Garamond',      family: 'EB Garamond',      fallback: 'serif',      category: 'serif',  weights: [400, 500, 600, 700, 800],           italic: true },
  { key: 'dm-serif-display', label: 'DM Serif Display', family: 'DM Serif Display', fallback: 'serif',      category: 'serif',  weights: [400],                               italic: true },
  // Manuscrites
  { key: 'great-vibes',      label: 'Great Vibes',      family: 'Great Vibes',      fallback: 'cursive',    category: 'script', weights: [400],                               italic: false },
  { key: 'dancing-script',   label: 'Dancing Script',   family: 'Dancing Script',   fallback: 'cursive',    category: 'script', weights: [400, 500, 600, 700],                italic: false },
];

const FONT_KEYS = FONT_CATALOG.map((f) => f.key);
const findFont = (key) => FONT_CATALOG.find((f) => f.key === key);

// Pile CSS d'une police : « 'EB Garamond', serif »
const fontStack = (font) => `'${font.family}', ${font.fallback}`;

/* Relit la valeur stockée (JSON). Une valeur absente ou abîmée ne doit jamais
   casser une page : on retombe sur « aucune mise en forme ». */
const readStyles = (json) => {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/* Version envoyée à la boutique : la clé de police devient la pile CSS, que la
   boutique applique telle quelle — elle n'a pas à connaître le catalogue.
   Une police retirée du catalogue depuis l'enregistrement est ignorée : le
   texte reprend la police prévue par le site. */
const toShopStyles = (styles) => Object.fromEntries(
  Object.entries(styles).map(([key, { font, ...rest }]) => {
    const known = font ? findFont(font) : null;
    return [key, known ? { ...rest, fontFamily: fontStack(known) } : rest];
  })
);

module.exports = { FONT_CATALOG, FONT_KEYS, findFont, fontStack, readStyles, toShopStyles };
