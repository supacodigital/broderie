const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/roles');

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
const { upload } = require('../middlewares/upload');

// Toutes les routes admin nécessitent auth + rôle admin ou super_admin
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));

// Dashboard
router.get('/dashboard/stats', dashboardController.getStats);

// Produits
router.get('/products', productAdminController.getAll);
router.post('/products', productAdminController.create);
router.get('/products/:id', productAdminController.getById);
router.put('/products/:id', productAdminController.update);
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

// Expédition — étiquette La Poste CH + tracking manuel
router.post('/orders/:id/label',    shippingAdminController.generateLabel);
router.get('/orders/:id/label',     shippingAdminController.downloadLabel);
router.put('/orders/:id/tracking',  shippingAdminController.updateTracking);

// Avis clients
router.get('/reviews', reviewController.getAll);
router.put('/reviews/:id/approve', reviewController.approve);
router.delete('/reviews/:id', reviewController.remove);

// Clients
router.get('/customers', customerController.getAll);
router.get('/customers/:id', customerController.getById);

// Paramètres
router.get('/settings/tax-rates',  settingsController.getTaxRates);
router.put('/settings/tax-rates',  settingsController.updateTaxRates);
router.get('/settings/shipping',   settingsController.getShippingRates);
router.put('/settings/shipping',   settingsController.updateShippingRates);
router.get('/settings/store',      settingsController.getStoreSettings);
router.put('/settings/store',      settingsController.updateStoreSettings);
router.get('/settings/legal',      settingsController.getLegalSettings);
router.put('/settings/legal',      settingsController.updateLegalSettings);

// Coupons
router.get('/coupons', couponController.getAll);
router.post('/coupons', couponController.create);
router.put('/coupons/:id', couponController.update);
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
