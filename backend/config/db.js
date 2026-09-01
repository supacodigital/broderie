const mysql = require('mysql2/promise');
const env = require('./env');

// Pool de connexions MySQL — ne jamais utiliser mysql.createConnection() directement
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  connectionLimit: 20,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // 'local' — suit le fuseau système (Europe/Zurich), qui gère automatiquement l'heure d'été/hiver.
  // Une valeur fixe comme '+01:00' casserait l'affichage dès le passage à l'heure d'été (+02:00).
  timezone: 'local',
  charset: 'utf8mb4',
});

// Vérification de la connexion au démarrage
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT VERSION() AS version, DATABASE() AS db');
    const { version, db } = rows[0];
    console.log(`✅ MySQL connecté  — host: ${env.db.host}:${env.db.port} | base: ${db} | version: ${version}`);
    connection.release();
  } catch (error) {
    console.error('❌ Erreur connexion MySQL:', error.message);
    process.exit(1);
  }
};

module.exports = { pool, testConnection };
