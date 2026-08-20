const { randomUUID } = require('node:crypto');
const { getMenuItem, getRequiredSelections, resolvePriceKey } = require('./menu');
const { evaluatePromotions } = require('./promotions');
const { roundToCents } = require('./money');
const { getTaxRate, getDeliveryFee } = require('./config');

let currentOrder = [];
let orderType = null;
let customer = { name: null };
let confirmed = false;
let status = 'building';

const ORDER_TYPES = ['pickup', 'delivery'];
const SESSION_STATUSES = ['building', 'confirmed', 'cancelled'];

function getCurrentOrder() {
  const subtotal = currentOrder.reduce((sum, line) => sum + line.lineTotal, 0);
  return { items: currentOrder.slice(), subtotal: roundToCents(subtotal) };
}

function getOrderTotals(options) {
  const { items, subtotal } = getCurrentOrder();
  const { appliedPromotions, discountTotal, recommendedPromotions } = evaluatePromotions(items, options);
  const taxableAmount = roundToCents(subtotal - discountTotal);
  const tax = roundToCents(taxableAmount * getTaxRate());
  const deliveryFee = roundToCents(getDeliveryFee());
  const total = roundToCents(taxableAmount + tax + deliveryFee);
  return { items, subtotal, appliedPromotions, discountTotal, tax, deliveryFee, total, recommendedPromotions };
}

function resetOrder() {
  currentOrder = [];
  orderType = null;
  customer = { name: null };
  confirmed = false;
  status = 'building';
}

function setOrderType(type) {
  if (!ORDER_TYPES.includes(type)) {
    return { ok: false, reason: 'invalid_order_type' };
  }
  orderType = type;
  return { ok: true, orderType };
}

function setCustomerDetails({ name } = {}) {
  customer = { name: name?.trim() || null };
  return { ok: true, customer };
}

function setConfirmed(value) {
  confirmed = Boolean(value);
  return { ok: true, confirmed };
}

function setStatus(newStatus) {
  if (!SESSION_STATUSES.includes(newStatus)) {
    return { ok: false, reason: 'invalid_status' };
  }
  status = newStatus;
  return { ok: true, status };
}

function getOrderState() {
  const { items, discountTotal, total } = getOrderTotals();
  return { items, orderType, customer, discount: discountTotal, total, confirmed, status };
}

function titleCase(value) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatExtra(name, value) {
  if (value === 'none' || value === 'no') {
    return null;
  }
  if (name === 'milk' || name === 'syrup') {
    return `${value} ${name}`;
  }
  if (name === 'whipped-cream' && value === 'yes') {
    return 'whipped cream';
  }
  return titleCase(value);
}

function getOrderSummary(options) {
  const { items, subtotal, appliedPromotions, discountTotal, tax, deliveryFee, total, recommendedPromotions } = getOrderTotals(options);

  if (items.length === 0) {
    return 'Your order is empty.';
  }

  const lines = items.map((line) => {
    const { size, ...otherOptions } = line.options;
    const sizePrefix = size ? `${titleCase(size)} ` : '';
    const extras = Object.entries(otherOptions)
      .map(([name, value]) => formatExtra(name, value))
      .filter(Boolean);
    const extrasSuffix = extras.length > 0 ? ` (${extras.join(', ')})` : '';

    return `${line.quantity}x ${sizePrefix}${line.name}${extrasSuffix} — $${line.lineTotal.toFixed(2)}`;
  });

  const totalsParts = [`Subtotal: $${subtotal.toFixed(2)}`];

  for (const promo of appliedPromotions) {
    totalsParts.push(`${promo.name}: -$${promo.discountAmount.toFixed(2)}`);
  }
  if (tax > 0) {
    totalsParts.push(`Tax: $${tax.toFixed(2)}`);
  }
  if (deliveryFee > 0) {
    totalsParts.push(`Delivery Fee: $${deliveryFee.toFixed(2)}`);
  }
  totalsParts.push(`Total: $${total.toFixed(2)}`);

  let summary = `${lines.join('\n')}\n\n${totalsParts.join('\n')}`;

  if (recommendedPromotions.length > 0) {
    const suggestions = recommendedPromotions.map((promo) => promo.message).join('\n');
    summary = `${summary}\n\n${suggestions}`;
  }

  return summary;
}

