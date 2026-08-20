require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { readOrders, updateOrderStatus, ORDER_STATUSES } = require('./orderStore');
const { getCurrentOrder, addItemToOrder, modifyOrderItem, removeOrderItem, getOrderTotals } = require('./order');
const { getRecommendations } = require('./recommendations');
const { getClaudeModel } = require('./config');
const menu = require('../data/menu.json');

const SYSTEM_PROMPT_RAW = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'system-prompt.md'),
  'utf8'
);
const SYSTEM_PROMPT = `${SYSTEM_PROMPT_RAW.slice(
  SYSTEM_PROMPT_RAW.indexOf('```') + 3,
  SYSTEM_PROMPT_RAW.lastIndexOf('```')
).trim()}\n\nCURRENT MENU DATA (source of truth, from data/menu.json — only mention items, sizes, and prices listed here; never invent items, sizes, or prices not present in this data):\n${JSON.stringify(menu, null, 2)}`;

const anthropic = new Anthropic();

const TOOLS = [
  {
    name: 'getMenu',
    description: "Get CafeBot's current menu. Returns only items that are currently available.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'addItemToCart',
    description: "Add a menu item to the customer's order. itemId must be a real id from the menu data. Only pass options you've already confirmed with the customer — never guess a size, milk, or other option to make the call succeed. If the call fails with missing or invalid options, it will tell you exactly which options are needed and their valid choices — ask the customer for those and call again once you have real answers, don't retry with an invented value. On success, the response may include a `recommendations` field (0-2 real menu items). If present and you haven't already suggested one this order, you may offer it once — never invent a suggestion of your own, and never repeat or re-offer one that's already been declined.",
    input_schema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'The id of the menu item from the menu data.' },
        options: {
          type: 'object',
          description: 'Confirmed option selections, e.g. { "size": "large", "milk": "oat" }. Keys and values must match the item\'s option choices exactly.',
        },
        quantity: { type: 'integer', description: 'How many to add. Defaults to 1.' },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'modifyItem',
    description: "Change the quantity, size, or other options of an item already in the customer's order. lineId must be the lineId returned by a previous addItemToCart call for that exact line — never guess it; ask the customer which item if unsure. Only include the fields you're changing (quantity, options) — anything omitted keeps its current value. Only pass confirmed option values, never guess. If the call fails with missing or invalid options, ask the customer for exactly what's listed and call again — don't retry with an invented value. This tool does not remove items, and does not place the order.",
    input_schema: {
      type: 'object',
      properties: {
        lineId: { type: 'string', description: 'The lineId of the existing order line to modify, from a previous addItemToCart result.' },
        quantity: { type: 'integer', description: 'New quantity, if changing it.' },
        options: {
          type: 'object',
          description: 'Option changes to apply, e.g. { "size": "large" }. Only include keys being changed — other existing options on the line are kept.',
        },
      },
      required: ['lineId'],
    },
  },
  {
    name: 'removeItem',
    description: "Remove an item from the customer's order, or reduce its quantity. lineId must be the lineId of an existing order line (from a previous addItemToCart result) — never guess it; ask the customer which item if unsure. If quantity is omitted, the entire line is removed. If quantity is given, that many units are removed from the line (it's an amount to take away, not a new total) — if it's greater than or equal to the line's current quantity, the whole line is removed. Only call this after the customer has confirmed exactly what to remove.",
    input_schema: {
      type: 'object',
      properties: {
        lineId: { type: 'string', description: 'The lineId of the existing order line to remove from, from a previous addItemToCart result.' },
        quantity: {
          type: 'integer',
          description: "How many units to remove from the line. Omit to remove the entire line. If greater than or equal to the line's current quantity, the whole line is removed.",
        },
      },
      required: ['lineId'],
    },
  },
  {
    name: 'viewCart',
    description: "Get a concise, itemized view of what's currently in the customer's order — each line's item, quantity, and confirmed options (size, milk, etc.), including its lineId for use with modifyItem or removeItem. Does not include prices or totals — don't use this to quote a price or total, only to review or confirm what's in the cart. The response may include a `recommendations` field (0-2 real menu items). If present and you haven't already suggested one this order, you may offer it once — never invent a suggestion of your own, and never repeat or re-offer one that's already been declined.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'applyPromotion',
    description: "Check which active promotions (from data/promotions.json) currently qualify for the customer's order, based on real eligibility rules evaluated against the current cart and time — never based on anything the customer claims. Returns `appliedPromotions` (already reflected in the order's discount — relay the exact discountAmount for each, never estimate or invent it yourself) and `recommendedPromotions` (an eligible offer you may mention once — never repeat or re-offer one that's already been declined). There is no discount-code system: this tool takes no input, and if a customer mentions a promo code, tell them none is needed or recognized — never invent or accept one.",
    input_schema: { type: 'object', properties: {} },
  },
];

function getMenu() {
  return menu.filter((item) => item.available);
}

function addItemToCart(input) {
  const { itemId, options, quantity } = input || {};
  const result = addItemToOrder({ itemId, options, quantity });
  if (result.ok) {
    return { ...result, recommendations: getRecommendations(result.order.items) };
  }
  return result;
}

function modifyItem(input) {
  const { lineId, quantity, options } = input || {};
  return modifyOrderItem({ lineId, quantity, options });
}

function removeItem(input) {
  const { lineId, quantity } = input || {};
  return removeOrderItem({ lineId, quantity });
}

function viewCart() {
  const { items } = getCurrentOrder();
  return {
    items: items.map(({ lineId, itemId, name, quantity, options }) => ({ lineId, itemId, name, quantity, options })),
    recommendations: getRecommendations(items),
  };
}

function applyPromotion() {
  const { appliedPromotions, discountTotal, recommendedPromotions } = getOrderTotals();
  return { appliedPromotions, discountTotal, recommendedPromotions };
}

function runTool(name, input) {
  if (name === 'getMenu') {
    return getMenu();
  }
  if (name === 'addItemToCart') {
    return addItemToCart(input);
  }
  if (name === 'modifyItem') {
    return modifyItem(input);
  }
  if (name === 'removeItem') {
    return removeItem(input);
  }
  if (name === 'viewCart') {
    return viewCart();
  }
  if (name === 'applyPromotion') {
    return applyPromotion();
  }
  return { error: `unknown tool: ${name}` };
}

function callClaude(messages) {
  return anthropic.messages.create({
    model: getClaudeModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages,
  });
}

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
    let response = await callClaude(messages);
    let iterations = 0;

    while (response.stop_reason === 'tool_use' && iterations < 5) {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = response.content
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(runTool(block.name, block.input)),
        }));
      messages.push({ role: 'user', content: toolResults });
      response = await callClaude(messages);
      iterations += 1;
    }

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
