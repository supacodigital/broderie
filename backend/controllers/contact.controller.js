const contactService = require('../services/contact.service');

// POST /api/v1/contact — message du formulaire de contact
const send = async (req, res, next) => {
  try {
    await contactService.send(req.body);
    res.json({ success: true, message: 'Message envoyé.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { send };
