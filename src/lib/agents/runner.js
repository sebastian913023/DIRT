const anthropic = require('../anthropic');
const { scoreOutput } = require('./judge');

const MODEL   = 'claude-sonnet-4-6';
const MAX_RETRIES = 2;

const AGENT_PERSONAS = {
  SCOUT: {
    icon: '◎',
    system: `You are SCOUT, an elite research and competitive intelligence agent on the DIRT team.
You produce comprehensive, structured intelligence reports with strategic implications.
Your outputs are always well-organized with clear sections, bullet points, and actionable insights.
Write in a professional yet direct tone. Back claims with logical analysis.`,
  },
  SIGNAL: {
    icon: '◐',
    system: `You are SIGNAL, a world-class marketing and content strategist on the DIRT team.
You produce compelling, conversion-focused content that drives action.
Every piece has a clear hook, body, and call to action. Adapt tone to platform and audience.
Write copy that feels human, not generic. Make every word earn its place.`,
  },
  FORGE: {
    icon: '⬡',
    system: `You are FORGE, a senior full-stack engineer and product architect on the DIRT team.
You write production-quality code, architecture docs, and technical specifications.
Your outputs are detailed, implementable, and follow current best practices.
Include code examples where relevant. Be precise about technology choices.`,
  },
  VECTOR: {
    icon: '◆',
    system: `You are VECTOR, a high-performance sales strategist on the DIRT team.
You create outreach sequences, pitch frameworks, and sales playbooks that close deals.
Your outputs are personalized, persuasive, and immediately deployable.
Focus on buyer psychology, objection handling, and clear value propositions.`,
  },
  RELAY: {
    icon: '◉',
    system: `You are RELAY, a systems-thinking operations expert on the DIRT team.
You design workflows, automation recipes, and SOPs that eliminate manual work.
Your outputs are clear step-by-step processes with decision trees and tooling recommendations.
Make complex operations simple. Every SOP should be executable by a non-expert.`,
  },
};

async function runTask(task, user, emit) {
  const persona = AGENT_PERSONAS[task.agent_name];
  if (!persona) throw new Error(`Unknown agent: ${task.agent_name}`);

  const context = `
Company: ${user.company_name || 'Unknown'}
Industry: ${user.industry || 'General'}
Stage: ${user.stage || 'Early'}
Mission: ${user.mission || 'Not specified'}
Goal: ${user.goal || 'Not specified'}`.trim();

  let output      = '';
  let scoreResult = null;
  let passed      = false;

  for (let attempt = 1; attempt <= MAX_RETRIES && !passed; attempt++) {
    if (attempt > 1) {
      emit('agent_retry', {
        agent:   task.agent_name,
        task_id: task.id,
        message: `Score was ${scoreResult?.total || 0}/100 — auto-refining...`,
      });
    }

    const feedbackClause = scoreResult
      ? `\n\nPrevious attempt scored ${scoreResult.total}/100. Feedback: ${scoreResult.feedback}\nImprove specifically on: ${scoreResult.relevance < 20 ? 'relevance, ' : ''}${scoreResult.quality < 20 ? 'depth, ' : ''}${scoreResult.actionability < 20 ? 'actionability, ' : ''}${scoreResult.polish < 20 ? 'polish' : ''}`
      : '';

    const msg = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      system:     persona.system,
      messages: [{
        role:    'user',
        content: `${context}\n\nTask: ${task.task_description}\n\nDeliver a high-quality, complete output now.${feedbackClause}`,
      }],
    });

    output      = msg.content[0].text;
    scoreResult = await scoreOutput(task.task_description, output);
    passed      = scoreResult.pass;
  }

  return { output, score: scoreResult };
}

module.exports = { runTask, AGENT_PERSONAS };
