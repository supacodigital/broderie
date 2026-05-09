-- ============================================================
-- ENRICHISSEMENT CATÉGORIES — Broderie E-Commerce CH
-- 10 catégories parentes (17-26)
-- 20 sous-catégories (27-46, 2 par parente)
-- 100 produits (61-160, 5 par sous-catégorie)
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = '';

-- ============================================================
-- 1. CATÉGORIES PARENTES (17 à 26)
-- ============================================================
INSERT INTO categories (id, parent_id, slug, sort_order) VALUES
(17, NULL, 'broderie-ruban',         6),
(18, NULL, 'broderie-perles',        7),
(19, NULL, 'tapisserie-canevas',     8),
(20, NULL, 'punch-needle',           9),
(21, NULL, 'macrame-tissage',        10),
(22, NULL, 'couture-mercerie',       11),
(23, NULL, 'outils-materiel',        12),
(24, NULL, 'coffrets-cadeaux',       13),
(25, NULL, 'tendances-saisons',      14),
(26, NULL, 'broderie-machine',       15);

INSERT INTO category_translations (category_id, locale, name, description) VALUES
-- Broderie ruban
(17,'fr','Broderie au ruban',          'Kits et rubans de soie pour la broderie florale en 3D'),
(17,'de','Bandstickerei',              'Sets und Seidenbänder für 3D-Blumenstickerei'),
(17,'en','Ribbon Embroidery',          'Kits and silk ribbons for 3D floral embroidery'),
-- Broderie perles
(18,'fr','Broderie aux perles',        'Perles, sequins et kits perlés pour broderies scintillantes'),
(18,'de','Perlen-Stickerei',           'Perlen, Pailletten und Perlensets für glänzende Stickereien'),
(18,'en','Bead Embroidery',            'Beads, sequins and bead kits for sparkling embroideries'),
-- Tapisserie canevas
(19,'fr','Tapisserie & Canevas',       'Kits de tapisserie, canevas et fils à la bobine'),
(19,'de','Gobelin & Kanvas',           'Gobelin-Sets, Kanvas und Garnspulen'),
(19,'en','Tapestry & Canvas',          'Tapestry kits, canvas and yarn on bobbins'),
-- Punch needle
(20,'fr','Punch Needle',               'Outils, tissus monks cloth et fils pour la technique punch needle'),
(20,'de','Punch Needle',               'Werkzeuge, Monks Cloth und Garne für Punch-Needle-Technik'),
(20,'en','Punch Needle',               'Tools, monks cloth and yarn for the punch needle technique'),
-- Macramé
(21,'fr','Macramé & Tissage',          'Cordes, cadres et kits pour le macramé et le tissage'),
(21,'de','Makramee & Weben',           'Schnüre, Rahmen und Sets für Makramee und Weben'),
(21,'en','Macramé & Weaving',          'Cords, frames and kits for macramé and weaving'),
-- Couture mercerie
(22,'fr','Couture & Mercerie',         'Tissus, patrons couture et fournitures de mercerie'),
(22,'de','Nähen & Kurzwaren',          'Stoffe, Schnittmuster und Kurzwaren'),
(22,'en','Sewing & Haberdashery',      'Fabrics, sewing patterns and haberdashery supplies'),
-- Outils matériel
(23,'fr','Outils & Matériel',          'Ciseaux, dés, marqueurs et outils professionnels'),
(23,'de','Werkzeuge & Material',       'Scheren, Fingerhüte, Marker und professionelles Werkzeug'),
(23,'en','Tools & Equipment',          'Scissors, thimbles, markers and professional tools'),
-- Coffrets cadeaux
(24,'fr','Coffrets Cadeaux',           'Coffrets broderie prêts à offrir pour tous les budgets'),
(24,'de','Geschenksets',               'Stickerei-Geschenksets für jeden Anlass und jedes Budget'),
(24,'en','Gift Sets',                  'Ready-to-gift embroidery sets for all budgets'),
-- Tendances & Saisons
(25,'fr','Tendances & Saisons',        'Collections saisonnières et motifs tendance du moment'),
(25,'de','Trends & Jahreszeiten',      'Saisonale Kollektionen und aktuelle Trendmotive'),
(25,'en','Trends & Seasons',           'Seasonal collections and current trend patterns'),
-- Broderie machine
(26,'fr','Broderie Machine',           'Stabilisateurs, fils bobine et logiciels pour machine à broder'),
(26,'de','Maschinenstickerei',         'Stabilisatoren, Unterfadengarne und Software für Stickmaschinen'),
(26,'en','Machine Embroidery',         'Stabilizers, bobbin threads and software for embroidery machines');

-- ============================================================
-- 2. SOUS-CATÉGORIES (27 à 46)
-- ============================================================
INSERT INTO categories (id, parent_id, slug, sort_order) VALUES
-- Broderie ruban (17) → 2 sous-cat
(27, 17, 'rubans-soie',               1),
(28, 17, 'kits-broderie-ruban',       2),
-- Broderie perles (18) → 2 sous-cat
(29, 18, 'perles-rocailles',          1),
(30, 18, 'kits-broderie-perles',      2),
-- Tapisserie canevas (19) → 2 sous-cat
(31, 19, 'kits-tapisserie',           1),
(32, 19, 'fils-tapisserie',           2),
-- Punch needle (20) → 2 sous-cat
(33, 20, 'outils-punch-needle',       1),
(34, 20, 'kits-punch-needle',         2),
-- Macramé (21) → 2 sous-cat
(35, 21, 'cordes-macrame',            1),
(36, 21, 'kits-macrame',              2),
-- Couture (22) → 2 sous-cat
(37, 22, 'tissus-broderie',           1),
(38, 22, 'fils-couture',              2),
-- Outils (23) → 2 sous-cat
(39, 23, 'ciseaux-coupe',             1),
(40, 23, 'accessoires-mesure',        2),
-- Coffrets (24) → 2 sous-cat
(41, 24, 'coffrets-debutant',         1),
(42, 24, 'coffrets-confirme',         2),
-- Tendances (25) → 2 sous-cat
(43, 25, 'collection-printemps-ete',  1),
(44, 25, 'collection-automne-hiver',  2),
-- Broderie machine (26) → 2 sous-cat
(45, 26, 'stabilisateurs-entoilage',  1),
(46, 26, 'fils-machine',              2);

