# DIRT — Claude Desktop Project Context

## What Is DIRT

DIRT is a $10/mo SaaS checkout product for a 6-agent autonomous AI team platform.
"Operation Shell Break" is the launch campaign.

## Stack

- **Backend**: Node.js + Express (`server.js`)
- **Payments**: Stripe Checkout Sessions (NOT payment links)
- **Stripe CLI**: used for local webhook testing
- **Frontend**: Vanilla HTML/CSS/JS with BEM architecture (`public/checkout.html`)
- **Auth**: express-session + bcryptjs for admin panel
- **No framework**: intentionally lightweight, single-file frontend

## Folder Structure

```
DIRT/
├── server.js                  ← entry point (Express)
├── src/
│   ├── lib/stripe.js          ← Stripe client singleton
│   └── routes/
│       ├── checkout.js        ← POST /create-checkout-session
│       ├── webhook.js         ← POST /webhook
│       └── admin.js           ← GET/POST /admin/* (protected)
├── public/
│   └── checkout.html          ← BEM-structured checkout UI
├── emails/
│   └── welcome.txt            ← onboarding email template
├── scripts/
│   └── create-stripe-prices.sh ← one-time Stripe setup
├── docs/
│   └── BEM-structure.md       ← full BEM class map
├── .env                       ← live config (gitignored)
├── .env.example               ← env vars template
└── SETUP.md                   ← full setup instructions
```

## Environment Variables

```
STRIPE_SECRET_KEY             sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET         whsec_... (from stripe listen)
STRIPE_PRICE_ID               price_... ($10/mo standard)
STRIPE_PRICE_ID_DISCOUNTED    price_... ($5/mo referral)
ADMIN_USERNAME                dirt_admin
ADMIN_PASSWORD_HASH           bcrypt hash of admin password
SESSION_SECRET                random secret for express-session
APP_URL                       blank for localhost, set in prod
PORT                          3001 (locally, HyperLLM owns 3000)
```

## Run Locally

```bash
# Terminal 1 — webhook listener
stripe listen --forward-to localhost:3001/webhook

# Terminal 2 — server
npm start
# → http://localhost:3001/checkout
# → http://localhost:3001/admin
```

## Admin Panel

- **URL**: `http://localhost:3001/admin`
- **Login**: `http://localhost:3001/admin/login`
- **Username**: `dirt_admin`
- **Password**: `DirtAdmin2026!`
- **Session duration**: 8 hours
- **Auth**: bcrypt password check + express-session cookie

### Admin routes:
| Route | Description |
|---|---|
| `GET /admin/login` | Login page |
| `POST /admin/login` | Authenticate → redirect to dashboard |
| `POST /admin/logout` | Destroy session → redirect to login |
| `GET /admin` | Dashboard — customers, subs, MRR, charges |
| `GET /admin/customer/:id` | Customer detail — profile, subs, payments |

### Dashboard shows:
- Total customers, active subscriptions, MRR, recent charges
- Full subscription table with status (active/canceled/past_due)
- Click any email → customer detail with Stripe metadata (company, industry, stage, goal, mission)

## Public Routes

| Route | Description |
|---|---|
| `GET /checkout` | 3-step checkout UI |
| `POST /create-checkout-session` | Creates Stripe session, returns URL |
| `POST /webhook` | Stripe webhook handler |
| `GET /success` | Post-payment confirmation page |
| `GET /` | Redirects to `/checkout` |

## BEM Convention

All CSS uses strict BEM: `block__element--modifier`
Full map: `docs/BEM-structure.md`

## Stripe Config (test mode)

- **Account**: acct_1TQn8wAFQwdx1hs4
- **Product**: prod_UXts68l10Z5Ms9
- **Standard price** ($10/mo): price_1TYo4xAFQwdx1hs4UQsNJQy9
- **Referral price** ($5/mo): price_1TYo5oAFQwdx1hs4Ocwzck2v
- **Test card**: 4242 4242 4242 4242 · any future date · any CVC

## Product Details

- Price: $10/mo standard, $5/mo with referral code
- Agents: APEX (opus-4-7), SCOUT/SIGNAL/FORGE/VECTOR/RELAY (sonnet-4-6)
- Task credits: 45/month
- Valid referral codes: DIRT-SHELLBREAK-2026, SHELLBREAK, DIRT10, BREAK

## Key Decisions

- Port 3001 (not 3000) — HyperLLM runs on 3000
- Stripe Checkout Sessions over Payment Links — user metadata flows into Stripe customer object
- bcrypt + express-session for admin auth — no JWT, no external auth service
- BEM enforced throughout CSS — no flat compound names, no inline styles
- Routes split into src/routes/ — checkout, webhook, admin each in own file
- Webhook covers: checkout.session.completed, subscription created/deleted, invoice.payment_failed

## Known Gotcha

When restarting the server, use PowerShell to kill the old process first:
```powershell
$conn = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```
`taskkill /F /IM node.exe` kills ALL node processes including unrelated ones.
