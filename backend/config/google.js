const { OAuth2Client } = require('google-auth-library');

// Client Google OAuth — null si GOOGLE_CLIENT_ID non configuré (désactivation gracieuse)
const client = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

module.exports = client;
