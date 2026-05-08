-- ============================================================
-- Seeds — données de test réalistes — Broderie E-Commerce CH
-- Supaco Digital — 2026
-- À exécuter APRÈS schema.sql
-- ============================================================

SET NAMES utf8mb4;

-- Idempotent — on nettoie les données de seeds avant de les réinsérer
-- Ne touche pas aux données créées par les tests ou via l'application
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM loyalty_rewards    WHERE code LIKE 'FIDELITE-%';
DELETE FROM loyalty_transactions WHERE order_id IN (1,2,3,4) OR order_id IS NULL;
DELETE FROM loyalty_accounts   WHERE user_id IN (3,4,6,7);
DELETE FROM payments           WHERE order_id IN (1,2,3,4);
DELETE FROM order_status_history WHERE order_id IN (1,2,3,4);
DELETE FROM order_items        WHERE order_id IN (1,2,3,4);
DELETE FROM orders             WHERE id IN (1,2,3,4);
DELETE FROM reviews            WHERE user_id IN (3,4,5,6,7);
DELETE FROM addresses          WHERE user_id IN (3,4,5,6,7);
DELETE FROM users              WHERE email IN (
  'superadmin@broderie.ch','admin@broderie.ch','marie.dupont@gmail.com',
  'anna.mueller@bluewin.ch','john.smith@gmail.com','isabelle.roux@gmail.com','hans.berger@gmail.com'
);
DELETE FROM product_images     WHERE product_id BETWEEN 1 AND 15;
DELETE FROM product_translations WHERE product_id BETWEEN 1 AND 15;
DELETE FROM products           WHERE id BETWEEN 1 AND 15;
DELETE FROM category_translations WHERE category_id BETWEEN 1 AND 10;
DELETE FROM categories         WHERE id BETWEEN 1 AND 10;
DELETE FROM suppliers          WHERE name IN ('DMC France','Zweigart Germany','Anchor Crafts','Madeira Threads');
DELETE FROM coupons            WHERE code IN ('BIENVENUE10','ETE2026','FIDELE5');
DELETE FROM loyalty_tiers      WHERE name IN ('Bronze','Argent','Or');
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- UTILISATEURS DE TEST
-- Mot de passe pour tous les comptes : Test1234!
-- Hash bcrypt généré avec salt rounds = 12
-- ============================================================
INSERT INTO users (email, password_hash, first_name, last_name, role, locale, is_active) VALUES
  ('superadmin@broderie.ch',  '$2b$12$KQfNKyH55l5oY7rY2MIsgeOv.L8wxKR7xrsQ9m.QE.5bde1l.aFxS', 'Sophie',   'Meylan',     'super_admin', 'fr', 1),
  ('admin@broderie.ch',       '$2b$12$KQfNKyH55l5oY7rY2MIsgeOv.L8wxKR7xrsQ9m.QE.5bde1l.aFxS', 'Marc',     'Favre',      'admin',       'fr', 1),
  ('marie.dupont@gmail.com',  '$2b$12$KQfNKyH55l5oY7rY2MIsgeOv.L8wxKR7xrsQ9m.QE.5bde1l.aFxS', 'Marie',    'Dupont',     'client',      'fr', 1),
  ('anna.mueller@bluewin.ch', '$2b$12$KQfNKyH55l5oY7rY2MIsgeOv.L8wxKR7xrsQ9m.QE.5bde1l.aFxS', 'Anna',     'Müller',     'client',      'de', 1),
  ('john.smith@gmail.com',    '$2b$12$KQfNKyH55l5oY7rY2MIsgeOv.L8wxKR7xrsQ9m.QE.5bde1l.aFxS', 'John',     'Smith',      'client',      'en', 1),
  ('isabelle.roux@gmail.com', '$2b$12$KQfNKyH55l5oY7rY2MIsgeOv.L8wxKR7xrsQ9m.QE.5bde1l.aFxS', 'Isabelle', 'Roux',       'client',      'fr', 1),
  ('hans.berger@gmail.com',   '$2b$12$KQfNKyH55l5oY7rY2MIsgeOv.L8wxKR7xrsQ9m.QE.5bde1l.aFxS', 'Hans',     'Berger',     'client',      'de', 1);

