require('dotenv').config();

function parseNonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getTaxRate() {
  return parseNonNegativeNumber(process.env.TAX_RATE, 0);
}

function getDeliveryFee() {
  return parseNonNegativeNumber(process.env.DELIVERY_FEE, 0);
}

module.exports = { getTaxRate, getDeliveryFee };
