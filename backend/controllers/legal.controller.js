const siteContentService = require('../services/siteContent.service');

/* Chaque réponse porte, en plus des textes, leur mise en forme (`styles`) :
   un objet par texte mis en forme dans l'administration, où la police est déjà
   la pile CSS à appliquer. Un texte absent de `styles` garde l'apparence
   prévue par la boutique. */

// GET /api/v1/legal — textes légaux publics (CGV, mentions légales), sans auth
const getLegalTexts = async (req, res, next) => {
  try {
    const data = await siteContentService.getContent('legal', { forShop: true });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* GET /api/v1/legal/banner — bandeau d'annonce public, sans auth.
   Ne renvoie rien quand le bandeau est désactivé ou son texte vide : la boutique
   n'a pas à décider de l'afficher, elle affiche ce qu'elle reçoit. */
const getBanner = async (req, res, next) => {
  try {
    const data = await siteContentService.getContent('banner', { forShop: true });
    const enabled = data.banner_enabled === '1' && Boolean((data.banner_text ?? '').trim());
    res.json({
      success: true,
      data: enabled
        ? { text: data.banner_text, link: data.banner_link || null, style: data.styles.banner_text ?? null }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

/* GET /api/v1/legal/about — contenu éditable de la page « Notre Histoire ».
   Les clés vides sont renvoyées telles quelles : c'est la boutique qui retombe
   sur son texte d'origine, elle seule connaît ses valeurs par défaut. */
const getAboutContent = async (req, res, next) => {
  try {
    const data = await siteContentService.getContent('about', { forShop: true });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* GET /api/v1/legal/home — textes éditables de la page d'accueil (ADM-08).
   Même règle que « Notre Histoire » : une clé vide laisse la boutique afficher
   son texte d'origine. */
const getHomeContent = async (req, res, next) => {
  try {
    const data = await siteContentService.getContent('home', { forShop: true });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = { getLegalTexts, getBanner, getAboutContent, getHomeContent };
