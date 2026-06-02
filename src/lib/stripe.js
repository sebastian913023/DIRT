require('dotenv').config();
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set. Copy .env.example → .env and fill in your keys.');
}

module.exports = Stripe(process.env.STRIPE_SECRET_KEY);
