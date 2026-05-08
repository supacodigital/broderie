const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');

// IMPORTANT : routes statiques avant les routes dynamiques pour éviter les conflits
router.get('/search', productController.search);
router.get('/', productController.getAll);
// Dispatch : id numérique → getById, sinon slug → getBySlug
router.get('/:identifier', (req, res, next) => {
  if (/^\d+$/.test(req.params.identifier)) {
    req.params.id = req.params.identifier;
    return productController.getById(req, res, next);
  }
  req.params.slug = req.params.identifier;
  return productController.getBySlug(req, res, next);
});

module.exports = router;
