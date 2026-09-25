const customerRepository   = require('../../repositories/customer.admin.repository');
const newsletterRepository = require('../../repositories/newsletter.repository');
const loyaltyRepository    = require('../../repositories/loyalty.repository');
const userRepository       = require('../../repositories/user.repository');

const getAll = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const search = req.query.q || '';
    const sort   = req.query.sort || 'created_at';
    const order  = req.query.order || 'desc';

    const { rows, total } = await customerRepository.findAll({ page, limit, search, sort, order });

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/* Fiche client complète : le compte, plus ce que la boutique a besoin de savoir
   au téléphone — inscription newsletter et prochain palier de fidélité. */
const loadCustomer = async (id) => {
  const customer = await customerRepository.findById(id);
  if (!customer) return null;

  const [newsletterStatus, tiers] = await Promise.all([
    newsletterRepository.findStatusByEmail(customer.email),
    customer.loyalty ? loyaltyRepository.findTiers() : [],
  ]);

  // Premier palier actif que le cumul n'atteint pas encore
  const nextTier = tiers.find((t) => parseFloat(t.min_spend_chf) > customer.loyalty.total_spend_chf);
  return {
    ...customer,
    newsletter_status: newsletterStatus,
    loyalty: customer.loyalty && {
      ...customer.loyalty,
      next_tier: nextTier ? { name: nextTier.name, min_spend_chf: parseFloat(nextTier.min_spend_chf) } : null,
    },
  };
};

const getById = async (req, res, next) => {
  try {
    const data = await loadCustomer(parseInt(req.params.id));
    if (!data) return res.status(404).json({ success: false, message: 'Client introuvable.' });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// Modification de la fiche client — prénom, nom et adresse e-mail (CLI-06)
const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ success: false, message: 'Client introuvable.' });
    }
    // Corps déjà validé et normalisé par adminUpdateCustomerSchema (routes/admin.routes.js)
    const { first_name, last_name, email } = req.body;
    const result = await customerRepository.updateIdentity(id, {
      firstName: first_name, lastName: last_name, email,
    });
    if (result.notFound) return res.status(404).json({ success: false, message: 'Client introuvable.' });
    if (result.emailTaken) {
      return res.status(409).json({ success: false, message: 'Cette adresse e-mail est déjà utilisée par un autre compte.' });
    }
    const data = await loadCustomer(id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── Adresses de la cliente, gérées par la boutique ── */

const parseId = (value) => {
  const id = parseInt(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const notFound = (res, message) => res.status(404).json({ success: false, message });

// Corps validé par adminAddressSchema → champs attendus par user.repository
const toAddressFields = (body) => ({
  label:        body.label,
  addressType:  body.address_type,
  firstName:    body.first_name || null,
  lastName:     body.last_name || null,
  street:       body.street,
  streetNumber: body.street_number,
  city:         body.city,
  zip:          body.zip,
  country:      'CH',
  canton:       body.canton,
  phone:        body.phone || null,
});

const createAddress = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id || !(await customerRepository.clientExists(id))) return notFound(res, 'Client introuvable.');

    // La première adresse devient l'adresse par défaut
    const existing = await userRepository.findAddresses(id);
    await userRepository.createAddress(id, {
      ...toAddressFields(req.body),
      isDefault: req.body.is_default === true || existing.length === 0,
    });
    res.status(201).json({ success: true, data: await loadCustomer(id) });
  } catch (error) {
    next(error);
  }
};

const updateAddress = async (req, res, next) => {
  try {
    const id        = parseId(req.params.id);
    const addressId = parseId(req.params.addressId);
    if (!id || !(await customerRepository.clientExists(id))) return notFound(res, 'Client introuvable.');

    const existing = await userRepository.findAddresses(id);
    if (!addressId || !existing.some((a) => a.id === addressId)) return notFound(res, 'Adresse introuvable.');

    // null = statut « par défaut » inchangé (on ne le retire pas sans en désigner une autre)
    await userRepository.updateAddress(addressId, id, {
      ...toAddressFields(req.body),
      isDefault: req.body.is_default === true ? true : null,
    });
    res.json({ success: true, data: await loadCustomer(id) });
  } catch (error) {
    next(error);
  }
};

const deleteAddress = async (req, res, next) => {
  try {
    const id        = parseId(req.params.id);
    const addressId = parseId(req.params.addressId);
    if (!id || !(await customerRepository.clientExists(id))) return notFound(res, 'Client introuvable.');
    if (!addressId) return notFound(res, 'Adresse introuvable.');

    // Si c'était l'adresse par défaut, la suivante prend le relais (user.repository)
    const deleted = await userRepository.deleteAddress(addressId, id);
    if (!deleted) return notFound(res, 'Adresse introuvable.');
    res.json({ success: true, message: 'Adresse supprimée.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById, update, createAddress, updateAddress, deleteAddress };
