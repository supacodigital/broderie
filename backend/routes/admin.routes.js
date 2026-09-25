const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/roles');
const searchLogController = require('../controllers/admin/searchLog.controller');

const dashboardController = require('../controllers/admin/dashboard.controller');
const supplierController  = require('../controllers/admin/supplier.controller');
const adminOrderController = require('../controllers/admin/order.controller');
const reviewController = require('../controllers/admin/review.controller');
const customerController = require('../controllers/admin/customer.controller');
const loyaltyAdminController = require('../controllers/admin/loyalty.controller');
const productAdminController = require('../controllers/admin/product.controller');
const categoryAdminController = require('../controllers/admin/category.controller');
const couponController          = require('../controllers/admin/coupon.controller');
const newsletterAdminController = require('../controllers/admin/newsletter.controller');
const settingsController        = require('../controllers/admin/settings.controller');
const shippingAdminController   = require('../controllers/admin/shipping.controller');
const restockController         = require('../controllers/admin/restock.controller');
const invoiceTrackingController = require('../controllers/admin/invoiceTracking.controller');
const { upload } = require('../middlewares/upload');
const { validate } = require('../middlewares/validate');
const { createCouponSchema, updateCouponSchema } = require('../validators/coupon.validator');
const { adminUpdateCustomerSchema, adminAddressSchema } = require('../validators/customer.validator');

// Toutes les routes admin nécessitent auth + rôle admin
router.use(requireAuth);
router.use(requireRole('admin'));

// Dashboard
router.get('/dashboard/stats', dashboardController.getStats);

// Produits
router.get('/products', productAdminController.getAll);
// Avant /products/:id : sinon « quality » serait lu comme un identifiant
router.get('/products/quality', productAdminController.getQuality);
router.post('/products', productAdminController.create);
router.put('/products/featured-order', productAdminController.updateFeaturedOrder);
/* Avant /products/:id ? Non : les deux chemins ne se recouvrent pas, mais on
   garde l'historique à côté de la fiche qu'il documente (ADM-21). */
router.get('/products/:id', productAdminController.getById);
router.get('/products/:id/price-history', productAdminController.getPriceHistory);
router.put('/products/:id', productAdminController.update);
// Vitrine d'accueil : bascule du seul drapeau « mis en avant »
router.put('/products/:id/featured', productAdminController.setFeatured);
router.delete('/products/:id', productAdminController.remove);
router.post('/products/:id/images', upload.single('image'), productAdminController.uploadImage);
router.put('/products/:id/images/:imageId/primary', productAdminController.setPrimaryImage);
router.delete('/products/:id/images/:imageId', productAdminController.removeImage);

// Catégories
router.get('/categories', categoryAdminController.getAll);
router.post('/categories', categoryAdminController.create);
router.get('/categories/:id', categoryAdminController.getById);
router.put('/categories/:id', categoryAdminController.update);
router.delete('/categories/:id', categoryAdminController.remove);

// Fournisseurs
// État des réassorts fournisseurs (ADM-09) — lecture seule
router.get('/restock',                     restockController.getSummary);
router.get('/restock/:supplierId',         restockController.getSupplierItems);
router.get('/restock/:supplierId/export',  restockController.exportSupplierCsv);

// Suivi des factures QR payées / à payer / en retard (ADM-09)
router.get('/invoices',        invoiceTrackingController.list);
router.get('/invoices/export', invoiceTrackingController.exportCsv);

router.get('/suppliers', supplierController.getAll);
router.post('/suppliers', supplierController.create);
router.get('/suppliers/:id/details', supplierController.getDetails);
router.get('/suppliers/:id', supplierController.getById);
router.put('/suppliers/:id', supplierController.update);
router.delete('/suppliers/:id', supplierController.remove);

// Commandes
router.get('/orders', adminOrderController.getAll);
router.get('/orders/:id', adminOrderController.getById);
router.put('/orders/:id/status', adminOrderController.updateStatus);
router.get('/orders/:id/invoice', adminOrderController.downloadInvoice);
router.get('/orders/:id/payment', adminOrderController.getPayment);
router.post('/orders/:id/twint-email', adminOrderController.sendTwintQr);

