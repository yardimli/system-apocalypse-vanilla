import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';
import { autoEquipBestGear, renderShopModal } from './heroes.js';
import { handleBuyBuilding } from './buildings.js';
import { initiateCarPurchase } from './cars.js';

/**
 * Finds an entity (item) by its ID from the game data.
 * @param {string} id - The ID of the entity to find.
 * @returns {object|null} The found entity or null.
 */
function findEntityById (id) {
	if (!id) return null;
	return gameData.items.find(i => i.id === id);
}

// Helper function to get an element by its ID, used by the event handler.
const getEl = (id) => document.getElementById(id);

/**
 * entralized handler for all shop and major purchase-related click events.
 * This function is called from the main event listener in main.js.
 * @param {Event} e - The click event object.
 * @returns {boolean} - True if an action was handled, indicating a re-render may be needed.
 */
export function handleShopAndPurchaseClicks (e) {
	const sellBtn = e.target.closest('[data-sell-item-id]');
	if (sellBtn) {
		const heroId = parseInt(sellBtn.dataset.heroId, 10);
		const itemId = sellBtn.dataset.sellItemId;
		handleSellItem(heroId, itemId);
		const modal = getEl('system-shop-modal');
		if (modal.open) {
			renderShopModal(heroId);
		}
		return true; // Handled, re-render needed
	}
	
	const buyItemBtn = e.target.closest('[data-buy-item-id]');
	if (buyItemBtn) {
		const heroId = parseInt(buyItemBtn.dataset.heroId, 10);
		const itemId = buyItemBtn.dataset.buyItemId;
		handleBuyItem(heroId, itemId);
		renderShopModal(heroId);
		return true; // Handled, re-render needed
	}
	
	const buySkillBtn = e.target.closest('[data-buy-skill-id]');
	if (buySkillBtn) {
		const heroId = parseInt(buySkillBtn.dataset.heroId, 10);
		const skillId = buySkillBtn.dataset.buySkillId;
		handleBuySkill(heroId, skillId);
		renderShopModal(heroId);
		return true; // Handled, re-render needed
	}
	
	const buyUpgradeBtn = e.target.closest('[data-buy-upgrade-id]');
	if (buyUpgradeBtn) {
		const upgradeId = buyUpgradeBtn.dataset.buyUpgradeId;
		const heroId = parseInt(buyUpgradeBtn.dataset.heroId, 10);
		handleBuyUpgrade(heroId, upgradeId);
		renderShopModal(heroId);
		return true; // Handled, re-render needed
	}
	
	const buyBuildingBtn = e.target.closest('[data-buy-building-id]');
	if (buyBuildingBtn) {
		const buildingId = parseInt(buyBuildingBtn.dataset.buyBuildingId, 10);
		handleBuyBuilding(buildingId);
		return true; // Handled, re-render needed
	}
	
	const confirmBuyCarBtn = e.target.closest('[data-confirm-buy-car]');
	if (confirmBuyCarBtn) {
		const heroId = parseInt(confirmBuyCarBtn.dataset.heroId, 10);
		const carId = confirmBuyCarBtn.dataset.carId;
		handleBuyCar(heroId, carId);
		const modal = getEl('car-purchase-modal');
		if (modal) modal.close();
		return true; // Handled, re-render needed
	}
	
	const buyCarBtn = e.target.closest('[data-buy-car-id]');
	if (buyCarBtn) {
		initiateCarPurchase(buyCarBtn.dataset.buyCarId);
		// This action just opens a modal, no immediate game state change that requires a full re-render.
		// Returning true is safer in case other things need to update.
		return true;
	}
	
	return false; // No relevant action was handled
}

/**
 * Handles a hero buying an item from the System Shop.
 * @param {number} heroId - The ID of the hero buying the item.
 * @param {string} itemId - The ID of the item to buy.
 */
