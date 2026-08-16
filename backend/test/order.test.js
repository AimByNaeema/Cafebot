const test = require('node:test');
const assert = require('node:assert/strict');
const { addItemToOrder, getOrderTotals, getOrderSummary, resetOrder } = require('../order');
const { roundToCents } = require('../money');

function setEnv(taxRate, deliveryFee) {
  if (taxRate === undefined) {
    delete process.env.TAX_RATE;
  } else {
    process.env.TAX_RATE = String(taxRate);
  }
  if (deliveryFee === undefined) {
    delete process.env.DELIVERY_FEE;
  } else {
    process.env.DELIVERY_FEE = String(deliveryFee);
  }
}

test.beforeEach(() => {
  resetOrder();
  setEnv(undefined, undefined);
});

test.afterEach(() => {
  setEnv(undefined, undefined);
});

test('quantity multiplication produces correct line total and subtotal', () => {
  addItemToOrder({ itemId: 'drip-coffee', options: { size: 'medium', milk: 'none' }, quantity: 2 });
  const { items, subtotal } = getOrderTotals();
  assert.equal(items[0].lineTotal, 6.0);
  assert.equal(subtotal, 6.0);
});

test('discount reduces the taxable amount, not just the subtotal', () => {
  addItemToOrder({ itemId: 'drip-coffee', options: { size: 'large', milk: 'none' }, quantity: 1 });
  const now = new Date(2026, 0, 1, 8, 0);
  const { subtotal, discountTotal, tax, total } = getOrderTotals({ now });

  assert.equal(subtotal, 3.5);
  assert.equal(discountTotal, roundToCents(3.5 * 0.2));
  assert.equal(tax, 0);
  assert.equal(total, roundToCents(subtotal - discountTotal));
});

test('tax is computed on the post-discount amount', () => {
  setEnv(0.1, undefined);
  addItemToOrder({ itemId: 'drip-coffee', options: { size: 'large', milk: 'none' }, quantity: 1 });
  const now = new Date(2026, 0, 1, 8, 0);
  const { subtotal, discountTotal, tax, total } = getOrderTotals({ now });

  const taxableAmount = roundToCents(subtotal - discountTotal);
  assert.equal(tax, roundToCents(taxableAmount * 0.1));
  assert.equal(total, roundToCents(taxableAmount + tax));
});

test('flat delivery fee is added once and is not taxed', () => {
  setEnv(0.1, 2.5);
  addItemToOrder({ itemId: 'drip-coffee', options: { size: 'medium', milk: 'none' }, quantity: 2 });
  const { subtotal, tax, deliveryFee, total } = getOrderTotals();

  assert.equal(deliveryFee, 2.5);
  assert.equal(tax, roundToCents(subtotal * 0.1));
  assert.equal(total, roundToCents(subtotal + tax + deliveryFee));
});

test('rounding stays cent-accurate under a float-prone tax rate', () => {
  setEnv(0.0825, undefined);
  addItemToOrder({ itemId: 'drip-coffee', options: { size: 'small', milk: 'none' }, quantity: 3 });
  const { subtotal, tax, total } = getOrderTotals();

  assert.equal(subtotal, 7.5);
  assert.equal(tax, roundToCents(7.5 * 0.0825));
  assert.equal(total, roundToCents(7.5 + tax));
  assert.equal(Number(total.toFixed(2)), total);
});

test('zero-config default matches pre-existing behavior', () => {
  addItemToOrder({ itemId: 'drip-coffee', options: { size: 'medium', milk: 'none' }, quantity: 1 });
  const { subtotal, discountTotal, tax, deliveryFee, total } = getOrderTotals();

  assert.equal(tax, 0);
  assert.equal(deliveryFee, 0);
  assert.equal(total, roundToCents(subtotal - discountTotal));

  const summary = getOrderSummary();
  assert.ok(!summary.includes('Tax:'));
  assert.ok(!summary.includes('Delivery Fee:'));
  assert.ok(summary.includes(`Total: $${total.toFixed(2)}`));
});
