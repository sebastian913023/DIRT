require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const session  = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path     = require('path');
const fs       = require('fs');
const stripe   = require('./src/lib/stripe');

const app  = express();
const PORT = process.env.PORT || 3001;

// Ensure data directory exists before DB loads
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ── HELPERS ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.APP_URL
  ? [process.env.APP_URL, `http://localhost:${PORT}`]
  : [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];

app.use(cors({ origin: allowedOrigins, credentials: true }));

const sessionDir = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(__dirname, 'data');

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: sessionDir }),
  secret: process.env.SESSION_SECRET || 'dirt-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   8 * 60 * 60 * 1000,
  },
}));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true,
}));

// Raw body for Stripe webhooks MUST come before json()
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use(require('./src/routes/checkout'));
app.use(require('./src/routes/webhook'));
app.use(require('./src/routes/admin'));
app.use(require('./src/routes/app'));

// ── PAGE ROUTES ───────────────────────────────────────────────────────────────
app.get('/checkout', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'))
);

app.get('/success', async (req, res) => {
  let email = '';
  try {
    if (req.query.session_id) {
      const sess = await stripe.checkout.sessions.retrieve(req.query.session_id);
      email = sess.customer_details?.email || '';
      const meta = sess.metadata || {};

      // Provision user immediately — works even if stripe listen isn't running
      if (email) {
        const { q: dbq } = require('./src/lib/db');
        const name = `${meta.firstName || ''} ${meta.lastName || ''}`.trim();
        try {
          dbq.createUser.run({
            email:                   email.toLowerCase(),
            name:                    name || null,
            company_name:            meta.companyName || null,
            industry:                meta.industry    || null,
            stage:                   meta.stage       || null,
            mission:                 null,
            goal:                    meta.goal        || null,
            stripe_customer_id:      sess.customer    || null,
            stripe_subscription_id:  null,
          });
        } catch (_) {} // already exists — fine
      }
    }
  } catch (_) {}

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>DIRT — Access Granted</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@300;400&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#000008;color:#F0EEFF;font-family:'Barlow',sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px;}
  .shell{max-width:480px;}
  .icon{font-size:60px;margin-bottom:16px;}
  h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(40px,10vw,64px);color:#39FF6E;letter-spacing:4px;margin-bottom:16px;}
  p{color:#6B6490;font-size:14px;line-height:1.8;}
  .email{color:#F0EEFF;font-weight:500;}
  .back{display:inline-block;margin-top:16px;color:#F5A623;text-decoration:none;
        font-family:'Barlow',sans-serif;font-size:13px;font-weight:600;
        border:1px solid rgba(245,166,35,0.3);padding:10px 24px;transition:all 0.2s;margin-right:8px;}
  .app-btn{display:inline-block;margin-top:16px;background:#F5A623;color:#000;text-decoration:none;
        font-family:'Barlow',sans-serif;font-size:13px;font-weight:700;
        border:1px solid #F5A623;padding:10px 24px;transition:all 0.2s;}
  .back:hover{background:rgba(245,166,35,0.08);}
  .app-btn:hover{background:#FFD27A;}
</style>
</head>
<body>
  <div class="shell">
    <div class="icon">⬡</div>
    <h1>SHELL BROKEN.</h1>
    <p>Your DIRT access is active${email ? ` for<br/><span class="email">${escHtml(email)}</span>` : ''}.</p>
    <p style="margin-top:12px;font-size:12px">Your 6-agent team is standing by.</p>
    <div style="margin-top:28px">
      <a class="app-btn" href="/app">LAUNCH DIRT APP →</a>
      <a class="back" href="/">← Campaign</a>
    </div>
  </div>
</body>
</html>`);
});

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'campaign.html'))
);

app.get('/campaign', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'campaign.html'))
);

app.get('/favicon.ico', (req, res) => res.status(204).end());

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⬡  DIRT server  →  http://localhost:${PORT}`);
  console.log(`   Campaign     →  http://localhost:${PORT}/`);
  console.log(`   Checkout     →  http://localhost:${PORT}/checkout`);
  console.log(`   App          →  http://localhost:${PORT}/app`);
  console.log(`   Admin        →  http://localhost:${PORT}/admin`);
  console.log(`\n   To test webhooks:`);
  console.log(`   stripe listen --forward-to localhost:${PORT}/webhook\n`);
});