INSERT INTO category_translations (category_id, locale, name, description) VALUES
-- Rubans soie (27)
(27,'fr','Rubans de soie',           'Rubans de soie 4mm, 7mm et 13mm pour broderie florale'),
(27,'de','Seidenbänder',             'Seidenbänder 4mm, 7mm und 13mm für Blumenstickerei'),
(27,'en','Silk Ribbons',             'Silk ribbons 4mm, 7mm and 13mm for floral embroidery'),
-- Kits broderie ruban (28)
(28,'fr','Kits broderie au ruban',   'Kits complets avec ruban, toile et patron pour débutants'),
(28,'de','Bandstickerei-Sets',       'Komplette Sets mit Band, Stoff und Anleitung für Anfänger'),
(28,'en','Ribbon Embroidery Kits',   'Complete kits with ribbon, fabric and pattern for beginners'),
-- Perles rocailles (29)
(29,'fr','Perles & Rocailles',       'Perles de rocaille, perles de Bohème et sequins pour broderie'),
(29,'de','Rocailles & Perlen',       'Rocailles, böhmische Perlen und Pailletten für Stickerei'),
(29,'en','Beads & Rocailles',        'Seed beads, Bohemian beads and sequins for embroidery'),
-- Kits broderie perles (30)
(30,'fr','Kits broderie perles',     'Kits broderie ornés de perles et sequins, résultat spectaculaire'),
(30,'de','Perlen-Sticksets',         'Perlen-Sticksets mit Pailletten, spektakuläres Ergebnis'),
(30,'en','Bead Embroidery Kits',     'Embroidery kits with beads and sequins, spectacular results'),
-- Kits tapisserie (31)
(31,'fr','Kits de tapisserie',       'Kits point de croix sur canevas et tapisserie au petit point'),
(31,'de','Gobelin-Sets',             'Kreuzstich-Sets auf Kanvas und Petit-Point-Gobelin'),
(31,'en','Tapestry Kits',            'Cross stitch kits on canvas and petit point tapestry'),
-- Fils tapisserie (32)
(32,'fr','Fils pour tapisserie',     'Fils à broder en laine et coton perlé pour tapisserie'),
(32,'de','Gobelingstickgarne',       'Stickgarne aus Wolle und Perlbaumwolle für Gobelin'),
(32,'en','Tapestry Threads',         'Wool and pearl cotton threads for tapestry'),
-- Outils punch needle (33)
(33,'fr','Outils punch needle',      'Aiguilles punch needle réglables, tissu monks cloth et cerceaux'),
(33,'de','Punch-Needle-Werkzeuge',   'Verstellbare Punch-Needle-Nadeln, Monks Cloth und Rahmen'),
(33,'en','Punch Needle Tools',       'Adjustable punch needle tools, monks cloth and hoops'),
-- Kits punch needle (34)
(34,'fr','Kits punch needle',        'Kits complets punch needle avec fil, tissu et motif imprimé'),
(34,'de','Punch-Needle-Sets',        'Komplette Punch-Needle-Sets mit Garn, Stoff und gedrucktem Motiv'),
(34,'en','Punch Needle Kits',        'Complete punch needle kits with yarn, fabric and printed pattern'),
-- Cordes macramé (35)
(35,'fr','Cordes macramé',           'Cordes en coton naturel, jute et polyester pour macramé'),
(35,'de','Makramee-Schnüre',         'Schnüre aus Naturbaumwolle, Jute und Polyester für Makramee'),
(35,'en','Macramé Cords',            'Natural cotton, jute and polyester cords for macramé'),
-- Kits macramé (36)
(36,'fr','Kits macramé',             'Kits suspension murale, attrape-rêves et sous-verre en macramé'),
(36,'de','Makramee-Sets',            'Wandbehang-, Traumfänger- und Untersetzer-Sets in Makramee'),
(36,'en','Macramé Kits',             'Wall hanging, dreamcatcher and coaster kits in macramé'),
-- Tissus broderie (37)
(37,'fr','Tissus pour broderie',     'Lin, coton et toile pour la broderie libre et le transfert de motifs'),
(37,'de','Stickereistoffe',          'Leinen, Baumwolle und Leinwand für freie Stickerei und Musterübertragung'),
(37,'en','Embroidery Fabrics',       'Linen, cotton and canvas for free embroidery and pattern transfer'),
-- Fils couture (38)
(38,'fr','Fils à coudre',            'Fils à coudre polyester, coton et spéciaux pour machines à coudre'),
(38,'de','Nähgarne',                 'Polyester-, Baumwoll- und Spezialnähgarne für Nähmaschinen'),
(38,'en','Sewing Threads',           'Polyester, cotton and special threads for sewing machines'),
-- Ciseaux (39)
(39,'fr','Ciseaux & Coupe',          'Ciseaux de broderie, cisailles et découpeurs rotatifs'),
(39,'de','Scheren & Schneiden',      'Stickscheren, Scheren und Rollschneider'),
(39,'en','Scissors & Cutting',       'Embroidery scissors, shears and rotary cutters'),
-- Accessoires mesure (40)
(40,'fr','Mesure & Traçage',         'Mètres-rubans, gabarits et marqueurs effaçables'),
(40,'de','Messen & Markieren',       'Massband, Schablonen und auswaschbare Marker'),
(40,'en','Measuring & Marking',      'Tape measures, templates and erasable markers'),
-- Coffrets débutant (41)
(41,'fr','Coffrets débutant',        'Coffrets initiations idéaux pour offrir à partir de CHF 25'),
(41,'de','Anfänger-Geschenksets',    'Einsteiger-Geschenksets zum Verschenken ab CHF 25'),
(41,'en','Beginner Gift Sets',       'Beginner initiation sets, perfect gifts from CHF 25'),
-- Coffrets confirmé (42)
(42,'fr','Coffrets confirmé',        'Coffrets prestige pour brodeuses expérimentées dès CHF 70'),
(42,'de','Fortgeschrittene Sets',    'Prestige-Sets für erfahrene Stickerinnen ab CHF 70'),
(42,'en','Advanced Gift Sets',       'Prestige sets for experienced embroiderers from CHF 70'),
-- Printemps-Été (43)
(43,'fr','Collection Printemps-Été', 'Motifs floraux, jardin et plage pour la saison estivale'),
(43,'de','Frühling-Sommer Kollektion','Blumen-, Garten- und Strandmotive für die Sommersaison'),
(43,'en','Spring-Summer Collection', 'Floral, garden and beach patterns for the summer season'),
-- Automne-Hiver (44)
(44,'fr','Collection Automne-Hiver', 'Motifs forêt, Noël et hiver cosy pour la saison froide'),
(44,'de','Herbst-Winter Kollektion', 'Wald-, Weihnachts- und Winter-Cosy-Motive für die kalte Saison'),
(44,'en','Autumn-Winter Collection', 'Forest, Christmas and cosy winter patterns for the cold season'),
-- Stabilisateurs (45)
(45,'fr','Stabilisateurs & Entoilage','Entoilages thermocollants, soluble et déchirable pour machine'),
(45,'de','Stabilisatoren & Einlagen','Bügeleinlagen, lösliche und aufreissbare Stabilisatoren für Maschinen'),
(45,'en','Stabilizers & Interfacing','Iron-on, soluble and tear-away stabilizers for machine embroidery'),
-- Fils machine (46)
(46,'fr','Fils pour machine à broder','Fils mousse, métallisés et standard pour machines à broder'),
(46,'de','Maschinenstickgarne',      'Schaum-, Metallic- und Standardgarne für Stickmaschinen'),
(46,'en','Machine Embroidery Threads','Foam, metallic and standard threads for embroidery machines');

-- ============================================================
-- 3. PRODUITS (61 à 160) — 5 par sous-catégorie
-- ============================================================

INSERT INTO products (id, category_id, supplier_id, slug, price_chf, compare_price_chf, tax_rate_id, sku, stock, weight_kg, is_active, is_featured, badge) VALUES

-- ════ Sous-cat 27 : Rubans de soie ════
(61,  27, 47, 'ruban-soie-4mm-rose-poudre',      4.90, NULL,  1, 'RUB-SOI-4-ROS', 80, 0.015, 1, 0, NULL),
(62,  27, 47, 'ruban-soie-7mm-lavande',           5.90, NULL,  1, 'RUB-SOI-7-LAV', 70, 0.020, 1, 0, NULL),
(63,  27, 47, 'ruban-soie-13mm-vert-sauge',       7.90, NULL,  1, 'RUB-SOI-13-VES', 55, 0.030, 1, 0, NULL),
(64,  27, 47, 'assortiment-rubans-soie-10-col',  29.90, 34.90, 1, 'RUB-SOI-ASS10', 30, 0.120, 1, 1, 'promo'),
(65,  27, 47, 'ruban-soie-ombre-4mm-coucher',     8.90, NULL,  1, 'RUB-SOI-OMB-4', 45, 0.018, 1, 0, 'nouveaute'),

-- ════ Sous-cat 28 : Kits broderie au ruban ════
(66,  28, 47, 'kit-ruban-roses-anglaises',        42.90, NULL,  1, 'KIT-RUB-ROS', 20, 0.250, 1, 1, 'coup_de_coeur'),
(67,  28, 47, 'kit-ruban-pivoine-romantique',     38.90, NULL,  1, 'KIT-RUB-PIV', 18, 0.230, 1, 0, NULL),
(68,  28, 48, 'kit-ruban-jardin-secret',          46.90, NULL,  1, 'KIT-RUB-JAR', 15, 0.280, 1, 0, NULL),
(69,  28, 48, 'kit-ruban-lavande-provence',       34.90, 39.90, 1, 'KIT-RUB-LAV', 22, 0.210, 1, 0, 'promo'),
(70,  28, 47, 'kit-ruban-coeur-fleuri',           29.90, NULL,  1, 'KIT-RUB-COE', 25, 0.190, 1, 1, NULL),

-- ════ Sous-cat 29 : Perles & Rocailles ════
(71,  29, 48, 'rocailles-miyuki-11-0-blanc-perle', 4.50, NULL,  1, 'PER-MIY-11-BL',100, 0.025, 1, 0, NULL),
(72,  29, 48, 'rocailles-toho-8-0-or-mat',          4.50, NULL,  1, 'PER-TOH-8-OR',  90, 0.025, 1, 0, NULL),
(73,  29, 48, 'perles-boheme-4mm-crystal-ab',       6.90, NULL,  1, 'PER-BOH-4-CAB', 75, 0.030, 1, 0, NULL),
(74,  29, 47, 'sequins-ronds-5mm-argent-vif',       3.90, NULL,  1, 'SEQ-RON-5-ARG', 60, 0.020, 1, 0, NULL),
(75,  29, 48, 'assortiment-perles-broderie-mix50g', 14.90, 18.90,1, 'PER-ASS-MIX50', 40, 0.055, 1, 1, 'promo'),

-- ════ Sous-cat 30 : Kits broderie perles ════
(76,  30, 49, 'kit-perles-paon-royal',             54.90, NULL,  1, 'KIT-PER-PAO', 14, 0.320, 1, 1, 'exclusif'),
(77,  30, 49, 'kit-perles-papillon-nocturne',      48.90, NULL,  1, 'KIT-PER-PAP', 16, 0.290, 1, 0, NULL),
(78,  30, 48, 'kit-perles-fleur-de-lotus',         39.90, 44.90, 1, 'KIT-PER-LOT', 20, 0.260, 1, 0, 'promo'),
(79,  30, 49, 'kit-sequins-plumes-tropical',       44.90, NULL,  1, 'KIT-SEQ-TRO', 12, 0.270, 1, 1, NULL),
(80,  30, 48, 'kit-perles-mandala-sacre',          59.90, NULL,  1, 'KIT-PER-MAN', 10, 0.350, 1, 0, NULL),

