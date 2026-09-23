const fs   = require('fs');
const path = require('path');

/* Non-régression CLI-09 — « retirer impérativement la mention erronée
   « Lausanne Suisse » ». La boutique est à Vucherens (VD) : le pied de page du
   site, celui des e-mails et la présentation de la boutique la situaient à
   Lausanne, en contradiction avec l'adresse affichée juste à côté.

   On contrôle les fichiers dont le texte est vu par les clientes : textes du
   site, gabarits d'e-mails, facture, pied de page, mentions légales. */
const ROOT = path.join(__dirname, '../../..');
const CUSTOMER_FACING_FILES = [
  'frontend/src/i18n/fr/common.json',
  'frontend/src/components/layout/Footer/Footer.jsx',
  'frontend/src/pages/MentionsLegales/MentionsLegales.jsx',
  'frontend/src/pages/Account/ProfilePage.jsx',
  'backend/services/email.service.js',
  'backend/services/invoice.service.js',
];

describe('CLI-09 — la boutique n\'est pas située à Lausanne', () => {
  test.each(CUSTOMER_FACING_FILES)('%s ne mentionne pas Lausanne', (file) => {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(content).not.toMatch(/lausanne/i);
  });
});
