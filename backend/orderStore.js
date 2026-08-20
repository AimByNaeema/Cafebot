const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getOrderTotals, resetOrder } = require('./order');

// data/orders.json is temporary, file-based dev storage, not a database — revisit before production.
const DEFAULT_ORDERS_FILE = path.join(__dirname, '..', 'data', 'orders.json');

const ORDER_STATUSES = ['confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
const FULFILLMENT_TYPES = ['pickup', 'delivery'];

function getOrdersFilePath() {
  return process.env.ORDERS_FILE_PATH || DEFAULT_ORDERS_FILE;
}

function readOrders() {
  let raw;
  try {
    raw = fs.readFileSync(getOrdersFilePath(), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? [] : JSON.parse(trimmed);
}

function writeOrders(orders) {
  const filePath = getOrdersFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(orders, null, 2)}\n`);
}

function confirmOrder({ customerName, fulfillmentType } = {}) {
  const { items, subtotal, appliedPromotions, discountTotal, tax, deliveryFee, total } = getOrderTotals();

  if (items.length === 0) {
    return { ok: false, reason: 'empty_order' };
  }

  const resolvedFulfillmentType = FULFILLMENT_TYPES.includes(fulfillmentType) ? fulfillmentType : 'pickup';

  const record = {
    orderId: randomUUID(),
    timestamp: new Date().toISOString(),
    status: 'confirmed',
    customerName: customerName?.trim() || null,
    fulfillmentType: resolvedFulfillmentType,
    items,
    subtotal,
    appliedPromotions,
    discountTotal,
    tax,
    deliveryFee,
    total,
  };

  const orders = readOrders();
  orders.push(record);
  writeOrders(orders);

  resetOrder();

  return { ok: true, order: record };
}

function updateOrderStatus(orderId, status) {
  if (!ORDER_STATUSES.includes(status)) {
    return { ok: false, reason: 'invalid_status' };
  }

  const orders = readOrders();
  const order = orders.find((o) => o.orderId === orderId);
  if (!order) {
    return { ok: false, reason: 'not_found' };
  }

  order.status = status;
  writeOrders(orders);

  return { ok: true, order };
}

module.exports = {
  confirmOrder,
  getOrdersFilePath,
  readOrders,
  updateOrderStatus,
  ORDER_STATUSES,
  FULFILLMENT_TYPES,
};
