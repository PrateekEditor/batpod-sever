const { mongoose } = require('../db');

/**
 * Someone asked for a custom print.
 *
 * The file itself is NOT stored — only its name, size and type. Accepting
 * arbitrary uploads means storage, virus scanning and a privacy policy, none of
 * which exist yet. The customer sends the actual file by email once you reply,
 * which is also when you find out whether the job is worth taking.
 */
const QuoteRequestSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },

    contact: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },

    // Exactly what was chosen, so you can reproduce the quote later
    spec: {
      size: String,
      material: String,
      quality: String,
      complexity: String,
      infill: Number,
      quantity: Number,
      colours: Number,
      rush: Boolean,
    },

    file: {
      name: { type: String, default: '' },
      sizeBytes: { type: Number, default: 0 },
      type: { type: String, default: '' },
    },

    message: { type: String, default: '' },

    // The estimate as it was shown. Frozen — your rates will change.
    estimate: { type: Object, default: {} },

    // What you came back with after actually slicing it
    revisedTotal: { type: Number, default: null },
    revisedLeadDays: { type: Number, default: null },
    internalNotes: { type: String, default: '' },

    status: {
      type: String,
      enum: ['new', 'reviewing', 'quoted', 'accepted', 'declined', 'completed'],
      default: 'new',
    },

    // Which partner sent it, once other freelancers are calling the API
    source: { type: String, default: 'website' },
  },
  { timestamps: true }
);

QuoteRequestSchema.statics.nextReference = function () {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `CQ-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

module.exports = mongoose.models.QuoteRequest || mongoose.model('QuoteRequest', QuoteRequestSchema);
