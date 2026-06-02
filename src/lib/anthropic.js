const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set in .env');
}

module.exports = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
