# DIRT — Stripe Setup Guide

## 1. Login to Stripe CLI

```bash
stripe login
```

Opens browser → authorize → done.

## 2. Create the Stripe Product & Prices

```bash
# Standard $10/mo price
stripe products create \
  --name "DIRT Shell Break — 30 Days" \
  --description "6-agent AI team: APEX, SCOUT, SIGNAL, FORGE, VECTOR, RELAY. 45 task credits."

# Copy the product ID (prod_...) from above, then:
stripe prices create \
  --product prod_XXXXX \
  --unit-amount 1000 \
  --currency usd \
  --recurring[interval]=month \
  --nickname "DIRT-standard"

# Referral / discounted $5/mo price
stripe prices create \
  --product prod_XXXXX \
  --unit-amount 500 \
  --currency usd \
  --recurring[interval]=month \
  --nickname "DIRT-referral"
```

Copy both price IDs (price_...).

## 3. Configure .env

```bash
cp .env.example .env
```

Edit `.env`:
```
STRIPE_SECRET_KEY=sk_test_...          # from dashboard.stripe.com/apikeys
STRIPE_PRICE_ID=price_...              # $10 standard price ID
STRIPE_PRICE_ID_DISCOUNTED=price_...   # $5 referral price ID
STRIPE_WEBHOOK_SECRET=                 # fill in step 4
```

## 4. Start Stripe webhook listener (in a separate terminal)

```bash
stripe listen --forward-to localhost:3000/webhook
```

Copy the `whsec_...` secret it prints → paste into `.env` as STRIPE_WEBHOOK_SECRET.

## 5. Start the server

```bash
npm start
```

Open http://localhost:3000/checkout

## 6. Test a payment

Use Stripe test card: **4242 4242 4242 4242** · any future date · any CVC

Trigger webhook events manually:
```bash
stripe trigger checkout.session.completed
```

## File Structure

```
DIRT/
├── server.js          ← Express + Stripe backend
├── public/
│   └── checkout.html  ← Checkout page (calls /create-checkout-session)
├── .env               ← Your keys (never commit)
├── .env.example       ← Template
└── package.json
```