-- Capture des IDs utilisateurs pour les INSERTs dépendants
SET @uid_marie    = (SELECT id FROM users WHERE email = 'marie.dupont@gmail.com');
SET @uid_anna     = (SELECT id FROM users WHERE email = 'anna.mueller@bluewin.ch');
SET @uid_john     = (SELECT id FROM users WHERE email = 'john.smith@gmail.com');
SET @uid_isabelle = (SELECT id FROM users WHERE email = 'isabelle.roux@gmail.com');
SET @uid_hans     = (SELECT id FROM users WHERE email = 'hans.berger@gmail.com');
SET @uid_admin    = (SELECT id FROM users WHERE email = 'admin@broderie.ch');

-- ============================================================
-- ADRESSES
-- ============================================================
INSERT INTO addresses (user_id, label, street, city, zip, country, canton, is_default) VALUES
  (@uid_marie,    'Domicile', 'Rue du Lac 12',        'Lausanne', '1003', 'CH', 'VD', 1),
  (@uid_anna,     'Domicile', 'Bahnhofstrasse 8',     'Zürich',   '8001', 'CH', 'ZH', 1),
  (@uid_john,     'Home',     'Marktgasse 3',         'Bern',     '3011', 'CH', 'BE', 1),
  (@uid_isabelle, 'Domicile', 'Avenue de la Gare 24', 'Genève',   '1201', 'CH', 'GE', 1),
  (@uid_hans,     'Domicile', 'Hauptstrasse 15',      'Basel',    '4051', 'CH', 'BS', 1);

-- ============================================================
-- FOURNISSEURS
-- ============================================================
INSERT INTO suppliers (name, contact_name, email, phone, address, notes, is_active) VALUES
  ('DMC France',        'Pierre Lefebvre', 'contact@dmc.com',           '+33 3 89 57 70 00', '10 avenue Bruat, 68057 Mulhouse, France', 'Fournisseur principal de fils à broder', 1),
  ('Zweigart Germany',  'Klaus Weber',     'info@zweigart.de',          '+49 7141 634 0',    'Heilbronner Str. 72, 71636 Ludwigsburg', 'Toiles et lin de qualité supérieure',    1),
  ('Anchor Crafts',     'Emma Jones',      'trade@anchorcrafts.com',    '+44 1204 366 8000', 'Anchor House, Mercer Way, Royd, UK',     'Fils coton Anchor, large gamme couleurs', 1),
  ('Madeira Threads',   'Hans Schmidt',    'info@madeira.com',          '+49 761 51030',     'Waldkirch, Baden-Württemberg, Germany',  'Fils spéciaux et broderie machine',       1);

-- Capture des IDs fournisseurs
SET @sup_dmc     = (SELECT id FROM suppliers WHERE name = 'DMC France');
SET @sup_zweig   = (SELECT id FROM suppliers WHERE name = 'Zweigart Germany');
SET @sup_anchor  = (SELECT id FROM suppliers WHERE name = 'Anchor Crafts');

-- ============================================================
-- CATÉGORIES
-- ============================================================
INSERT INTO categories (id, parent_id, slug, sort_order) VALUES
  (1, NULL, 'kits-broderie',        1),
  (2, NULL, 'fils',                 2),
  (3, NULL, 'toiles-supports',      3),
  (4, NULL, 'accessoires',          4),
  (5, 1,    'kits-point-de-croix',  1),
  (6, 1,    'kits-broderie-libre',  2),
  (7, 2,    'fils-dmc',             1),
  (8, 2,    'fils-anchor',          2),
  (9, 4,    'cerceaux-cadres',      1),
  (10, 4,   'aiguilles-ciseaux',    2);

