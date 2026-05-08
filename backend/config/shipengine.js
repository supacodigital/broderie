const ShipEngine = require('shipengine');

if (!process.env.SHIPENGINE_API_KEY) {
  console.warn('[ShipEngine] SHIPENGINE_API_KEY manquante — étiquettes d\'expédition désactivées');
}

const shipengine = process.env.SHIPENGINE_API_KEY
  ? new ShipEngine.default({ apiKey: process.env.SHIPENGINE_API_KEY })
  : null;

module.exports = shipengine;
