const { mongoose } = require('../db');

/**
 * Whether the shop is taking orders.
 *
 * One document, keyed 'shop'. Three modes:
 *   open         - business as usual
 *   paused       - you are away (a ride, a festival, a holiday); browsing is
 *                  allowed if you say so, ordering is not
 *   maintenance  - something is broken and you are fixing it; nothing works
 *
 * The storefront reads this every minute and swaps itself for a holding page
 * when the mode is not open; quote and order routes refuse too, so a stale
 * tab cannot slip an order through.
 */
const ShopStatusSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'shop', unique: true },
    mode: { type: String, enum: ['open', 'paused', 'maintenance'], default: 'open' },
    title: { type: String, default: '' },
    message: { type: String, default: '' },
    until: { type: Date, default: null },
    allowBrowsing: { type: Boolean, default: true },
    changedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.ShopStatus || mongoose.model('ShopStatus', ShopStatusSchema);
