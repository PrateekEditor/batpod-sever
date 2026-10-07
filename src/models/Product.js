const { mongoose } = require('../db');

/**
 * One product in the catalog. `listPrice` is the published MRP before any CPQ
 * discounting; the pricing engine never mutates it, it only derives a net price.
 */
const ProductSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    categorySlug: { type: String, required: true, lowercase: true, index: true },

    shortDescription: { type: String, default: '' },
    description: { type: String, default: '' },

    // Merchandising. `tags` drives the related-products scoring, so keep them
    // meaningful ("dominar", "keyring", "desk", "gift").
    tags: { type: [String], default: [], index: true },
    images: { type: [String], default: [] },

    listPrice: { type: Number, required: true, min: 0 },

    // What it actually costs you to make — used by the admin margin read-out.
    filamentGrams: { type: Number, default: 0 },
    printHours: { type: Number, default: 0 },
    handsOnMinutes: { type: Number, default: 0 },

    /**
     * Print geometry — what the plate planner needs.
     *
     * `footprintMm` is the part as it sits on the bed, not its bounding box in
     * CAD; `heightMm` decides whether it clears the gantry. `printMinutes` is
     * kept separate from `printHours` on purpose: printHours feeds the costing
     * model and is rounded, the planner needs the real slicer figure.
     */
    footprintMm: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    heightMm: { type: Number, default: 0 },
    printMinutes: { type: Number, default: 0 },
    colours: { type: [String], default: [] },
    supportsRequired: { type: Boolean, default: false },

    // Availability
    stockOnHand: { type: Number, default: 0 },
    madeToOrder: { type: Boolean, default: false },
    leadTimeDays: { type: Number, default: 3 },
    active: { type: Boolean, default: true },

    // CPQ hooks
    discountScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscountSchedule', default: null },
    kitEligible: { type: Boolean, default: false },

    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ProductSchema.index({ name: 'text', shortDescription: 'text', tags: 'text' });

ProductSchema.virtual('availability').get(function () {
  if (!this.active) return 'unavailable';
  if (this.madeToOrder) return 'made-to-order';
  if (this.stockOnHand > 5) return 'in-stock';
  if (this.stockOnHand > 0) return 'low-stock';
  return 'sold-out';
});


ProductSchema.virtual('plannable').get(function () {
  return Boolean(this.footprintMm && this.footprintMm.x > 0 && this.footprintMm.y > 0 && this.printMinutes > 0);
});

ProductSchema.set('toJSON', { virtuals: true });
ProductSchema.set('toObject', { virtuals: true });

module.exports = mongoose.models.Product || mongoose.model('Product', ProductSchema);
