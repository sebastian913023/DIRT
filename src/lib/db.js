const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const dataDir = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(process.env.DB_PATH || path.join(dataDir, 'dirt.db'), {
  timeout: 30000,  // wait up to 30s for SQLite locks at open time (Railway rolling deploys)
});
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    email                  TEXT    UNIQUE NOT NULL,
    name                   TEXT,
    company_name           TEXT,
    industry               TEXT,
    stage                  TEXT,
    mission                TEXT,
    goal                   TEXT,
    stripe_customer_id     TEXT    UNIQUE,
    stripe_subscription_id TEXT,
    credits_remaining      INTEGER DEFAULT 45,
    created_at             INTEGER DEFAULT (unixepoch()),
    last_active            INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS weekly_plans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    week_start  TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    status      TEXT    DEFAULT 'pending_approval',
    created_at  INTEGER DEFAULT (unixepoch()),
    approved_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS daily_briefs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    plan_id      INTEGER REFERENCES weekly_plans(id),
    brief_date   TEXT    NOT NULL,
    content      TEXT    NOT NULL,
    status       TEXT    DEFAULT 'pending_approval',
    created_at   INTEGER DEFAULT (unixepoch()),
    approved_at  INTEGER,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id),
    brief_id         INTEGER REFERENCES daily_briefs(id),
    agent_name       TEXT    NOT NULL,
    task_description TEXT    NOT NULL,
    output_type      TEXT,
    status           TEXT    DEFAULT 'queued',
    output           TEXT,
    quality_score    INTEGER,
    quality_feedback TEXT,
    attempts         INTEGER DEFAULT 0,
    created_at       INTEGER DEFAULT (unixepoch()),
    completed_at     INTEGER
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    timestamp  INTEGER DEFAULT (unixepoch()),
    agent_name TEXT,
    event_type TEXT,
    message    TEXT,
    metadata   TEXT
  );
`);

// ── HELPERS ───────────────────────────────────────────────────────────────────
const q = {
  // Users
  getUserByEmail:    db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserById:       db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByStripe:   db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?'),
  createUser:        db.prepare(`
    INSERT OR IGNORE INTO users (email, name, company_name, industry, stage, mission, goal, stripe_customer_id, stripe_subscription_id)
    VALUES (@email, @name, @company_name, @industry, @stage, @mission, @goal, @stripe_customer_id, @stripe_subscription_id)
  `),
  updateUserActivity: db.prepare('UPDATE users SET last_active = unixepoch() WHERE id = ?'),
  deductCredit:       db.prepare('UPDATE users SET credits_remaining = credits_remaining - 1 WHERE id = ? AND credits_remaining > 0'),

  // Weekly plans
  getCurrentPlan: db.prepare(`
    SELECT * FROM weekly_plans WHERE user_id = ? AND week_start = ?
    ORDER BY created_at DESC LIMIT 1
  `),
  getLatestApprovedPlan: db.prepare(`
    SELECT * FROM weekly_plans WHERE user_id = ? AND status = 'approved'
    ORDER BY created_at DESC LIMIT 1
  `),
  insertPlan:   db.prepare('INSERT INTO weekly_plans (user_id, week_start, content) VALUES (?, ?, ?)'),
  approvePlan:  db.prepare("UPDATE weekly_plans SET status = 'approved', approved_at = unixepoch() WHERE id = ? AND user_id = ?"),

  // Daily briefs
  getTodayBrief: db.prepare(`
    SELECT * FROM daily_briefs WHERE user_id = ? AND brief_date = ?
    ORDER BY created_at DESC LIMIT 1
  `),
  insertBrief:     db.prepare('INSERT INTO daily_briefs (user_id, plan_id, brief_date, content) VALUES (?, ?, ?, ?)'),
  approveBrief:    db.prepare("UPDATE daily_briefs SET status = 'approved', approved_at = unixepoch() WHERE id = ? AND user_id = ?"),
  setExecuting:    db.prepare("UPDATE daily_briefs SET status = 'executing' WHERE id = ?"),
  completeBrief:   db.prepare("UPDATE daily_briefs SET status = 'complete', completed_at = unixepoch() WHERE id = ?"),

  // Tasks
  insertTask:    db.prepare('INSERT INTO tasks (user_id, brief_id, agent_name, task_description, output_type) VALUES (?, ?, ?, ?, ?)'),
  setRunning:    db.prepare("UPDATE tasks SET status = 'running', attempts = attempts + 1 WHERE id = ?"),
  completeTask:  db.prepare("UPDATE tasks SET status = 'complete', output = ?, quality_score = ?, quality_feedback = ?, completed_at = unixepoch() WHERE id = ?"),
  failTask:      db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?"),
  getTasksByBrief: db.prepare('SELECT * FROM tasks WHERE brief_id = ? ORDER BY id ASC'),
  getOutputs:    db.prepare(`
    SELECT t.*, db.brief_date FROM tasks t
    JOIN daily_briefs db ON t.brief_id = db.id
    WHERE t.user_id = ? AND t.status = 'complete'
    ORDER BY t.completed_at DESC LIMIT 50
  `),

  // Activity
  logActivity: db.prepare(`
    INSERT INTO activity_log (user_id, agent_name, event_type, message, metadata)
    VALUES (?, ?, ?, ?, ?)
  `),
  getActivity: db.prepare(`
    SELECT * FROM activity_log WHERE user_id = ?
    ORDER BY timestamp DESC LIMIT 100
  `),
};

module.exports = { db, q };
