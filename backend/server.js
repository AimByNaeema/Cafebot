require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { readOrders, updateOrderStatus, ORDER_STATUSES } = require('./orderStore');
const { getClaudeModel } = require('./config');

const SYSTEM_PROMPT_RAW = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'system-prompt.md'),
  'utf8'
);
const SYSTEM_PROMPT = SYSTEM_PROMPT_RAW.slice(
  SYSTEM_PROMPT_RAW.indexOf('```') + 3,
  SYSTEM_PROMPT_RAW.lastIndexOf('```')
).trim();

const anthropic = new Anthropic();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/api/orders', (req, res) => {
  const orders = readOrders().slice().reverse();
  res.json(orders);
});

app.patch('/api/orders/:orderId/status', (req, res) => {
  const { status } = req.body || {};

  if (typeof status !== 'string' || !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
  }

  const result = updateOrderStatus(req.params.orderId, status);
  if (!result.ok) {
    return res.status(404).json({ error: 'order not found' });
  }

  res.json(result.order);
});

app.post('/api/chat', async (req, res) => {
  const { message, conversationHistory } = req.body || {};

  if (typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message is required' });
  }
  if (conversationHistory !== undefined && !Array.isArray(conversationHistory)) {
    return res.status(400).json({ error: 'conversationHistory must be an array' });
  }

  const messages = [
    ...(conversationHistory || []),
    { role: 'user', content: message },
  ];

  try {
    const response = await anthropic.messages.create({
      model: getClaudeModel(),
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    res.json({ reply });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(502).json({
      reply: "Sorry, I'm having trouble connecting right now — please try again in a moment.",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CafeBot backend listening on port ${PORT}`);
});
