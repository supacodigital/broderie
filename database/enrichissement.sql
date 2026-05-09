-- ============================================================
-- ENRICHISSEMENT BASE DE DONNÉES — Broderie E-Commerce CH
-- Données réalistes : produits, clients, commandes, avis
-- IDs de départ : users > 300, products > 15, orders > 101
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = '';

-- ============================================================
-- 1. NOUVELLES CATÉGORIES
-- ============================================================
INSERT IGNORE INTO categories (id, parent_id, slug, sort_order) VALUES
(11, 2,    'fils-madeira',         4),
(12, 4,    'cadres-baguettes',     2),
(13, 4,    'rangement-organisation', 3),
(14, NULL, 'livres-patrons',       5),
(15, 14,   'livres-broderie',      1),
(16, 14,   'patrons-telechargeables', 2);

INSERT IGNORE INTO category_translations (category_id, locale, name, description) VALUES
(11, 'fr', 'Fils Madeira',                'Fils à broder Madeira — qualité premium'),
(11, 'de', 'Madeira Garne',               'Madeira Stickgarne – Premium-Qualität'),
(11, 'en', 'Madeira Threads',             'Madeira embroidery threads — premium quality'),
(12, 'fr', 'Cadres & Baguettes',          'Cadres en bois et baguettes pour encadrement'),
(12, 'de', 'Rahmen & Leisten',            'Holzrahmen und Leisten zur Einrahmung'),
(12, 'en', 'Frames & Mouldings',          'Wooden frames and mouldings for framing'),
(13, 'fr', 'Rangement & Organisation',    'Boîtes, pochettes et organisateurs pour broderie'),
(13, 'de', 'Aufbewahrung & Organisation', 'Boxen, Taschen und Organizer für Stickerei'),
(13, 'en', 'Storage & Organisation',      'Boxes, pouches and organisers for embroidery'),
(14, 'fr', 'Livres & Patrons',            'Livres de broderie et patrons à imprimer'),
(14, 'de', 'Bücher & Muster',             'Stickereibibücher und Schnittmuster'),
(14, 'en', 'Books & Patterns',            'Embroidery books and printable patterns'),
(15, 'fr', 'Livres de broderie',          'Guides et inspirations pour tous niveaux'),
(15, 'de', 'Stickereibibücher',           'Anleitungen und Inspirationen für alle Niveaus'),
(15, 'en', 'Embroidery Books',            'Guides and inspiration for all levels'),
(16, 'fr', 'Patrons téléchargeables',     'Patrons PDF à imprimer chez soi'),
(16, 'de', 'Downloadbare Schnittmuster',  'PDF-Muster zum selbst Ausdrucken'),
(16, 'en', 'Downloadable Patterns',       'PDF patterns to print at home');

-- ============================================================
-- 2. NOUVEAUX FOURNISSEURS
-- ============================================================
INSERT IGNORE INTO suppliers (id, name, contact_name, email, phone, address, notes, is_active) VALUES
(47, 'Sajou Paris',        'Amélie Bouchard', 'contact@sajou.fr',         '+33 1 45 00 12 34', '75 Rue du Faubourg Saint-Antoine, 75011 Paris, France', 'Spécialiste fils et accessoires haut de gamme', 1),
(48, 'Rico Design',        'Ingrid Hoffmann', 'info@rico-design.de',      '+49 2161 8600',     'Industriestraße 17, 41751 Viersen, Allemagne',          'Kits et fils tendance, livraison rapide', 1),
(49, 'Vervaco Belgium',    'Nathalie Dupuis', 'info@vervaco.be',          '+32 2 223 45 67',   'Rue de la Loi 42, 1000 Bruxelles, Belgique',            'Spécialiste kits point de croix et canevas', 1);

-- ============================================================
-- 3. NOUVEAUX PRODUITS (id 16 à 60)
-- ============================================================

-- Kits point de croix (cat 5)
INSERT INTO products (id, category_id, supplier_id, slug, price_chf, compare_price_chf, tax_rate_id, sku, stock, weight_kg, is_active, is_featured, badge) VALUES
(16, 5, 49, 'kit-point-croix-chalet-alpin',       59.90, NULL,  1, 'KIT-PDC-016', 18, 0.350, 1, 1, 'nouveaute'),
(17, 5, 49, 'kit-point-croix-lac-leman',           44.90, NULL,  1, 'KIT-PDC-003', 24, 0.300, 1, 0, NULL),
(18, 5, 49, 'kit-point-croix-ours-brun',           39.90, NULL,  1, 'KIT-PDC-004', 30, 0.280, 1, 0, NULL),
(19, 5, 48, 'kit-point-croix-mandala-zen',         34.90, 39.90, 1, 'KIT-PDC-005', 15, 0.250, 1, 1, 'promo'),
(20, 5, 48, 'kit-point-croix-papillons',           29.90, NULL,  1, 'KIT-PDC-006', 22, 0.220, 1, 0, NULL),
(21, 5, 49, 'kit-point-croix-noel-sapins',         49.90, NULL,  1, 'KIT-PDC-007', 40, 0.320, 1, 1, 'coup_de_coeur'),
(22, 5, 49, 'kit-point-croix-moutons-engadine',    54.90, NULL,  1, 'KIT-PDC-008', 12, 0.380, 1, 0, NULL),

-- Kits broderie libre (cat 6)
(23, 6, 47, 'kit-broderie-fleurs-sauvages',        36.90, NULL,  1, 'KIT-BL-023',  20, 0.280, 1, 1, 'nouveaute'),
(24, 6, 47, 'kit-broderie-boho-dreamcatcher',      32.90, NULL,  1, 'KIT-BL-003',  18, 0.250, 1, 0, NULL),
(25, 6, 48, 'kit-broderie-couronne-vegetale',      28.90, 34.90, 1, 'KIT-BL-004',  25, 0.230, 1, 0, 'promo'),
(26, 6, 47, 'kit-broderie-portrait-chat',          42.90, NULL,  1, 'KIT-BL-005',  10, 0.300, 1, 1, 'exclusif'),
(27, 6, 48, 'kit-broderie-paysage-automne',        38.90, NULL,  1, 'KIT-BL-006',  16, 0.290, 1, 0, NULL),

-- Fils DMC (cat 7)
(28, 7, 43, 'fil-dmc-bleu-royal-820',              1.90, NULL,  1, 'FIL-DMC-820',  200, 0.010, 1, 0, NULL),
(29, 7, 43, 'fil-dmc-vert-foret-319',              1.90, NULL,  1, 'FIL-DMC-319',  180, 0.010, 1, 0, NULL),
(30, 7, 43, 'fil-dmc-jaune-soleil-444',            1.90, NULL,  1, 'FIL-DMC-444',  160, 0.010, 1, 0, NULL),
(31, 7, 43, 'fil-dmc-rose-poudre-3716',            1.90, NULL,  1, 'FIL-DMC-3716', 150, 0.010, 1, 0, NULL),
(32, 7, 43, 'fil-dmc-or-metallic-5282',            3.90, NULL,  1, 'FIL-DMC-5282',  80, 0.012, 1, 0, NULL),
(33, 7, 43, 'coffret-fils-dmc-couleurs-pastel-24', 18.90, 22.90,1, 'COF-DMC-PAST', 35, 0.180, 1, 1, 'promo'),

-- Fils Anchor (cat 8)
(34, 8, 45, 'fil-anchor-marine-150',               1.90, NULL,  1, 'FIL-ANC-150',  120, 0.010, 1, 0, NULL),
(35, 8, 45, 'fil-anchor-bordeaux-44',              1.90, NULL,  1, 'FIL-ANC-044',  130, 0.010, 1, 0, NULL),

-- Fils Madeira (cat 11)
(36, 11, 46, 'fil-madeira-soie-naturelle-1',       4.90, NULL,  1, 'FIL-MAD-S01', 60, 0.015, 1, 1, 'exclusif'),
(37, 11, 46, 'fil-madeira-metallic-argent',        3.50, NULL,  1, 'FIL-MAD-M02', 75, 0.012, 1, 0, NULL),
(38, 11, 46, 'coffret-fils-madeira-20-couleurs',   24.90, NULL, 1, 'COF-MAD-020', 28, 0.200, 1, 0, NULL),

-- Toiles et supports (cat 3)
(39, 3, 44, 'toile-aida-noire-18ct-50x70',         14.90, NULL, 1, 'TOI-AID-N18', 40, 0.250, 1, 0, NULL),
(40, 3, 44, 'toile-aida-bleue-14ct-40x60',         11.90, NULL, 1, 'TOI-AID-B14', 35, 0.200, 1, 0, NULL),
(41, 3, 44, 'toile-evenweave-28ct-50x70',          22.90, NULL, 1, 'TOI-EVE-28',  22, 0.280, 1, 0, NULL),
(42, 3, 47, 'panneau-bois-brut-20x20',              8.90, NULL, 1, 'PAN-BOI-2020', 50, 0.300, 1, 0, NULL),

