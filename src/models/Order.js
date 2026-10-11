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

    /** Set when the buyer was signed in. Guest orders leave it null. */
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    /**
     * Where the order came from. Marketplace orders arrive with their own
     * deadlines and penalties, so knowing the channel is what lets you decide
     * which plate to print first.
     */
    channel: {
      type: String,
      enum: ['website', 'instagram', 'youtube', 'whatsapp', 'bike-meet', 'amazon', 'etsy', 'partner-api', 'other'],
      default: 'website',
      index: true,
    },
    /** Free text for the specific source: a video title, an event name, a partner. */
    channelDetail: { type: String, default: '' },

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

    /**
     * Every status the order has been in, with when. The tracking page draws
     * its timeline from this; "shipped" on its own is a word, "shipped on
     * Tuesday at 17:10" is an answer.
     */
    statusHistory: { type: [{ status: String, at: Date, _id: false }], default: [] },
    trackingNote: { type: String, default: '' },
    courierRef: { type: String, default: '' },
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

OrderSchema.pre('save', function (next) {
  const last = this.statusHistory[this.statusHistory.length - 1];
  if (!last || last.status !== this.status) this.statusHistory.push({ status: this.status, at: new Date() });
  next();
});

/**
 * What a customer may see about an order without being signed in: enough to
 * track it, nothing that identifies the buyer beyond what they already know.
 */
OrderSchema.methods.toTracking = function () {
  return {
    reference: this.reference,
    status: this.status,
    statusHistory: this.statusHistory,
    trackingNote: this.trackingNote,
    courierRef: this.courierRef,
    channel: this.channel,
    lines: this.lines.map((l) => ({ name: l.name, quantity: l.quantity, slug: l.slug })),
    total: this.total,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

OrderSchema.statics.nextReference = function () {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BP-${stamp}-${rand}`;
};

module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);
