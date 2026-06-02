const express = require('express');
const stripe  = require('../lib/stripe');
const router  = express.Router();

// ── VALID REFERRAL CODES (server-authoritative) ───────────────────────────────
const VALID_REFERRAL_CODES = new Set([
  'DIRT-SHELLBREAK-2026',
  'SHELLBREAK',
  'DIRT10',
  'BREAK',
]);

// ── RATE LIMITER (in-memory, per IP, no external deps) ────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT    = 10;   // max requests
const RATE_WINDOW   = 60_000; // per 60 seconds

function rateLimit(req, res, next) {
  const ip  = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - rec.start > RATE_WINDOW) {
    rec.count = 1;
    rec.start = now;
  } else {
    rec.count++;
  }

  rateLimitMap.set(ip, rec);

  if (rec.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
  }
  next();
}

// Purge stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, rec] of rateLimitMap) {
    if (rec.start < cutoff) rateLimitMap.delete(ip);
  }
}, 5 * 60_000);

// ── POST /create-checkout-session ─────────────────────────────────────────────
router.post('/create-checkout-session', rateLimit, async (req, res) => {
  const {
    firstName, lastName, email,
    companyName, industry, stage, mission, goal,
    hasReferral, referral,
  } = req.body;

  if (!email || !firstName || !lastName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Basic email format check server-side
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Validate referral server-side — client flag is not trusted
  const referralCode = String(referral || '').trim().toUpperCase();
  const referralValid = VALID_REFERRAL_CODES.has(referralCode);
  const useDiscount   = hasReferral && referralValid;

  const priceId = useDiscount
    ? process.env.STRIPE_PRICE_ID_DISCOUNTED
    : process.env.STRIPE_PRICE_ID;

  if (!priceId) {
    return res.status(500).json({ error: 'Price not configured. Check your .env file.' });
  }

  try {
    const existing = await stripe.customers.list({ email, limit: 1 });
    let customer;
    if (existing.data.length > 0) {
      customer = existing.data[0];
      await stripe.customers.update(customer.id, {
        name: `${firstName} ${lastName}`,
        metadata: { companyName, industry, stage, mission, goal },
      });
    } else {
      customer = await stripe.customers.create({
        email,
        name: `${firstName} ${lastName}`,
        metadata: { companyName, industry, stage, mission, goal },
      });
    }

    const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${base}/checkout`,
      metadata: {
        firstName, lastName, companyName, industry, stage, goal,
        product:  'DIRT-SHELLBREAK-30DAY',
        referral: useDiscount ? referralCode : '0',
      },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[checkout] Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