-- Cerceaux et cadres (cat 9)
(43, 9, 47, 'cerceau-bois-10cm',                   3.90, NULL, 1, 'CER-BOI-10', 80, 0.050, 1, 0, NULL),
(44, 9, 47, 'cerceau-bois-20cm',                   5.90, NULL, 1, 'CER-BOI-20', 65, 0.080, 1, 0, NULL),
(45, 9, 47, 'cerceau-bois-30cm',                   7.90, NULL, 1, 'CER-BOI-30', 45, 0.120, 1, 0, NULL),
(46, 9, 47, 'cerceau-bambou-ovale-15x20',           6.90, NULL, 1, 'CER-BAM-1520', 40, 0.090, 1, 0, NULL),

-- Cadres & Baguettes (cat 12)
(47, 12, 47, 'cadre-pin-brut-25x25',               15.90, NULL, 1, 'CAD-PIN-2525', 30, 0.400, 1, 0, NULL),
(48, 12, 47, 'cadre-pin-brut-30x40',               19.90, NULL, 1, 'CAD-PIN-3040', 25, 0.550, 1, 0, NULL),

-- Aiguilles (cat 10)
(49, 10, 43, 'aiguilles-tapisserie-n24-paquet-6',   2.90, NULL, 1, 'AIG-TAP-24', 120, 0.020, 1, 0, NULL),
(50, 10, 43, 'aiguilles-broder-pointe-n7-paquet-5', 2.50, NULL, 1, 'AIG-BRO-07', 100, 0.015, 1, 0, NULL),
(51, 10, 47, 'kit-aiguilles-assortiment-20pcs',     6.90, NULL, 1, 'AIG-ASS-20', 55, 0.040, 1, 1, 'coup_de_coeur'),
(52, 10, 47, 'de-a-coudre-laiton',                  4.50, NULL, 1, 'ACC-DEA-LAI', 70, 0.030, 1, 0, NULL),

-- Rangement (cat 13)
(53, 13, 47, 'trousse-broderie-coton-naturel',      16.90, NULL, 1, 'RAN-TRO-COT', 35, 0.180, 1, 1, 'nouveaute'),
(54, 13, 47, 'boite-rangement-fils-36-compartiments', 22.90, NULL, 1, 'RAN-BOI-36', 28, 0.450, 1, 0, NULL),
(55, 13, 47, 'pochette-zip-aiguilles-accessoires',    8.90, NULL, 1, 'RAN-POC-ZIP', 50, 0.080, 1, 0, NULL),

-- Livres (cat 15)
(56, 15, 47, 'livre-broderie-florale-debutant',     24.90, NULL, 1, 'LIV-BRO-FL1', 20, 0.400, 1, 1, NULL),
(57, 15, 47, 'livre-point-de-croix-moderne',        29.90, NULL, 1, 'LIV-PDC-MOD', 15, 0.450, 1, 0, NULL),

-- Patrons (cat 16)
(58, 16, 47, 'patron-pdf-fleurs-des-alpes',          4.90, NULL, 1, 'PAT-PDF-FA1', 999, 0.001, 1, 1, NULL),
(59, 16, 47, 'patron-pdf-faune-suisse',              5.90, NULL, 1, 'PAT-PDF-FS1', 999, 0.001, 1, 0, NULL),
(60, 16, 47, 'patron-pdf-lettrines-copperplate',     6.90, NULL, 1, 'PAT-PDF-LC1', 999, 0.001, 1, 0, NULL);

-- Traductions produits FR
INSERT INTO product_translations (product_id, locale, name, description) VALUES
(16,'fr','Kit point de croix — Chalet alpin','Brodez un authentique chalet alpin suisse. Toile Aida 16ct, fils DMC sélectionnés, guide de points illustré.'),
(17,'fr','Kit point de croix — Lac Léman','Panorama du lac Léman avec les Alpes en toile de fond. Idéal niveau intermédiaire.'),
(18,'fr','Kit point de croix — Ours brun','Adorable ourson en forêt, rendu réaliste grâce aux dégradés DMC. Niveau débutant avancé.'),
(19,'fr','Kit point de croix — Mandala zen','Mandala géométrique aux couleurs apaisantes. Méditation et concentration garanties.'),
(20,'fr','Kit point de croix — Papillons','Quatre espèces de papillons suisses à broder sur toile écrue. Idéal cadeau.'),
(21,'fr','Kit point de croix — Noël Sapins','Décoration de Noël traditionnelle à broder. Sapins enneigés et étoiles dorées.'),
(22,'fr','Kit point de croix — Moutons de l''Engadine','Moutons de race Engadinoise dans un paysage montagnard. Édition limitée.'),
(23,'fr','Kit broderie libre — Fleurs sauvages','Bouquet champêtre à broder en broderie libre. Points variés, résultat poétique.'),
(24,'fr','Kit broderie — Boho dreamcatcher','Attrape-rêves bohème aux plumes et perles brodées. Style moderne et tendance.'),
(25,'fr','Kit broderie — Couronne végétale','Couronne de feuillage et petites fleurs. Parfait pour décorer ou offrir.'),
(26,'fr','Kit broderie — Portrait de chat','Portrait réaliste de chat brodé en fils de soie Madeira. Niveau confirmé.'),
(27,'fr','Kit broderie — Paysage d''automne','Forêt aux couleurs d''automne, feuilles d''or et branches noires. Ambiance poétique.'),
(28,'fr','Fil DMC — Bleu royal 820','Fil mouliné DMC coloris bleu royal 820. Échevette 8m, 100% coton.'),
(29,'fr','Fil DMC — Vert forêt 319','Fil mouliné DMC coloris vert forêt 319. Échevette 8m, 100% coton.'),
(30,'fr','Fil DMC — Jaune soleil 444','Fil mouliné DMC coloris jaune vif 444. Échevette 8m, 100% coton.'),
(31,'fr','Fil DMC — Rose poudré 3716','Fil mouliné DMC coloris rose poudré 3716. Échevette 8m, 100% coton.'),
(32,'fr','Fil DMC — Or métallisé 5282','Fil métallisé DMC coloris or 5282. Idéal pour touches dorées et finitions.'),
(33,'fr','Coffret fils DMC — 24 couleurs pastels','Assortiment 24 fils moulinés DMC teintes pastels. Idéal pour la broderie florale.'),
(34,'fr','Fil Anchor — Marine 150','Fil mouliné Anchor coloris bleu marine 150. Échevette 8m, coton peigné.'),
(35,'fr','Fil Anchor — Bordeaux 44','Fil mouliné Anchor coloris bordeaux 44. Échevette 8m, coton peigné.'),
(36,'fr','Fil Madeira — Soie naturelle n°1','Fil de soie naturelle Madeira, couleur ivoire. Brillance et douceur incomparables.'),
(37,'fr','Fil Madeira — Métallisé argent','Fil métallisé Madeira coloris argent. Touche élégante sur vos broderies.'),
(38,'fr','Coffret fils Madeira — 20 couleurs','Assortiment 20 fils Madeira, mélange soie et coton. Palette harmonieuse.'),
(39,'fr','Toile Aida noire 18ct — 50x70cm','Toile Aida noire, 18 points/2,5cm. Idéale pour motifs lumineux sur fond sombre.'),
(40,'fr','Toile Aida bleue 14ct — 40x60cm','Toile Aida coloris bleu ciel, 14 points/2,5cm. Rendu doux et original.'),
(41,'fr','Toile Evenweave 28ct — 50x70cm','Tissu Evenweave 28 fils/cm, naturel écru. Pour la broderie au point compté fin.'),
(42,'fr','Panneau de bois brut — 20x20cm','Support bois brut 20x20cm pour montage broderie tendue. Bois de pin massif.'),
(43,'fr','Cerceau à broder bois — 10cm','Cerceau bois de hêtre 10cm. Idéal pour petites compositions et initiation.'),
(44,'fr','Cerceau à broder bois — 20cm','Cerceau bois de hêtre 20cm. Format intermédiaire polyvalent.'),
(45,'fr','Cerceau à broder bois — 30cm','Cerceau bois de hêtre 30cm. Grands formats et œuvres ambitieuses.'),
(46,'fr','Cerceau bambou ovale — 15x20cm','Cerceau ovale en bambou naturel 15x20cm. Format original pour compositions florales.'),
(47,'fr','Cadre pin brut — 25x25cm','Cadre en pin brut 25x25cm pour présentation broderie. Baguettes à assembler.'),
(48,'fr','Cadre pin brut — 30x40cm','Cadre en pin brut 30x40cm. Encadrement naturel et élégant pour vos créations.'),
(49,'fr','Aiguilles de tapisserie n°24 — 6 pcs','Lot de 6 aiguilles de tapisserie à bout rond n°24. Pour toile Aida et kanvas.'),
(50,'fr','Aiguilles à broder pointe n°7 — 5 pcs','Lot de 5 aiguilles à broder pointe fine n°7. Pour broderie libre sur tissu.'),
(51,'fr','Kit aiguilles — Assortiment 20 pcs','Assortiment 20 aiguilles : tapisserie, broderie et chenille. Toutes techniques.'),
(52,'fr','Dé à coudre laiton','Dé à coudre en laiton massif. Protection classique, ajustement parfait.'),
(53,'fr','Trousse à broderie — Coton naturel','Trousse en coton naturel avec compartiments intérieurs. Pratique et jolie.'),
(54,'fr','Boîte de rangement fils — 36 compartiments','Boîte plastique transparente, 36 cases pour organiser échevettes et accessoires.'),
(55,'fr','Pochette zip — Aiguilles & accessoires','Petite pochette zippée imperméable pour aiguilles, dés et petits accessoires.'),
(56,'fr','Broderie florale pour débutants','Guide complet de broderie florale avec 15 projets progressifs. FR/DE.'),
(57,'fr','Point de croix moderne','Inspiration contemporaine pour le point de croix, 20 motifs tendance.'),
(58,'fr','Patron PDF — Fleurs des Alpes','Patron numérique point compté : bouquet de fleurs alpines. Grille couleur A4 incluse.'),
(59,'fr','Patron PDF — Faune suisse','Patron numérique : chamois, marmottes et aigle royal. Grille couleur et N&B.'),
(60,'fr','Patron PDF — Lettrines copperplate','Alphabet complet en style copperplate à broder. 26 lettres + chiffres.');

