const express = require('express');
const bcrypt  = require('bcryptjs');
const stripe  = require('../lib/stripe');
const router  = express.Router();

// ── HTML ESCAPE HELPER ────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session?.admin) return next();
  res.redirect('/admin/login');
}

// ── LOGIN GET ─────────────────────────────────────────────────────────────────
router.get('/admin/login', (req, res) => {
  res.send(loginPage(req.query.error));
});

// ── LOGIN POST ────────────────────────────────────────────────────────────────
router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = username === process.env.ADMIN_USERNAME;
  const hash      = process.env.ADMIN_PASSWORD_HASH || '';
  let validPass   = false;

  try {
    validPass = hash ? bcrypt.compareSync(password || '', hash) : false;
  } catch (_) {}

  if (validUser && validPass) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  res.redirect('/admin/login?error=1');
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
router.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const [customers, subscriptions, charges] = await Promise.all([
      stripe.customers.list({ limit: 50 }),
      stripe.subscriptions.list({ limit: 50, status: 'all' }),
      stripe.charges.list({ limit: 10 }),
    ]);

    const active = subscriptions.data.filter(s => s.status === 'active').length;
    const mrr    = subscriptions.data
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + (s.items.data[0]?.price?.unit_amount || 0), 0) / 100;

    res.send(dashboardPage({ customers, subscriptions, charges, active, mrr }));
  } catch (err) {
    res.status(500).send(`<pre style="color:red">Stripe error: ${esc(err.message)}</pre>`);
  }
});

// ── CUSTOMER DETAIL ───────────────────────────────────────────────────────────
router.get('/admin/customer/:id', requireAdmin, async (req, res) => {
  try {
    const [customer, subs, payments] = await Promise.all([
      stripe.customers.retrieve(req.params.id),
      stripe.subscriptions.list({ customer: req.params.id }),
      stripe.charges.list({ customer: req.params.id, limit: 10 }),
    ]);
    res.send(customerPage({ customer, subs, payments }));
  } catch (err) {
    res.status(500).send(`<pre style="color:red">${esc(err.message)}</pre>`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// HTML TEMPLATES
// ═════════════════════════════════════════════════════════════════════════════

const css = `
  *{box-sizing:border-box;margin:0;padding:0;}
  :root{
    --void:#000008;--card:#0C0918;--raised:#13102A;
    --amber:#F5A623;--amber2:#FFD27A;--amber3:#C47B10;
    --green:#39FF6E;--red:#FF2D55;--cyan:#00E5FF;
    --white:#F0EEFF;--muted:#6B6490;--border:rgba(245,166,35,0.2);
  }
  body{background:var(--void);color:var(--white);font-family:'Barlow',sans-serif;min-height:100vh;}
  a{color:var(--amber);text-decoration:none;}
  a:hover{color:var(--amber2);}
  .table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
`;

const fonts = `<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Share+Tech+Mono&family=Barlow:wght@300;400;500&display=swap" rel="stylesheet"/>`;

const stripeMode = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live') ||
                   (process.env.STRIPE_SECRET_KEY || '').startsWith('rk_live')
  ? 'LIVE MODE' : 'TEST MODE';

const navHtml = `
<nav class="admin-nav">
  <div class="admin-nav__logo">⬡ DIRT — ADMIN</div>
  <div class="admin-nav__badge">${stripeMode} · STRIPE DASHBOARD</div>
  <form method="POST" action="/admin/logout" style="margin:0">
    <button class="admin-nav__logout" type="submit">LOGOUT</button>
  </form>
</nav>`;

const navCss = `
.admin-nav{padding:16px 32px;display:flex;align-items:center;justify-content:space-between;gap:12px;
  border-bottom:1px solid var(--border);background:rgba(0,0,8,0.95);
  position:sticky;top:0;z-index:10;}
.admin-nav__logo{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:5px;color:var(--amber);}
.admin-nav__badge{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--muted);}
.admin-nav__logout{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;
  background:none;border:1px solid rgba(255,45,85,0.3);color:var(--red);
  padding:6px 14px;cursor:pointer;transition:all 0.2s;white-space:nowrap;}
.admin-nav__logout:hover{background:var(--red);color:#000;}
@media(max-width:600px){.admin-nav__badge{display:none;}}
`;

// ── LOGIN PAGE ────────────────────────────────────────────────────────────────
function loginPage(error) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>DIRT Admin</title>${fonts}
<style>${css}
.login{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
.login__card{width:100%;max-width:360px;padding:40px;background:var(--card);border:1px solid var(--border);position:relative;}
.login__card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--amber),transparent);}
.login__logo{font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:6px;color:var(--amber);margin-bottom:4px;}
.login__sub{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:var(--muted);margin-bottom:32px;}
.login__label{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--amber);display:block;margin-bottom:6px;}
.login__input{width:100%;background:var(--raised);border:1px solid var(--border);color:var(--white);
  font-family:'Barlow',sans-serif;font-size:14px;padding:12px 14px;outline:none;
  transition:border-color 0.2s;margin-bottom:16px;}
.login__input:focus{border-color:var(--amber);}
.login__btn{width:100%;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;
  background:var(--amber);color:#000;border:none;padding:14px;cursor:pointer;transition:all 0.2s;}
.login__btn:hover{background:var(--amber2);}
.login__error{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--red);
  margin-bottom:16px;padding:10px;border:1px solid rgba(255,45,85,0.3);background:rgba(255,45,85,0.05);}
</style></head><body>
<div class="login">
  <div class="login__card">
    <div class="login__logo">⬡ DIRT</div>
    <div class="login__sub">ADMIN PANEL · RESTRICTED ACCESS</div>
    ${error ? `<div class="login__error" role="alert">✗ INVALID CREDENTIALS — TRY AGAIN</div>` : ''}
    <form method="POST" action="/admin/login">
      <label class="login__label" for="admin-user">USERNAME</label>
      <input class="login__input" id="admin-user" name="username" type="text" autocomplete="username" autofocus/>
      <label class="login__label" for="admin-pass">PASSWORD</label>
      <input class="login__input" id="admin-pass" name="password" type="password" autocomplete="current-password"/>
      <button class="login__btn" type="submit">ACCESS DASHBOARD →</button>
    </form>
  </div>
</div>
</body></html>`;
}

// ── DASHBOARD PAGE ────────────────────────────────────────────────────────────
function dashboardPage({ customers, subscriptions, charges, active, mrr }) {
  const fmtDate = ts => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtAmt  = n  => `$${(n / 100).toFixed(2)}`;

  const subRows = subscriptions.data.map(s => {
    const cust = customers.data.find(c => c.id === s.customer) || {};
    const statusColor = {
      active:   'var(--green)',
      canceled: 'var(--red)',
      past_due: 'var(--amber)',
      trialing: 'var(--cyan)',
    }[s.status] || 'var(--muted)';
    return `<tr>
      <td><a href="/admin/customer/${esc(s.customer)}">${esc(cust.email || s.customer)}</a></td>
      <td>${esc(cust.metadata?.companyName)}</td>
      <td style="color:${statusColor};font-family:'Share Tech Mono',monospace;font-size:10px">${esc(s.status.toUpperCase())}</td>
      <td>${fmtAmt(s.items.data[0]?.price?.unit_amount || 0)}/mo</td>
      <td style="color:var(--muted);font-size:12px">${fmtDate(s.created)}</td>
    </tr>`;
  }).join('');

  const recentRows = charges.data.map(c => `<tr>
    <td style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--amber)">${fmtAmt(c.amount)}</td>
    <td>${esc(c.billing_details?.email)}</td>
    <td style="color:${c.status === 'succeeded' ? 'var(--green)' : 'var(--red)'};font-family:'Share Tech Mono',monospace;font-size:10px">${esc(c.status.toUpperCase())}</td>
    <td style="color:var(--muted);font-size:12px">${fmtDate(c.created)}</td>
  </tr>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>DIRT Admin — Dashboard</title>${fonts}
