const settingsRepository = require('../repositories/settings.repository');

// GET /api/v1/legal — textes légaux publics (CGV, mentions légales), sans auth
const getLegalTexts = async (req, res, next) => {
  try {
    const data = await settingsRepository.findSettings(settingsRepository.LEGAL_KEYS);
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
    const data = await settingsRepository.findSettings(settingsRepository.BANNER_KEYS);
    const enabled = data.banner_enabled === '1' && Boolean((data.banner_text ?? '').trim());
    res.json({
      success: true,
      data: enabled
        ? { text: data.banner_text, link: data.banner_link || null }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getLegalTexts, getBanner };