-- Traductions DE
INSERT INTO product_translations (product_id, locale, name, description) VALUES
(16,'de','Kreuzstich-Set — Alpenchalet','Sticken Sie ein typisches Schweizer Alpenchalet. Aida-Stoff 16ct, DMC-Garne, illustrierte Anleitung.'),
(17,'de','Kreuzstich-Set — Genfersee','Panorama des Genfersees mit den Alpen im Hintergrund. Mittleres Niveau.'),
(18,'de','Kreuzstich-Set — Braunbär','Niedlicher Bär im Wald, realistischer Look durch DMC-Farbverläufe.'),
(19,'de','Kreuzstich-Set — Zen-Mandala','Geometrisches Mandala in beruhigenden Farben. Meditativ und entspannend.'),
(20,'de','Kreuzstich-Set — Schmetterlinge','Vier Schweizer Schmetterlingsarten auf Naturstoff. Schönes Geschenk.'),
(21,'de','Kreuzstich-Set — Weihnachtstannen','Traditioneller Weihnachtsschmuck: verschneite Tannen und goldene Sterne.'),
(22,'de','Kreuzstich-Set — Engadiner Schafe','Engadiner Schafe in einer Berglandschaft. Limitierte Edition.'),
(23,'de','Stickset — Wildblumen','Ländlicher Blumenstrauss in freier Stickerei. Verschiedene Stiche, poetisches Ergebnis.'),
(24,'de','Stickset — Boho Traumfänger','Böhmischer Traumfänger mit bestickten Federn und Perlen. Modern und trendig.'),
(25,'de','Stickset — Pflanzenkranz','Blattkranz mit kleinen Blüten. Perfekt zum Dekorieren oder Verschenken.'),
(26,'de','Stickset — Katzenporträt','Realistisches Katzenporträt in Madeira-Seide. Für Fortgeschrittene.'),
(27,'de','Stickset — Herbstlandschaft','Herbstwald in goldenen Farben. Poetische Stimmung.'),
(28,'de','DMC-Garn — Königsblau 820','DMC Mouliné-Garn, Farbe Königsblau 820. Strang 8m, 100% Baumwolle.'),
(29,'de','DMC-Garn — Waldgrün 319','DMC Mouliné-Garn, Farbe Waldgrün 319. Strang 8m, 100% Baumwolle.'),
(30,'de','DMC-Garn — Sonnengelb 444','DMC Mouliné-Garn, Farbe Sonnengelb 444. Strang 8m, 100% Baumwolle.'),
(36,'de','Madeira-Seide — Natur n°1','Natürliches Seidengarn Madeira, Elfenbeinfarbe. Unübertroffener Glanz.'),
(37,'de','Madeira-Garn — Metallic Silber','Metallisches Madeira-Garn, Silber. Elegante Akzente auf Ihren Stickereien.'),
(53,'de','Stickerei-Täschchen — Naturleinen','Täschchen aus Naturleinen mit Innenfächern. Praktisch und schön.'),
(56,'de','Blumenstickerei für Anfänger','Umfassende Anleitung mit 15 progressiven Projekten. FR/DE.');

-- Images produits (URL placeholder structurée)
INSERT INTO product_images (product_id, url, alt, sort_order, is_primary) VALUES
(16, 'https://storage.example.ch/products/kit-pdc-chalet-alpin-1.webp', 'Kit point de croix chalet alpin', 1, 1),
(17, 'https://storage.example.ch/products/kit-pdc-lac-leman-1.webp',    'Kit point de croix lac Léman', 1, 1),
(18, 'https://storage.example.ch/products/kit-pdc-ours-brun-1.webp',    'Kit point de croix ours brun', 1, 1),
(19, 'https://storage.example.ch/products/kit-pdc-mandala-zen-1.webp',  'Kit point de croix mandala zen', 1, 1),
(20, 'https://storage.example.ch/products/kit-pdc-papillons-1.webp',    'Kit point de croix papillons', 1, 1),
(21, 'https://storage.example.ch/products/kit-pdc-noel-sapins-1.webp',  'Kit point de croix Noël sapins', 1, 1),
(22, 'https://storage.example.ch/products/kit-pdc-moutons-1.webp',      'Kit point de croix moutons Engadine', 1, 1),
(23, 'https://storage.example.ch/products/kit-bl-fleurs-sauvages-1.webp','Kit broderie fleurs sauvages', 1, 1),
(24, 'https://storage.example.ch/products/kit-bl-dreamcatcher-1.webp',  'Kit broderie dreamcatcher', 1, 1),
(25, 'https://storage.example.ch/products/kit-bl-couronne-1.webp',      'Kit broderie couronne végétale', 1, 1),
(26, 'https://storage.example.ch/products/kit-bl-chat-1.webp',          'Kit broderie portrait de chat', 1, 1),
(27, 'https://storage.example.ch/products/kit-bl-automne-1.webp',       'Kit broderie paysage automne', 1, 1),
(28, 'https://storage.example.ch/products/fil-dmc-820-1.webp',          'Fil DMC bleu royal 820', 1, 1),
(29, 'https://storage.example.ch/products/fil-dmc-319-1.webp',          'Fil DMC vert forêt 319', 1, 1),
(30, 'https://storage.example.ch/products/fil-dmc-444-1.webp',          'Fil DMC jaune soleil 444', 1, 1),
(31, 'https://storage.example.ch/products/fil-dmc-3716-1.webp',         'Fil DMC rose poudré 3716', 1, 1),
(32, 'https://storage.example.ch/products/fil-dmc-5282-1.webp',         'Fil DMC or métallisé 5282', 1, 1),
(33, 'https://storage.example.ch/products/coffret-dmc-pastel-1.webp',   'Coffret fils DMC pastels 24 couleurs', 1, 1),
(34, 'https://storage.example.ch/products/fil-anchor-150-1.webp',       'Fil Anchor marine 150', 1, 1),
(35, 'https://storage.example.ch/products/fil-anchor-44-1.webp',        'Fil Anchor bordeaux 44', 1, 1),
(36, 'https://storage.example.ch/products/fil-madeira-soie-1.webp',     'Fil Madeira soie naturelle', 1, 1),
(37, 'https://storage.example.ch/products/fil-madeira-argent-1.webp',   'Fil Madeira métallisé argent', 1, 1),
(38, 'https://storage.example.ch/products/coffret-madeira-20-1.webp',   'Coffret fils Madeira 20 couleurs', 1, 1),
(39, 'https://storage.example.ch/products/toile-aida-noire-1.webp',     'Toile Aida noire 18ct', 1, 1),
(40, 'https://storage.example.ch/products/toile-aida-bleue-1.webp',     'Toile Aida bleue 14ct', 1, 1),
(41, 'https://storage.example.ch/products/toile-evenweave-1.webp',      'Toile Evenweave 28ct', 1, 1),
(42, 'https://storage.example.ch/products/panneau-bois-1.webp',         'Panneau bois brut 20x20cm', 1, 1),
(43, 'https://storage.example.ch/products/cerceau-10cm-1.webp',         'Cerceau à broder bois 10cm', 1, 1),
(44, 'https://storage.example.ch/products/cerceau-20cm-1.webp',         'Cerceau à broder bois 20cm', 1, 1),
(45, 'https://storage.example.ch/products/cerceau-30cm-1.webp',         'Cerceau à broder bois 30cm', 1, 1),
(46, 'https://storage.example.ch/products/cerceau-ovale-1.webp',        'Cerceau bambou ovale 15x20cm', 1, 1),
(47, 'https://storage.example.ch/products/cadre-pin-25-1.webp',         'Cadre pin brut 25x25cm', 1, 1),
(48, 'https://storage.example.ch/products/cadre-pin-30-1.webp',         'Cadre pin brut 30x40cm', 1, 1),
(49, 'https://storage.example.ch/products/aig-tapisserie-24-1.webp',    'Aiguilles tapisserie n°24', 1, 1),
(50, 'https://storage.example.ch/products/aig-broderie-7-1.webp',       'Aiguilles à broder pointe n°7', 1, 1),
(51, 'https://storage.example.ch/products/kit-aiguilles-20-1.webp',     'Kit aiguilles assortiment 20 pcs', 1, 1),
(52, 'https://storage.example.ch/products/de-laiton-1.webp',            'Dé à coudre laiton', 1, 1),
(53, 'https://storage.example.ch/products/trousse-coton-1.webp',        'Trousse broderie coton naturel', 1, 1),
(54, 'https://storage.example.ch/products/boite-36-1.webp',             'Boîte rangement 36 compartiments', 1, 1),
(55, 'https://storage.example.ch/products/pochette-zip-1.webp',         'Pochette zip accessoires', 1, 1),
(56, 'https://storage.example.ch/products/livre-florale-1.webp',        'Livre broderie florale débutants', 1, 1),
(57, 'https://storage.example.ch/products/livre-pdc-moderne-1.webp',    'Livre point de croix moderne', 1, 1),
(58, 'https://storage.example.ch/products/patron-pdf-alpes-1.webp',     'Patron PDF fleurs des Alpes', 1, 1),
(59, 'https://storage.example.ch/products/patron-pdf-faune-1.webp',     'Patron PDF faune suisse', 1, 1),
(60, 'https://storage.example.ch/products/patron-pdf-lettrines-1.webp', 'Patron PDF lettrines copperplate', 1, 1);