-- ════ Sous-cat 31 : Kits de tapisserie ════
(81,  31, 49, 'kit-tapisserie-renne-nordique',     64.90, NULL,  1, 'KIT-TAP-REN', 18, 0.420, 1, 1, NULL),
(82,  31, 49, 'kit-tapisserie-chateau-medieval',   79.90, NULL,  1, 'KIT-TAP-CHA', 12, 0.500, 1, 0, NULL),
(83,  31, 49, 'kit-tapisserie-jardin-anglais',     59.90, 69.90, 1, 'KIT-TAP-JAR', 15, 0.400, 1, 0, 'promo'),
(84,  31, 48, 'kit-petit-point-portrait-dame',     49.90, NULL,  1, 'KIT-PPT-POR', 10, 0.360, 1, 1, 'coup_de_coeur'),
(85,  31, 48, 'kit-tapisserie-bouquet-roses',      54.90, NULL,  1, 'KIT-TAP-BOU', 20, 0.380, 1, 0, NULL),

-- ════ Sous-cat 32 : Fils pour tapisserie ════
(86,  32, 44, 'fil-laine-tapisserie-rouge-cardinal',  3.90, NULL, 1, 'FIL-LAI-RCR', 90, 0.040, 1, 0, NULL),
(87,  32, 44, 'fil-laine-tapisserie-vert-sapin',      3.90, NULL, 1, 'FIL-LAI-VSA', 85, 0.040, 1, 0, NULL),
(88,  32, 44, 'coton-perle-n3-ecru',                  2.90, NULL, 1, 'COT-PER-3-EC', 120, 0.025, 1, 0, NULL),
(89,  32, 44, 'coton-perle-n5-bleu-nuit',             2.90, NULL, 1, 'COT-PER-5-BN', 110, 0.025, 1, 0, NULL),
(90,  32, 46, 'coffret-fils-laine-tapisserie-24col',  34.90, 39.90,1,'COF-LAI-TAP24',28, 0.350, 1, 1, 'promo'),

-- ════ Sous-cat 33 : Outils punch needle ════
(91,  33, 47, 'aiguille-punch-needle-fine-n1',        18.90, NULL, 1, 'OUT-PUN-N1',  40, 0.080, 1, 1, NULL),
(92,  33, 47, 'aiguille-punch-needle-medium-n3',      18.90, NULL, 1, 'OUT-PUN-N3',  45, 0.080, 1, 0, NULL),
(93,  33, 47, 'aiguille-punch-needle-large-n5',       19.90, NULL, 1, 'OUT-PUN-N5',  35, 0.090, 1, 0, NULL),
(94,  33, 47, 'tissu-monks-cloth-50x70',              14.90, NULL, 1, 'TIS-MON-5070',50, 0.200, 1, 0, NULL),
(95,  33, 47, 'cadre-bois-punch-30x30',               12.90, NULL, 1, 'CAD-PUN-3030',40, 0.350, 1, 0, NULL),

-- ════ Sous-cat 34 : Kits punch needle ════
(96,  34, 48, 'kit-punch-needle-renard-foret',        44.90, NULL,  1, 'KIT-PUN-REN', 18, 0.320, 1, 1, 'nouveaute'),
(97,  34, 48, 'kit-punch-needle-cactus-boheme',       38.90, NULL,  1, 'KIT-PUN-CAC', 20, 0.290, 1, 0, NULL),
(98,  34, 49, 'kit-punch-needle-lettre-prenom',       29.90, NULL,  1, 'KIT-PUN-LET', 25, 0.250, 1, 1, NULL),
(99,  34, 48, 'kit-punch-needle-champignons',         34.90, 39.90, 1, 'KIT-PUN-CHA', 22, 0.270, 1, 0, 'promo'),
(100, 34, 49, 'kit-punch-needle-arc-en-ciel',         42.90, NULL,  1, 'KIT-PUN-ARC', 15, 0.310, 1, 0, NULL),

-- ════ Sous-cat 35 : Cordes macramé ════
(101, 35, 47, 'corde-macrame-coton-3mm-100m',         12.90, NULL,  1, 'COR-MAC-3-100',30, 0.500, 1, 0, NULL),
(102, 35, 47, 'corde-macrame-coton-5mm-50m',          11.90, NULL,  1, 'COR-MAC-5-050',35, 0.500, 1, 0, NULL),
(103, 35, 47, 'corde-jute-naturel-2mm-200m',          14.90, NULL,  1, 'COR-JUT-2-200',25, 0.600, 1, 0, NULL),
(104, 35, 47, 'fil-kraft-marron-rouleau-100m',         8.90, NULL,  1, 'FIL-KRA-BR100',40, 0.300, 1, 0, NULL),
(105, 35, 47, 'assortiment-cordes-macrame-5-col',     24.90, 29.90, 1, 'COR-MAC-ASS5', 20, 0.900, 1, 1, 'promo'),

-- ════ Sous-cat 36 : Kits macramé ════
(106, 36, 47, 'kit-macrame-suspension-murale-lune',   49.90, NULL,  1, 'KIT-MAC-LUN', 16, 0.600, 1, 1, 'nouveaute'),
(107, 36, 47, 'kit-macrame-attrape-reves-plumes',     39.90, NULL,  1, 'KIT-MAC-ATT', 20, 0.450, 1, 0, NULL),
(108, 36, 48, 'kit-macrame-sac-boho',                 54.90, 59.90, 1, 'KIT-MAC-SAC', 12, 0.550, 1, 0, 'promo'),
(109, 36, 47, 'kit-macrame-sous-verre-set6',          29.90, NULL,  1, 'KIT-MAC-SVR', 25, 0.400, 1, 0, NULL),
(110, 36, 48, 'kit-macrame-rideau-pompons',           64.90, NULL,  1, 'KIT-MAC-RID', 10, 0.700, 1, 1, 'exclusif'),

-- ════ Sous-cat 37 : Tissus pour broderie ════
(111, 37, 44, 'lin-naturel-ecru-140cm-50cm',          16.90, NULL,  1, 'TIS-LIN-EC50', 40, 0.300, 1, 0, NULL),
(112, 37, 44, 'coton-solide-blanc-casse-50x100',      11.90, NULL,  1, 'TIS-COT-BC50', 50, 0.250, 1, 0, NULL),
(113, 37, 44, 'felt-feutrine-epaisse-20x30-rouge',     3.90, NULL,  1, 'TIS-FEU-RG30',  80, 0.060, 1, 0, NULL),
(114, 37, 44, 'organza-soie-blanc-150cm-50cm',        22.90, NULL,  1, 'TIS-ORG-BL50', 30, 0.150, 1, 0, NULL),
(115, 37, 47, 'velours-marine-broderie-50x50',        18.90, 22.90, 1, 'TIS-VEL-MA50', 25, 0.200, 1, 1, 'promo'),

-- ════ Sous-cat 38 : Fils à coudre ════
(116, 38, 44, 'fil-polyester-blanc-500m',              3.90, NULL,  1, 'FIL-COU-PBL', 60, 0.100, 1, 0, NULL),
(117, 38, 44, 'fil-polyester-noir-500m',               3.90, NULL,  1, 'FIL-COU-PNO', 60, 0.100, 1, 0, NULL),
(118, 38, 44, 'fil-coton-naturel-100m',                2.90, NULL,  1, 'FIL-COU-CNT', 80, 0.060, 1, 0, NULL),
(119, 38, 46, 'fil-invisible-nylon-200m',              4.90, NULL,  1, 'FIL-COU-INV', 50, 0.080, 1, 0, NULL),
(120, 38, 44, 'assortiment-fils-coudre-12-col',       14.90, 18.90, 1, 'FIL-COU-AS12', 35, 0.350, 1, 1, 'promo'),

-- ════ Sous-cat 39 : Ciseaux & Coupe ════
(121, 39, 47, 'ciseaux-broderie-poulette-11cm',       19.90, NULL,  1, 'CIS-BRO-P11', 35, 0.080, 1, 1, NULL),
(122, 39, 47, 'ciseaux-couture-inox-21cm',            24.90, NULL,  1, 'CIS-COU-I21', 30, 0.200, 1, 0, NULL),
(123, 39, 47, 'ciseaux-zigzag-dents-19cm',            22.90, 26.90, 1, 'CIS-ZIG-Z19', 25, 0.180, 1, 0, 'promo'),
(124, 39, 47, 'cutter-rotatif-45mm-decoupe',          28.90, NULL,  1, 'CUT-ROT-45',  28, 0.250, 1, 0, NULL),
(125, 39, 47, 'kit-ciseaux-broderie-3-pcs-etui',      39.90, 44.90, 1, 'KIT-CIS-3ET', 20, 0.280, 1, 1, 'coup_de_coeur'),

