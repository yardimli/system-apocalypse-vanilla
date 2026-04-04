import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';
import { autoEquipBestGear } from './heroes.js';

/**
 * Finds an entity (item) by its ID from the game data.
 * @param {string} id - The ID of the entity to find.
 * @returns {object|null} The found entity or null.
 */
function findEntityById(id) {
	if (!id) return null;
	return gameData.items.find(i => i.id === id);
}

/**
 * Handles a hero buying an item from the System Shop.
 * @param {number} heroId - The ID of the hero buying the item.
 * @param {string} itemId - The ID of the item to buy.
 */
export function handleBuyItem(heroId, itemId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const shopEntry = gameData.system_shop.find(item => item.itemId === itemId);
	const itemData = findEntityById(itemId);
	
	if (!hero || !shopEntry || !itemData) {
		addToLog('Shop Error: Hero or item not found.');
		return;
	}
	
	if (hero.tokens < shopEntry.price) {
		addToLog(`${hero.name} does not have enough tokens to buy ${itemData.name}.`, hero.id);
		return;
	}
	
	// Process transaction
	hero.tokens -= shopEntry.price;
	hero.inventory[itemId] = (hero.inventory[itemId] || 0) + 1;
	
	addToLog(`${hero.name} bought ${itemData.name} for ${shopEntry.price} tokens.`, hero.id);
	
	// If the bought item was equippable, run auto-equip logic
	if (itemData.equipSlot) {
		autoEquipBestGear(hero);
	}
}

/**
 * Handles a hero buying a skill from the System Shop.
 * @param {number} heroId - The ID of the hero buying the skill.
 * @param {string} skillId - The ID of the skill to buy.
 */
export function handleBuySkill(heroId, skillId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const shopEntry = gameData.system_shop.find(item => item.skillId === skillId);
	const skillData = gameData.skills.find(s => s.id === skillId);
	
	if (!hero || !shopEntry || !skillData) {
		addToLog('Shop Error: Hero or skill not found.');
		return;
	}
	
	if (hero.tokens < shopEntry.price) {
		addToLog(`${hero.name} does not have enough tokens to learn ${skillData.name}.`, hero.id);
		return;
	}
	
	if (hero.skills.some(s => s.id === skillId)) {
		addToLog(`${hero.name} already knows ${skillData.name}.`, hero.id);
		return;
	}
	
	// Process transaction
	hero.tokens -= shopEntry.price;
	hero.skills.push({ id: skillId });
	
	addToLog(`${hero.name} learned ${skillData.name} for ${shopEntry.price} tokens.`, hero.id);
}


/**
 * Handles a hero selling an item from their inventory.
 * @param {number} heroId - The ID of the hero selling the item.
 * @param {string} itemId - The ID of the item to sell.
 */
export function handleSellItem(heroId, itemId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const itemData = findEntityById(itemId);
	
	if (!hero || !itemData || !hero.inventory[itemId] || hero.inventory[itemId] <= 0) {
		addToLog('Shop Error: Hero or item not found in inventory.');
		return;
	}
	
	// Allow selling if the hero has unequipped duplicates.
	const totalQty = hero.inventory[itemId] || 0;
	const equippedCount = Object.values(hero.equipment).filter(eqId => eqId === itemId).length;
	
	// Cannot sell if the number of items is less than or equal to the number equipped.
	if (totalQty <= equippedCount) {
		addToLog(`Cannot sell. All ${itemData.name}(s) are currently equipped.`, hero.id);
		return;
	}
	
	const sellPrice = itemData.sellPrice || 0;
	
	// Process transaction
	hero.inventory[itemId]--;
	if (hero.inventory[itemId] === 0) {
		delete hero.inventory[itemId];
	}
	hero.tokens += sellPrice;
	
	addToLog(`${hero.name} sold ${itemData.name} for ${sellPrice} tokens.`, hero.id);
}

/**
 * NEW: Handles the party buying an upgrade for a car or building.
 * @param {string} upgradeId - The ID of the upgrade to buy.
 */
export function handleBuyUpgrade(upgradeId) {
	const upgrade = gameData.building_upgrades.find(u => u.id === upgradeId) || gameData.car_upgrades.find(u => u.id === upgradeId);
	if (!upgrade) {
		addToLog(`Shop Error: Upgrade with ID ${upgradeId} not found.`);
		return;
	}
	
	const totalTokens = gameState.heroes.reduce((sum, h) => sum + h.tokens, 0);
	if (totalTokens < upgrade.cost) {
		addToLog(`The party doesn't have enough tokens to buy ${upgrade.name}. (Need ${upgrade.cost})`);
		return;
	}
	
	const isCarUpgrade = upgrade.id.startsWith('CAR_');
	const targetType = isCarUpgrade ? 'car' : 'building';
	const ownedAssets = isCarUpgrade
		? gameState.city.cars.filter(c => c.owner === 'player')
		: gameState.city.buildings.filter(b => b.owner === 'player');
	
	if (ownedAssets.length === 0) {
		addToLog(`There are no player-owned ${targetType}s to upgrade.`);
		return;
	}
	
	const validIds = ownedAssets.map(a => a.id).join(', ');
	const targetIdStr = prompt(`Enter the ID of the ${targetType} to apply "${upgrade.name}" to.\nValid IDs: ${validIds}`);
	if (!targetIdStr) {
		addToLog('Upgrade purchase cancelled.');
		return;
	}
	
	const targetId = parseInt(targetIdStr, 10);
	const targetAsset = ownedAssets.find(a => a.id === targetId);
	
	if (!targetAsset) {
		addToLog(`Invalid ID. No player-owned ${targetType} with ID #${targetId} found.`);
		return;
	}
	
	if (targetAsset.upgrades.includes(upgradeId)) {
		addToLog(`${targetAsset.name || `${targetType} #${targetId}`} already has the ${upgrade.name} upgrade.`);
		return;
	}
	
	// Deduct cost from party, starting with the richest heroes.
	let remainingCost = upgrade.cost;
	const payers = gameState.heroes.slice().sort((a, b) => b.tokens - a.tokens);
	for (const hero of payers) {
		const payment = Math.min(hero.tokens, remainingCost);
		hero.tokens -= payment;
		remainingCost -= payment;
		if (remainingCost <= 0) break;
	}
	
	// Apply upgrade
	targetAsset.upgrades.push(upgradeId);
	
	// Handle one-time effects of upgrades (e.g., adding a shield)
	const { effect } = upgrade;
	if (effect) {
		if (effect.type === 'add_shield') {
			targetAsset.maxShieldHp = (targetAsset.maxShieldHp || 0) + effect.value;
			targetAsset.shieldHp = (targetAsset.shieldHp || 0) + effect.value;
		} else if (effect.type === 'increase_max_hp') {
			targetAsset.maxHp += effect.value;
			targetAsset.hp += effect.value;
		}
	}
	
	addToLog(`Party purchased ${upgrade.name} for ${targetAsset.name || `${targetType} #${targetId}`} for ${upgrade.cost} tokens!`);
}
