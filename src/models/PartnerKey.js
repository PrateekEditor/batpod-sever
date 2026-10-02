const { mongoose } = require('../db');

/**
 * An API key for another print shop calling the estimator.
 *
 * Keys are stored in plain text, which is fine for what they protect — a
 * pricing estimate, not anyone's data. Treat that as a deliberate choice, not
 * an oversight, and revisit it the moment these keys unlock anything else.
 */
const PartnerKeySchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true },
    contactEmail: { type: String, default: '' },
    active: { type: Boolean, default: true },
    callCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
    monthlyLimit: { type: Number, default: 1000 },
  },
  { timestamps: true }
);

PartnerKeySchema.statics.generate = function () {
  return 'bpk_' + require('crypto').randomBytes(18).toString('hex');
};

module.exports = mongoose.models.PartnerKey || mongoose.model('PartnerKey', PartnerKeySchema);