INSERT INTO category_translations (category_id, locale, name, description) VALUES
  -- Kits broderie
  (1, 'fr', 'Kits de broderie',        'Tout pour commencer votre projet de broderie'),
  (1, 'de', 'Stickpackungen',          'Alles für Ihr Stickprojekt'),
  (1, 'en', 'Embroidery Kits',         'Everything to start your embroidery project'),
  -- Fils
  (2, 'fr', 'Fils à broder',           'Large sélection de fils de qualité'),
  (2, 'de', 'Stickgarn',               'Grosse Auswahl an Qualitätsgarnen'),
  (2, 'en', 'Embroidery Thread',       'Wide selection of quality threads'),
  -- Toiles
  (3, 'fr', 'Toiles et supports',      'Aida, lin, canevas — tous les supports'),
  (3, 'de', 'Stoffe und Unterlagen',   'Aida, Leinen, Kanvas — alle Unterlagen'),
  (3, 'en', 'Fabrics & Canvas',        'Aida, linen, canvas — all backgrounds'),
  -- Accessoires
  (4, 'fr', 'Accessoires',             'Cerceaux, aiguilles, ciseaux et plus'),
  (4, 'de', 'Zubehör',                 'Stickrahmen, Nadeln, Scheren und mehr'),
  (4, 'en', 'Accessories',             'Hoops, needles, scissors and more'),
  -- Sous-catégories
  (5, 'fr', 'Kits point de croix',     NULL),
  (5, 'de', 'Kreuzstich-Packungen',    NULL),
  (5, 'en', 'Cross Stitch Kits',       NULL),
  (6, 'fr', 'Kits broderie libre',     NULL),
  (6, 'de', 'Freihand-Stickpackungen', NULL),
  (6, 'en', 'Free Embroidery Kits',    NULL),
  (7, 'fr', 'Fils DMC',                NULL),
  (7, 'de', 'DMC-Garne',               NULL),
  (7, 'en', 'DMC Threads',             NULL),
  (8, 'fr', 'Fils Anchor',             NULL),
  (8, 'de', 'Anchor-Garne',            NULL),
  (8, 'en', 'Anchor Threads',          NULL),
  (9, 'fr', 'Cerceaux et cadres',      NULL),
  (9, 'de', 'Stickrahmen',             NULL),
  (9, 'en', 'Hoops & Frames',          NULL),
  (10, 'fr', 'Aiguilles et ciseaux',   NULL),
  (10, 'de', 'Nadeln und Scheren',     NULL),
  (10, 'en', 'Needles & Scissors',     NULL);

-- ============================================================
-- PRODUITS (tax_rate_id 1 = 8.1% taux normal)
-- ============================================================
INSERT INTO products (id, category_id, supplier_id, slug, price_chf, compare_price_chf, tax_rate_id, sku, stock, is_active, is_featured) VALUES
  (1,  5, @sup_dmc,    'kit-point-de-croix-alpes-suisses',     49.90, 59.90, 1, 'KIT-PDC-001',  25, 1, 1),
  (2,  5, @sup_dmc,    'kit-point-de-croix-fleurs-des-champs', 34.90, NULL,  1, 'KIT-PDC-002',  18, 1, 1),
  (3,  6, @sup_dmc,    'kit-broderie-libre-lavande',            29.90, 34.90, 1, 'KIT-BL-001',   30, 1, 1),
  (4,  6, @sup_zweig,  'kit-broderie-animaux-foret',            39.90, NULL,  1, 'KIT-BL-002',   12, 1, 0),
  (5,  7, @sup_dmc,    'fils-dmc-coffret-36-couleurs',          22.90, 27.50, 1, 'FIL-DMC-036',   8, 1, 1),
  (6,  7, @sup_dmc,    'fil-dmc-strande-coton-blanc',            1.90, NULL,  1, 'FIL-DMC-B5200',150, 1, 0),
  (7,  7, @sup_dmc,    'fil-dmc-strande-coton-rouge',            1.90, NULL,  1, 'FIL-DMC-321',  120, 1, 0),
  (8,  8, @sup_anchor, 'fils-anchor-coffret-20-couleurs',       16.90, 19.90, 1, 'FIL-ANC-020',  15, 1, 0),
  (9,  3, @sup_zweig,  'toile-aida-blanc-18ct-50x50cm',          8.90, NULL,  1, 'TOI-AID-001',  40, 1, 0),
  (10, 3, @sup_zweig,  'toile-aida-ecru-14ct-50x50cm',           7.90, NULL,  1, 'TOI-AID-002',  35, 1, 0),
  (11, 3, @sup_zweig,  'toile-lin-28ct-naturel-50x70cm',        18.90, 22.00, 1, 'TOI-LIN-001',  20, 1, 0),
  (12, 9, NULL,        'cerceau-bois-15cm',                      4.90, NULL,  1, 'ACC-CER-015',  60, 1, 0),
  (13, 9, NULL,        'cerceau-bois-25cm',                      6.90, NULL,  1, 'ACC-CER-025',  45, 1, 0),
  (14, 9, NULL,        'cadre-bois-rectangulaire-20x30cm',      12.90, NULL,  1, 'ACC-CAD-001',  22, 1, 0),
  (15, 10,NULL,        'aiguilles-tapisserie-paquet-10',          3.90, NULL,  1, 'ACC-AIQ-001',  80, 1, 0);

