const express = require('express');
const stripe  = require('../lib/stripe');
const router  = express.Router();

// POST /webhook  — raw body required (configured in server.js)
router.post('/webhook', (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.warn('[webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature check');
    return res.json({ received: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object;
      const meta    = session.metadata || {};
      console.log('✅ DIRT payment complete:', {
        customer:    session.customer,
        email:       session.customer_details?.email,
        amount:      `$${(session.amount_total / 100).toFixed(2)}`,
        company:     meta.companyName,
        industry:    meta.industry,
        goal:        meta.goal,
        referral:    meta.referral === '1',
      });
      // TODO: send onboarding email, provision DIRT account
      break;
    }

    case 'customer.subscription.created': {
      const sub = event.data.object;
      console.log('🟢 Subscription created:', sub.id, '→ customer', sub.customer);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log('🔴 Subscription cancelled:', sub.id, '→ customer', sub.customer);
      // TODO: revoke DIRT access
      break;
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object;
      console.warn('⚠ Payment failed:', inv.customer, '→', inv.hosted_invoice_url);
      // TODO: send dunning email
      break;
    }

    default:
      console.log(`[webhook] Unhandled: ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
