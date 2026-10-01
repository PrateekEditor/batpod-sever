const { mongoose } = require('../db');

/**
 * Conditions-and-actions price rule, in the shape of a Salesforce CPQ Price Rule.
 *
 * scope "line"  — evaluated once per cart line, actions adjust that line.
 * scope "order" — evaluated once for the whole cart, actions adjust the total.
 *
 * Rules run in ascending `priority`. `stopProcessing` on a matched rule halts
 * evaluation of any later rules in the same scope, which is how you build
 * "best discount wins" instead of stacking everything.
 */
const ConditionSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
      // line scope: quantity, listPrice, lineTotal, categorySlug, sku, tags
      // order scope: subtotal, itemCount, lineCount, categoriesInCart, couponCode
    },
    operator: {
      type: String,
      required: true,
      enum: ['equals', 'notEquals', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'in', 'notIn', 'contains'],
    },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const ActionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['percentDiscount', 'amountDiscount', 'setUnitPrice', 'freeShipping'],
    },
    value: { type: Number, default: 0 },
    label: { type: String, default: '' },
  },
  { _id: false }
);

const PriceRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    scope: { type: String, enum: ['line', 'order'], default: 'line' },
    active: { type: Boolean, default: true },
    priority: { type: Number, default: 100 },
    // "all" = every condition must pass, "any" = at least one
    conditionLogic: { type: String, enum: ['all', 'any'], default: 'all' },
    conditions: { type: [ConditionSchema], default: [] },
    actions: { type: [ActionSchema], default: [] },
    stopProcessing: { type: Boolean, default: false },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.PriceRule || mongoose.model('PriceRule', PriceRuleSchema);
