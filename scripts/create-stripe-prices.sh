#!/usr/bin/env bash
# DIRT — Create Stripe Product & Prices
# Run: bash scripts/create-stripe-prices.sh
# Requires: stripe CLI logged in

set -e

echo ""
echo "⬡ DIRT — Creating Stripe Product & Prices"
echo "────────────────────────────────────────────"

# 1. Create product
PRODUCT=$(stripe products create \
  --name "DIRT Shell Break — 30 Days" \
  --description "6-agent AI team: APEX, SCOUT, SIGNAL, FORGE, VECTOR, RELAY. 45 task credits. Daily autonomous cycles." \
  --metadata[product_id]="DIRT-SHELLBREAK-30DAY" \
  --format json)

PRODUCT_ID=$(echo "$PRODUCT" | grep -o '"id": "prod_[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Product created: $PRODUCT_ID"

# 2. Standard $10/mo price
PRICE_STD=$(stripe prices create \
  --product "$PRODUCT_ID" \
  --unit-amount 1000 \
  --currency usd \
  --recurring[interval]=month \
  --nickname "DIRT-standard-10" \
  --format json)

PRICE_STD_ID=$(echo "$PRICE_STD" | grep -o '"id": "price_[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Standard price: $PRICE_STD_ID  (\$10/mo)"

# 3. Referral $5/mo price
PRICE_REF=$(stripe prices create \
  --product "$PRODUCT_ID" \
  --unit-amount 500 \
  --currency usd \
  --recurring[interval]=month \
  --nickname "DIRT-referral-5" \
  --format json)

PRICE_REF_ID=$(echo "$PRICE_REF" | grep -o '"id": "price_[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Referral price: $PRICE_REF_ID  (\$5/mo)"

# 4. Write to .env
echo ""
echo "──────────────────────────────────────────────"
echo "Add these to your .env file:"
echo ""
echo "STRIPE_PRICE_ID=$PRICE_STD_ID"
echo "STRIPE_PRICE_ID_DISCOUNTED=$PRICE_REF_ID"
echo ""
echo "⬡ Done. Run: npm start"
