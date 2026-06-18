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
      // Mode cluster — exploite plusieurs cœurs CPU sans changer le code (Express stateless).
      // Passer à un nombre fixe (ex: 2) si le VPS a peu de RAM.
      instances: 'max',
      exec_mode: 'cluster',
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
