const express  = require('express');
const stripe   = require('../lib/stripe');
const { db, q } = require('../lib/db');
const router   = express.Router();

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
      const email   = session.customer_details?.email || '';
      const name    = `${meta.firstName || ''} ${meta.lastName || ''}`.trim();

      console.log('✅ DIRT payment complete:', {
        customer: session.customer,
        email,
        amount:   `$${(session.amount_total / 100).toFixed(2)}`,
        company:  meta.companyName,
      });

      // Provision user in DIRT platform database
      if (email) {
        try {
          q.createUser.run({
            email:                   email.toLowerCase(),
            name:                    name || null,
            company_name:            meta.companyName   || null,
            industry:                meta.industry      || null,
            stage:                   meta.stage         || null,
            mission:                 null,
            goal:                    meta.goal          || null,
            stripe_customer_id:      session.customer   || null,
            stripe_subscription_id:  null,
          });
          console.log(`⬡  DIRT user provisioned: ${email}`);
        } catch (err) {
          console.warn('[webhook] createUser skipped (likely duplicate):', err.message);
        }
      }
      break;
    }

    case 'customer.subscription.created': {
      const sub = event.data.object;
      console.log('🟢 Subscription created:', sub.id, '→ customer', sub.customer);
      // Update subscription ID on user record
      const user = q.getUserByStripe.get(sub.customer);
      if (user) {
        db.prepare('UPDATE users SET stripe_subscription_id = ? WHERE id = ?')
          .run(sub.id, user.id);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log('🔴 Subscription cancelled:', sub.id, '→ customer', sub.customer);
      const cancelledUser = q.getUserByStripe.get(sub.customer);
      if (cancelledUser) {
        db.prepare('UPDATE users SET stripe_subscription_id = NULL, credits_remaining = 0 WHERE id = ?')
          .run(cancelledUser.id);
        console.log(`⬡  DIRT access revoked: ${cancelledUser.email}`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object;
      console.warn('⚠ Payment failed:', inv.customer, '→', inv.hosted_invoice_url);
      break;
    }

    default:
      console.log(`[webhook] Unhandled: ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