// Expédition — étiquette La Poste CH + tracking manuel
router.post('/orders/:id/label',    shippingAdminController.generateLabel);
router.get('/orders/:id/label',     shippingAdminController.downloadLabel);
router.put('/orders/:id/tracking',  shippingAdminController.updateTracking);

// Avis clients
// Recherches sans résultat — ce que les clientes cherchent en vain
router.get('/search-logs/no-results', searchLogController.getNoResults);

router.get('/reviews', reviewController.getAll);
router.put('/reviews/:id/approve', reviewController.approve);
router.delete('/reviews/:id', reviewController.remove);

// Clients
router.get('/customers', customerController.getAll);
router.get('/customers/:id', customerController.getById);
router.put('/customers/:id', validate(adminUpdateCustomerSchema), customerController.update);
// Adresses de la cliente, modifiables par la boutique
router.post('/customers/:id/addresses',               validate(adminAddressSchema), customerController.createAddress);
router.put('/customers/:id/addresses/:addressId',     validate(adminAddressSchema), customerController.updateAddress);
router.delete('/customers/:id/addresses/:addressId',  customerController.deleteAddress);

// Paramètres
router.get('/settings/tax-rates',  settingsController.getTaxRates);
router.put('/settings/tax-rates',  settingsController.updateTaxRates);
router.get('/settings/shipping',   settingsController.getShippingRates);
router.put('/settings/shipping',   settingsController.updateShippingRates);
router.get('/settings/store',      settingsController.getStoreSettings);
router.put('/settings/store',      settingsController.updateStoreSettings);
// Pages de contenu et blocs promotionnels — réservés au super-administrateur (ADM-08)
const superAdminOnly = requireRole('super_admin');
router.get('/settings/legal',      superAdminOnly, settingsController.getLegalSettings);
router.put('/settings/legal',      superAdminOnly, settingsController.updateLegalSettings);
router.get('/settings/about',      superAdminOnly, settingsController.getAboutSettings);
router.put('/settings/about',      superAdminOnly, settingsController.updateAboutSettings);
router.get('/settings/home',       superAdminOnly, settingsController.getHomeSettings);
router.put('/settings/home',       superAdminOnly, settingsController.updateHomeSettings);
router.get('/settings/banner',     superAdminOnly, settingsController.getBannerSettings);
router.put('/settings/banner',     superAdminOnly, settingsController.updateBannerSettings);
router.get('/settings/emails',     superAdminOnly, settingsController.getEmailSettings);
router.put('/settings/emails',     superAdminOnly, settingsController.updateEmailSettings);
router.get('/settings/pickup',     settingsController.getPickupSettings);
router.put('/settings/pickup',     settingsController.updatePickupSettings);
router.get('/settings/invoice',    settingsController.getInvoiceSettings);
router.put('/settings/invoice',    settingsController.updateInvoiceSettings);

// Coupons
router.get('/coupons', couponController.getAll);
router.post('/coupons', validate(createCouponSchema), couponController.create);
router.put('/coupons/:id', validate(updateCouponSchema), couponController.update);
router.delete('/coupons/:id', couponController.remove);

// Programme de fidélité
router.get('/loyalty/kpis',         loyaltyAdminController.getKpis);
router.get('/loyalty/tiers',        loyaltyAdminController.getTiers);
router.post('/loyalty/tiers',       loyaltyAdminController.createTier);
router.put('/loyalty/tiers/:id',    loyaltyAdminController.updateTier);
router.delete('/loyalty/tiers/:id', loyaltyAdminController.deleteTier);
router.get('/loyalty/accounts',     loyaltyAdminController.getAccounts);
router.get('/loyalty/rewards',      loyaltyAdminController.getRewards);

// Newsletter
router.get('/newsletter',            newsletterAdminController.getAll);
router.get('/newsletter/export',     newsletterAdminController.exportCsv);
router.delete('/newsletter/:id',     newsletterAdminController.unsubscribe);

module.exports = router;
