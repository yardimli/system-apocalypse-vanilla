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
		addToLog(`${hero.name} does not have enough tokens to buy ${itemData.name}.`, hero.id); // MODIFIED
		return;
	}
	
	// Process transaction
	hero.tokens -= shopEntry.price;
	hero.inventory[itemId] = (hero.inventory[itemId] || 0) + 1;
	
	addToLog(`${hero.name} bought ${itemData.name} for ${shopEntry.price} tokens.`, hero.id); // MODIFIED
	
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
		addToLog(`${hero.name} does not have enough tokens to learn ${skillData.name}.`, hero.id); // MODIFIED
		return;
	}
	
	if (hero.skills.some(s => s.id === skillId)) {
		addToLog(`${hero.name} already knows ${skillData.name}.`, hero.id); // MODIFIED
		return;
	}
	
	// Process transaction
	hero.tokens -= shopEntry.price;
	hero.skills.push({ id: skillId, xp: 0 });
	
	addToLog(`${hero.name} learned ${skillData.name} for ${shopEntry.price} tokens.`, hero.id); // MODIFIED
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
		addToLog(`Cannot sell. All ${itemData.name}(s) are currently equipped.`, hero.id); // MODIFIED
		return;
	}
	
	const sellPrice = itemData.sellPrice || 0;
	
	// Process transaction
	hero.inventory[itemId]--;
	if (hero.inventory[itemId] === 0) {
		delete hero.inventory[itemId];
	}
	hero.tokens += sellPrice;
	
	addToLog(`${hero.name} sold ${itemData.name} for ${sellPrice} tokens.`, hero.id); // MODIFIED
}