-- ════ Sous-cat 40 : Mesure & Traçage ════
(126, 40, 47, 'metre-ruban-retractable-150cm',         5.90, NULL,  1, 'MET-RUB-150', 60, 0.040, 1, 0, NULL),
(127, 40, 47, 'marqueur-tissu-effacable-eau-bleu',     3.90, NULL,  1, 'MAR-EAU-BLU', 70, 0.030, 1, 0, NULL),
(128, 40, 47, 'craie-tailleur-blanche-paquet10',       4.90, NULL,  1, 'CRA-TAI-BL10',55, 0.050, 1, 0, NULL),
(129, 40, 47, 'gabarit-hexagone-quilting-set5',       12.90, NULL,  1, 'GAB-HEX-QU5', 40, 0.120, 1, 0, NULL),
(130, 40, 47, 'regle-patchwork-transparente-15x60',   18.90, NULL,  1, 'REG-PAT-1560',30, 0.350, 1, 1, NULL),

-- ════ Sous-cat 41 : Coffrets débutant ════
(131, 41, 49, 'coffret-debutant-point-croix-25chf',   25.90, NULL,  1, 'COF-DEB-PDC', 30, 0.300, 1, 1, NULL),
(132, 41, 48, 'coffret-debutant-broderie-libre',       28.90, NULL,  1, 'COF-DEB-BRL', 25, 0.320, 1, 0, NULL),
(133, 41, 47, 'coffret-initiation-punch-needle',       34.90, 39.90, 1, 'COF-DEB-PUN', 20, 0.380, 1, 0, 'promo'),
(134, 41, 49, 'coffret-debutant-ruban-soie',           32.90, NULL,  1, 'COF-DEB-RUB', 18, 0.350, 1, 0, NULL),
(135, 41, 48, 'coffret-initiation-macrame',            29.90, NULL,  1, 'COF-DEB-MAC', 22, 0.400, 1, 1, 'nouveaute'),

-- ════ Sous-cat 42 : Coffrets confirmé ════
(136, 42, 47, 'coffret-prestige-soie-or',              89.90, NULL,  1, 'COF-PRE-SOI', 10, 0.600, 1, 1, 'exclusif'),
(137, 42, 49, 'coffret-expert-tapisserie-laine',       74.90, 84.90, 1, 'COF-EXP-TAP', 12, 0.700, 1, 0, 'promo'),
(138, 42, 47, 'coffret-luxe-broderie-perles',          99.90, NULL,  1, 'COF-LUX-PER',  8, 0.750, 1, 0, NULL),
(139, 42, 48, 'coffret-creator-punch-needle',          69.90, NULL,  1, 'COF-CRE-PUN', 15, 0.650, 1, 1, NULL),
(140, 42, 49, 'coffret-maitre-point-croix-suisse',     79.90, NULL,  1, 'COF-MAI-PDC', 10, 0.680, 1, 0, NULL),

-- ════ Sous-cat 43 : Collection Printemps-Été ════
(141, 43, 48, 'kit-saisonnier-hibiscus-tropical',     44.90, NULL,  1, 'KIT-SAI-HIB', 20, 0.280, 1, 1, 'nouveaute'),
(142, 43, 48, 'kit-saisonnier-coquelicots-champs',    39.90, NULL,  1, 'KIT-SAI-COQ', 25, 0.260, 1, 0, NULL),
(143, 43, 49, 'kit-saisonnier-plage-bord-mer',        34.90, 39.90, 1, 'KIT-SAI-PLA', 22, 0.240, 1, 0, 'promo'),
(144, 43, 48, 'kit-saisonnier-papillons-jardin',      42.90, NULL,  1, 'KIT-SAI-PAP', 18, 0.270, 1, 0, NULL),
(145, 43, 49, 'kit-saisonnier-fraises-bucolique',     36.90, NULL,  1, 'KIT-SAI-FRA', 24, 0.250, 1, 1, NULL),

-- ════ Sous-cat 44 : Collection Automne-Hiver ════
(146, 44, 49, 'kit-saisonnier-champignons-automne',   44.90, NULL,  1, 'KIT-SAI-AUT', 20, 0.280, 1, 1, NULL),
(147, 44, 48, 'kit-saisonnier-renne-hiver',           49.90, NULL,  1, 'KIT-SAI-REN', 18, 0.300, 1, 0, NULL),
(148, 44, 49, 'kit-saisonnier-etoiles-noel',          39.90, 44.90, 1, 'KIT-SAI-NOE', 30, 0.260, 1, 1, 'promo'),
(149, 44, 48, 'kit-saisonnier-ours-polar',            46.90, NULL,  1, 'KIT-SAI-OUR', 15, 0.290, 1, 0, NULL),
(150, 44, 49, 'kit-saisonnier-sapin-enneige',         42.90, NULL,  1, 'KIT-SAI-SAP', 22, 0.275, 1, 0, NULL),

-- ════ Sous-cat 45 : Stabilisateurs & Entoilage ════
(151, 45, 44, 'entoilage-thermocollant-leger-25x100',  9.90, NULL,  1, 'ENT-THC-LE25', 40, 0.150, 1, 0, NULL),
(152, 45, 44, 'entoilage-dechirable-blanc-30x100',     8.90, NULL,  1, 'ENT-DEC-BL30', 45, 0.130, 1, 0, NULL),
(153, 45, 44, 'entoilage-hydrosoluble-20x100',        11.90, NULL,  1, 'ENT-HYD-HS20', 35, 0.120, 1, 0, NULL),
(154, 45, 44, 'stabilisateur-mousse-broderie-mach',   14.90, 17.90, 1, 'STA-MOU-MAC',  30, 0.180, 1, 0, 'promo'),
(155, 45, 46, 'kit-entoilages-assortiment-3types',    24.90, NULL,  1, 'KIT-ENT-AS3',  25, 0.350, 1, 1, NULL),

-- ════ Sous-cat 46 : Fils pour machine à broder ════
(156, 46, 46, 'fil-machine-rayon-40-blanc-1000m',     11.90, NULL,  1, 'FIL-MAC-RBL', 35, 0.200, 1, 0, NULL),
(157, 46, 46, 'fil-machine-polyester-40-noir-1000m',  11.90, NULL,  1, 'FIL-MAC-PNO', 35, 0.200, 1, 0, NULL),
(158, 46, 46, 'fil-machine-metallic-or-200m',         14.90, NULL,  1, 'FIL-MAC-MOR', 28, 0.150, 1, 1, NULL),
(159, 46, 46, 'fil-canette-bobine-machine-1000m',      7.90, NULL,  1, 'FIL-CAN-BOB', 50, 0.180, 1, 0, NULL),
(160, 46, 46, 'assortiment-fils-machine-10-col',      49.90, 59.90, 1, 'FIL-MAC-AS10',20, 0.600, 1, 1, 'promo');

