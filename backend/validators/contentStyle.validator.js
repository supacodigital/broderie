const { z } = require('zod');
const { FONT_KEYS, findFont } = require('../utils/contentStyle.utils');

/* Mise en forme d'un texte (voir utils/contentStyle.utils.js pour le détail).
   Objet strict : une propriété inconnue est refusée plutôt qu'ignorée, pour
   qu'aucune donnée arbitraire ne finisse en base puis dans l'attribut style
   de la boutique. Les bornes évitent un texte illisible ou qui casse la page
   (titre de 400 px, lettres superposées). */
const textStyleSchema = z.object({
  font:          z.enum(FONT_KEYS).optional(),
  weight:        z.number().int().min(100).max(900).multipleOf(100).optional(),
  size:          z.number().int().min(10).max(120).optional(),
  color:         z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((c) => c.toLowerCase()).optional(),
  align:         z.enum(['left', 'center', 'right', 'justify']).optional(),
  italic:        z.boolean().optional(),
  uppercase:     z.boolean().optional(),
  underline:     z.boolean().optional(),
  lineHeight:    z.number().min(0.8).max(3).optional(),
  letterSpacing: z.number().min(-0.1).max(0.5).optional(),
}).strict().superRefine((style, ctx) => {
  // Une graisse que la police choisie n'a pas serait imitée par le navigateur (lettres épaissies artificiellement)
  if (style.font && style.weight !== undefined && !findFont(style.font).weights.includes(style.weight)) {
    ctx.addIssue({ code: 'custom', path: ['weight'], message: 'Graisse non disponible pour cette police.' });
  }
});

// Messages en français, par réglage — ceux de Zod sont en anglais
const MESSAGES = {
  font:          'Police inconnue.',
  weight:        'Graisse invalide.',
  size:          'Taille invalide (entre 10 et 120 px).',
  color:         'Couleur invalide (format #rrggbb).',
  align:         'Alignement invalide.',
  italic:        'Valeur attendue : oui ou non.',
  uppercase:     'Valeur attendue : oui ou non.',
  underline:     'Valeur attendue : oui ou non.',
  lineHeight:    'Interligne invalide (entre 0,8 et 3).',
  letterSpacing: 'Espacement des lettres invalide (entre -0,1 et 0,5).',
};

const issueMessage = (issue) => {
  if (issue.code === 'custom') return issue.message;
  if (issue.code === 'unrecognized_keys') return `Réglage inconnu : ${issue.keys.join(', ')}.`;
  return MESSAGES[issue.path[0]] ?? 'Mise en forme invalide.';
};

/* Valide les mises en forme d'une page : { cléDuTexte: mise en forme }.
   `input` absent → { styles: undefined } : la mise en forme en base reste telle
   quelle. Les mises en forme vides sont retirées (retour à l'apparence du site).
   Renvoie { styles } ou { error: { field, message } }. */
const parseContentStyles = (input, allowedKeys) => {
  if (input === undefined) return { styles: undefined };
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { error: { field: 'styles', message: 'Mise en forme invalide.' } };
  }
  const styles = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!allowedKeys.includes(key)) {
      return { error: { field: `styles.${key}`, message: 'Ce texte ne peut pas être mis en forme.' } };
    }
    const parsed = textStyleSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { error: { field: ['styles', key, ...issue.path].join('.'), message: issueMessage(issue) } };
    }
    const clean = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length > 0) styles[key] = clean;
  }
  return { styles };
};

module.exports = { textStyleSchema, parseContentStyles };
