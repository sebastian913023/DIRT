require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const session  = require('express-session');
const path     = require('path');
const stripe   = require('./src/lib/stripe');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── HELPERS ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.APP_URL
  ? [process.env.APP_URL, `http://localhost:${PORT}`]
  : [`http://localhost:${PORT}`, 'http://127.0.0.1:' + PORT];

app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dirt-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

// Static files with 1-hour cache in production
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
  .back{display:inline-block;margin-top:28px;color:#F5A623;text-decoration:none;
        font-family:'Barlow',sans-serif;font-size:13px;font-weight:600;
        border:1px solid rgba(245,166,35,0.3);padding:10px 24px;transition:all 0.2s;}
  .back:hover{background:rgba(245,166,35,0.08);}
</style>
</head>
<body>
  <div class="shell">
    <div class="icon">⬡</div>
    <h1>SHELL BROKEN.</h1>
    <p>Your DIRT access credentials will be sent to<br/>
       ${email ? `<span class="email">${escHtml(email)}</span>` : 'your email address'}</p>
    <p style="margin-top:16px;font-size:12px">Check your inbox — agents are being provisioned now.</p>
    <a class="back" href="/checkout">← Back to DIRT</a>
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

// Suppress favicon 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⬡  DIRT server  →  http://localhost:${PORT}`);
  console.log(`   Checkout     →  http://localhost:${PORT}/checkout`);
  console.log(`   Admin        →  http://localhost:${PORT}/admin`);
  console.log(`\n   To test webhooks:`);
  console.log(`   stripe listen --forward-to localhost:${PORT}/webhook\n`);
});
