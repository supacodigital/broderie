const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const wishlistController = require('../controllers/wishlist.controller');
const { requireAuth } = require('../middlewares/auth');

// Toutes les routes utilisateur nécessitent une authentification
router.use(requireAuth);

router.get('/me', userController.getMe);
router.put('/me', userController.updateMe);
router.put('/me/password', userController.changePassword);
router.get('/me/addresses', userController.getAddresses);
router.post('/me/addresses', userController.createAddress);
router.put('/me/addresses/:id', userController.updateAddress);
router.delete('/me/addresses/:id', userController.deleteAddress);

// Wishlist
router.get('/me/wishlist', wishlistController.getWishlist);
router.post('/me/wishlist/:productId', wishlistController.addToWishlist);
router.delete('/me/wishlist/:productId', wishlistController.removeFromWishlist);

module.exports = router;