function validateSelections(item, options) {
  const requiredSelections = getRequiredSelections(item);
  const missing = [];
  const invalid = [];

  for (const selection of requiredSelections) {
    const value = options[selection.name];
    if (value === undefined) {
      missing.push({ name: selection.name, choices: selection.choices });
    } else if (!selection.choices.includes(value)) {
      invalid.push({ name: selection.name, value, choices: selection.choices });
    }
  }

  return { missing, invalid };
}

function addItemToOrder({ itemId, options = {}, quantity = 1 }) {
  const item = getMenuItem(itemId);
  if (!item) {
    return { ok: false, reason: 'not_found' };
  }
  if (!item.available) {
    return { ok: false, reason: 'unavailable' };
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: 'invalid_quantity' };
  }

  const { missing, invalid } = validateSelections(item, options);

  if (missing.length > 0) {
    return { ok: false, reason: 'missing_options', item: { id: item.id, name: item.name }, missing };
  }
  if (invalid.length > 0) {
    return { ok: false, reason: 'invalid_options', item: { id: item.id, name: item.name }, invalid };
  }

  const priceKey = resolvePriceKey(item, options);
  const unitPrice = item.prices[priceKey];

  const addedItem = {
    lineId: randomUUID(),
    itemId: item.id,
    name: item.name,
    quantity,
    options: { ...options },
    unitPrice,
    lineTotal: roundToCents(unitPrice * quantity),
  };

  currentOrder.push(addedItem);

  return { ok: true, addedItem, order: getCurrentOrder() };
}

function modifyOrderItem({ lineId, quantity, options }) {
  const line = currentOrder.find((l) => l.lineId === lineId);
  if (!line) {
    return { ok: false, reason: 'not_found' };
  }

  const item = getMenuItem(line.itemId);
  if (!item.available) {
    return { ok: false, reason: 'unavailable' };
  }

  const nextQuantity = quantity === undefined ? line.quantity : quantity;
  if (!Number.isInteger(nextQuantity) || nextQuantity < 1) {
    return { ok: false, reason: 'invalid_quantity' };
  }

  const nextOptions = { ...line.options, ...(options || {}) };
  const { missing, invalid } = validateSelections(item, nextOptions);

  if (missing.length > 0) {
    return { ok: false, reason: 'missing_options', item: { id: item.id, name: item.name }, missing };
  }
  if (invalid.length > 0) {
    return { ok: false, reason: 'invalid_options', item: { id: item.id, name: item.name }, invalid };
  }

  const priceKey = resolvePriceKey(item, nextOptions);

  line.quantity = nextQuantity;
  line.options = nextOptions;
  line.unitPrice = item.prices[priceKey];
  line.lineTotal = roundToCents(line.unitPrice * nextQuantity);

  return { ok: true, modifiedItem: line, order: getCurrentOrder() };
}

function removeOrderItem({ lineId, quantity }) {
  const index = currentOrder.findIndex((l) => l.lineId === lineId);
  if (index === -1) {
    return { ok: false, reason: 'not_found' };
  }

  const line = currentOrder[index];

  if (quantity === undefined) {
    currentOrder.splice(index, 1);
    return { ok: true, removed: true, removedItem: line, order: getCurrentOrder() };
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: 'invalid_quantity' };
  }

  if (quantity >= line.quantity) {
    currentOrder.splice(index, 1);
    return { ok: true, removed: true, removedItem: line, order: getCurrentOrder() };
  }

  line.quantity -= quantity;
  line.lineTotal = roundToCents(line.unitPrice * line.quantity);

  return { ok: true, removed: false, modifiedItem: line, order: getCurrentOrder() };
}

module.exports = {
  getCurrentOrder,
  addItemToOrder,
  modifyOrderItem,
  removeOrderItem,
  resetOrder,
  getOrderSummary,
  getOrderTotals,
  getOrderState,
  setOrderType,
  setCustomerDetails,
  setConfirmed,
  setStatus,
};
