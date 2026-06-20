const anthropic = require('../anthropic');

const MODEL = 'claude-opus-4-8';

// ── WEEKLY PLAN ───────────────────────────────────────────────────────────────
async function generateWeeklyPlan(user, weekStart) {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are APEX, the CEO agent of DIRT — an autonomous AI business team.
You orchestrate 5 specialist agents: SCOUT (Research), SIGNAL (Marketing), FORGE (Dev/Product), VECTOR (Sales), RELAY (Operations).
Your role is to create strategic weekly plans that maximise results for solo founders.
Always return valid JSON only — no markdown, no explanation outside the JSON.`,
    messages: [{
      role: 'user',
      content: `Generate a comprehensive weekly strategic plan for this company.

Company: ${user.company_name || 'Unknown'}
Industry: ${user.industry || 'General'}
Stage: ${user.stage || 'Early'}
Mission: ${user.mission || 'Not specified'}
30-Day Goal: ${user.goal || 'Not specified'}
Week starting: ${weekStart}

Return this exact JSON structure:
{
  "overall_theme": "string — theme for this week",
  "objectives": ["obj1", "obj2", "obj3"],
  "apex_rationale": "string — why this plan is right for them this week",
  "agent_assignments": {
    "SCOUT":  { "focus": "string", "deliverables": ["d1", "d2"] },
    "SIGNAL": { "focus": "string", "deliverables": ["d1", "d2"] },
    "FORGE":  { "focus": "string", "deliverables": ["d1", "d2"] },
    "VECTOR": { "focus": "string", "deliverables": ["d1", "d2"] },
    "RELAY":  { "focus": "string", "deliverables": ["d1", "d2"] }
  },
  "success_metrics": ["metric1", "metric2", "metric3"]
}`,
    }],
  });

  try {
    return JSON.parse(msg.content[0].text);
  } catch (_) {
    const match = msg.content[0].text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('APEX returned invalid JSON for weekly plan');
  }
}

// ── DAILY BRIEF ───────────────────────────────────────────────────────────────
async function generateDailyBrief(user, weeklyPlan, briefDate) {
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const day = dayNames[new Date(briefDate).getDay()];

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are APEX, the CEO agent of DIRT. Generate focused, actionable daily briefings.
Each task must be specific enough that an AI agent can execute it autonomously.
Always return valid JSON only.`,
    messages: [{
      role: 'user',
      content: `Generate today's daily brief for ${day}, ${briefDate}.

Company: ${user.company_name || 'Unknown'}
Industry: ${user.industry || 'General'}
Mission: ${user.mission || 'Not specified'}
Goal: ${user.goal || 'Not specified'}

Weekly Plan Theme: ${weeklyPlan.overall_theme}
Weekly Objectives: ${weeklyPlan.objectives.join('; ')}

Agent Assignments this week:
${Object.entries(weeklyPlan.agent_assignments).map(([a, v]) => `${a}: ${v.focus}`).join('\n')}

Return this exact JSON:
{
  "date": "${briefDate}",
  "day": "${day}",
  "theme": "string — today's focus theme",
  "apex_note": "string — 2-3 sentence motivational briefing from APEX",
  "tasks": [
    {
      "agent": "SCOUT|SIGNAL|FORGE|VECTOR|RELAY",
      "task": "string — specific, executable task description",
      "output_type": "research_report|social_post|email_sequence|code|pitch_deck|sop|strategy_doc|content_calendar|other",
      "priority": "high|medium",
      "estimated_credits": 1
    }
  ]
}

Generate 1-2 tasks per agent (5-8 tasks total). Make each task highly specific and immediately actionable.`,
    }],
  });

  try {
    return JSON.parse(msg.content[0].text);
  } catch (_) {
    const match = msg.content[0].text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('APEX returned invalid JSON for daily brief');
  }
}

module.exports = { generateWeeklyPlan, generateDailyBrief };
