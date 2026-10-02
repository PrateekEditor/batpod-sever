const express = require('express');
const QuoteRequest = require('../models/QuoteRequest');
const PartnerKey = require('../models/PartnerKey');
const { estimateCustomPrint, estimatorOptions } = require('../pricing/customEstimate');

const router = express.Router();

/**
 * Partner access.
 *
 * The estimator is meant to be callable by other print shops. Until you
 * publicise it, it stays open — flip REQUIRE_PARTNER_KEY=true and every caller
 * needs an `x-api-key` issued from the admin. The website itself always passes,
 * because it is same-origin and already covered by CORS.
 */
async function partnerGate(req, res, next) {
  const required = String(process.env.REQUIRE_PARTNER_KEY || '').toLowerCase() === 'true';
  const provided = req.get('x-api-key');

  if (!provided) {
    if (!required) {
      req.partner = null;
      return next();
    }
    return res.status(401).json({ error: 'An x-api-key header is required.' });
  }

  try {
    const key = await PartnerKey.findOne({ key: provided, active: true });
    if (!key) return res.status(401).json({ error: 'That API key is not recognised.' });

    req.partner = key;
    // Fire and forget — usage stats are not worth failing a request over.
    PartnerKey.updateOne({ _id: key._id }, { $inc: { callCount: 1 }, $set: { lastUsedAt: new Date() } }).catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/custom/options
 * Everything the form needs: the dropdown values, accepted file types, size cap.
 * Public and cacheable — a partner building a UI starts here.
 */
router.get('/custom/options', (_req, res) => {
  res.json(estimatorOptions());
});

/**
 * POST /api/custom/estimate
 *
 * Stateless. Nothing is saved, nothing is emailed. Call it as often as you like
 * while the customer moves the sliders.
 *
 * Pass `mesh: { volumeCm3 }` instead of `size` once you are parsing files —
 * the response shape does not change, so integrations keep working.
 */
router.post('/custom/estimate', partnerGate, (req, res) => {
  const result = estimateCustomPrint(req.body || {});
  if (!result.ok) return res.status(400).json({ error: result.errors.join(' '), errors: result.errors });
  res.json(result);
});

/**
 * POST /api/custom/requests
 *
 * The customer liked the estimate and wants it actually made. Recalculates
 * server-side rather than trusting the estimate in the body, then stores the
 * request for the admin.
 */
router.post('/custom/requests', partnerGate, async (req, res, next) => {
  try {
    const { contact = {}, spec = {}, file = {}, message = '' } = req.body || {};

    if (!contact.email && !contact.phone) {
      return res.status(400).json({ error: 'An email address or a phone number is needed, or there is no way to reply.' });
    }

    const result = estimateCustomPrint(spec);
    if (!result.ok) return res.status(400).json({ error: result.errors.join(' '), errors: result.errors });

    const maxMb = Number(process.env.CUSTOM_MAX_FILE_MB || 50);
    if (file.sizeBytes && file.sizeBytes > maxMb * 1024 * 1024) {
      return res.status(400).json({ error: `That file is over the ${maxMb} MB limit. Split it, or send it by email.` });
    }

    const doc = await QuoteRequest.create({
      reference: QuoteRequest.nextReference(),
      contact: { name: contact.name || '', email: contact.email || '', phone: contact.phone || '' },
      spec: {
        size: spec.size,
        material: spec.material,
        quality: spec.quality,
        complexity: spec.complexity,
        infill: Number(spec.infill),
        quantity: Number(spec.quantity),
        colours: Number(spec.colours) || 1,
        rush: Boolean(spec.rush),
      },
      file: { name: file.name || '', sizeBytes: Number(file.sizeBytes) || 0, type: file.type || '' },
      message,
      estimate: result.estimate,
      source: req.partner ? `partner:${req.partner.label}` : 'website',
    });

    res.status(201).json({
      reference: doc.reference,
      estimate: result.estimate,
      message: 'Request received. Send the file over and you get a firm price back.',
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/custom/requests/:reference — lets a customer check back. */
router.get('/custom/requests/:reference', async (req, res, next) => {
  try {
    const doc = await QuoteRequest.findOne({ reference: req.params.reference.toUpperCase() })
      .select('-internalNotes')
      .lean();
    if (!doc) return res.status(404).json({ error: 'No request with that reference.' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
