/* Configuration PM2 — gestionnaire de process pour l'API en production (VPS Infomaniak).
   L'app Express sert l'API + les builds frontend/admin + /uploads (architecture mono-domaine).
   Démarrage :  pm2 start ecosystem.config.js --env production
   Logs :       pm2 logs broderie-api
   Redémarrage : pm2 reload broderie-api   (zéro-downtime)
   Persistance au reboot : pm2 startup  puis  pm2 save */
module.exports = {
  apps: [
    {
      name: 'broderie-api',
      cwd: './backend',
      script: 'app.js',
      // ⚠️ Mode fork (1 seul process) — volontaire, ne pas repasser en cluster sans
      // externaliser d'abord les deux états gardés EN MÉMOIRE DE PROCESS :
      //   1. express-rate-limit (app.js, auth.routes.js, mfa.routes.js) — un compteur
      //      par worker ⇒ N workers = limites multipliées par N. En cluster sur 4 cœurs,
      //      la protection anti-brute-force MFA passerait de 5 à 20 tentatives/15 min.
      //   2. node-cache (config/cache.js) — invalidateProducts() ne vide que le cache
      //      du worker qui traite la requête ⇒ une modification produit dans l'admin
      //      apparaîtrait/disparaîtrait selon le worker qui répond, pendant 5 min.
      // Pour repasser en cluster : store Redis pour le rate limit + cache partagé.
      // Le trafic attendu (boutique artisanale) tient très largement sur un process.
      instances: 1,
      exec_mode: 'fork',
      // Redémarrage auto si le process dépasse cette mémoire (fuite éventuelle)
      max_memory_restart: '500M',
      // Ne pas relancer en boucle si crash immédiat au démarrage
      min_uptime: '10s',
      max_restarts: 10,
      // Variables chargées depuis backend/.env.production via dotenv dans app.js ;
      // on force seulement NODE_ENV ici.
      env_production: {
        NODE_ENV: 'production',
      },
      // Logs horodatés
      time: true,
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
    },
  ],
}