-- ============================================================
-- 4. NOUVEAUX CLIENTS (id 301 à 320)
-- Mot de passe : Test1234! => $2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m
-- ============================================================
INSERT INTO users (id, email, password_hash, first_name, last_name, role, locale, is_active) VALUES
-- Romands (FR)
(301, 'sophie.bernard@gmail.com',    '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Sophie',    'Bernard',    'client', 'fr', 1),
(302, 'nathalie.favre@bluewin.ch',   '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Nathalie',  'Favre',      'client', 'fr', 1),
(303, 'laura.simon@gmail.com',       '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Laura',     'Simon',      'client', 'fr', 1),
(304, 'veronique.martin@bluewin.ch', '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Véronique', 'Martin',     'client', 'fr', 1),
(305, 'amelie.richard@gmail.com',    '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Amélie',    'Richard',    'client', 'fr', 1),
(306, 'cecile.dubois@bluewin.ch',    '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Cécile',    'Dubois',     'client', 'fr', 1),
(307, 'elisa.chevalier@gmail.com',   '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Elisa',     'Chevalier',  'client', 'fr', 1),
-- Alémaniques (DE)
(308, 'ursula.zimmermann@gmx.ch',    '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Ursula',    'Zimmermann', 'client', 'de', 1),
(309, 'brigitte.huber@bluewin.ch',   '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Brigitte',  'Huber',      'client', 'de', 1),
(310, 'monika.steiner@gmx.ch',       '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Monika',    'Steiner',    'client', 'de', 1),
(311, 'katharina.wolf@bluewin.ch',   '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Katharina', 'Wolf',       'client', 'de', 1),
(312, 'claudia.bauer@gmx.ch',        '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Claudia',   'Bauer',      'client', 'de', 1),
(313, 'renate.fischer@bluewin.ch',   '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Renate',    'Fischer',    'client', 'de', 1),
-- Tessin (IT speaking, locale FR par défaut)
(314, 'giulia.rossi@gmail.com',      '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Giulia',    'Rossi',      'client', 'fr', 1),
(315, 'francesca.ferrari@bluewin.ch','$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Francesca', 'Ferrari',    'client', 'fr', 1),
-- Anglophones (expats)
(316, 'emily.watson@gmail.com',      '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Emily',     'Watson',     'client', 'en', 1),
(317, 'sarah.johnson@gmail.com',     '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Sarah',     'Johnson',    'client', 'en', 1),
-- Clients inactifs / supprimés
(318, 'anne.leclerc@gmail.com',      '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Anne',      'Leclerc',    'client', 'fr', 0),
(319, 'thomas.graf@bluewin.ch',      '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Thomas',    'Graf',       'client', 'de', 1),
(320, 'linda.meier@gmx.ch',          '$2b$12$wvMubT5PYwPRyI.We8ua0eisSQo9JxFI7oVaF5YuA3v20BpolYg8m', 'Linda',     'Meier',      'client', 'de', 1);

-- Adresses clients
INSERT INTO addresses (user_id, label, street, city, zip, country, canton, is_default) VALUES
(301, 'Domicile', '14 Chemin des Vignes',      'Lutry',         '1095', 'CH', 'VD', 1),
(302, 'Domicile', '3 Rue du Midi',             'Sion',          '1950', 'CH', 'VS', 1),
(303, 'Domicile', '27 Avenue de la Gare',      'Morges',        '1110', 'CH', 'VD', 1),
(304, 'Domicile', '8 Route de Genève',         'Nyon',          '1260', 'CH', 'VD', 1),
(305, 'Domicile', '52 Rue de Rive',            'Genève',        '1204', 'CH', 'GE', 1),
(306, 'Domicile', '19 Boulevard de la Paix',   'La Chaux-de-Fonds', '2300', 'CH', 'NE', 1),
(307, 'Domicile', '6 Rue des Alpes',           'Aigle',         '1860', 'CH', 'VD', 1),
(308, 'Zuhause',  'Dorfstrasse 12',            'Wollerau',      '8832', 'CH', 'SZ', 1),
(309, 'Zuhause',  'Bahnhofstrasse 45',         'Olten',         '4600', 'CH', 'SO', 1),
(310, 'Zuhause',  'Hauptgasse 7',              'Solothurn',     '4500', 'CH', 'SO', 1),
(311, 'Zuhause',  'Rathausplatz 3',            'Zug',           '6300', 'CH', 'ZG', 1),
(312, 'Zuhause',  'Seestrasse 88',             'Küsnacht',      '8700', 'CH', 'ZH', 1),
(313, 'Zuhause',  'Marktgasse 21',             'Thun',          '3600', 'CH', 'BE', 1),
(314, 'Casa',     'Via Nassa 14',              'Lugano',        '6900', 'CH', 'TI', 1),
(315, 'Casa',     'Via Cattedrale 9',          'Bellinzona',    '6500', 'CH', 'TI', 1),
(316, 'Home',     '3 Rue de Rive',             'Geneva',        '1204', 'CH', 'GE', 1),
(317, 'Home',     '12 Avenue des Bains',       'Lausanne',      '1005', 'CH', 'VD', 1),
(318, 'Domicile', '5 Rue de la Croix',         'Yverdon',       '1400', 'CH', 'VD', 1),
(319, 'Zuhause',  'Industriestrasse 4',        'Aarau',         '5000', 'CH', 'AG', 1),
(320, 'Zuhause',  'Kirchgasse 16',             'Frauenfeld',    '8500', 'CH', 'TG', 1);

-- ============================================================
-- 5. COMMANDES (102 à 145)
-- Répartition réaliste des statuts et méthodes de paiement
-- ============================================================
INSERT INTO orders (id, user_id, status, subtotal, discount, coupon_code, shipping_cost, tax_amount, total,
  shipping_street, shipping_city, shipping_zip, shipping_country, shipping_canton, tracking_number, created_at, updated_at) VALUES

-- Janvier 2026 — commandes livrées
(102, 301, 'delivered', 94.80, 0.00, NULL, 8.50, 7.44, 110.74, '14 Chemin des Vignes', 'Lutry',     '1095','CH','VD', 'CH123456789CH', '2026-01-08 10:14:00', '2026-01-14 09:00:00'),
(103, 309, 'delivered', 49.90, 0.00, NULL, 8.50, 4.00,  62.40, 'Bahnhofstrasse 45',   'Olten',     '4600','CH','SO', 'CH223456789CH', '2026-01-12 14:32:00', '2026-01-18 11:00:00'),
(104, 302, 'delivered', 74.80, 0.00, NULL, 8.50, 5.87,  89.17, '3 Rue du Midi',       'Sion',      '1950','CH','VS', 'CH323456789CH', '2026-01-19 09:05:00', '2026-01-25 10:00:00'),
(105, 310, 'delivered', 39.90, 0.00, NULL, 8.50, 3.19,  51.59, 'Hauptgasse 7',        'Solothurn', '4500','CH','SO', 'CH423456789CH', '2026-01-22 16:18:00', '2026-01-28 14:00:00'),

-- Février 2026
(106, 303, 'delivered', 89.70, 0.00, NULL, 8.50, 7.08, 105.28, '27 Avenue de la Gare','Morges',    '1110','CH','VD', 'CH523456789CH', '2026-02-03 11:45:00', '2026-02-09 10:00:00'),
(107, 311, 'delivered', 59.90, 0.00, NULL, 8.50, 4.80,  73.20, 'Rathausplatz 3',      'Zug',       '6300','CH','ZG', 'CH623456789CH', '2026-02-10 08:20:00', '2026-02-16 09:00:00'),
(108, 316, 'delivered', 44.80, 0.00, NULL, 8.50, 3.56,  56.86, '3 Rue de Rive',       'Geneva',    '1204','CH','GE', 'CH723456789CH', '2026-02-14 15:10:00', '2026-02-20 11:00:00'),
(109, 304, 'refunded',  49.90, 0.00, NULL, 8.50, 4.00,  62.40, '8 Route de Genève',   'Nyon',      '1260','CH','VD', NULL,             '2026-02-18 10:30:00', '2026-02-25 14:00:00'),

