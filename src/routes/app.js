const express  = require('express');
const path     = require('path');
const { q }    = require('../lib/db');
const { generateWeeklyPlan, generateDailyBrief } = require('../lib/agents/apex');
const { runTask, AGENT_PERSONAS } = require('../lib/agents/runner');

const router = express.Router();

// ── SSE STREAM REGISTRY ───────────────────────────────────────────────────────
const streams = new Map(); // userId → Set<res>

function addStream(userId, res) {
  if (!streams.has(userId)) streams.set(userId, new Set());
  streams.get(userId).add(res);
}
function removeStream(userId, res) {
  streams.get(userId)?.delete(res);
}
function emit(userId, type, data) {
  const conns = streams.get(userId);
  if (!conns) return;
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  conns.forEach(res => { try { res.write(payload); } catch (_) {} });
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function requireUser(req, res, next) {
  if (req.session?.userId) {
    req.user = q.getUserById.get(req.session.userId);
    if (req.user) return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// ── SERVE SPA ─────────────────────────────────────────────────────────────────
router.get('/app', (req, res) =>
  res.sendFile(path.join(__dirname, '../../public/app.html'))
);

// ── AUTH ──────────────────────────────────────────────────────────────────────
router.post('/app/api/login', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = q.getUserByEmail.get(email.toLowerCase().trim());

  if (!user) return res.status(404).json({ error: 'No account found for this email. Please complete checkout first.' });

  req.session.userId = user.id;
  q.updateUserActivity.run(user.id);

  res.json({
    id:          user.id,
    email:       user.email,
    name:        user.name,
    companyName: user.company_name,
    industry:    user.industry,
    stage:       user.stage,
    credits:     user.credits_remaining,
  });
});

router.post('/app/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/app/api/me', requireUser, (req, res) => {
  const u = req.user;
  res.json({
    id:          u.id,
    email:       u.email,
    name:        u.name,
    companyName: u.company_name,
    industry:    u.industry,
    stage:       u.stage,
    mission:     u.mission,
    goal:        u.goal,
    credits:     u.credits_remaining,
  });
});

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getMondayISO(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── WEEKLY PLAN ───────────────────────────────────────────────────────────────
router.get('/app/api/weekly-plan', requireUser, (req, res) => {
  const weekStart = getMondayISO();
  const plan = q.getCurrentPlan.get(req.user.id, weekStart);
  if (!plan) return res.json({ plan: null });
  try {
    res.json({ plan: { ...plan, content: JSON.parse(plan.content) } });
  } catch (_) {
    res.status(500).json({ error: 'Plan data corrupted' });
  }
});

router.post('/app/api/weekly-plan/generate', requireUser, async (req, res) => {
  const weekStart = getMondayISO();

  // Only one pending plan per week
  const existing = q.getCurrentPlan.get(req.user.id, weekStart);
  if (existing && existing.status !== 'complete') {
    try {
      return res.json({ plan: { ...existing, content: JSON.parse(existing.content) } });
    } catch (_) {
      return res.status(500).json({ error: 'Plan data corrupted' });
    }
  }

  try {
    emit(req.user.id, 'apex_thinking', { message: 'APEX is analysing your company and building your strategic plan...' });

    const content = await generateWeeklyPlan(req.user, weekStart);

    q.logActivity.run(req.user.id, 'APEX', 'plan_generated',
      `Weekly plan generated: "${content.overall_theme}"`, null);

    const result = q.insertPlan.run(req.user.id, weekStart, JSON.stringify(content));
    const plan   = { id: result.lastInsertRowid, user_id: req.user.id, week_start: weekStart, content, status: 'pending_approval' };

    emit(req.user.id, 'plan_ready', { message: 'Your weekly plan is ready for review', plan_id: plan.id });

    res.json({ plan });
  } catch (err) {
    console.error('[apex] generateWeeklyPlan error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/app/api/weekly-plan/:id/approve', requireUser, (req, res) => {
  q.approvePlan.run(req.params.id, req.user.id);
  q.logActivity.run(req.user.id, 'USER', 'plan_approved', 'Weekly plan approved — agents are ready', null);
  emit(req.user.id, 'plan_approved', { message: 'Weekly plan approved! Generate your daily brief to begin.' });
  res.json({ ok: true });
});

// ── DAILY BRIEF ───────────────────────────────────────────────────────────────
router.get('/app/api/daily-brief', requireUser, (req, res) => {
  const today = getTodayISO();
  const brief = q.getTodayBrief.get(req.user.id, today);
  if (!brief) return res.json({ brief: null });
  const tasks = q.getTasksByBrief.all(brief.id);
  try {
    res.json({ brief: { ...brief, content: JSON.parse(brief.content), tasks } });
  } catch (_) {
    res.status(500).json({ error: 'Brief data corrupted' });
  }
});

router.post('/app/api/daily-brief/generate', requireUser, async (req, res) => {
  const today   = getTodayISO();
  const existing = q.getTodayBrief.get(req.user.id, today);
  if (existing) {
    const tasks = q.getTasksByBrief.all(existing.id);
    return res.json({ brief: { ...existing, content: JSON.parse(existing.content), tasks } });
  }

  const plan = q.getLatestApprovedPlan.get(req.user.id);
  if (!plan) return res.status(400).json({ error: 'Approve your weekly plan first' });

  let planContent;
  try {
    planContent = JSON.parse(plan.content);
  } catch (_) {
    return res.status(500).json({ error: 'Weekly plan data corrupted' });
  }

  try {
    emit(req.user.id, 'apex_thinking', { message: 'APEX is planning today\'s agent tasks...' });

    const content = await generateDailyBrief(req.user, planContent, today);

    const result = q.insertBrief.run(req.user.id, plan.id, today, JSON.stringify(content));
    const brief  = { id: result.lastInsertRowid, content, status: 'pending_approval', tasks: [] };

    q.logActivity.run(req.user.id, 'APEX', 'brief_generated',
      `Daily brief ready: "${content.theme}"`, null);

    emit(req.user.id, 'brief_ready', { message: 'Today\'s brief is ready for your approval', brief_id: brief.id });

    res.json({ brief });
  } catch (err) {
    console.error('[apex] generateDailyBrief error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/app/api/daily-brief/:id/approve', requireUser, async (req, res) => {
  const briefId = parseInt(req.params.id, 10);
  const brief   = q.getTodayBrief.get(req.user.id, getTodayISO());
  if (isNaN(briefId)) return res.status(400).json({ error: 'Invalid brief ID' });
  if (!brief || brief.id !== briefId) return res.status(404).json({ error: 'Brief not found' });
  if (brief.status !== 'pending_approval') return res.json({ ok: true, message: 'Already approved' });

  let briefContent;
  try {
    briefContent = JSON.parse(brief.content);
  } catch (_) {
    return res.status(500).json({ error: 'Brief data corrupted' });
  }

  const taskCount = briefContent.tasks?.length || 0;
  if (req.user.credits_remaining < taskCount) {
    return res.status(402).json({ error: `Not enough credits. Need ${taskCount}, have ${req.user.credits_remaining}.` });
  }

  q.approveBrief.run(briefId, req.user.id);
  q.setExecuting.run(briefId);
  q.logActivity.run(req.user.id, 'USER', 'brief_approved', 'Daily brief approved — agents are executing', null);
  const taskRecords  = briefContent.tasks.map(t => {
    const r = q.insertTask.run(req.user.id, briefId, t.agent, t.task, t.output_type);
    return { id: r.lastInsertRowid, agent_name: t.agent, task_description: t.task, output_type: t.output_type, status: 'queued' };
  });

  res.json({ ok: true, tasks: taskRecords });

  // Execute tasks asynchronously
  setImmediate(() => executeTasks(req.user, briefId, taskRecords));
});

// ── TASK EXECUTION (async) ────────────────────────────────────────────────────
async function executeTasks(user, briefId, tasks) {
  const emitFn = (type, data) => emit(user.id, type, data);

  for (const task of tasks) {
    try {
      q.setRunning.run(task.id);
      q.logActivity.run(user.id, task.agent_name, 'task_started',
        `${task.agent_name} started: ${task.task_description.slice(0, 80)}...`, JSON.stringify({ task_id: task.id }));

      emit(user.id, 'task_started', {
        task_id:     task.id,
        agent:       task.agent_name,
        icon:        AGENT_PERSONAS[task.agent_name]?.icon || '◈',
        description: task.task_description,
      });

      const { output, score } = await runTask(task, user, emitFn);

      q.completeTask.run(output, score.total, score.feedback, task.id);
      q.deductCredit.run(user.id);
      q.logActivity.run(user.id, task.agent_name, 'task_complete',
        `${task.agent_name} scored ${score.total}/100 — ${score.pass ? '✓ Passed' : '⚠ Below threshold'}`,
        JSON.stringify({ task_id: task.id, score: score.total }));

      emit(user.id, 'task_complete', {
        task_id: task.id,
        agent:   task.agent_name,
        icon:    AGENT_PERSONAS[task.agent_name]?.icon || '◈',
        score:   score.total,
        passed:  score.pass,
        preview: output.slice(0, 200),
      });

    } catch (err) {
      q.failTask.run(task.id);
      q.logActivity.run(user.id, task.agent_name, 'task_failed',
        `${task.agent_name} failed: ${err.message}`, null);
      emit(user.id, 'task_failed', { task_id: task.id, agent: task.agent_name, error: err.message });
    }
  }

  q.completeBrief.run(briefId);
  emit(user.id, 'brief_complete', { message: 'All agents have completed their tasks for today.' });
}

// ── OUTPUTS ───────────────────────────────────────────────────────────────────
router.get('/app/api/outputs', requireUser, (req, res) => {
  const outputs = q.getOutputs.all(req.user.id);
  res.json({ outputs });
});

router.get('/app/api/outputs/:id', requireUser, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid output ID' });
  const outputs = q.getOutputs.all(req.user.id);
  const output  = outputs.find(o => o.id === id);
  if (!output) return res.status(404).json({ error: 'Not found' });
  res.json({ output });
});

// ── ACTIVITY ──────────────────────────────────────────────────────────────────
router.get('/app/api/activity', requireUser, (req, res) => {
  const activity = q.getActivity.all(req.user.id);
  res.json({ activity });
});

// ── SSE STREAM ────────────────────────────────────────────────────────────────
router.get('/app/api/stream', requireUser, (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Stream connected' })}\n\n`);

  addStream(req.user.id, res);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeStream(req.user.id, res);
  });
});

// ── ANTHROPIC PROXY (for mobile app) ─────────────────────────────────────────
router.post('/app/api/proxy', requireUser, async (req, res) => {
  const anthropic = require('../anthropic');
  const { model, messages, system, max_tokens } = req.body;

  const ALLOWED_MODELS = ['claude-opus-4-7', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
  const safeModel = ALLOWED_MODELS.includes(model) ? model : 'claude-sonnet-4-6';

  try {
    const msg = await anthropic.messages.create({
      model:      safeModel,
      max_tokens: Math.min(parseInt(max_tokens, 10) || 1000, 4000),
      system:     typeof system === 'string' ? system.slice(0, 8000) : undefined,
      messages:   Array.isArray(messages) ? messages.slice(-20).map(m => ({
        role:    m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content.slice(0, 8000) : m.content,
      })) : [],
    });
    res.json(msg);
  } catch (err) {
    console.error('[proxy] Anthropic error:', err.message);
    res.status(502).json({ error: 'AI service unavailable. Try again shortly.' });
  }
});

module.exports = router;
