const Anthropic = require('@anthropic-ai/sdk');

// Warn at startup if key is missing — server still boots, but AI routes will fail at request time
if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[WARN] ANTHROPIC_API_KEY is not set. AI agent features will not work.\n       Add it to your .env file (see .env.example).');
}

module.exports = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'key-not-set' });
