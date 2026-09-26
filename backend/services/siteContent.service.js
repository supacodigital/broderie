const settingsRepository = require('../repositories/settings.repository');
const { readStyles, toShopStyles } = require('../utils/contentStyle.utils');

/* Contenu du site éditable par le super-administrateur : textes et mise en
   forme de la page d'accueil, de « Notre Histoire », du bandeau et des textes
   légaux. Les deux sont lus et enregistrés ensemble — une seule requête SQL,
   donc jamais un texte enregistré sans sa mise en forme, ou l'inverse. */

const TEXT_KEYS = {
  home:   settingsRepository.HOME_KEYS,
  about:  settingsRepository.ABOUT_KEYS,
  banner: settingsRepository.BANNER_KEYS,
  legal:  settingsRepository.LEGAL_KEYS,
};

/* Textes et mise en forme d'une page : { ...textes, styles }.
   `forShop` : version publique, où la clé de police devient la pile CSS
   appliquée telle quelle par la boutique. */
const getContent = async (page, { forShop = false } = {}) => {
  const styleKey = settingsRepository.STYLE_KEYS[page];
  const { [styleKey]: stylesJson, ...texts } = await settingsRepository.findSettings([...TEXT_KEYS[page], styleKey]);
  const styles = readStyles(stylesJson);
  return { ...texts, styles: forShop ? toShopStyles(styles) : styles };
};

/* Enregistre les textes déjà validés et, si elle est fournie, la mise en forme
   de la page (elle remplace alors l'ancienne en entier). */
const saveContent = async (page, texts, styles) => {
  const entries = { ...texts };
  if (styles !== undefined) entries[settingsRepository.STYLE_KEYS[page]] = JSON.stringify(styles);
  await settingsRepository.upsertSettings(entries);
  return getContent(page);
};

module.exports = { getContent, saveContent };
