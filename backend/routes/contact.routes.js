const express    = require('express');
const router     = express.Router();
const { send }   = require('../controllers/contact.controller');

router.post('/', send);

module.exports = router;
