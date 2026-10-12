const mongoose = require('mongoose');

/**
 * A product photo, stored in the database.
 *
 * There is no file storage on Vercel and no CDN account to depend on, so the
 * bytes live in Atlas next to the product. The admin resizes and compresses
 * in the browser before upload (longest side 1200 px, JPEG or WebP, usually
 * 60–150 KB), which keeps a product's set of photos well under a megabyte.
 * They are served from GET /api/images/:id with a year-long cache header and
 * never embedded in catalog responses, so listings stay small.
 */
const ProductImageSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true, required: true },
    data: { type: Buffer, required: true, select: false },
    contentType: { type: String, required: true },
    bytes: { type: Number, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    alt: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.ProductImage || mongoose.model('ProductImage', ProductImageSchema);