-- Mars 2026
(110, 305, 'delivered', 79.80, 7.98, 'ETE2026', 8.50, 5.72,  86.04, '52 Rue de Rive',     'Genève',    '1204','CH','GE', 'CH823456789CH', '2026-03-02 13:22:00', '2026-03-08 10:00:00'),
(111, 308, 'delivered', 54.80, 0.00, NULL,      8.50, 4.38,  67.68, 'Dorfstrasse 12',     'Wollerau',  '8832','CH','SZ', 'CH923456789CH', '2026-03-11 09:55:00', '2026-03-17 10:00:00'),
(112, 312, 'delivered', 49.90, 0.00, NULL,      8.50, 4.00,  62.40, 'Seestrasse 88',      'Küsnacht',  '8700','CH','ZH', 'CH103456789CH', '2026-03-15 17:40:00', '2026-03-21 09:00:00'),
(113, 314, 'delivered', 34.90, 3.49, 'FIDELE5', 8.50, 2.55,  42.46, 'Via Nassa 14',       'Lugano',    '6900','CH','TI', 'CH113456789CH', '2026-03-22 11:15:00', '2026-03-28 11:00:00'),

-- Avril 2026
(114, 306, 'delivered', 64.80, 0.00, NULL,      8.50, 5.17,  78.47, '19 Boulevard de la Paix','La Chaux-de-Fonds','2300','CH','NE','CH124456789CH','2026-04-05 10:00:00', '2026-04-11 09:00:00'),
(115, 313, 'delivered', 44.90, 0.00, NULL,      8.50, 3.59,  56.99, 'Marktgasse 21',      'Thun',      '3600','CH','BE', 'CH134456789CH', '2026-04-08 14:10:00', '2026-04-14 11:00:00'),
(116, 317, 'delivered', 59.80, 8.97, 'BIENVENUE10', 8.50, 4.07, 63.40, '12 Avenue des Bains','Lausanne', '1005','CH','VD','CH144456789CH','2026-04-12 09:30:00', '2026-04-18 10:00:00'),
(117, 301, 'delivered', 89.80, 0.00, NULL,      8.50, 7.17, 105.47, '14 Chemin des Vignes','Lutry',    '1095','CH','VD', 'CH154456789CH', '2026-04-19 16:05:00', '2026-04-25 10:00:00'),
(118, 319, 'paid',      54.80, 0.00, NULL,      8.50, 4.38,  67.68, 'Industriestrasse 4', 'Aarau',     '5000','CH','AG', NULL,             '2026-04-26 11:20:00', '2026-04-26 12:00:00'),
(119, 315, 'shipped',   39.80, 0.00, NULL,      8.50, 3.18,  51.48, 'Via Cattedrale 9',  'Bellinzona','6500','CH','TI', 'CH164456789CH', '2026-04-28 10:45:00', '2026-04-30 14:00:00'),

-- Mai 2026
(120, 303, 'shipped',   74.80, 0.00, NULL,      8.50, 5.97,  89.27, '27 Avenue de la Gare','Morges',  '1110','CH','VD', 'CH174456789CH', '2026-05-02 09:15:00', '2026-05-04 11:00:00'),
(121, 320, 'paid',      29.90, 0.00, NULL,      8.50, 2.39,  40.79, 'Kirchgasse 16',      'Frauenfeld','8500','CH','TG', NULL,             '2026-05-03 15:30:00', '2026-05-03 16:00:00'),
(122, 307, 'processing', 49.90,0.00, NULL,      8.50, 3.99,  62.39, '6 Rue des Alpes',   'Aigle',    '1860','CH','VD', NULL,             '2026-05-05 10:00:00', '2026-05-05 11:00:00'),
(123, 308, 'processing', 64.80,0.00, NULL,      8.50, 5.17,  78.47, 'Dorfstrasse 12',    'Wollerau', '8832','CH','SZ', NULL,             '2026-05-06 08:45:00', '2026-05-06 09:30:00'),
(124, 316, 'paid',       79.80,0.00, NULL,      8.50, 6.37,  94.67, '3 Rue de Rive',     'Geneva',   '1204','CH','GE', NULL,             '2026-05-06 14:20:00', '2026-05-06 15:00:00'),
(125, 302, 'paid',       54.80,0.00, NULL,      8.50, 4.38,  67.68, '3 Rue du Midi',     'Sion',     '1950','CH','VS', NULL,             '2026-05-07 11:10:00', '2026-05-07 12:00:00'),
(126, 311, 'processing', 44.80,0.00, NULL,      8.50, 3.57,  56.87, 'Rathausplatz 3',    'Zug',      '6300','CH','ZG', NULL,             '2026-05-07 16:00:00', '2026-05-07 17:00:00'),
(127, 305, 'pending',    34.90,0.00, NULL,      8.50, 2.79,  46.19, '52 Rue de Rive',    'Genève',   '1204','CH','GE', NULL,             '2026-05-08 09:00:00', '2026-05-08 09:00:00'),
(128, 317, 'pending',    59.90,0.00, NULL,      8.50, 4.79,  73.19, '12 Avenue des Bains','Lausanne','1005','CH','VD', NULL,             '2026-05-08 14:30:00', '2026-05-08 14:30:00'),
(129, 310, 'pending',    49.90,0.00, NULL,      8.50, 3.99,  62.39, 'Hauptgasse 7',      'Solothurn','4500','CH','SO', NULL,             '2026-05-09 08:15:00', '2026-05-09 08:15:00'),
(130, 312, 'awaiting_payment',24.80,0.00,NULL,  8.50, 1.98,  35.28, 'Seestrasse 88',     'Küsnacht', '8700','CH','ZH', NULL,             '2026-05-09 10:00:00', '2026-05-09 10:00:00'),
(131, 306, 'awaiting_payment',39.90,0.00,NULL,  8.50, 3.19,  51.59, '19 Boulevard de la Paix','La Chaux-de-Fonds','2300','CH','NE',NULL,'2026-05-09 11:30:00', '2026-05-09 11:30:00'),
(132, 314, 'cancelled',  29.90,0.00, NULL,      8.50, 2.39,  40.79, 'Via Nassa 14',      'Lugano',   '6900','CH','TI', NULL,             '2026-04-30 13:00:00', '2026-05-01 10:00:00');

