const Stripe = require('stripe');

// Warn at startup if key is missing — server still boots; checkout routes will return an error
if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_...') {
    console.warn('[WARN] STRIPE_SECRET_KEY is not set or is still a placeholder.\n       Copy .env.example → .env and fill in your Stripe keys.');
}

module.exports = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