-- ============================================================
-- 4. TRADUCTIONS FR (product_translations)
-- ============================================================
INSERT INTO product_translations (product_id, locale, name, description) VALUES
-- Sous-cat 27 : Rubans soie
( 61,'fr','Ruban de soie 4mm — Rose poudré',    'Ruban de soie pure 4mm coloris rose poudré. Idéal pour pétales et petites fleurs en broderie au ruban.'),
( 62,'fr','Ruban de soie 7mm — Lavande',         'Ruban de soie pure 7mm coloris lavande. Format polyvalent pour fleurs moyennes et feuillages.'),
( 63,'fr','Ruban de soie 13mm — Vert sauge',     'Ruban de soie pure 13mm coloris vert sauge. Parfait pour grandes fleurs et feuilles en volume.'),
( 64,'fr','Assortiment rubans de soie — 10 col', 'Lot de 10 rubans de soie 7mm en teintes harmonieuses. Coffret idéal pour débuter ou s''initier.'),
( 65,'fr','Ruban soie ombré 4mm — Coucher de soleil', 'Ruban de soie dégradé orangé-rose 4mm. Effet ombré unique pour compositions florales originales.'),
-- Sous-cat 28 : Kits broderie ruban
( 66,'fr','Kit broderie au ruban — Roses anglaises',  'Bouquet de roses anglaises en 3D brodé au ruban de soie. Guide illustré pas à pas, niveau intermédiaire.'),
( 67,'fr','Kit broderie au ruban — Pivoine romantique','Pivoine généreuse en ruban de soie, sur fond de lin naturel. Résultat luxueux et romantique.'),
( 68,'fr','Kit broderie au ruban — Jardin secret',    'Scène de jardin anglais avec roses, pivoines et feuillages. Kit complet avec cadre inclus.'),
( 69,'fr','Kit broderie au ruban — Lavande de Provence','Épi de lavande brodé au ruban sur toile écrue. Parfum du Sud dans votre intérieur.'),
( 70,'fr','Kit broderie au ruban — Cœur fleuri',      'Cœur décoratif composé de petites fleurs en ruban. Cadeau idéal pour la Saint-Valentin ou les anniversaires.'),
-- Sous-cat 29 : Perles rocailles
( 71,'fr','Rocailles Miyuki 11/0 — Blanc perle',      'Rocailles japonaises Miyuki taille 11/0, coloris blanc nacré. Qualité premium, trou régulier.'),
( 72,'fr','Rocailles Toho 8/0 — Or mat',              'Rocailles japonaises Toho taille 8/0, coloris or mat. Effet doré élégant sur vos broderies.'),
( 73,'fr','Perles de Bohème 4mm — Crystal AB',        'Perles de verre de Bohème rondes 4mm, finition aurora borealis. Éclat et irisations multicolores.'),
( 74,'fr','Séquins ronds 5mm — Argent vif',           'Séquins ronds 5mm finition argent brillant. Mille reflets sur vos broderies perlées et couture.'),
( 75,'fr','Assortiment perles broderie — Mix 50g',     'Mélange de rocailles, perles rondes et sequins en 50g. Palette harmonisée pour broderie perlée.'),
-- Sous-cat 30 : Kits broderie perles
( 76,'fr','Kit broderie perles — Paon royal',          'Paon majestueux brodé de perles et sequins irisés. Niveau confirmé, résultat éblouissant.'),
( 77,'fr','Kit broderie perles — Papillon nocturne',   'Papillon de nuit aux ailes perlées sur velours noir. Points de perles et sequins argent.'),
( 78,'fr','Kit broderie perles — Fleur de lotus',      'Lotus sacré brodé de perles de Bohème sur fond satin. Sérénité et élégance garanties.'),
( 79,'fr','Kit sequins — Plumes tropical',             'Composition tropicale de plumes brodées en sequins colorés. Festif et lumineux.'),
( 80,'fr','Kit broderie perles — Mandala sacré',       'Mandala complexe serti de rocailles Miyuki et perles dorées. Pour brodeuses expertes.'),
-- Sous-cat 31 : Kits tapisserie
( 81,'fr','Kit tapisserie — Renne nordique',           'Renne en forêt enneigée, style scandinave. Point de croix sur canevas 14ct, fils laine inclus.'),
( 82,'fr','Kit tapisserie — Château médiéval',         'Château fort sur fond crépuscule, rendu détaillé au petit point. Niveau avancé.'),
( 83,'fr','Kit tapisserie — Jardin anglais',           'Roseraie anglaise au petit point sur canevas 18ct. Mille détails pour un résultat exceptionnel.'),
( 84,'fr','Kit petit point — Portrait de dame',        'Portrait de dame à l''éventail, style XVIIIe siècle au petit point fin. Pièce de collection.'),
( 85,'fr','Kit tapisserie — Bouquet de roses',         'Bouquet classique de roses en tapisserie laine. Rendu en volume et couleurs chatoyantes.'),
-- Sous-cat 32 : Fils tapisserie
( 86,'fr','Fil laine tapisserie — Rouge cardinal',     'Fil de laine pour tapisserie, coloris rouge cardinal. Échevette 40m, 100% laine vierge.'),
( 87,'fr','Fil laine tapisserie — Vert sapin',         'Fil de laine pour tapisserie, coloris vert sapin profond. Échevette 40m, laine vierge qualité.'),
( 88,'fr','Coton perlé n°3 — Écru',                   'Fil coton perlé n°3, coloris écru naturel. Twist brillant, idéal pour tapisserie et point de croix.'),
( 89,'fr','Coton perlé n°5 — Bleu nuit',              'Fil coton perlé n°5, coloris bleu nuit intense. Texture mate et brillante pour travaux fins.'),
( 90,'fr','Coffret fils laine tapisserie — 24 couleurs','Assortiment 24 fils de laine tapisserie, palette équilibrée. Toutes techniques canevas.'),
-- Sous-cat 33 : Outils punch needle
( 91,'fr','Aiguille punch needle fine n°1',            'Aiguille punch needle réglable n°1 pour fils fins 1-3 brins. Corps ergonomique en bois de hêtre.'),
( 92,'fr','Aiguille punch needle medium n°3',          'Aiguille punch needle n°3 pour fils medium. Jauge réglable 3-6mm, idéale pour débutants.'),
( 93,'fr','Aiguille punch needle large n°5',           'Aiguille punch needle grand format n°5 pour fils épais et laine. Boucles volumineuses garanties.'),
( 94,'fr','Tissu monks cloth — 50x70cm',              'Tissu monks cloth traditionnel pour punch needle, 50x70cm. Tisse régulier, idéal pour toutes aiguilles.'),
( 95,'fr','Cadre bois pour punch needle — 30x30cm',   'Cadre bois carré 30x30cm avec vis de serrage pour tendre le tissu monks cloth pendant le travail.'),
-- Sous-cat 34 : Kits punch needle
( 96,'fr','Kit punch needle — Renard en forêt',        'Renard roux dans une forêt d''automne, pré-dessiné sur monks cloth. Fils laine colorés inclus.'),
( 97,'fr','Kit punch needle — Cactus bohème',          'Trois cactus stylisés en punch needle. Motif tendance pour déco murale bohème.'),
( 98,'fr','Kit punch needle — Lettre prénom',          'Monogramme décoratif personnalisé en punch needle. Idéal cadeau naissance ou mariage.'),
( 99,'fr','Kit punch needle — Champignons',            'Champignons des bois colorés sur fond neutre. Kit ludique et accessible aux débutants.'),
(100,'fr','Kit punch needle — Arc-en-ciel',            'Arc-en-ciel et nuages en punch needle pastel. Déco douce et joyeuse pour chambre enfant.'),
-- Sous-cat 35 : Cordes macramé
(101,'fr','Corde macramé coton 3mm — 100m',           'Corde macramé 100% coton naturel, 3mm de diamètre, 100m. Non teinte, tressée 3 brins.'),
(102,'fr','Corde macramé coton 5mm — 50m',            'Corde macramé coton 5mm épaisse, 50m. Idéale pour suspensions murales et attrape-rêves.'),
(103,'fr','Corde jute naturel 2mm — 200m',            'Fil de jute naturel 2mm, bobine 200m. Rustique et écologique pour macramé et emballage cadeau.'),
(104,'fr','Fil kraft brun — Rouleau 100m',            'Fil kraft papier brun recyclé, 100m. Déco naturelle pour emballage et macramé délicat.'),
(105,'fr','Assortiment cordes macramé — 5 couleurs',  'Lot de 5 cordes macramé coton teintées, 20m chacune. Palette terracotta, vert, bleu, ocre, blanc.'),
-- Sous-cat 36 : Kits macramé
(106,'fr','Kit macramé — Suspension murale Lune',     'Suspension murale lune en coton naturel, 60cm. Tutoriel illustré étape par étape inclus.'),
(107,'fr','Kit macramé — Attrape-rêves à plumes',     'Attrape-rêves bohème avec plumes naturelles. Corde coton 3mm, perles bois et anneau inclus.'),
(108,'fr','Kit macramé — Sac boho',                   'Sac à main bohème tressé en macramé coton naturel. Patron et corde 5mm fournis.'),
(109,'fr','Kit macramé — Sous-verres set de 6',       'Lot de 6 sous-verres ronds en macramé coton. Design géométrique élégant, corde 3mm incluse.'),
(110,'fr','Kit macramé — Rideau à pompons',           'Rideau de porte ou fenêtre avec pompons colorés. Grande suspension décorative, 1m20 inclus.'),
-- Sous-cat 37 : Tissus broderie
(111,'fr','Lin naturel écru — 50cm coupe',            'Lin tissé écru naturel, largeur 140cm, coupe 50cm. Idéal broderie libre, sacs et encadrements.'),
(112,'fr','Coton solide blanc cassé — 50x100cm',      'Coton tissé serré blanc cassé. Support polyvalent pour broderie à l''aiguille et transfert de motifs.'),
(113,'fr','Feutrine épaisse — 20x30cm rouge',         'Feutrine épaisse 3mm, 20x30cm coloris rouge. Pour découpages, appliqués et petits projets brodés.'),
(114,'fr','Organza de soie blanc — 50cm coupe',       'Organza de soie naturelle blanc, semi-transparent. Support délicat pour broderie ajourée et dentelle.'),
(115,'fr','Velours marine — 50x50cm',                 'Velours coton bleu marine, 50x50cm. Fond luxueux pour broderies de perles et sequins.'),
-- Sous-cat 38 : Fils à coudre
(116,'fr','Fil à coudre polyester blanc — 500m',      'Fil polyester blanc 40/2, bobine 500m. Résistant et régulier pour couture machine et main.'),
(117,'fr','Fil à coudre polyester noir — 500m',       'Fil polyester noir 40/2, bobine 500m. Indispensable dans toute boîte à couture.'),
(118,'fr','Fil à coudre coton naturel — 100m',        'Fil coton naturel non blanchi, 100m. Pour couture naturelle et broderie de finition.'),
(119,'fr','Fil invisible nylon — 200m',               'Fil nylon transparent 0,15mm, 200m. Invisible sur tous tissus pour couture discrète.'),
(120,'fr','Assortiment fils à coudre — 12 couleurs',  'Lot 12 fils polyester 100m en couleurs essentielles. Boîte plastique pratique incluse.'),
-- Sous-cat 39 : Ciseaux
(121,'fr','Ciseaux broderie "poulette" — 11cm',       'Ciseaux broderie en acier inox, lames courbées 11cm. Coupe précise au ras du tissu.'),
(122,'fr','Ciseaux couture inox — 21cm',              'Ciseaux couture professionnels 21cm, lames inox trempées. Coupe nette sur tous tissus.'),
(123,'fr','Ciseaux cranteurs dentelés — 19cm',        'Ciseaux à cranter inox 19cm. Finitions propres anti-effilochage sur tous tissus.'),
(124,'fr','Cutter rotatif 45mm — Découpe précise',    'Cutter rotatif lame 45mm pour découpe tissu sur tapis. Idéal patchwork et broderie au mètre.'),
(125,'fr','Kit ciseaux broderie — 3 pcs + étui cuir', 'Set 3 ciseaux broderie inox dans étui cuir : cisailles 21cm, pointus 15cm, poulette 11cm.'),
-- Sous-cat 40 : Mesure & Traçage
(126,'fr','Mètre-ruban rétractable — 150cm',          'Mètre-ruban rétractable 150cm double-face cm/pouces. Boîtier métal, crochet auto-verrouillant.'),
(127,'fr','Marqueur tissu effaçable à l''eau — Bleu', 'Feutre marqueur bleu effaçable à l''eau froide. Traces disparaissent en 24h ou au lavage.'),
(128,'fr','Craie tailleur blanche — Paquet de 10',    'Craies tailleur plates blanches, lot de 10. Traces nettes sur tous tissus sombres, effaçables.'),
(129,'fr','Gabarits hexagones quilting — Set de 5',   'Lot 5 gabarits acryliques transparents pour English Paper Piecing hexagone, tailles 1" à 2,5".'),
(130,'fr','Règle patchwork transparente — 15x60cm',   'Règle acrylique quadrillée 15x60cm avec angle 45°. Indispensable pour découpe précise patchwork.'),
-- Sous-cat 41 : Coffrets débutant
(131,'fr','Coffret débutant — Point de croix',        'Kit complet d''initiation au point de croix : toile, fils DMC, aiguilles et patron illustré.'),
(132,'fr','Coffret débutant — Broderie libre',         'Kit initiation broderie libre : cerceau, lin, fils DMC colorés et guide des points illustré.'),
(133,'fr','Coffret initiation — Punch needle',         'Kit punch needle pour débutant : aiguille n°3, monks cloth, fils laine et motif imprimé.'),
(134,'fr','Coffret débutant — Broderie au ruban',      'Kit initiation broderie ruban : rubans soie 7mm, lin naturel, aiguilles et patron floral.'),
(135,'fr','Coffret initiation — Macramé',              'Kit macramé débutant : corde 3mm 50m, anneau bois, perles et tutoriel suspension murale.'),
-- Sous-cat 42 : Coffrets confirmé
(136,'fr','Coffret prestige — Soie & Or',             'Coffret luxe brodeuse confirmée : fils soie Madeira, fils or, lin premium et patron exclusif.'),
(137,'fr','Coffret expert — Tapisserie laine',         'Coffret complet tapisserie haut de gamme : canevas 14ct, laines Anchor sélection, guide couleurs.'),
(138,'fr','Coffret luxe — Broderie perles',           'Coffret prestige broderie perlée : rocailles Miyuki, perles Bohème, sequins argent et velours marine.'),
(139,'fr','Coffret créateur — Punch needle',           'Coffret créateur punch needle : aiguilles n°1, 3 et 5, monks cloth XL, fils laine coloris exclusifs.'),
(140,'fr','Coffret maître — Point de croix suisse',   'Coffret collector motifs suisses : 3 kits exclusifs Alpes, edelweiss et Engadine. Édition limitée.'),
-- Sous-cat 43 : Collection Printemps-Été
(141,'fr','Kit saisonnier — Hibiscus tropical',        'Fleur d''hibiscus rouge et orange en broderie libre. Collection Été, fils teintes vives inclus.'),
(142,'fr','Kit saisonnier — Coquelicots des champs',   'Champ de coquelicots brodé en point de croix. Collection Printemps, motif champêtre et poétique.'),
(143,'fr','Kit saisonnier — Bord de mer',              'Phare, coquillages et vagues en broderie libre. Ambiance vacances garantie.'),
(144,'fr','Kit saisonnier — Papillons du jardin',      'Trois papillons suisses sur branche fleurie. Collection Printemps, niveau intermédiaire.'),
(145,'fr','Kit saisonnier — Fraises bucoliques',       'Buisson de fraises brodé sur lin écru. Collection Été, motif champêtre gourmand.'),
-- Sous-cat 44 : Collection Automne-Hiver
(146,'fr','Kit saisonnier — Champignons d''automne',   'Cèpes et girolles brodés en broderie libre. Palette terracotta et ocre, ambiance forêt.'),
(147,'fr','Kit saisonnier — Renne de l''hiver',        'Renne nordique sur fond neige en point de croix. Kit Noël, niveau intermédiaire.'),
(148,'fr','Kit saisonnier — Étoiles de Noël',          'Guirlande d''étoiles scandinaves brodée en rouge et blanc. Décoration de Noël intemporelle.'),
(149,'fr','Kit saisonnier — Ours polaire',             'Ourson polaire sur banquise en broderie libre fils blancs et bleus. Hivernage assuré.'),
(150,'fr','Kit saisonnier — Sapin enneigé',            'Sapin de montagne sous la neige brodé au point de croix. Motif hiver cosy et classique.'),
-- Sous-cat 45 : Stabilisateurs
(151,'fr','Entoilage thermocollant léger — 25x100cm', 'Entoilage thermocollant léger non tissé blanc, 25cm×100cm. Pour broderie machine sur tissus fins.'),
(152,'fr','Entoilage déchirable blanc — 30x100cm',    'Stabilisateur à déchirer blanc 30cm×100cm. Stabilise le tissu pendant la broderie machine.'),
(153,'fr','Entoilage hydrosoluble — 20x100cm',        'Film soluble à l''eau froide 20cm×100cm. Idéal dentelle et broderies sur matières délicates.'),
(154,'fr','Stabilisateur mousse — Broderie machine',  'Entoilage mousse 3D 30cm×50cm pour broderie en relief machine. Effet relief gonflé.'),
(155,'fr','Kit entoilages — Assortiment 3 types',     'Lot 3 entoilages (thermocollant, déchirable, hydrosoluble) 30x50cm chacun. Découverte complète.'),
-- Sous-cat 46 : Fils machine
(156,'fr','Fil machine rayon 40 blanc — 1000m',       'Fil rayon brillant 40wt blanc, bobine 1000m. Brillance satinée pour broderies machine haut de gamme.'),
(157,'fr','Fil machine polyester 40 noir — 1000m',    'Fil polyester mat 40wt noir, bobine 1000m. Solide, régulier, compatible toutes machines à broder.'),
(158,'fr','Fil machine métallisé or — 200m',          'Fil métallisé doré 40wt, bobine 200m. Touches dorées éblouissantes sur broderies machine.'),
(159,'fr','Fil canette bobine machine — 1000m',       'Fil canette blanc polyester 60wt, bobine 1000m. Compatible sous toutes machines à broder.'),
(160,'fr','Assortiment fils machine — 10 couleurs',   'Lot 10 fils polyester 40wt en couleurs populaires, 200m chacun. Coffret boîte plastique incluse.');

