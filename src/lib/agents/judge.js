const anthropic = require('../anthropic');

async function scoreOutput(task, output) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `You are an expert quality assessor for business deliverables.
Score outputs strictly and fairly. Return valid JSON only.`,
    messages: [{
      role: 'user',
      content: `Score this business deliverable.

Task: ${task}

Output:
${output.slice(0, 3000)}

Score on 4 dimensions (0-25 each):
- relevance: How well it addresses the specific task
- quality: Depth, accuracy, and completeness
- actionability: Can it be used immediately without modification?
- polish: Professional quality, formatting, clarity

Return:
{
  "relevance": number,
  "quality": number,
  "actionability": number,
  "polish": number,
  "total": number,
  "feedback": "string — 1-2 sentences on key strengths and what to improve",
  "pass": boolean (true if total >= 65)
}`,
    }],
  });

  let result;
  try {
    result = JSON.parse(msg.content[0].text);
  } catch (_) {
    const match = msg.content[0].text.match(/\{[\s\S]*\}/);
    if (match) result = JSON.parse(match[0]);
    else return { relevance: 15, quality: 15, actionability: 15, polish: 15, total: 60, feedback: 'Score parse failed — defaulting to 60', pass: false };
  }
  result.total = result.relevance + result.quality + result.actionability + result.polish;
  result.pass  = result.total >= 65;
  return result;
}

module.exports = { scoreOutput };
