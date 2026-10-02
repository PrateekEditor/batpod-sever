const { mongoose } = require('../db');

/**
 * Something you bought for the business — a printer, a filament dryer, a
 * licence. Stored so the admin can answer one question: has this paid for
 * itself yet, and if not, when will it?
 */
const PurchaseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['printer', 'material', 'tool', 'software', 'marketing', 'other'],
      default: 'other',
    },
    cost: { type: Number, required: true, min: 0 },
    purchasedOn: { type: Date, default: Date.now },
    notes: { type: String, default: '' },

    // What you expected it to do for you, recorded at purchase time so you can
    // check later whether the reasoning held up.
    expectedMonthlyBenefit: { type: Number, default: 0 },

    // Recurring costs (a subscription) are a different animal from a one-off.
    recurringMonthly: { type: Number, default: 0 },

    retired: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Purchase || mongoose.model('Purchase', PurchaseSchema);
