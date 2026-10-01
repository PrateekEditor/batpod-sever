const { mongoose } = require('../db');

const CouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['percent', 'amount'], default: 'percent' },
    value: { type: Number, required: true, min: 0 },
    minSubtotal: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: null },
    usageLimit: { type: Number, default: null },
    timesUsed: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CouponSchema.methods.isRedeemable = function (subtotal) {
  if (!this.active) return { ok: false, reason: 'This code is no longer active.' };
  if (this.expiresAt && this.expiresAt < new Date()) return { ok: false, reason: 'This code has expired.' };
  if (this.usageLimit !== null && this.timesUsed >= this.usageLimit)
    return { ok: false, reason: 'This code has been fully redeemed.' };
  if (subtotal < this.minSubtotal)
    return { ok: false, reason: `Add ₹${Math.ceil(this.minSubtotal - subtotal)} more to use this code.` };
  return { ok: true };
};

module.exports = mongoose.models.Coupon || mongoose.model('Coupon', CouponSchema);