<style>${css}${navCss}
.admin-body{max-width:1200px;margin:0 auto;padding:40px 32px;}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:40px;}
.stat{padding:20px;background:var(--card);border:1px solid var(--border);position:relative;}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--amber),transparent);}
.stat__label{font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:3px;color:var(--muted);margin-bottom:8px;}
.stat__value{font-family:'Bebas Neue',sans-serif;font-size:40px;color:var(--amber);line-height:1;}
.stat__value--green{color:var(--green);}
.section{margin-bottom:40px;}
.section__title{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:var(--amber);margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid var(--border);}
table{width:100%;border-collapse:collapse;}
th{font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:2px;color:var(--muted);text-align:left;padding:8px 12px;border-bottom:1px solid var(--raised);}
td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;}
tr:hover td{background:rgba(245,166,35,0.03);}
@media(max-width:768px){
  .stats{grid-template-columns:1fr 1fr;}
  .admin-body{padding:24px 16px;}
}
@media(max-width:400px){.stats{grid-template-columns:1fr;}}
</style></head><body>

${navHtml}

<div class="admin-body">
  <div class="stats">
    <div class="stat">
      <div class="stat__label">TOTAL CUSTOMERS</div>
      <div class="stat__value">${customers.data.length}</div>
    </div>
    <div class="stat">
      <div class="stat__label">ACTIVE SUBS</div>
      <div class="stat__value stat__value--green">${active}</div>
    </div>
    <div class="stat">
      <div class="stat__label">MRR</div>
      <div class="stat__value">$${mrr.toFixed(0)}</div>
    </div>
    <div class="stat">
      <div class="stat__label">RECENT CHARGES</div>
      <div class="stat__value">${charges.data.length}</div>
    </div>
  </div>

  <div class="section">
    <div class="section__title">SUBSCRIPTIONS</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>EMAIL</th><th>COMPANY</th><th>STATUS</th><th>AMOUNT</th><th>CREATED</th>
        </tr></thead>
        <tbody>${subRows || `<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:24px">No subscriptions yet</td></tr>`}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section__title">RECENT CHARGES</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>AMOUNT</th><th>EMAIL</th><th>STATUS</th><th>DATE</th>
        </tr></thead>
        <tbody>${recentRows || `<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:24px">No charges yet</td></tr>`}</tbody>
      </table>
    </div>
  </div>
