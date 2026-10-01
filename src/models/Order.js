const { mongoose } = require('../db');

/**
 * An order is stored as a frozen copy of the quote, not as a list of product
 * references. Prices and discount rules change; what the customer agreed to
 * must not. `pricingSnapshot` keeps the full adjustment trail for that reason.
 */
const OrderLineSchema = new mongoose.Schema(
  {
    sku: String,
    name: String,
    slug: String,
    quantity: Number,
    listPrice: Number,
    netUnitPrice: Number,
    netLineTotal: Number,
    adjustments: { type: Array, default: [] },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['draft', 'placed', 'printing', 'shipped', 'delivered', 'cancelled'],
      default: 'draft',
    },
    customer: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      address: { type: String, default: '' },
      city: { type: String, default: '' },
      pincode: { type: String, default: '' },
    },
    lines: { type: [OrderLineSchema], default: [] },
    couponCode: { type: String, default: '' },
    grossSubtotal: Number,
    subtotal: Number,
    shipping: { type: Number, default: 0 },
    total: Number,
    totalSaved: { type: Number, default: 0 },
    pricingSnapshot: { type: Object, default: {} },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

OrderSchema.statics.nextReference = function () {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BP-${stamp}-${rand}`;
};

module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);