-- ============================================================
-- 5. TRADUCTIONS DE (sélection principale)
-- ============================================================
INSERT INTO product_translations (product_id, locale, name, description) VALUES
( 61,'de','Seidenband 4mm — Puderrosa',           'Reines Seidenband 4mm in Puderrosa. Ideal für Blütenblätter und kleine Blüten in der Bandstickerei.'),
( 62,'de','Seidenband 7mm — Lavendel',             'Reines Seidenband 7mm in Lavendel. Vielseitiges Format für mittlere Blüten und Blattwerk.'),
( 64,'de','Sortiment Seidenbänder — 10 Farben',    'Set mit 10 Seidenbändern 7mm in harmonischen Tönen. Ideal zum Einstieg in die Bandstickerei.'),
( 66,'de','Bandstickerei-Set — Englische Rosen',   'Englische Rosen 3D in Seidenband gestickt. Illustrierte Schritt-für-Schritt-Anleitung inklusive.'),
( 71,'de','Miyuki Rocailles 11/0 — Perlweiss',     'Japanische Miyuki Rocailles Grösse 11/0, Farbe Perlweiss. Premium-Qualität, gleichmässige Löcher.'),
( 75,'de','Perlen-Sortiment Stickerei — Mix 50g',  'Mischung aus Rocailles, Rundperlen und Pailletten, 50g. Harmonische Palette für Perlenstickerei.'),
( 76,'de','Perlen-Stickset — Königspfau',          'Majestätischer Pfau in Perlen und Irisier-Pailletten gestickt. Fortgeschrittenes Niveau, atemberaubendes Ergebnis.'),
( 81,'de','Gobelin-Set — Nordisches Rentier',      'Rentier im verschneiten Wald, skandinavischer Stil. Kreuzstich auf 14ct Kanvas, Wollgarne inklusive.'),
( 86,'de','Woll-Stickgarn Gobelin — Kardinalrot',  'Wollgarn für Gobelin, Farbe Kardinalrot. Strähne 40m, 100% Jungschurwolle.'),
( 90,'de','Gobelinwoll-Sortiment — 24 Farben',     'Sortiment mit 24 Wollgarnen für Gobelin, ausgewogene Farbpalette. Alle Kanvas-Techniken.'),
( 91,'de','Punch-Needle-Nadel fein Nr. 1',         'Verstellbare Punch-Needle-Nadel Nr. 1 für feine Garne 1-3 Fäden. Ergonomischer Buchenholzgriff.'),
( 96,'de','Punch-Needle-Set — Fuchs im Wald',      'Rotfuchs im Herbstwald, vorgedruckt auf Monks Cloth. Bunte Wollgarne inklusive.'),
(101,'de','Makramee-Schnur Baumwolle 3mm — 100m',  '100% Naturbauwollschnur, 3mm Durchmesser, 100m. Unbehandelt, 3-fädig gedreht.'),
(106,'de','Makramee-Set — Wandbehang Mond',        'Wanddekoration Mond aus Naturbaumwolle, 60cm. Illustriertes Schritt-für-Schritt-Tutorial inklusive.'),
(121,'de','Stickschere "Hühnchen" — 11cm',         'Stickschere aus Edelstahl, gebogene Klingen 11cm. Präzisionsschnitt direkt am Stoff.'),
(125,'de','Schererset Stickerei — 3 Stk + Ledertui','Set 3 Stickscheren im Ledertui: Schneidschere 21cm, Spitzschere 15cm, Hühnchenschere 11cm.'),
(131,'de','Anfänger-Set — Kreuzstich',             'Komplettes Einführungsset Kreuzstich: Aida-Stoff, DMC-Garne, Nadeln und illustriertes Muster.'),
(135,'de','Einführungsset — Makramee',             'Makramee-Starterkit: 3mm Schnur 50m, Holzring, Perlen und Wandhänger-Tutorial.'),
(136,'de','Prestige-Coffret — Seide & Gold',       'Luxusset für erfahrene Stickerinnen: Madeira Seidengarne, Goldgarne, Premium-Leinen, Exklusivmuster.'),
(146,'de','Saisonales Set — Herbstpilze',          'Steinpilze und Pfifferlinge in freier Stickerei. Terracotta-Palette, Waldatmosphäre.'),
(147,'de','Saisonales Set — Winterrentier',        'Nordisches Rentier auf Schneegrund im Kreuzstich. Weihnachts-Set, mittleres Niveau.'),
(148,'de','Saisonales Set — Weihnachtssterne',     'Skandinavischer Sternenvorhang in Rot und Weiss gestickt. Zeitlose Weihnachtsdekoration.'),
(155,'de','Einlagen-Sortiment — 3 Typen',          'Set mit 3 Einlagen (Bügeleinlage, aufreissbar, löslich) je 30x50cm. Vollständige Entdeckung.'),
(158,'de','Maschinenstickgarn Metallic Gold — 200m','Goldenes Metallic-Garn 40wt, Spule 200m. Strahlende Goldakzente auf Maschinenstickereien.');