-- Traductions produits
INSERT INTO product_translations (product_id, locale, name, description, slug) VALUES
  -- Kit Alpes Suisses
  (1, 'fr', 'Kit point de croix — Alpes Suisses',
   'Brodez les magnifiques paysages des Alpes suisses en point de croix. Comprend toile Aida 18ct, fils DMC, aiguille et grille couleur A4.',
   'kit-point-de-croix-alpes-suisses'),
  (1, 'de', 'Kreuzstich-Set — Schweizer Alpen',
   'Sticken Sie die wunderschöne Schweizer Alpenlandschaft in Kreuzstich. Enthält Aida-Stoff 18ct, DMC-Garne, Nadel und A4-Farbmuster.',
   'kreuzstich-set-schweizer-alpen'),
  (1, 'en', 'Cross Stitch Kit — Swiss Alps',
   'Embroider the beautiful Swiss Alpine landscape in cross stitch. Includes 18ct Aida fabric, DMC threads, needle and A4 colour chart.',
   'cross-stitch-kit-swiss-alps'),
  -- Kit Fleurs des champs
  (2, 'fr', 'Kit point de croix — Fleurs des champs',
   'Un bouquet de fleurs champêtres à broder en point de croix. Idéal pour les débutantes. Toile Aida 14ct incluse.',
   'kit-point-de-croix-fleurs-des-champs'),
  (2, 'de', 'Kreuzstich-Set — Wiesenblumen',
   'Einen Strauss Wiesenblumen in Kreuzstich sticken. Ideal für Anfänger. Aida-Stoff 14ct inklusive.',
   'kreuzstich-set-wiesenblumen'),
  (2, 'en', 'Cross Stitch Kit — Wildflowers',
   'A wildflower bouquet to embroider in cross stitch. Perfect for beginners. 14ct Aida fabric included.',
   'cross-stitch-kit-wildflowers'),
  -- Kit Lavande
  (3, 'fr', 'Kit broderie libre — Lavande de Provence',
   'Kit broderie libre avec motif lavande stylisé. Inclut toile de lin naturel, fils dégradés violet, aiguille et instructions détaillées.',
   'kit-broderie-libre-lavande'),
  (3, 'de', 'Freihandstick-Set — Lavendel',
   'Freihandstick-Set mit stilisiertem Lavendelmotiv. Enthält Naturleinen, violette Verlaufsgarne, Nadel und detaillierte Anleitung.',
   'freihandstick-set-lavendel'),
  (3, 'en', 'Free Embroidery Kit — Lavender',
   'Free embroidery kit with a stylized lavender motif. Includes natural linen, gradient purple threads, needle and detailed instructions.',
   'free-embroidery-kit-lavender'),
  -- Kit Animaux
  (4, 'fr', 'Kit broderie — Animaux de la forêt',
   'Brodez un renard, un hérisson et un écureuil dans un décor forestier. Kit complet pour niveau intermédiaire.',
   'kit-broderie-animaux-foret'),
  (4, 'de', 'Stickset — Waldtiere',
   'Sticken Sie einen Fuchs, einen Igel und ein Eichhörnchen in einem Waldambiente. Komplettes Set für Fortgeschrittene.',
   'stickset-waldtiere'),
  (4, 'en', 'Embroidery Kit — Forest Animals',
   'Embroider a fox, a hedgehog and a squirrel in a forest setting. Complete kit for intermediate level.',
   'embroidery-kit-forest-animals'),
  -- Coffret DMC 36
  (5, 'fr', 'Coffret fils DMC — 36 couleurs assorties',
   'Coffret de 36 échevettes de fils DMC Mouliné Spécial, soigneusement sélectionnées pour la broderie et le point de croix.',
   'fils-dmc-coffret-36-couleurs'),
  (5, 'de', 'DMC-Garnkoffer — 36 Farben',
   'Koffer mit 36 Strängen DMC Mouliné Spécial, sorgfältig für Stickerei und Kreuzstich ausgewählt.',
   'dmc-garnkoffer-36-farben'),
  (5, 'en', 'DMC Thread Box — 36 Assorted Colours',
   'Box of 36 skeins of DMC Mouliné Spécial, carefully selected for embroidery and cross stitch.',
   'dmc-thread-box-36-colours'),
  -- Fil DMC blanc
  (6, 'fr', 'Fil DMC Mouliné — Blanc B5200',     'Échevette de fil DMC Mouliné Spécial, coloris blanc pur B5200. 8 mètres.', 'fil-dmc-mouline-blanc'),
  (6, 'de', 'DMC Mouliné-Garn — Weiss B5200',    'DMC Mouliné Spécial Strang, Farbe reines Weiss B5200. 8 Meter.',           'dmc-mouline-garn-weiss'),
  (6, 'en', 'DMC Mouliné Thread — White B5200',  'DMC Mouliné Spécial skein, pure white colour B5200. 8 metres.',            'dmc-mouline-thread-white'),
  -- Fil DMC rouge
  (7, 'fr', 'Fil DMC Mouliné — Rouge 321',       'Échevette de fil DMC Mouliné Spécial, coloris rouge vif 321. 8 mètres.', 'fil-dmc-mouline-rouge'),
  (7, 'de', 'DMC Mouliné-Garn — Rot 321',        'DMC Mouliné Spécial Strang, Farbe leuchtendrot 321. 8 Meter.',            'dmc-mouline-garn-rot'),
  (7, 'en', 'DMC Mouliné Thread — Red 321',      'DMC Mouliné Spécial skein, bright red colour 321. 8 metres.',             'dmc-mouline-thread-red'),
  -- Coffret Anchor
  (8, 'fr', 'Coffret fils Anchor — 20 couleurs', 'Coffret de 20 échevettes Anchor Mouliné, idéal pour débuter ou compléter sa collection.', 'fils-anchor-coffret-20-couleurs'),
  (8, 'de', 'Anchor-Garnset — 20 Farben',        'Set mit 20 Anchor Mouliné Strängen, ideal zum Starten oder Ergänzen der Sammlung.',       'anchor-garnset-20-farben'),
  (8, 'en', 'Anchor Thread Set — 20 Colours',    'Set of 20 Anchor Mouliné skeins, ideal to start or complete your collection.',            'anchor-thread-set-20-colours'),
  -- Toile Aida blanche
  (9, 'fr', 'Toile Aida blanche 18ct — 50x50cm', 'Toile Aida de qualité supérieure, 18 points au cm, blanc pur. Idéale pour le point de croix fin.', 'toile-aida-blanc-18ct'),
  (9, 'de', 'Weisser Aida-Stoff 18ct — 50x50cm', 'Aida-Stoff in Premiumqualität, 18 Punkte pro cm, reinweiss. Ideal für feinen Kreuzstich.',        'aida-stoff-weiss-18ct'),
  (9, 'en', 'White Aida Fabric 18ct — 50x50cm',  'Premium quality Aida fabric, 18 count, pure white. Ideal for fine cross stitch.',                  'aida-fabric-white-18ct'),
  -- Toile Aida écrue
  (10, 'fr', 'Toile Aida écrue 14ct — 50x50cm',  'Toile Aida teinte écrue naturelle, 14 points au cm. Format idéal pour les projets moyens.', 'toile-aida-ecru-14ct'),
  (10, 'de', 'Ecru Aida-Stoff 14ct — 50x50cm',   'Aida-Stoff in natürlicher Ecrufarbe, 14 Punkte pro cm. Ideales Format für mittlere Projekte.', 'aida-stoff-ecru-14ct'),
  (10, 'en', 'Ecru Aida Fabric 14ct — 50x50cm',  'Natural ecru Aida fabric, 14 count. Ideal size for medium-sized projects.',                     'aida-fabric-ecru-14ct'),
  -- Lin naturel
  (11, 'fr', 'Toile de lin naturel 28ct — 50x70cm', 'Lin naturel haut de gamme, 28 points au cm. Pour broderie libre et point de croix raffiné.', 'toile-lin-naturel-28ct'),
  (11, 'de', 'Naturleinen 28ct — 50x70cm',           'Premium-Naturleinen, 28 Punkte pro cm. Für Freihandstickerei und raffinierten Kreuzstich.',  'naturleinen-28ct'),
  (11, 'en', 'Natural Linen 28ct — 50x70cm',         'Premium natural linen, 28 count. For free embroidery and refined cross stitch.',             'natural-linen-28ct'),
  -- Cerceau 15cm
  (12, 'fr', 'Cerceau à broder en bois — 15cm',   'Cerceau à broder en bois de hêtre, diamètre 15cm. Finition lisse, idéal pour débutants.',  'cerceau-bois-15cm'),
  (12, 'de', 'Holz-Stickrahmen — 15cm',            'Stickrahmen aus Buchenholz, Durchmesser 15cm. Glatte Oberfläche, ideal für Anfänger.',     'holz-stickrahmen-15cm'),
  (12, 'en', 'Wooden Embroidery Hoop — 15cm',      'Beech wood embroidery hoop, 15cm diameter. Smooth finish, ideal for beginners.',           'wooden-hoop-15cm'),
  -- Cerceau 25cm
  (13, 'fr', 'Cerceau à broder en bois — 25cm',   'Cerceau à broder en bois de hêtre, diamètre 25cm. Pour les projets de taille moyenne.',    'cerceau-bois-25cm'),
  (13, 'de', 'Holz-Stickrahmen — 25cm',            'Stickrahmen aus Buchenholz, Durchmesser 25cm. Für mittelgrosse Projekte.',                'holz-stickrahmen-25cm'),
  (13, 'en', 'Wooden Embroidery Hoop — 25cm',      'Beech wood embroidery hoop, 25cm diameter. For medium-sized projects.',                   'wooden-hoop-25cm'),
  -- Cadre rectangulaire
  (14, 'fr', 'Cadre bois rectangulaire — 20x30cm', 'Cadre à broder rectangulaire en bois massif, 20x30cm. Idéal pour tableaux et projets déco.', 'cadre-bois-rectangulaire'),
  (14, 'de', 'Rechteckiger Holzrahmen — 20x30cm',  'Rechteckiger Stickrahmen aus Massivholz, 20x30cm. Ideal für Wandbilder und Deko-Projekte.',  'rechteckiger-holzrahmen'),
  (14, 'en', 'Rectangular Wood Frame — 20x30cm',   'Rectangular embroidery frame in solid wood, 20x30cm. Ideal for wall art and deco projects.', 'rectangular-wood-frame'),
  -- Aiguilles tapisserie
  (15, 'fr', 'Aiguilles de tapisserie — paquet de 10', 'Aiguilles de tapisserie à bout rond, taille 24/26. Paquet de 10 aiguilles en acier inoxydable.', 'aiguilles-tapisserie-10'),
  (15, 'de', 'Tapisserie-Nadeln — 10er Pack',           '10 Tapisserie-Nadeln mit stumpfer Spitze, Grösse 24/26. Aus rostfreiem Stahl.',                 'tapisserie-nadeln-10er'),
  (15, 'en', 'Tapestry Needles — Pack of 10',           'Blunt-tipped tapestry needles, size 24/26. Pack of 10 stainless steel needles.',               'tapestry-needles-10');

