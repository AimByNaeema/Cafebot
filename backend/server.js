require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { readOrders, updateOrderStatus, confirmOrder, ORDER_STATUSES } = require('./orderStore');
const { getCurrentOrder, addItemToOrder, modifyOrderItem, removeOrderItem, getOrderTotals, setOrderType, setCustomerDetails, setPickupTime, setDeliveryAddress, markSummaryShown, getOrderState } = require('./order');
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
    name: 'setOrderDetails',
    description: "Record the customer's order type (pickup or delivery) along with whatever details that type requires — call this as you collect each piece, passing only what you just confirmed (anything omitted keeps its current value; call it multiple times as info comes in). Pickup only needs a confirmed name (pickup time is optional). Delivery needs a confirmed name, phone number, and full delivery address; apartment/unit and delivery instructions are optional — ask for them, but don't invent a value or leave a required field blank. The response's `missing` field lists exactly which required fields are still unset for the order type currently selected — only ask the customer for those, never re-ask for something already confirmed, and never guess or invent any of these details yourself.",
    input_schema: {
      type: 'object',
      properties: {
        orderType: { type: 'string', enum: ['pickup', 'delivery'], description: 'Set once the customer has confirmed whether this is pickup or delivery.' },
        customerName: { type: 'string', description: "The customer's name, exactly as they gave it." },
        pickupTime: { type: 'string', description: 'Pickup only. Preferred pickup time in the customer\'s own words, e.g. "3:30pm" or "in 20 minutes". Omit if no preference.' },
        phone: { type: 'string', description: "Delivery only. The customer's phone number, exactly as they gave it." },
        deliveryAddress: { type: 'string', description: 'Delivery only. The full delivery address (street, city, etc.), exactly as given.' },
        aptUnit: { type: 'string', description: 'Delivery only. Apartment/unit/suite number, if applicable. Omit if there is none.' },
        deliveryInstructions: { type: 'string', description: 'Delivery only. Any delivery instructions (gate code, "leave at door", etc.). Omit if none given.' },
      },
    },
  },
  {
    name: 'applyPromotion',
    description: "Check which active promotions (from data/promotions.json) currently qualify for the customer's order, based on real eligibility rules evaluated against the current cart and time — never based on anything the customer claims. Returns `appliedPromotions` (already reflected in the order's discount — relay the exact discountAmount for each, never estimate or invent it yourself) and `recommendedPromotions` (an eligible offer you may mention once — never repeat or re-offer one that's already been declined). There is no discount-code system: this tool takes no input, and if a customer mentions a promo code, tell them none is needed or recognized — never invent or accept one.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'getOrderTotal',
    description: "Get the exact subtotal, applied promotion discount, tax, delivery fee, and total for the current order — computed by the backend from real menu prices and quantities, with any active promotion and the order's fulfillment type (pickup vs. delivery) already factored in. Call this right before quoting a total to the customer, and relay these figures exactly as returned — never calculate, sum, estimate, or invent a subtotal, tax, fee, or total yourself.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'getCheckoutSummary',
    description: "Get a complete structured summary of the current order, right before checkout — every item with its quantity and customizations, fulfillment details (pickup or delivery, name, phone/delivery address if delivery, pickup time if given), any valid applied promotion, and the exact subtotal/tax/delivery fee/total. Use this to recite the full order back to the customer for final review before asking them to confirm. Relay everything exactly as returned — never calculate, invent, or guess any item detail, promotion, or price yourself.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'placeOrder',
    description: "Finalize and save the order. This is the only tool that actually places it, and it refuses unless every requirement is met: the customer must have already been shown the full checkout summary (call getCheckoutSummary first), all required order-type details must be set (name; plus phone and delivery address for delivery), and customerConfirmed must be true. Only ever pass customerConfirmed: true after the customer gives a clear, unambiguous affirmative to a direct question like \"Shall I place this order?\" — a vague, hedging, or unclear reply (e.g. \"maybe\", \"I think so\", not really answering, changing the subject) is NOT confirmation; if there's any doubt, ask again instead of calling this. If the call fails, it tells you exactly why (summary not yet shown, which order details are still missing, or not yet confirmed) — resolve that with the customer and try again, never guess or force it through.",
    input_schema: {
      type: 'object',
      properties: {
        customerConfirmed: { type: 'boolean', description: "Set true only after the customer's explicit, unambiguous affirmative reply confirming they want to place the order." },
      },
      required: ['customerConfirmed'],
    },
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

function getMissingOrderDetails(state) {
  const missing = [];
  if (state.orderType !== 'pickup' && state.orderType !== 'delivery') {
    missing.push('orderType');
  } else {
    if (!state.customer.name) missing.push('customerName');
    if (state.orderType === 'delivery') {
      if (!state.customer.phone) missing.push('phone');
      if (!state.deliveryAddress.address) missing.push('deliveryAddress');
    }
  }
  return missing;
}

function setOrderDetails(input) {
  const { orderType, customerName, pickupTime, phone, deliveryAddress, aptUnit, deliveryInstructions } = input || {};
  if (orderType === 'pickup' || orderType === 'delivery') {
    setOrderType(orderType);
  }
  if (customerName !== undefined || phone !== undefined) {
    setCustomerDetails({ name: customerName, phone });
  }
  if (pickupTime !== undefined) {
    setPickupTime(pickupTime);
  }
  if (deliveryAddress !== undefined || aptUnit !== undefined || deliveryInstructions !== undefined) {
    setDeliveryAddress({ address: deliveryAddress, aptUnit, instructions: deliveryInstructions });
  }
  const state = getOrderState();
  const missing = getMissingOrderDetails(state);
  return {
    orderType: state.orderType,
    customerName: state.customer.name,
    pickupTime: state.pickupTime,
    phone: state.customer.phone,
    deliveryAddress: state.deliveryAddress.address,
    aptUnit: state.deliveryAddress.aptUnit,
    deliveryInstructions: state.deliveryAddress.instructions,
    missing,
  };
}

function applyPromotion() {
  const { appliedPromotions, discountTotal, recommendedPromotions } = getOrderTotals();
  return { appliedPromotions, discountTotal, recommendedPromotions };
}

function getOrderTotal() {
  const { subtotal, appliedPromotions, discountTotal, tax, deliveryFee, total } = getOrderTotals();
  return { subtotal, appliedPromotions, discountTotal, tax, deliveryFee, total };
}

function getCheckoutSummary() {
  const { items, subtotal, appliedPromotions, discountTotal, tax, deliveryFee, total } = getOrderTotals();
  const state = getOrderState();
  markSummaryShown();
  return {
    items: items.map(({ lineId, itemId, name, quantity, options, unitPrice, lineTotal }) => ({
      lineId,
      itemId,
      name,
      quantity,
      options,
      unitPrice,
      lineTotal,
    })),
    orderType: state.orderType,
    customerName: state.customer.name,
    pickupTime: state.pickupTime,
    phone: state.customer.phone,
    deliveryAddress: state.deliveryAddress.address,
    aptUnit: state.deliveryAddress.aptUnit,
    deliveryInstructions: state.deliveryAddress.instructions,
    subtotal,
    appliedPromotions,
    discountTotal,
    tax,
    deliveryFee,
    total,
  };
}

function placeOrder(input) {
  const { customerConfirmed } = input || {};
  const state = getOrderState();

  if (!state.summaryShown) {
    return { ok: false, reason: 'summary_not_shown' };
  }

  const missing = getMissingOrderDetails(state);
  if (missing.length > 0) {
    return { ok: false, reason: 'missing_order_details', missing };
  }

  if (customerConfirmed !== true) {
    return { ok: false, reason: 'not_confirmed' };
  }

  return confirmOrder({
    customerName: state.customer.name,
    phone: state.customer.phone,
    fulfillmentType: state.orderType,
    pickupTime: state.pickupTime,
    deliveryAddress: state.deliveryAddress.address,
    aptUnit: state.deliveryAddress.aptUnit,
    deliveryInstructions: state.deliveryAddress.instructions,
  });
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
  if (name === 'setOrderDetails') {
    return setOrderDetails(input);
  }
  if (name === 'getOrderTotal') {
    return getOrderTotal();
  }
  if (name === 'getCheckoutSummary') {
    return getCheckoutSummary();
  }
  if (name === 'placeOrder') {
    return placeOrder(input);
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