-- ============================================================
-- 6. ARTICLES DES COMMANDES
-- ============================================================
INSERT INTO order_items (order_id, product_id, quantity, unit_price, tax_rate_snapshot, product_snapshot_json) VALUES
-- Commande 102 (Sophie Bernard : Kit chalet + Coffret DMC pastels)
(102, 16, 1, 59.90, 8.10, '{"name":"Kit point de croix — Chalet alpin","sku":"KIT-PDC-016"}'),
(102, 33, 1, 18.90, 8.10, '{"name":"Coffret fils DMC — 24 couleurs pastels","sku":"COF-DMC-PAST"}'),
-- Commande 103 (Brigitte Huber : Kit Alpes Suisses existant)
(103,  1, 1, 49.90, 8.10, '{"name":"Kit point de croix — Alpes Suisses","sku":"KIT-PDC-001"}'),
-- Commande 104 (Nathalie Favre : Kit fleurs sauvages + cerceau 20cm)
(104, 23, 1, 36.90, 8.10, '{"name":"Kit broderie libre — Fleurs sauvages","sku":"KIT-BL-023"}'),
(104, 44, 1, 18.90, 8.10, '{"name":"Toile de lin naturel 28ct — 50x70cm","sku":"TOI-LIN-28"}'),
-- Commande 105 (Monika Steiner : Kit mandala zen)
(105, 19, 1, 34.90, 8.10, '{"name":"Kit point de croix — Mandala zen","sku":"KIT-PDC-005"}'),
-- Commande 106 (Laura Simon : Kit ours brun + coffret fils anchor)
(106,  8, 1, 16.90, 8.10, '{"name":"Coffret fils Anchor — 20 couleurs","sku":"COF-ANC-20"}'),
(106, 18, 1, 39.90, 8.10, '{"name":"Kit point de croix — Ours brun","sku":"KIT-PDC-004"}'),
(106, 33, 1, 18.90, 8.10, '{"name":"Coffret fils DMC — 24 couleurs pastels","sku":"COF-DMC-PAST"}'),
-- Commande 107 (Katharina Wolf : Kit lac Léman)
(107, 17, 1, 44.90, 8.10, '{"name":"Kit point de croix — Lac Léman","sku":"KIT-PDC-003"}'),
(107, 44, 1, 15.00, 8.10, '{"name":"Cerceau à broder bois 20cm","sku":"CER-BOI-20"}'),
-- Commande 108 (Emily Watson : Kit fleurs + cerceau 15cm)
(108,  2, 1, 34.90, 8.10, '{"name":"Kit point de croix — Fleurs des champs","sku":"KIT-PDC-001B"}'),
(108, 12, 1,  4.90, 8.10, '{"name":"Cerceau à broder en bois — 15cm","sku":"CER-BOI-15"}'),
(108, 50, 1,  5.00, 8.10, '{"name":"Aiguilles à broder pointe n°7","sku":"AIG-BRO-07"}'),
-- Commande 109 (Véronique Martin : Kit remboursé)
(109,  1, 1, 49.90, 8.10, '{"name":"Kit point de croix — Alpes Suisses","sku":"KIT-PDC-001"}'),
-- Commande 110 (Amélie Richard avec coupon ETE2026)
(110,  3, 1, 29.90, 8.10, '{"name":"Kit broderie libre — Lavande de Provence","sku":"KIT-BL-001"}'),
(110, 23, 1, 36.90, 8.10, '{"name":"Kit broderie libre — Fleurs sauvages","sku":"KIT-BL-023"}'),
-- Commande 111 (Ursula Zimmermann)
(111, 17, 1, 44.90, 8.10, '{"name":"Kit point de croix — Lac Léman","sku":"KIT-PDC-003"}'),
(111, 43, 1,  3.90, 8.10, '{"name":"Cerceau à broder bois 10cm","sku":"CER-BOI-10"}'),
-- Commande 112 (Claudia Bauer)
(112,  1, 1, 49.90, 8.10, '{"name":"Kit point de croix — Alpes Suisses","sku":"KIT-PDC-001"}'),
-- Commande 113 (Giulia Rossi avec coupon FIDELE5)
(113,  2, 1, 34.90, 8.10, '{"name":"Kit point de croix — Fleurs des champs","sku":"KIT-PDC-001B"}'),
-- Commande 114 (Cécile Dubois)
(114, 16, 1, 59.90, 8.10, '{"name":"Kit point de croix — Chalet alpin","sku":"KIT-PDC-016"}'),
(114, 43, 1,  3.90, 8.10, '{"name":"Cerceau à broder bois 10cm","sku":"CER-BOI-10"}'),
-- Commande 115 (Renate Fischer)
(115, 17, 1, 44.90, 8.10, '{"name":"Kit point de croix — Lac Léman","sku":"KIT-PDC-003"}'),
-- Commande 116 (Sarah Johnson avec coupon BIENVENUE10)
(116,  3, 1, 29.90, 8.10, '{"name":"Kit broderie libre — Lavande de Provence","sku":"KIT-BL-001"}'),
(116, 24, 1, 32.90, 8.10, '{"name":"Kit broderie — Boho dreamcatcher","sku":"KIT-BL-003"}'),
-- Commande 117 (Sophie Bernard 2e commande)
(117, 21, 1, 49.90, 8.10, '{"name":"Kit point de croix — Noël Sapins","sku":"KIT-PDC-007"}'),
(117, 38, 1, 24.90, 8.10, '{"name":"Coffret fils Madeira — 20 couleurs","sku":"COF-MAD-020"}'),
-- Commande 118 (Thomas Graf)
(118, 23, 1, 36.90, 8.10, '{"name":"Kit broderie libre — Fleurs sauvages","sku":"KIT-BL-023"}'),
(118, 44, 1,  5.90, 8.10, '{"name":"Cerceau à broder bois 20cm","sku":"CER-BOI-20"}'),
-- Commande 119 (Francesca Ferrari)
(119, 25, 1, 28.90, 8.10, '{"name":"Kit broderie — Couronne végétale","sku":"KIT-BL-004"}'),
(119, 49, 1,  2.90, 8.10, '{"name":"Aiguilles de tapisserie n°24","sku":"AIG-TAP-24"}'),
-- Commande 120 (Laura Simon 2e)
(120,  4, 1, 39.90, 8.10, '{"name":"Kit broderie libre — Animaux de la forêt","sku":"KIT-BL-005B"}'),
(120, 27, 1, 38.90, 8.10, '{"name":"Kit broderie — Paysage d''automne","sku":"KIT-BL-006"}'),
-- Commande 121 (Linda Meier)
(121,  3, 1, 29.90, 8.10, '{"name":"Kit broderie libre — Lavande de Provence","sku":"KIT-BL-001"}'),
-- Commande 122 (Elisa Chevalier)
(122,  1, 1, 49.90, 8.10, '{"name":"Kit point de croix — Alpes Suisses","sku":"KIT-PDC-001"}'),
-- Commande 123 (Ursula Zimmermann 2e)
(123, 16, 1, 59.90, 8.10, '{"name":"Kit point de croix — Chalet alpin","sku":"KIT-PDC-016"}'),
(123, 43, 1,  3.90, 8.10, '{"name":"Cerceau à broder bois 10cm","sku":"CER-BOI-10"}'),
-- Commande 124 (Emily Watson 2e)
(124, 26, 1, 42.90, 8.10, '{"name":"Kit broderie — Portrait de chat","sku":"KIT-BL-005"}'),
(124, 37, 1,  3.50, 8.10, '{"name":"Fil Madeira — Métallisé argent","sku":"FIL-MAD-M02"}'),
(124,  9, 1, 18.90, 8.10, '{"name":"Toile Aida blanc 18ct — 50x70cm","sku":"TOI-AID-B18"}'),
-- Commande 125 (Nathalie Favre 2e)
(125, 22, 1, 54.90, 8.10, '{"name":"Kit point de croix — Moutons de l''Engadine","sku":"KIT-PDC-008"}'),
-- Commande 126 (Katharina Wolf 2e)
(126, 25, 1, 28.90, 8.10, '{"name":"Kit broderie — Couronne végétale","sku":"KIT-BL-004"}'),
(126, 51, 1,  6.90, 8.10, '{"name":"Kit aiguilles — Assortiment 20 pcs","sku":"AIG-ASS-20"}'),
-- Commande 127 (Amélie Richard en attente)
(127,  2, 1, 34.90, 8.10, '{"name":"Kit point de croix — Fleurs des champs","sku":"KIT-PDC-001B"}'),
-- Commande 128 (Sarah Johnson en attente)
(128, 17, 1, 44.90, 8.10, '{"name":"Kit point de croix — Lac Léman","sku":"KIT-PDC-003"}'),
(128, 44, 1,  5.90, 8.10, '{"name":"Cerceau à broder bois 20cm","sku":"CER-BOI-20"}'),
-- Commande 129 (Monika Steiner en attente)
(129, 19, 1, 34.90, 8.10, '{"name":"Kit point de croix — Mandala zen","sku":"KIT-PDC-005"}'),
(129, 49, 1,  2.90, 8.10, '{"name":"Aiguilles de tapisserie n°24","sku":"AIG-TAP-24"}'),
-- Commande 130 (Claudia Bauer en attente paiement)
(130, 31, 2,  1.90, 8.10, '{"name":"Fil DMC — Rose poudré 3716","sku":"FIL-DMC-3716"}'),
(130, 28, 2,  1.90, 8.10, '{"name":"Fil DMC — Bleu royal 820","sku":"FIL-DMC-820"}'),
(130, 30, 2,  1.90, 8.10, '{"name":"Fil DMC — Jaune soleil 444","sku":"FIL-DMC-444"}'),
(130, 29, 2,  1.90, 8.10, '{"name":"Fil DMC — Vert forêt 319","sku":"FIL-DMC-319"}'),
-- Commande 131 (Cécile Dubois en attente paiement)
(131, 20, 1, 29.90, 8.10, '{"name":"Kit point de croix — Papillons","sku":"KIT-PDC-006"}'),
(131, 43, 1,  3.90, 8.10, '{"name":"Cerceau à broder bois 10cm","sku":"CER-BOI-10"}'),
-- Commande 132 (Giulia Rossi annulée)
(132,  3, 1, 29.90, 8.10, '{"name":"Kit broderie libre — Lavande de Provence","sku":"KIT-BL-001"}');

