const menu = require('../data/menu.json');

function getMenuItem(itemId) {
  return menu.find((item) => item.id === itemId);
}

function getSizeRequirement(item) {
  const priceKeys = Object.keys(item.prices);
  if (priceKeys.length <= 1) {
    return null;
  }

  const priceKeySet = new Set(priceKeys);
  const matchingOption = item.options.find((option) => {
    const choiceSet = new Set(option.choices);
    return choiceSet.size === priceKeySet.size && option.choices.every((choice) => priceKeySet.has(choice));
  });
  if (matchingOption) {
    return null;
  }

  return { name: 'size', choices: priceKeys };
}

function getRequiredSelections(item) {
  const sizeRequirement = getSizeRequirement(item);
  return sizeRequirement ? [...item.options, sizeRequirement] : [...item.options];
}

function resolvePriceKey(item, selections) {
  const priceKeys = Object.keys(item.prices);
  if (priceKeys.length === 1) {
    return priceKeys[0];
  }

  if (selections.size && priceKeys.includes(selections.size)) {
    return selections.size;
  }

  const priceKeySet = new Set(priceKeys);
  const matchingOption = item.options.find((option) => {
    const choiceSet = new Set(option.choices);
    return choiceSet.size === priceKeySet.size && option.choices.every((choice) => priceKeySet.has(choice));
  });
  if (matchingOption) {
    return selections[matchingOption.name];
  }

  return undefined;
}

module.exports = { getMenuItem, getRequiredSelections, resolvePriceKey };