</div>
</body></html>`;
}

// ── CUSTOMER DETAIL PAGE ──────────────────────────────────────────────────────
function customerPage({ customer, subs, payments }) {
  const fmtDate = ts => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const m = customer.metadata || {};

  const subRows = subs.data.map(s => {
    const statusColor = {
      active:   'var(--green)',
      canceled: 'var(--red)',
      past_due: 'var(--amber)',
    }[s.status] || 'var(--muted)';
    return `<tr>
      <td style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted)">${esc(s.id)}</td>
      <td style="color:${statusColor};font-family:'Share Tech Mono',monospace;font-size:10px">${esc(s.status.toUpperCase())}</td>
      <td>$${((s.items.data[0]?.price?.unit_amount || 0) / 100).toFixed(2)}/mo</td>
      <td style="color:var(--muted);font-size:12px">${fmtDate(s.created)}</td>
    </tr>`;
  }).join('');

  const payRows = payments.data.map(c => `<tr>
    <td style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--amber)">$${(c.amount / 100).toFixed(2)}</td>
    <td style="color:${c.status === 'succeeded' ? 'var(--green)' : 'var(--red)'};font-family:'Share Tech Mono',monospace;font-size:10px">${esc(c.status.toUpperCase())}</td>
    <td style="color:var(--muted);font-size:12px">${fmtDate(c.created)}</td>
  </tr>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>DIRT Admin · ${esc(customer.email)}</title>${fonts}
<style>${css}${navCss}
.admin-body{max-width:900px;margin:0 auto;padding:40px 32px;}
.back{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--muted);
  display:inline-flex;align-items:center;gap:6px;margin-bottom:24px;}
.back:hover{color:var(--white);}
.profile{padding:24px;background:var(--card);border:1px solid var(--border);margin-bottom:32px;position:relative;}
.profile::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--amber),transparent);}
.profile__name{font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:2px;margin-bottom:4px;}
.profile__email{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--amber);margin-bottom:16px;}
.profile__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.profile__field{font-size:12px;}
.profile__field-label{font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:2px;color:var(--muted);margin-bottom:4px;}
.profile__field-value{color:var(--white);}
.section{margin-bottom:32px;}
.section__title{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:var(--amber);margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid var(--border);}
table{width:100%;border-collapse:collapse;}
th{font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:2px;color:var(--muted);text-align:left;padding:8px 12px;border-bottom:1px solid var(--raised);}
td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;}
@media(max-width:600px){.profile__grid{grid-template-columns:1fr 1fr;}.admin-body{padding:24px 16px;}}
</style></head><body>

${navHtml}

<div class="admin-body">
  <a class="back" href="/admin">← BACK TO DASHBOARD</a>

  <div class="profile">
    <div class="profile__name">${esc(customer.name || 'Unknown')}</div>
    <div class="profile__email">${esc(customer.email)}</div>
    <div class="profile__grid">
      <div class="profile__field">
        <div class="profile__field-label">COMPANY</div>
        <div class="profile__field-value">${esc(m.companyName)}</div>
      </div>
      <div class="profile__field">
        <div class="profile__field-label">INDUSTRY</div>
        <div class="profile__field-value">${esc(m.industry)}</div>
      </div>
      <div class="profile__field">
        <div class="profile__field-label">STAGE</div>
        <div class="profile__field-value">${esc(m.stage)}</div>
      </div>
      <div class="profile__field">
        <div class="profile__field-label">30-DAY GOAL</div>
        <div class="profile__field-value">${esc(m.goal)}</div>
      </div>
      <div class="profile__field">
        <div class="profile__field-label">STRIPE ID</div>
        <div class="profile__field-value" style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted)">${esc(customer.id)}</div>
      </div>
    </div>
    ${m.mission ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:rgba(240,238,255,0.6)">&ldquo;${esc(m.mission)}&rdquo;</div>` : ''}
  </div>

  <div class="section">
    <div class="section__title">SUBSCRIPTIONS</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>STATUS</th><th>AMOUNT</th><th>CREATED</th></tr></thead>
        <tbody>${subRows || `<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:20px">No subscriptions</td></tr>`}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section__title">PAYMENT HISTORY</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>AMOUNT</th><th>STATUS</th><th>DATE</th></tr></thead>
        <tbody>${payRows || `<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:20px">No payments</td></tr>`}</tbody>
      </table>
    </div>
  </div>
</div>
</body></html>`;
}

module.exports = router;
