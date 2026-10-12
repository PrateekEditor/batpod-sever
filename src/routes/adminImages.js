const express = require('express');
const Product = require('../models/Product');
const ProductImage = require('../models/ProductImage');

/**
 * Product photos, admin side.
 *
 *   POST   /api/admin/products/:id/images   { dataUrl, alt? }  → updated product
 *   DELETE /api/admin/products/:id/images/:imageId             → updated product
 *   PUT    /api/admin/products/:id/images   { order: [url…] }  → updated product (reorder)
 *
 * The body is a data: URL from the admin's in-browser resize. Hard limits
 * here are the backstop: anything over 1.5 MB after compression is refused
 * rather than stored, because it means the resize did not happen.
 */
const router = express.Router({ mergeParams: true });
const MAX_BYTES = 1.5 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const urlFor = (img) => `/api/images/${img._id}`;

router.post('/', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    const m = /^data:(image\/[a-z]+);base64,(.+)$/s.exec(String(req.body.dataUrl || ''));
    if (!m || !TYPES.has(m[1])) return res.status(400).json({ error: 'Send a JPEG, PNG or WebP as a data URL.' });
    const data = Buffer.from(m[2], 'base64');
    if (data.length > MAX_BYTES) return res.status(413).json({ error: `Image is ${Math.round(data.length / 1024)} KB after compression; the limit is ${MAX_BYTES / 1024} KB.` });
    if ((product.images || []).length >= 8) return res.status(400).json({ error: 'Eight photos per product is plenty. Remove one first.' });

    const img = await ProductImage.create({
      product: product._id,
      data,
      contentType: m[1],
      bytes: data.length,
      width: Number(req.body.width) || 0,
      height: Number(req.body.height) || 0,
      alt: String(req.body.alt || '').slice(0, 160),
    });
    product.images = [...(product.images || []), urlFor(img)];
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    const order = Array.isArray(req.body.order) ? req.body.order.map(String) : [];
    const current = product.images || [];
    // Only accept a permutation of what is already there.
    if (order.length !== current.length || order.some((u) => !current.includes(u))) {
      return res.status(400).json({ error: 'Order must list exactly the current images.' });
    }
    product.images = order;
    await product.save();
    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.delete('/:imageId', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    const url = `/api/images/${req.params.imageId}`;
    product.images = (product.images || []).filter((u) => u !== url);
    await product.save();
    await ProductImage.deleteOne({ _id: req.params.imageId, product: product._id });
    res.json(product);
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
    next(err);
  }
});

module.exports = router;