export function handleBuyItem (heroId, itemId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const shopEntry = gameData.system_shop.find(item => item.itemId === itemId);
	const itemData = findEntityById(itemId);
	
	if (!hero || !shopEntry || !itemData) {
		addToLog('Shop Error: Hero or item not found.');
		return;
	}
	
	if (hero.tokens < shopEntry.price) {
		addToLog(`does not have enough tokens to buy ${itemData.name}.`, hero.id);
		return;
	}
	
	// Process transaction
	hero.tokens -= shopEntry.price;
	hero.inventory[itemId] = (hero.inventory[itemId] || 0) + 1;
	
	addToLog(`bought ${itemData.name} for ${shopEntry.price} tokens.`, hero.id);
	
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
export function handleBuySkill (heroId, skillId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const shopEntry = gameData.system_shop.find(item => item.skillId === skillId);
	const skillData = gameData.skills.find(s => s.id === skillId);
	
	if (!hero || !shopEntry || !skillData) {
		addToLog('Shop Error: Hero or skill not found.');
		return;
	}
	
	if (hero.tokens < shopEntry.price) {
		addToLog(`does not have enough tokens to learn ${skillData.name}.`, hero.id);
		return;
	}
	
	if (hero.skills.some(s => s.id === skillId)) {
		addToLog(`already knows ${skillData.name}.`, hero.id);
		return;
	}
	
	// Process transaction
	hero.tokens -= shopEntry.price;
	hero.skills.push({ id: skillId });
	
	addToLog(`learned ${skillData.name} for ${shopEntry.price} tokens.`, hero.id);
}

/**
 * Handles a hero selling an item from their inventory.
 * @param {number} heroId - The ID of the hero selling the item.
 * @param {string} itemId - The ID of the item to sell.
 */
export function handleSellItem (heroId, itemId) {
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
	
	addToLog(`sold ${itemData.name} for ${sellPrice} tokens.`, hero.id);
}

/**
 * Handles a hero buying an upgrade for a car or building.
 * @param {number} heroId - The ID of the hero buying the upgrade.
 * @param {string} upgradeId - The ID of the upgrade to buy.
 */
export function handleBuyUpgrade (heroId, upgradeId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const upgrade = gameData.building_upgrades.find(u => u.id === upgradeId) || gameData.car_upgrades.find(u => u.id === upgradeId);
	
	if (!hero || !upgrade) {
		addToLog(`Shop Error: Hero or upgrade with ID ${upgradeId} not found.`);
		return;
	}
	
	if (hero.tokens < upgrade.cost) {
		addToLog(`doesn't have enough tokens to buy ${upgrade.name}. (Need ${upgrade.cost})`, hero.id);
		return;
	}
	
	const isCarUpgrade = upgrade.id.startsWith('CAR_');
	const targetType = isCarUpgrade ? 'car' : 'building';
	// For car upgrades, only show cars owned by the hero. For building upgrades, show all player buildings.
	const ownedAssets = isCarUpgrade
		? gameState.city.cars.filter(c => c.ownerId === heroId)
		: gameState.city.buildings.filter(b => b.owner === 'player');
	
	if (ownedAssets.length === 0) {
		addToLog(`has no available ${targetType}s to upgrade.`, hero.id);
		return;
	}
	
	const validIds = ownedAssets.map(a => a.id).join(', ');
	const targetIdStr = prompt(`Enter the ID of the ${targetType} to apply "${upgrade.name}" to.\nYour valid ${targetType} IDs: ${validIds}`);
	if (!targetIdStr) {
		addToLog('Upgrade purchase cancelled.', hero.id);
		return;
	}
	
	const targetId = isCarUpgrade ? targetIdStr : parseInt(targetIdStr, 10);
	const targetAsset = ownedAssets.find(a => a.id === targetId);
	
	if (!targetAsset) {
		addToLog(`Invalid ID. No valid ${targetType} with ID #${targetId} found for ${hero.name}.`, hero.id);
		return;
	}
	
	if (targetAsset.upgrades.includes(upgradeId)) {
		addToLog(`${targetAsset.name || `${targetType} #${targetId}`} already has the ${upgrade.name} upgrade.`, hero.id);
		return;
	}
	
	hero.tokens -= upgrade.cost;
	
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
	
	addToLog(`purchased ${upgrade.name} for ${targetAsset.name || `${targetType} #${targetId}`} for ${upgrade.cost} tokens!`, hero.id);
}

/**
 * Handles a hero buying a car, making them the sole owner and occupant.
 * @param {number} heroId - The ID of the hero buying the car.
 * @param {string} carId - The ID of the car to buy.
 */
export function handleBuyCar (heroId, carId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const carData = gameData.cars.find(c => c.id === carId);
	const carState = gameState.city.cars.find(c => c.id === carId);
	
	if (!hero || !carData || !carState) {
		addToLog('Shop Error: Hero or car not found for purchase.');
		return;
	}
	
	// Check if the hero already owns a car.
	const alreadyOwnsCar = gameState.city.cars.some(c => c.ownerId === heroId);
	if (alreadyOwnsCar) {
		addToLog(`already owns a car and cannot buy another.`, hero.id);
		return;
	}
	
	if (carState.ownerId) {
		addToLog(`${carData.name} is already owned.`);
		return;
	}
	
	if (hero.tokens < carData.price) {
		addToLog(`cannot afford the ${carData.name}. (Needs ${carData.price} Tokens)`, hero.id);
		return;
	}
	
	// Process transaction
	hero.tokens -= carData.price;
	carState.ownerId = hero.id;
	hero.carId = carState.id;
	
	addToLog(`purchased the ${carData.name} for ${carData.price} tokens and is now the driver!`, hero.id);
}
