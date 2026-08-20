const promotions = require('../data/promotions.json');
const { getMenuItem } = require('./menu');
const { roundToCents } = require('./money');

function getActivePromotions() {
  return promotions.filter((promo) => promo.active === true);
}

function isMorningRushEligible(now) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 7 * 60 && minutes < 9 * 60;
}

function hasLargeDripCoffee(items) {
  return items.some((line) => line.itemId === 'drip-coffee' && line.options.size === 'large' && line.quantity >= 1);
}

const PREDICATES = {
  'morning-rush-20': (promo, items, now) => {
    if (!isMorningRushEligible(now)) {
      return null;
    }
    const coffeeLines = items.filter((line) => {
      const item = getMenuItem(line.itemId);
      return item && item.category === 'coffee';
    });
    if (coffeeLines.length === 0) {
      return null;
    }
    const discountAmount = coffeeLines.reduce((sum, line) => sum + line.lineTotal * (promo.discount.value / 100), 0);
    return {
      type: 'applied',
      id: promo.id,
      name: promo.name,
      discountAmount: roundToCents(discountAmount),
    };
  },
  'pastry-combo': (promo, items) => {
    if (!hasLargeDripCoffee(items)) {
      return null;
    }
    const freeItem = getMenuItem(promo.discount.item);
    const freeItemLine = items.find((line) => line.itemId === promo.discount.item);
    if (freeItemLine) {
      return {
        type: 'applied',
        id: promo.id,
        name: promo.name,
        discountAmount: roundToCents(freeItemLine.unitPrice),
      };
    }
    return {
      type: 'recommended',
      id: promo.id,
      name: promo.name,
      message: `You qualify for a free ${freeItem ? freeItem.name : promo.discount.item} with a large Drip Coffee — want me to add it?`,
    };
  },
};

function evaluatePromotions(items, { now = new Date() } = {}) {
  const appliedPromotions = [];
  const recommendedPromotions = [];

  for (const promo of getActivePromotions()) {
    const predicate = PREDICATES[promo.id];
    if (!predicate) {
      continue;
    }
    const result = predicate(promo, items, now);
    if (!result) {
      continue;
    }
    if (result.type === 'applied') {
      appliedPromotions.push({ id: result.id, name: result.name, discountAmount: result.discountAmount });
    } else if (result.type === 'recommended') {
      recommendedPromotions.push({ id: result.id, name: result.name, message: result.message });
    }
  }

  const discountTotal = roundToCents(appliedPromotions.reduce((sum, p) => sum + p.discountAmount, 0));

  return { appliedPromotions, discountTotal, recommendedPromotions };
}

module.exports = { getActivePromotions, evaluatePromotions };