-- Images produits (URLs placeholder — remplacer par vrais fichiers à l'upload)
INSERT INTO product_images (product_id, url, alt, sort_order, is_primary) VALUES
  (1,  '/uploads/products/kit-alpes-suisses-lg.webp',   'Kit point de croix Alpes Suisses',   0, 1),
  (2,  '/uploads/products/kit-fleurs-champs-lg.webp',   'Kit point de croix Fleurs des champs', 0, 1),
  (3,  '/uploads/products/kit-lavande-lg.webp',         'Kit broderie libre Lavande',          0, 1),
  (4,  '/uploads/products/kit-animaux-foret-lg.webp',   'Kit broderie Animaux de la forêt',    0, 1),
  (5,  '/uploads/products/coffret-dmc-36-lg.webp',      'Coffret fils DMC 36 couleurs',        0, 1),
  (6,  '/uploads/products/fil-dmc-blanc-lg.webp',       'Fil DMC blanc B5200',                 0, 1),
  (7,  '/uploads/products/fil-dmc-rouge-lg.webp',       'Fil DMC rouge 321',                   0, 1),
  (8,  '/uploads/products/coffret-anchor-20-lg.webp',   'Coffret fils Anchor 20 couleurs',     0, 1),
  (9,  '/uploads/products/toile-aida-blanc-lg.webp',    'Toile Aida blanche 18ct',             0, 1),
  (10, '/uploads/products/toile-aida-ecru-lg.webp',     'Toile Aida écrue 14ct',               0, 1),
  (11, '/uploads/products/toile-lin-naturel-lg.webp',   'Toile de lin naturel 28ct',           0, 1),
  (12, '/uploads/products/cerceau-15cm-lg.webp',        'Cerceau à broder 15cm',               0, 1),
  (13, '/uploads/products/cerceau-25cm-lg.webp',        'Cerceau à broder 25cm',               0, 1),
  (14, '/uploads/products/cadre-rectangulaire-lg.webp', 'Cadre rectangulaire 20x30cm',         0, 1),
  (15, '/uploads/products/aiguilles-tapisserie-lg.webp','Aiguilles de tapisserie pack 10',     0, 1);

-- ============================================================
-- CODES PROMO DE TEST
-- ============================================================
INSERT INTO coupons (code, type, value, min_order_chf, usage_limit, is_active) VALUES
  ('BIENVENUE10', 'percent', 10.00, 30.00,  NULL, 1),
  ('ETE2026',     'percent', 15.00, 50.00,  200,  1),
  ('FIDELE5',     'fixed',    5.00, 25.00,  NULL, 1);

-- ============================================================
-- COMMANDES DE TEST
-- ============================================================
-- Prix TTC — TVA extraite : tva = subtotal × 0.081 / 1.081, arrondie au 0.05 CHF
-- total = subtotal + shipping_cost (TVA déjà incluse dans subtotal TTC)
-- Commande 1 : items = 49.90 + 29.90 = 79.80 TTC → TVA = 79.80 × 0.081 / 1.081 = 5.98 → total = 79.80 + 8.50 = 88.30
-- Commande 2 : items = 49.90 TTC          → TVA = 49.90 × 0.081 / 1.081 = 3.74 → total = 49.90 + 8.50 = 58.40
-- Commande 3 : items = 34.90 TTC          → TVA = 34.90 × 0.081 / 1.081 = 2.62 → total = 34.90 + 8.50 = 43.40
-- Commande 4 : items = 22.90 TTC          → TVA = 22.90 × 0.081 / 1.081 = 1.72 → total = 22.90 + 1.90 = 24.80
INSERT INTO orders (id, user_id, status, subtotal, shipping_cost, tax_amount, total) VALUES
  (1, @uid_marie,    'delivered',        79.80, 8.50, 5.98, 88.30),
  (2, @uid_anna,     'shipped',          49.90, 8.50, 3.74, 58.40),
  (3, @uid_isabelle, 'awaiting_payment', 34.90, 8.50, 2.62, 43.40),
  (4, @uid_hans,     'paid',             22.90, 1.90, 1.72, 24.80);

INSERT INTO order_items (order_id, product_id, quantity, unit_price, tax_rate_snapshot, product_snapshot_json) VALUES
  (1, 1, 1, 49.90, 8.1, '{"name": "Kit point de croix — Alpes Suisses", "sku": "KIT-PDC-001", "price_chf": 49.90}'),
  (1, 3, 1, 29.90, 8.1, '{"name": "Kit broderie libre — Lavande de Provence", "sku": "KIT-BL-001", "price_chf": 29.90}'),
  (2, 1, 1, 49.90, 8.1, '{"name": "Kit point de croix — Alpes Suisses", "sku": "KIT-PDC-001", "price_chf": 49.90}'),
  (3, 2, 1, 34.90, 8.1, '{"name": "Kit point de croix — Fleurs des champs", "sku": "KIT-PDC-002", "price_chf": 34.90}'),
  (4, 5, 1, 22.90, 8.1, '{"name": "Coffret fils DMC — 36 couleurs assorties", "sku": "FIL-DMC-036", "price_chf": 22.90}');

INSERT INTO order_status_history (order_id, status, note, created_by) VALUES
  (1, 'pending',          'Commande créée',                                    NULL),
  (1, 'paid',             'Paiement Twint confirmé',                           @uid_admin),
  (1, 'processing',       'En préparation',                                    @uid_admin),
  (1, 'shipped',          'Expédié Swiss Post — tracking: 99.00.000000.0000000', @uid_admin),
  (1, 'delivered',        'Livré',                                             NULL),
  (2, 'pending',          'Commande créée',                                    NULL),
  (2, 'paid',             'Paiement carte confirmé',                           @uid_admin),
  (2, 'shipped',          'Expédié Swiss Post',                                @uid_admin),
  (3, 'pending',          'Commande créée',                                    NULL),
  (3, 'awaiting_payment', 'QR Twint envoyé par email',                         @uid_admin),
  (4, 'pending',          'Commande créée',                                    NULL),
  (4, 'paid',             'Paiement carte confirmé',                           @uid_admin);

INSERT INTO payments (order_id, provider, provider_payment_id, amount, currency, method, status) VALUES
  (1, 'stripe', 'pi_test_1234567890abcdef', 88.30, 'CHF', 'twint', 'succeeded'),
  (2, 'stripe', 'pi_test_0987654321fedcba', 58.40, 'CHF', 'card',  'succeeded'),
  (3, 'stripe', 'pi_test_twintqr_pending',  43.40, 'CHF', 'twint', 'pending'),
  (4, 'stripe', 'pi_test_card_001',         24.80, 'CHF', 'card',  'succeeded');

-- ============================================================
-- PROGRAMME DE FIDÉLITÉ — PALIERS DE TEST
-- ============================================================
INSERT INTO loyalty_tiers (name, min_spend_chf, reward_type, reward_value, reward_validity_days, is_active, sort_order) VALUES
  ('Bronze',  100.00, 'fixed',   10.00, 90,  1, 1),
  ('Argent',  250.00, 'fixed',   25.00, 90,  1, 2),
  ('Or',      500.00, 'percent', 10.00, 180, 1, 3);

SET @tier_bronze = (SELECT id FROM loyalty_tiers WHERE name = 'Bronze');

INSERT INTO loyalty_accounts (user_id, total_spend_chf, current_tier_id) VALUES
  (@uid_marie,    0.00, NULL),
  (@uid_anna,     0.00, NULL),
  (@uid_isabelle, 0.00, NULL),
  (@uid_hans,     0.00, NULL);

-- Transactions fidélité — uniquement commandes au statut paid ou delivered
INSERT INTO loyalty_transactions (user_id, order_id, amount_chf, type) VALUES
  (@uid_marie, 1, 88.30, 'earn'),   -- commande 1 delivered ✓
  (@uid_hans,  4, 24.80, 'earn');   -- commande 4 paid ✓

-- Achat simulé pour faire atteindre le palier Bronze à Marie (88.30 + 12.00 = 100.30)
INSERT INTO loyalty_transactions (user_id, order_id, amount_chf, type) VALUES
  (@uid_marie, NULL, 12.00, 'earn');

UPDATE loyalty_accounts SET total_spend_chf = 100.30, current_tier_id = @tier_bronze WHERE user_id = @uid_marie;
UPDATE loyalty_accounts SET total_spend_chf = 0.00,   current_tier_id = NULL          WHERE user_id = @uid_anna;
UPDATE loyalty_accounts SET total_spend_chf = 0.00,   current_tier_id = NULL          WHERE user_id = @uid_isabelle;
UPDATE loyalty_accounts SET total_spend_chf = 24.80,  current_tier_id = NULL          WHERE user_id = @uid_hans;

-- Bon Bronze généré pour Marie
INSERT INTO loyalty_rewards (user_id, tier_id, code, type, value, status, expires_at) VALUES
  (@uid_marie, @tier_bronze, 'FIDELITE-BRONZE-MARIE2026', 'fixed', 10.00, 'available', DATE_ADD(NOW(), INTERVAL 90 DAY));

-- ============================================================
-- AVIS CLIENTS
-- ============================================================
INSERT INTO reviews (user_id, product_id, rating, title, body, is_approved) VALUES
  (@uid_marie,    1, 5, 'Magnifique kit !',       'Les couleurs sont superbes et les instructions très claires. Je recommande vivement !',    1),
  (@uid_anna,     1, 4, 'Sehr schön',              'Tolles Set, die Farben sind wunderschön. Die Anleitung könnte etwas detaillierter sein.',   1),
  (@uid_isabelle, 3, 5, 'Parfait pour débutante',  'Premier kit de broderie libre, facile à suivre et résultat magnifique !',                  1),
  (@uid_john,     5, 4, 'Good quality threads',    'The DMC threads are excellent quality. Great variety of colours in this box.',             1),
  (@uid_hans,     9, 5, 'Toile de qualité',        'Sehr gute Qualität, die Aida-Stoff ist fest und gut zu besticken.',                        1);
