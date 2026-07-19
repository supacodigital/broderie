// Config Babel minimale — Jest uniquement. Nécessaire car otplib dépend transitivement
// de paquets ESM purs (@scure/base, @noble/hashes) que le runtime CommonJS de Jest ne
// peut pas charger nativement. N'affecte jamais le code de production (node app.js
// démarre sans Babel — vérifié).
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