-- ============================================================
-- 7. HISTORIQUE STATUTS COMMANDES
-- ============================================================
INSERT INTO order_status_history (order_id, status, note, created_by, created_at) VALUES
(102,'paid',      'Paiement Twint reçu',                  293, '2026-01-08 10:20:00'),
(102,'processing','En cours de préparation',               293, '2026-01-09 08:00:00'),
(102,'shipped',   'Expédié via Swiss Post — CH123456789CH',293, '2026-01-11 14:00:00'),
(102,'delivered', 'Livré avec succès',                     293, '2026-01-14 09:00:00'),
(103,'paid',      'Paiement carte Stripe',                 293, '2026-01-12 14:40:00'),
(103,'processing','Préparation commande',                  293, '2026-01-13 09:00:00'),
(103,'shipped',   'Expédié — CH223456789CH',               293, '2026-01-15 11:00:00'),
(103,'delivered', 'Livré',                                 293, '2026-01-18 11:00:00'),
(104,'paid',      'Paiement carte Stripe',                 293, '2026-01-19 09:15:00'),
(104,'processing','Préparation commande',                  293, '2026-01-20 08:00:00'),
(104,'shipped',   'Expédié — CH323456789CH',               293, '2026-01-22 10:00:00'),
(104,'delivered', 'Livré',                                 293, '2026-01-25 10:00:00'),
(105,'paid',      'Paiement Twint',                        293, '2026-01-22 16:25:00'),
(105,'shipped',   'Expédié — CH423456789CH',               293, '2026-01-24 10:00:00'),
(105,'delivered', 'Livré',                                 293, '2026-01-28 14:00:00'),
(106,'paid',      'Paiement Twint reçu',                   293, '2026-02-03 12:00:00'),
(106,'processing','En préparation',                        293, '2026-02-04 09:00:00'),
(106,'shipped',   'Expédié — CH523456789CH',               293, '2026-02-06 11:00:00'),
(106,'delivered', 'Livré',                                 293, '2026-02-09 10:00:00'),
(107,'paid',      'Paiement carte',                        293, '2026-02-10 08:30:00'),
(107,'shipped',   'Expédié — CH623456789CH',               293, '2026-02-13 10:00:00'),
(107,'delivered', 'Livré',                                 293, '2026-02-16 09:00:00'),
(108,'paid',      'Paiement carte Stripe',                 293, '2026-02-14 15:20:00'),
(108,'shipped',   'Expédié — CH723456789CH',               293, '2026-02-17 11:00:00'),
(108,'delivered', 'Livré',                                 293, '2026-02-20 11:00:00'),
(109,'paid',      'Paiement facture',                      293, '2026-02-18 10:45:00'),
(109,'refunded',  'Remboursement suite retour — article défectueux', 293, '2026-02-25 14:00:00'),
(110,'paid',      'Paiement Twint — coupon ETE2026 appliqué', 293, '2026-03-02 13:35:00'),
(110,'processing','Préparation',                           293, '2026-03-03 09:00:00'),
(110,'shipped',   'Expédié — CH823456789CH',               293, '2026-03-05 10:00:00'),
(110,'delivered', 'Livré',                                 293, '2026-03-08 10:00:00'),
(111,'paid',      'Paiement carte',                        293, '2026-03-11 10:10:00'),
(111,'shipped',   'Expédié — CH923456789CH',               293, '2026-03-14 10:00:00'),
(111,'delivered', 'Livré',                                 293, '2026-03-17 10:00:00'),
(112,'paid',      'Paiement Twint',                        293, '2026-03-15 17:50:00'),
(112,'shipped',   'Expédié — CH103456789CH',               293, '2026-03-18 11:00:00'),
(112,'delivered', 'Livré',                                 293, '2026-03-21 09:00:00'),
(113,'paid',      'Paiement facture — coupon FIDELE5 appliqué', 293, '2026-03-22 11:30:00'),
(113,'shipped',   'Expédié — CH113456789CH',               293, '2026-03-25 10:00:00'),
(113,'delivered', 'Livré',                                 293, '2026-03-28 11:00:00'),
(114,'paid',      'Paiement carte',                        293, '2026-04-05 10:15:00'),
(114,'processing','Préparation',                           293, '2026-04-07 09:00:00'),
(114,'shipped',   'Expédié — CH124456789CH',               293, '2026-04-08 11:00:00'),
(114,'delivered', 'Livré',                                 293, '2026-04-11 09:00:00'),
(115,'paid',      'Paiement Twint',                        293, '2026-04-08 14:20:00'),
(115,'shipped',   'Expédié — CH134456789CH',               293, '2026-04-11 10:00:00'),
(115,'delivered', 'Livré',                                 293, '2026-04-14 11:00:00'),
(116,'paid',      'Paiement carte — coupon BIENVENUE10 appliqué', 293, '2026-04-12 09:45:00'),
(116,'shipped',   'Expédié — CH144456789CH',               293, '2026-04-15 10:00:00'),
(116,'delivered', 'Livré',                                 293, '2026-04-18 10:00:00'),
(117,'paid',      'Paiement Twint',                        293, '2026-04-19 16:20:00'),
(117,'processing','Préparation',                           293, '2026-04-21 09:00:00'),
(117,'shipped',   'Expédié — CH154456789CH',               293, '2026-04-22 11:00:00'),
(117,'delivered', 'Livré',                                 293, '2026-04-25 10:00:00'),
(118,'paid',      'Paiement carte Stripe',                 293, '2026-04-26 11:30:00'),
(119,'paid',      'Paiement Twint',                        293, '2026-04-28 11:00:00'),
(119,'shipped',   'Expédié — CH164456789CH',               293, '2026-04-30 14:00:00'),
(120,'paid',      'Paiement carte',                        293, '2026-05-02 09:30:00'),
(120,'shipped',   'Expédié — CH174456789CH',               293, '2026-05-04 11:00:00'),
(121,'paid',      'Paiement Twint',                        293, '2026-05-03 15:45:00'),
(122,'paid',      'Paiement carte Stripe',                 293, '2026-05-05 10:15:00'),
(122,'processing','En cours de préparation',               293, '2026-05-05 11:00:00'),
(123,'paid',      'Paiement Twint',                        293, '2026-05-06 09:00:00'),
(123,'processing','Préparation en cours',                  293, '2026-05-06 09:30:00'),
(124,'paid',      'Paiement carte Stripe',                 293, '2026-05-06 14:35:00'),
(125,'paid',      'Paiement Twint',                        293, '2026-05-07 11:25:00'),
(126,'paid',      'Paiement carte',                        293, '2026-05-07 16:15:00'),
(126,'processing','En préparation',                        293, '2026-05-07 17:00:00'),
(127,'pending',   'Commande créée',                        NULL, '2026-05-08 09:00:00'),
(128,'pending',   'Commande créée',                        NULL, '2026-05-08 14:30:00'),
(129,'pending',   'Commande créée',                        NULL, '2026-05-09 08:15:00'),
(130,'awaiting_payment','En attente du paiement Twint',    NULL, '2026-05-09 10:00:00'),
(131,'awaiting_payment','En attente du paiement carte',    NULL, '2026-05-09 11:30:00'),
(132,'pending',   'Commande créée',                        NULL, '2026-04-30 13:00:00'),
(132,'cancelled', 'Client a annulé — changement d''avis',  293, '2026-05-01 10:00:00');

-- ============================================================
-- 8. PAIEMENTS
-- ============================================================
INSERT INTO payments (order_id, provider, provider_payment_id, amount, currency, method, status) VALUES
(102, 'stripe', 'pi_test_102_twint',  110.74, 'CHF', 'twint',   'succeeded'),
(103, 'stripe', 'pi_test_103_card',    62.40, 'CHF', 'card',    'succeeded'),
(104, 'stripe', 'pi_test_104_card',    89.17, 'CHF', 'card',    'succeeded'),
(105, 'stripe', 'pi_test_105_twint',   51.59, 'CHF', 'twint',   'succeeded'),
(106, 'stripe', 'pi_test_106_twint',  105.28, 'CHF', 'twint',   'succeeded'),
(107, 'stripe', 'pi_test_107_card',    73.20, 'CHF', 'card',    'succeeded'),
(108, 'stripe', 'pi_test_108_card',    56.86, 'CHF', 'card',    'succeeded'),
(109, 'stripe', 'pi_test_109_inv',     62.40, 'CHF', 'invoice', 'refunded'),
(110, 'stripe', 'pi_test_110_twint',   86.04, 'CHF', 'twint',   'succeeded'),
(111, 'stripe', 'pi_test_111_card',    67.68, 'CHF', 'card',    'succeeded'),
(112, 'stripe', 'pi_test_112_twint',   62.40, 'CHF', 'twint',   'succeeded'),
(113, 'stripe', 'pi_test_113_inv',     42.46, 'CHF', 'invoice', 'succeeded'),
(114, 'stripe', 'pi_test_114_card',    78.47, 'CHF', 'card',    'succeeded'),
(115, 'stripe', 'pi_test_115_twint',   56.99, 'CHF', 'twint',   'succeeded'),
(116, 'stripe', 'pi_test_116_card',    63.40, 'CHF', 'card',    'succeeded'),
(117, 'stripe', 'pi_test_117_twint',  105.47, 'CHF', 'twint',   'succeeded'),
(118, 'stripe', 'pi_test_118_card',    67.68, 'CHF', 'card',    'succeeded'),
(119, 'stripe', 'pi_test_119_twint',   51.48, 'CHF', 'twint',   'succeeded'),
(120, 'stripe', 'pi_test_120_card',    89.27, 'CHF', 'card',    'succeeded'),
(121, 'stripe', 'pi_test_121_twint',   40.79, 'CHF', 'twint',   'succeeded'),
(122, 'stripe', 'pi_test_122_card',    62.39, 'CHF', 'card',    'succeeded'),
(123, 'stripe', 'pi_test_123_twint',   78.47, 'CHF', 'twint',   'succeeded'),
(124, 'stripe', 'pi_test_124_card',    94.67, 'CHF', 'card',    'succeeded'),
(125, 'stripe', 'pi_test_125_twint',   67.68, 'CHF', 'twint',   'succeeded'),
(126, 'stripe', 'pi_test_126_card',    56.87, 'CHF', 'card',    'succeeded'),
(130, 'stripe', 'pi_test_130_twint',   35.28, 'CHF', 'twint',   'pending'),
(131, 'stripe', 'pi_test_131_card',    51.59, 'CHF', 'card',    'pending');

