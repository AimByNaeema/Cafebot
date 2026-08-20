const menu = require('../data/menu.json');

const DRINK_CATEGORIES = ['coffee', 'tea'];

function getRecommendations(items) {
  const categoriesInCart = new Set(
    items
      .map((line) => menu.find((item) => item.id === line.itemId))
      .filter(Boolean)
      .map((item) => item.category)
  );

  const hasDrink = DRINK_CATEGORIES.some((category) => categoriesInCart.has(category));
  const hasFood = categoriesInCart.has('food');

  let targetCategory = null;
  if (hasDrink && !hasFood) {
    targetCategory = 'food';
  } else if (hasFood && !hasDrink) {
    targetCategory = 'coffee';
  }

  if (!targetCategory) {
    return [];
  }

  const cartItemIds = new Set(items.map((line) => line.itemId));

  return menu
    .filter((item) => item.category === targetCategory && item.available && !cartItemIds.has(item.id))
    .slice(0, 2)
    .map((item) => ({ id: item.id, name: item.name, category: item.category }));
}

module.exports = { getRecommendations };
