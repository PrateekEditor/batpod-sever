const express = require('express');
const { lookup, estimate } = require('../pincode');

const router = express.Router();

/**
 * GET /api/pincode/:pin?production=1
 *
 * City, state and a delivery window for a pincode. No database — mounted
 * above the DB gate so the checkout form keeps working if Atlas is slow.
 */
router.get('/pincode/:pin', async (req, res) => {
  try {
    const place = await lookup(req.params.pin);
    if (!place) return res.status(404).json({ error: 'That pincode is not in the India Post directory. Check the digits.' });
    const productionDays = Math.min(14, Math.max(1, parseInt(req.query.production, 10) || 1));
    const window = estimate(place.state, { productionDays });
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ ...place, delivery: { ...window, from: window.from.toISOString(), to: window.to.toISOString() } });
  } catch (err) {
    res.status(502).json({ error: 'The pincode service did not answer. Type the city and state in by hand.' });
  }
});

module.exports = router;
