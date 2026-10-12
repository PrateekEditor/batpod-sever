const express = require('express');
const ProductImage = require('../models/ProductImage');

const router = express.Router();

/** GET /api/images/:id — the bytes, cached for a year (ids never change content). */
router.get('/images/:id', async (req, res, next) => {
  try {
    const img = await ProductImage.findById(req.params.id).select('+data');
    if (!img) return res.status(404).end();
    res.set('Content-Type', img.contentType);
    res.set('Content-Length', String(img.bytes));
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(img.data);
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).end();
    next(err);
  }
});

module.exports = router;
