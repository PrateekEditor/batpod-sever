const { mongoose } = require('../db');

/**
 * Volume discount tiers, modelled on the Salesforce CPQ Discount Schedule.
 *
 *  type "range" — the whole quantity is priced at the tier the quantity lands in.
 *  type "slab"  — each tier prices only the units that fall inside it, so a
 *                 quantity of 12 against tiers 1-5 / 6-10 / 11+ is charged as
 *                 5 units at tier 1, 5 at tier 2 and 2 at tier 3.
 *
 * `upperBound` is exclusive and null means "and above".
 */
const TierSchema = new mongoose.Schema(
  {
    lowerBound: { type: Number, required: true, min: 1 },
    upperBound: { type: Number, default: null },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const DiscountScheduleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['range', 'slab'], default: 'range' },
    active: { type: Boolean, default: true },
    tiers: { type: [TierSchema], default: [] },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

DiscountScheduleSchema.pre('save', function (next) {
  this.tiers.sort((a, b) => a.lowerBound - b.lowerBound);
  next();
});

module.exports =
  mongoose.models.DiscountSchedule || mongoose.model('DiscountSchedule', DiscountScheduleSchema);