-- ============================================================
-- 6. IMAGES PRODUITS (URL placeholder)
-- ============================================================
INSERT INTO product_images (product_id, url, alt, sort_order, is_primary) VALUES
( 61,'https://storage.example.ch/products/ruban-soie-4mm-rose-1.webp',       'Ruban de soie 4mm rose poudré', 1, 1),
( 62,'https://storage.example.ch/products/ruban-soie-7mm-lavande-1.webp',    'Ruban de soie 7mm lavande', 1, 1),
( 63,'https://storage.example.ch/products/ruban-soie-13mm-sauge-1.webp',     'Ruban de soie 13mm vert sauge', 1, 1),
( 64,'https://storage.example.ch/products/rubans-soie-assortiment-1.webp',   'Assortiment rubans soie 10 couleurs', 1, 1),
( 65,'https://storage.example.ch/products/ruban-soie-ombre-1.webp',          'Ruban soie ombré coucher de soleil', 1, 1),
( 66,'https://storage.example.ch/products/kit-ruban-roses-1.webp',           'Kit broderie ruban roses anglaises', 1, 1),
( 67,'https://storage.example.ch/products/kit-ruban-pivoine-1.webp',         'Kit broderie ruban pivoine', 1, 1),
( 68,'https://storage.example.ch/products/kit-ruban-jardin-1.webp',          'Kit broderie ruban jardin secret', 1, 1),
( 69,'https://storage.example.ch/products/kit-ruban-lavande-1.webp',         'Kit broderie ruban lavande', 1, 1),
( 70,'https://storage.example.ch/products/kit-ruban-coeur-1.webp',           'Kit broderie ruban coeur fleuri', 1, 1),
( 71,'https://storage.example.ch/products/rocailles-miyuki-11-blanc-1.webp', 'Rocailles Miyuki 11/0 blanc perle', 1, 1),
( 72,'https://storage.example.ch/products/rocailles-toho-8-or-1.webp',       'Rocailles Toho 8/0 or mat', 1, 1),
( 73,'https://storage.example.ch/products/perles-boheme-4mm-1.webp',         'Perles de Bohème 4mm crystal AB', 1, 1),
( 74,'https://storage.example.ch/products/sequins-ronds-5mm-argent-1.webp',  'Séquins ronds 5mm argent', 1, 1),
( 75,'https://storage.example.ch/products/perles-assortiment-mix-1.webp',    'Assortiment perles broderie mix 50g', 1, 1),
( 76,'https://storage.example.ch/products/kit-perles-paon-1.webp',           'Kit broderie perles paon royal', 1, 1),
( 77,'https://storage.example.ch/products/kit-perles-papillon-1.webp',       'Kit broderie perles papillon nocturne', 1, 1),
( 78,'https://storage.example.ch/products/kit-perles-lotus-1.webp',          'Kit broderie perles fleur de lotus', 1, 1),
( 79,'https://storage.example.ch/products/kit-sequins-tropical-1.webp',      'Kit sequins plumes tropical', 1, 1),
( 80,'https://storage.example.ch/products/kit-perles-mandala-1.webp',        'Kit broderie perles mandala sacré', 1, 1),
( 81,'https://storage.example.ch/products/kit-tapisserie-renne-1.webp',      'Kit tapisserie renne nordique', 1, 1),
( 82,'https://storage.example.ch/products/kit-tapisserie-chateau-1.webp',    'Kit tapisserie château médiéval', 1, 1),
( 83,'https://storage.example.ch/products/kit-tapisserie-jardin-1.webp',     'Kit tapisserie jardin anglais', 1, 1),
( 84,'https://storage.example.ch/products/kit-petitpoint-dame-1.webp',       'Kit petit point portrait de dame', 1, 1),
( 85,'https://storage.example.ch/products/kit-tapisserie-roses-1.webp',      'Kit tapisserie bouquet roses', 1, 1),
( 86,'https://storage.example.ch/products/fil-laine-rouge-1.webp',           'Fil laine tapisserie rouge cardinal', 1, 1),
( 87,'https://storage.example.ch/products/fil-laine-vert-1.webp',            'Fil laine tapisserie vert sapin', 1, 1),
( 88,'https://storage.example.ch/products/coton-perle-3-ecru-1.webp',        'Coton perlé n°3 écru', 1, 1),
( 89,'https://storage.example.ch/products/coton-perle-5-bleu-1.webp',        'Coton perlé n°5 bleu nuit', 1, 1),
( 90,'https://storage.example.ch/products/coffret-laine-tapisserie-1.webp',  'Coffret fils laine tapisserie 24 couleurs', 1, 1),
( 91,'https://storage.example.ch/products/aiguille-punch-n1-1.webp',         'Aiguille punch needle fine n°1', 1, 1),
( 92,'https://storage.example.ch/products/aiguille-punch-n3-1.webp',         'Aiguille punch needle medium n°3', 1, 1),
( 93,'https://storage.example.ch/products/aiguille-punch-n5-1.webp',         'Aiguille punch needle large n°5', 1, 1),
( 94,'https://storage.example.ch/products/monks-cloth-5070-1.webp',          'Tissu monks cloth 50x70cm', 1, 1),
( 95,'https://storage.example.ch/products/cadre-punch-3030-1.webp',          'Cadre bois punch needle 30x30cm', 1, 1),
( 96,'https://storage.example.ch/products/kit-punch-renard-1.webp',          'Kit punch needle renard en forêt', 1, 1),
( 97,'https://storage.example.ch/products/kit-punch-cactus-1.webp',          'Kit punch needle cactus bohème', 1, 1),
( 98,'https://storage.example.ch/products/kit-punch-lettre-1.webp',          'Kit punch needle lettre prénom', 1, 1),
( 99,'https://storage.example.ch/products/kit-punch-champignons-1.webp',     'Kit punch needle champignons', 1, 1),
(100,'https://storage.example.ch/products/kit-punch-arc-en-ciel-1.webp',     'Kit punch needle arc-en-ciel', 1, 1),
(101,'https://storage.example.ch/products/corde-macrame-3mm-1.webp',         'Corde macramé coton 3mm 100m', 1, 1),
(102,'https://storage.example.ch/products/corde-macrame-5mm-1.webp',         'Corde macramé coton 5mm 50m', 1, 1),
(103,'https://storage.example.ch/products/corde-jute-2mm-1.webp',            'Corde jute naturel 2mm 200m', 1, 1),
(104,'https://storage.example.ch/products/fil-kraft-brun-1.webp',            'Fil kraft brun rouleau 100m', 1, 1),
(105,'https://storage.example.ch/products/cordes-macrame-5col-1.webp',       'Assortiment cordes macramé 5 couleurs', 1, 1),
(106,'https://storage.example.ch/products/kit-macrame-lune-1.webp',          'Kit macramé suspension murale lune', 1, 1),
(107,'https://storage.example.ch/products/kit-macrame-attrape-1.webp',       'Kit macramé attrape-rêves à plumes', 1, 1),
(108,'https://storage.example.ch/products/kit-macrame-sac-1.webp',           'Kit macramé sac boho', 1, 1),
(109,'https://storage.example.ch/products/kit-macrame-verres-1.webp',        'Kit macramé sous-verres set 6', 1, 1),
(110,'https://storage.example.ch/products/kit-macrame-rideau-1.webp',        'Kit macramé rideau à pompons', 1, 1),
(111,'https://storage.example.ch/products/lin-ecru-50cm-1.webp',             'Lin naturel écru 50cm', 1, 1),
(112,'https://storage.example.ch/products/coton-blanc-50x100-1.webp',        'Coton solide blanc cassé 50x100cm', 1, 1),
(113,'https://storage.example.ch/products/feutrine-rouge-2030-1.webp',       'Feutrine épaisse rouge 20x30cm', 1, 1),
(114,'https://storage.example.ch/products/organza-soie-blanc-1.webp',        'Organza de soie blanc 50cm', 1, 1),
(115,'https://storage.example.ch/products/velours-marine-50-1.webp',         'Velours marine 50x50cm', 1, 1),
(116,'https://storage.example.ch/products/fil-polyester-blanc-1.webp',       'Fil à coudre polyester blanc 500m', 1, 1),
(117,'https://storage.example.ch/products/fil-polyester-noir-1.webp',        'Fil à coudre polyester noir 500m', 1, 1),
(118,'https://storage.example.ch/products/fil-coton-naturel-1.webp',         'Fil à coudre coton naturel 100m', 1, 1),
(119,'https://storage.example.ch/products/fil-invisible-nylon-1.webp',       'Fil invisible nylon 200m', 1, 1),
(120,'https://storage.example.ch/products/fils-coudre-12col-1.webp',         'Assortiment fils à coudre 12 couleurs', 1, 1),
(121,'https://storage.example.ch/products/ciseaux-poulette-11-1.webp',       'Ciseaux broderie poulette 11cm', 1, 1),
(122,'https://storage.example.ch/products/ciseaux-couture-21-1.webp',        'Ciseaux couture inox 21cm', 1, 1),
(123,'https://storage.example.ch/products/ciseaux-cranteurs-19-1.webp',      'Ciseaux cranteurs 19cm', 1, 1),
(124,'https://storage.example.ch/products/cutter-rotatif-45-1.webp',         'Cutter rotatif 45mm', 1, 1),
(125,'https://storage.example.ch/products/kit-ciseaux-3pcs-etui-1.webp',     'Kit ciseaux broderie 3 pcs étui cuir', 1, 1),
(126,'https://storage.example.ch/products/metre-ruban-150-1.webp',           'Mètre-ruban rétractable 150cm', 1, 1),
(127,'https://storage.example.ch/products/marqueur-effacable-bleu-1.webp',   'Marqueur tissu effaçable bleu', 1, 1),
(128,'https://storage.example.ch/products/craie-tailleur-blanc-1.webp',      'Craie tailleur blanche paquet 10', 1, 1),
(129,'https://storage.example.ch/products/gabarits-hexagone-1.webp',         'Gabarits hexagones quilting set 5', 1, 1),
(130,'https://storage.example.ch/products/regle-patchwork-1560-1.webp',      'Règle patchwork 15x60cm', 1, 1),
(131,'https://storage.example.ch/products/coffret-debutant-pdc-1.webp',      'Coffret débutant point de croix', 1, 1),
(132,'https://storage.example.ch/products/coffret-debutant-brl-1.webp',      'Coffret débutant broderie libre', 1, 1),
(133,'https://storage.example.ch/products/coffret-initiation-punch-1.webp',  'Coffret initiation punch needle', 1, 1),
(134,'https://storage.example.ch/products/coffret-debutant-ruban-1.webp',    'Coffret débutant broderie ruban', 1, 1),
(135,'https://storage.example.ch/products/coffret-initiation-mac-1.webp',    'Coffret initiation macramé', 1, 1),
(136,'https://storage.example.ch/products/coffret-prestige-soie-1.webp',     'Coffret prestige soie et or', 1, 1),
(137,'https://storage.example.ch/products/coffret-expert-tapisserie-1.webp', 'Coffret expert tapisserie laine', 1, 1),
(138,'https://storage.example.ch/products/coffret-luxe-perles-1.webp',       'Coffret luxe broderie perles', 1, 1),
(139,'https://storage.example.ch/products/coffret-createur-punch-1.webp',    'Coffret créateur punch needle', 1, 1),
(140,'https://storage.example.ch/products/coffret-maitre-suisse-1.webp',     'Coffret maître point de croix suisse', 1, 1),
(141,'https://storage.example.ch/products/kit-hibiscus-1.webp',              'Kit saisonnier hibiscus tropical', 1, 1),
(142,'https://storage.example.ch/products/kit-coquelicots-1.webp',           'Kit saisonnier coquelicots des champs', 1, 1),
(143,'https://storage.example.ch/products/kit-bord-mer-1.webp',              'Kit saisonnier bord de mer', 1, 1),
(144,'https://storage.example.ch/products/kit-papillons-jardin-1.webp',      'Kit saisonnier papillons du jardin', 1, 1),
(145,'https://storage.example.ch/products/kit-fraises-1.webp',               'Kit saisonnier fraises bucoliques', 1, 1),
(146,'https://storage.example.ch/products/kit-champignons-1.webp',           'Kit saisonnier champignons automne', 1, 1),
(147,'https://storage.example.ch/products/kit-renne-hiver-1.webp',           'Kit saisonnier renne de l hiver', 1, 1),
(148,'https://storage.example.ch/products/kit-etoiles-noel-1.webp',          'Kit saisonnier étoiles de Noël', 1, 1),
(149,'https://storage.example.ch/products/kit-ours-polaire-1.webp',          'Kit saisonnier ours polaire', 1, 1),
(150,'https://storage.example.ch/products/kit-sapin-enneige-1.webp',         'Kit saisonnier sapin enneigé', 1, 1),
(151,'https://storage.example.ch/products/entoilage-thermocol-1.webp',       'Entoilage thermocollant léger 25x100cm', 1, 1),
(152,'https://storage.example.ch/products/entoilage-dechirable-1.webp',      'Entoilage déchirable blanc 30x100cm', 1, 1),
(153,'https://storage.example.ch/products/entoilage-hydrosoluble-1.webp',    'Entoilage hydrosoluble 20x100cm', 1, 1),
(154,'https://storage.example.ch/products/stabilisateur-mousse-1.webp',      'Stabilisateur mousse broderie machine', 1, 1),
(155,'https://storage.example.ch/products/kit-entoilages-3types-1.webp',     'Kit entoilages assortiment 3 types', 1, 1),
(156,'https://storage.example.ch/products/fil-machine-rayon-blanc-1.webp',   'Fil machine rayon blanc 1000m', 1, 1),
(157,'https://storage.example.ch/products/fil-machine-polyester-noir-1.webp','Fil machine polyester noir 1000m', 1, 1),
(158,'https://storage.example.ch/products/fil-machine-metallic-or-1.webp',   'Fil machine métallisé or 200m', 1, 1),
(159,'https://storage.example.ch/products/fil-canette-bobine-1.webp',        'Fil canette bobine machine 1000m', 1, 1),
(160,'https://storage.example.ch/products/fils-machine-10col-1.webp',        'Assortiment fils machine 10 couleurs', 1, 1);

SET FOREIGN_KEY_CHECKS = 1;
