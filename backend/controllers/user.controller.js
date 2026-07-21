const bcrypt = require('bcrypt');
const { z } = require('zod');
const userRepository = require('../repositories/user.repository');
const { AppError } = require('../middlewares/errorHandler');

// Cantons suisses officiels (2 lettres)
const SWISS_CANTONS = ['AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE','NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH'];

// Schéma d'adresse du compte — validé côté serveur
const accountAddressSchema = z.object({
  label:        z.string().trim().min(1).max(100),
  address_type: z.enum(['shipping', 'billing', 'both']).optional(),
  first_name:   z.string().trim().max(100).optional().nullable(),
  last_name:    z.string().trim().max(100).optional().nullable(),
  street:        z.string().trim().min(1).max(255),
  street_number: z.string().trim().max(20).optional().nullable(),
  city:         z.string().trim().min(1).max(100),
  zip:          z.string().regex(/^\d{4}$/),
  canton:       z.enum(SWISS_CANTONS).optional().nullable(),
});

const getMe = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.id);
    if (!user) return next(new AppError('Utilisateur introuvable.', 404));
    /* Expose emailVerified (booléen) en plus des données brutes — cohérent avec /auth */
    res.json({ success: true, data: { ...user, emailVerified: !!user.email_verified_at } });
  } catch (error) {
    next(error);
  }
};

const updateMe = async (req, res, next) => {
  try {
    /* Accepte camelCase et snake_case pour la compatibilité frontend */
    const firstName = req.body.firstName ?? req.body.first_name;
    const lastName  = req.body.lastName  ?? req.body.last_name;
    /* Préserver la locale existante si non fournie dans le body */
    let { locale } = req.body;
    if (!locale) {
      const current = await userRepository.findById(req.user.id);
      locale = current?.locale ?? 'fr';
    }
    const user = await userRepository.update(req.user.id, { firstName, lastName, locale });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

const getAddresses = async (req, res, next) => {
  try {
    const addresses = await userRepository.findAddresses(req.user.id);
    res.json({ success: true, data: addresses });
  } catch (error) {
    next(error);
  }
};

const createAddress = async (req, res, next) => {
  try {
    const parsed = accountAddressSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Adresse invalide.' });
    }
    const isDefault = req.body.isDefault ?? req.body.is_default ?? false;
    const { label, address_type, first_name, last_name, street, street_number, city, zip, canton } = parsed.data;
    const addressId = await userRepository.createAddress(req.user.id, {
      label, addressType: address_type, firstName: first_name, lastName: last_name,
      street, streetNumber: street_number, city, zip, country: 'CH', canton, isDefault,
    });
    const addresses = await userRepository.findAddresses(req.user.id);
    const created = addresses.find((a) => a.id === addressId);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

const updateAddress = async (req, res, next) => {
  try {
    const parsed = accountAddressSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Adresse invalide.' });
    }
    const addressId = parseInt(req.params.id);
    const isDefault = req.body.isDefault ?? req.body.is_default ?? false;
    const { label, address_type, first_name, last_name, street, street_number, city, zip, canton } = parsed.data;
    await userRepository.updateAddress(addressId, req.user.id, {
      label, addressType: address_type, firstName: first_name, lastName: last_name,
      street, streetNumber: street_number, city, zip, country: 'CH', canton, isDefault,
    });
    const addresses = await userRepository.findAddresses(req.user.id);
    const updated = addresses.find((a) => a.id === addressId);
    if (!updated) return next(new AppError('Adresse introuvable.', 404));
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteAddress = async (req, res, next) => {
  try {
    const addressId = parseInt(req.params.id);
    const deleted = await userRepository.deleteAddress(addressId, req.user.id);
    if (!deleted) return next(new AppError('Adresse introuvable.', 404));
    res.json({ success: true, message: 'Adresse supprimée.' });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return next(new AppError('Mot de passe actuel et nouveau mot de passe requis.', 400));
    }
    if (new_password.length < 8) {
      return next(new AppError('Le nouveau mot de passe doit contenir au moins 8 caractères.', 400));
    }

    const user = await userRepository.findByIdWithPassword(req.user.id);
    if (!user) return next(new AppError('Utilisateur introuvable.', 404));

    if (!user.password_hash) {
      return next(new AppError('Ce compte utilise la connexion Google. La modification du mot de passe n\'est pas disponible.', 400));
    }

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return next(new AppError('Mot de passe actuel incorrect.', 401));

    const hash = await bcrypt.hash(new_password, 12);
    await userRepository.updatePassword(req.user.id, hash);

    res.json({ success: true, message: 'Mot de passe modifié avec succès.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMe, updateMe, getAddresses, createAddress, updateAddress, deleteAddress, changePassword };