-- ============================================================
-- 9. AVIS CLIENTS (24 à 50)
-- ============================================================
INSERT INTO reviews (id, user_id, product_id, rating, title, body, is_approved, created_at) VALUES
-- Produits existants (1-15)
(24, 301, 16, 5, 'Magnifique kit !',        'Le chalet alpin est superbe à broder. Les fils DMC inclus sont de très bonne qualité. Je recommande vivement !', 1, '2026-01-20 10:00:00'),
(25, 309,  1, 4, 'Très beau motif',         'Kit bien conçu, toile de qualité. Le niveau est bien adapté aux intermédiaires. Les couleurs sont fidèles.', 1, '2026-01-25 14:00:00'),
(26, 302, 23, 5, 'Broderie libre superbe',  'Le kit fleurs sauvages est une vraie réussite. Les instructions sont claires et le résultat est bluffant.', 1, '2026-02-05 09:00:00'),
(27, 310, 19, 4, 'Mandala apaisant',        'Sehr schönes Muster, gut für Anfänger geeignet. Die Farben sind harmonisch. Klare Anleitung.', 1, '2026-02-10 11:00:00'),
(28, 303,  8, 5, 'Coffret de qualité',      'Les fils Anchor sont vraiment supérieurs. Les couleurs sont intenses et ne décolorent pas au lavage.', 1, '2026-02-15 16:00:00'),
(29, 311, 17, 4, 'Lac Léman magnifique',    'Das Genfersee-Motiv ist wunderschön. Die Qualität ist sehr gut und der Schwierigkeitsgrad passt.', 1, '2026-02-22 10:00:00'),
(30, 316,  2, 5, 'Beautiful kit !',         'Lovely kit, very clear instructions. The fabric quality is excellent. Will definitely buy again.', 1, '2026-03-01 14:00:00'),
(31, 305,  3, 5, 'Kit lavande parfait',     'La lavande est magnifique à broder. C''est mon 3e kit de cette boutique et je suis toujours aussi satisfaite.', 1, '2026-03-10 09:00:00'),
(32, 308,  1, 5, 'Toujours au top',         'Wunderbar! Das Schweizer Alpenmotiv ist perfekt. Sehr hochwertige Materialien. 5 Sterne verdient.', 1, '2026-03-18 11:00:00'),
(33, 312,  1, 3, 'Bien mais livraison lente','Le kit est de bonne qualité mais la livraison a pris plus de temps que prévu. Le produit lui-même est satisfaisant.', 1, '2026-03-25 10:00:00'),
(34, 314,  2, 5, 'Regalo perfetto !',       'Kit bellissimo, ricevuto in ottime condizioni. Le istruzioni sono molto chiare. Ottima qualità.', 1, '2026-04-02 14:00:00'),
(35, 306, 16, 5, 'Le chalet, un régal !',   'J''ai offert ce kit à ma mère et elle adore. Le résultat est digne d''un tableau. Merci !', 1, '2026-04-15 09:00:00'),
(36, 313, 17, 4, 'Schönes Motiv',           'Sehr schönes Motiv vom Genfersee. Die Anleitung könnte etwas detaillierter sein, aber das Ergebnis ist toll.', 1, '2026-04-20 11:00:00'),
(37, 317,  3, 5, 'Wonderful product !',     'The lavender kit is stunning. Very relaxing to stitch and the end result is beautiful. Fast shipping too!', 1, '2026-04-25 14:00:00'),
(38, 301, 21, 4, 'Parfait pour Noël',       'Ce kit de Noël est très joli. Je l''ai terminé fin novembre pour décorer la maison. Très satisfaite.', 1, '2026-04-28 10:00:00'),
(39, 319, 23, 5, 'Tolle Blumen!',           'Das Wildblumen-Set ist fantastisch. Habe viel Freude beim Sticken und das Ergebnis hängt jetzt im Wohnzimmer.', 1, '2026-05-03 09:00:00'),
(40, 315,  2, 4, 'Kit molto bello',         'Kit di ottima qualità. Le istruzioni sono chiare e i materiali sono eccellenti. Consiglio vivamente.', 1, '2026-05-04 14:00:00'),
(41, 320, 33, 5, 'Superbe coffret DMC',     'Die Farbauswahl der Pastelltöne ist perfekt für Blumenstickereien. Sehr hochwertige DMC-Garne.', 1, '2026-05-06 10:00:00'),
-- Avis en attente de modération
(42, 302, 22, 5, 'Moutons d''Engadine',     'Édition limitée absolument magnifique. Les détails sont incroyables et les fils sont d''une qualité irréprochable.', 0, '2026-05-07 11:00:00'),
(43, 307, 27, 4, 'Paysage automne',         'Les couleurs d''automne sont sublimes. J''ai pris beaucoup de plaisir à broder ce paysage.', 0, '2026-05-08 09:00:00'),
(44, 316, 26, 5, 'Amazing cat portrait !', 'The cat portrait kit is incredible. Using Madeira silk really elevates the result. Worth every franc.', 0, '2026-05-08 14:00:00'),
(45, 308, 38, 4, 'Madeira Sortiment',      'Das Madeira-Sortiment ist hochwertig. Die Mischung aus Seide und Baumwolle ist angenehm zu verarbeiten.', 0, '2026-05-09 09:00:00'),
(46, 311, 36, 5, 'Seidenglanz perfekt',    'Der Madeira-Seidenfaden ist eine Klasse für sich. Unübertroffener Glanz und Griffigkeit.', 0, '2026-05-09 10:00:00');

-- ============================================================
-- 10. PROGRAMME DE FIDÉLITÉ — Comptes et transactions
-- ============================================================

-- Comptes fidélité pour les nouveaux clients
-- (total_spend = somme des commandes delivered/paid)
INSERT INTO loyalty_accounts (user_id, total_spend_chf, current_tier_id) VALUES
(301, 216.21, 11),  -- Sophie Bernard : 110.74 + 105.47 => Argent
(302,  89.17,  NULL), -- Nathalie Favre : une commande delivered, pas encore Bronze
(303, 105.28,  10), -- Laura Simon : 105.28 => Bronze
(304,   0.00,  NULL), -- Véronique Martin : commande remboursée, 0
(305,  86.04,  NULL), -- Amélie Richard : pas encore 100
(306,  78.47,  NULL), -- Cécile Dubois
(307,   0.00,  NULL), -- Elisa Chevalier : pas encore livré
(308,  67.68,  10), -- Ursula : Bronze
(309,  62.40,  NULL), -- Brigitte : pas encore 100
(310,  51.59,  NULL), -- Monika
(311,  73.20,  NULL), -- Katharina
(312,  62.40,  NULL), -- Claudia
(313,  56.99,  NULL), -- Renate
(314,  42.46,  NULL), -- Giulia
(315,  51.48,  NULL), -- Francesca
(316, 120.26,  10), -- Emily : 56.86 + 63.40 => Bronze
(317,  63.40,  NULL), -- Sarah
(319,  67.68,  NULL), -- Thomas
(320,  40.79,  NULL); -- Linda

-- Transactions fidélité
INSERT INTO loyalty_transactions (user_id, order_id, amount_chf, type) VALUES
(301, 102, 110.74, 'earn'),
(301, 117, 105.47, 'earn'),
(302, 104,  89.17, 'earn'),
(303, 106, 105.28, 'earn'),
(305, 110,  86.04, 'earn'),
(306, 114,  78.47, 'earn'),
(307, 122,  62.39, 'earn'),
(308, 111,  67.68, 'earn'),
(309, 103,  62.40, 'earn'),
(310, 105,  51.59, 'earn'),
(311, 107,  73.20, 'earn'),
(312, 112,  62.40, 'earn'),
(313, 115,  56.99, 'earn'),
(314, 113,  42.46, 'earn'),
(315, 119,  51.48, 'earn'),
(316, 108,  56.86, 'earn'),
(316, 116,  63.40, 'earn'),
(317, 116,  63.40, 'earn'),
(319, 118,  67.68, 'earn'),
(320, 121,  40.79, 'earn');

-- Récompense Bronze pour Sophie Bernard (palier atteint à 100 CHF)
INSERT INTO loyalty_rewards (user_id, tier_id, code, type, value, status, expires_at) VALUES
(301, 10, 'BRONZE-SB-2026', 'fixed', 10.00, 'available', '2026-08-08 00:00:00'),
(303, 10, 'BRONZE-LS-2026', 'fixed', 10.00, 'available', '2026-08-03 00:00:00'),
(308, 10, 'BRONZE-UZ-2026', 'fixed', 10.00, 'available', '2026-08-11 00:00:00'),
(316, 10, 'BRONZE-EW-2026', 'fixed', 10.00, 'available', '2026-08-06 00:00:00'),
-- Argent pour Sophie (palier atteint à 200 CHF)
(301, 11, 'ARGENT-SB-2026', 'fixed', 25.00, 'available', '2026-07-19 00:00:00');

-- ============================================================
-- 11. NEWSLETTER
-- ============================================================
INSERT INTO newsletter_subscribers (email, locale, is_active) VALUES
('sophie.bernard@gmail.com',    'fr', 1),
('nathalie.favre@bluewin.ch',   'fr', 1),
('laura.simon@gmail.com',       'fr', 1),
('amelie.richard@gmail.com',    'fr', 1),
('elisa.chevalier@gmail.com',   'fr', 1),
('ursula.zimmermann@gmx.ch',    'de', 1),
('brigitte.huber@bluewin.ch',   'de', 1),
('monika.steiner@gmx.ch',       'de', 1),
('emily.watson@gmail.com',      'en', 1),
('sarah.johnson@gmail.com',     'en', 1),
('anne.leclerc@gmail.com',      'fr', 0); -- désabonnée

SET FOREIGN_KEY_CHECKS = 1;
