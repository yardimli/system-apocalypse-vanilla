import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';
import { autoEquipBestGear } from './heroes.js';
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
 * Centralized handler for all shop and major purchase-related click events.
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
			renderShopModal({ heroId });
		}
		return true; // Handled, re-render needed
	}
	
	const buyItemBtn = e.target.closest('[data-buy-item-id]');
	if (buyItemBtn) {
		const heroId = parseInt(buyItemBtn.dataset.heroId, 10);
		const itemId = buyItemBtn.dataset.buyItemId;
		handleBuyItem(heroId, itemId);
		renderShopModal({ heroId });
		return true; // Handled, re-render needed
	}
	
	const buySkillBtn = e.target.closest('[data-buy-skill-id]');
	if (buySkillBtn) {
		const heroId = parseInt(buySkillBtn.dataset.heroId, 10);
		const skillId = buySkillBtn.dataset.buySkillId;
		handleBuySkill(heroId, skillId);
		renderShopModal({ heroId });
		return true; // Handled, re-render needed
	}
	
	const buyUpgradeBtn = e.target.closest('[data-buy-upgrade-id]');
	if (buyUpgradeBtn) {
		const upgradeId = buyUpgradeBtn.dataset.buyUpgradeId;
		// MODIFIED: Check if the purchase is for a hero or a building
		const heroId = buyUpgradeBtn.dataset.heroId ? parseInt(buyUpgradeBtn.dataset.heroId, 10) : null;
		const buildingId = buyUpgradeBtn.dataset.buildingId ? parseInt(buyUpgradeBtn.dataset.buildingId, 10) : null;
		
		if (buildingId) {
			handleBuyUpgrade({ buildingId, upgradeId });
			renderShopModal({ buildingId, defaultTab: 'building-upgrades' }); // Re-render shop for building
		} else if (heroId) {
			handleBuyUpgrade({ heroId, upgradeId });
			renderShopModal({ heroId }); // Re-render shop for hero
		}
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
 * Handles buying an upgrade for a car or building.
 * Can be initiated by a hero (for their car) or by a building (for itself).
 * @param {object} options - The purchase options.
 * @param {number} [options.heroId] - The ID of the hero buying the upgrade.
 * @param {number} [options.buildingId] - The ID of the building buying the upgrade for itself.
 * @param {string} options.upgradeId - The ID of the upgrade to buy.
 */
export function handleBuyUpgrade ({ heroId, buildingId, upgradeId }) {
	const upgrade = gameData.building_upgrades.find(u => u.id === upgradeId) || gameData.car_upgrades.find(u => u.id === upgradeId);
	if (!upgrade) {
		addToLog(`Shop Error: Upgrade with ID ${upgradeId} not found.`);
		return;
	}
	
	const isCarUpgrade = upgrade.id.startsWith('CAR_');
	
	// Case 1: A building is buying an upgrade for itself.
	if (buildingId) {
		const building = gameState.city.buildings.find(b => b.id === buildingId);
		if (!building) {
			addToLog(`Shop Error: Building #${buildingId} not found.`);
			return;
		}
		
		if (gameState.city.tokens < upgrade.cost) {
			addToLog(`The city doesn't have enough tokens to buy ${upgrade.name} for ${building.name}. (Need ${upgrade.cost})`, null);
			return;
		}
		
		if (building.upgrades.includes(upgradeId)) {
			addToLog(`${building.name} already has the ${upgrade.name} upgrade.`, null);
			return;
		}
		
		// Process transaction
		gameState.city.tokens -= upgrade.cost;
		building.upgrades.push(upgradeId);
		
		// Apply one-time effects
		const { effect } = upgrade;
		if (effect) {
			if (effect.type === 'add_shield') {
				building.maxShieldHp = (building.maxShieldHp || 0) + effect.value;
				building.shieldHp = (building.shieldHp || 0) + effect.value;
				// NEW: Logic to rename the first building that gets a shield.
				if (!gameState.city.firstShieldInstalled) {
					gameState.city.firstShieldInstalled = true;
					const aegisHero = gameState.heroes.find(h => h.class === 'Aegis');
					if (aegisHero) {
						const oldName = building.name;
						building.name = `${aegisHero.name}'s Bastion`;
						addToLog(`As the first shielded safezone, ${oldName} has been renamed to ${building.name}!`, null);
					}
				}
				// END NEW
			} else if (effect.type === 'increase_max_hp') {
				building.maxHp += effect.value;
				building.hp += effect.value;
			}
		}
		addToLog(`${building.name} purchased the ${upgrade.name} upgrade for ${upgrade.cost} tokens! (Paid by city)`, null);
		return;
	}
	
	// Case 2: A hero is buying a car upgrade.
	if (heroId) {
		const hero = gameState.heroes.find(h => h.id === heroId);
		if (!hero) {
			addToLog(`Shop Error: Hero #${heroId} not found.`);
			return;
		}
		
		if (hero.tokens < upgrade.cost) {
			addToLog(`doesn't have enough tokens to buy ${upgrade.name}. (Need ${upgrade.cost})`, hero.id);
			return;
		}
		
		if (isCarUpgrade) {
			const ownedAssets = gameState.city.cars.filter(c => c.ownerId === heroId);
			if (ownedAssets.length === 0) {
				addToLog(`has no available cars to upgrade.`, hero.id);
				return;
			}
			
			const validIds = ownedAssets.map(a => a.id).join(', ');
			const targetIdStr = prompt(`Enter the ID of the car to apply "${upgrade.name}" to.\nYour valid car IDs: ${validIds}`);
			if (!targetIdStr) {
				addToLog('Upgrade purchase cancelled.', hero.id);
				return;
			}
			
			const targetAsset = ownedAssets.find(a => a.id === targetIdStr);
			if (!targetAsset) {
				addToLog(`Invalid ID. No valid car with ID #${targetIdStr} found for ${hero.name}.`, hero.id);
				return;
			}
			
			if (targetAsset.upgrades.includes(upgradeId)) {
				addToLog(`${targetAsset.name} already has the ${upgrade.name} upgrade.`, hero.id);
				return;
			}
			
			hero.tokens -= upgrade.cost;
			targetAsset.upgrades.push(upgradeId);
			addToLog(`purchased ${upgrade.name} for ${targetAsset.name} for ${upgrade.cost} tokens!`, hero.id);
		} else {
			addToLog('Heroes can no longer purchase building upgrades directly. The building must purchase it with its own tokens.', hero.id);
		}
	}
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

/**
 * Renders the System Shop modal for either a hero or a building.
 * @param {object} options - The options for rendering the modal.
 * @param {number} [options.heroId] - The ID of the hero to open the shop for.
 * @param {number} [options.buildingId] - The ID of the building to open the shop for.
 * @param {string} [options.defaultTab] - The ID of the tab to open by default (e.g., 'items', 'building-upgrades').
 */
export function renderShopModal ({ heroId, buildingId, defaultTab = 'items' }) {
	const modal = getEl('system-shop-modal');
	if (!modal) return;
	
	const isBuildingContext = !!buildingId;
	const contextEntity = isBuildingContext
		? gameState.city.buildings.find(b => b.id === buildingId)
		: gameState.heroes.find(h => h.id === heroId);
	
	if (!contextEntity) return;
	
	const header = getEl('shop-modal-header');
	const itemsContent = getEl('shop-modal-items-content');
	const skillsContent = getEl('shop-modal-skills-content');
	const inventoryContent = getEl('shop-modal-inventory-content');
	const buildingUpgradesContent = getEl('shop-modal-building-upgrades-content');
	const carUpgradesContent = getEl('shop-modal-car-upgrades-content');
	
	if (!header || !itemsContent || !skillsContent || !inventoryContent || !buildingUpgradesContent || !carUpgradesContent) return;
	
	// 1. Update Header
	// MODIFIED: Show city tokens for building context, hero tokens for hero context.
	const tokensToShow = isBuildingContext ? gameState.city.tokens : contextEntity.tokens;
	header.innerHTML = `
        <div class="flex justify-between items-center">
            <h3 class="font-bold text-lg">System Shop (${contextEntity.name})</h3>
            <span class="badge badge-warning">Tokens: ${Math.floor(tokensToShow)}</span>
        </div>
    `;
	
	// 2. Manage Tab Visibility
	const activeGroup = isBuildingContext ? 'building' : 'hero';
	modal.querySelectorAll('[data-tab-group]').forEach(el => {
		const groups = el.dataset.tabGroup.split(' ');
		// A tab/panel is visible if its group list includes the active group
		el.style.display = groups.includes(activeGroup) ? '' : 'none';
	});
	
	// 3. Set Default Tab
	const tabInput = getEl(`shop-tab-${defaultTab}`);
	if (tabInput && tabInput.style.display !== 'none') {
		tabInput.checked = true;
	} else {
		// Fallback to the first visible tab if default is hidden or invalid
		const firstVisibleTab = modal.querySelector('input[role="tab"]:not([style*="display: none"])');
		if (firstVisibleTab) firstVisibleTab.checked = true;
	}
	
	// 4. Render Content
	if (isBuildingContext) {
		const building = contextEntity;
		// Building context: only render building upgrades
		buildingUpgradesContent.innerHTML = gameData.building_upgrades.map(upgrade => {
			// MODIFIED: Check against city's token balance.
			const canAfford = gameState.city.tokens >= upgrade.cost;
			const hasUpgrade = building.upgrades.includes(upgrade.id);
			return `
				<div class="bg-base-300/50 rounded p-2 flex flex-col gap-1">
					<div class="flex justify-between items-center gap-2">
						<span class="font-bold text-sm truncate" title="${upgrade.name}">${upgrade.name}</span>
						<span class="badge badge-warning flex-shrink-0">${upgrade.cost} T</span>
					</div>
					<p class="text-xs mt-1 flex-grow">${upgrade.description || ''}</p>
					<button class="btn btn-sm btn-accent w-full mt-1" data-buy-upgrade-id="${upgrade.id}" data-building-id="${building.id}" ${!canAfford || hasUpgrade ? 'disabled' : ''}>
						${hasUpgrade ? 'Installed' : 'Buy & Install'}
					</button>
				</div>
			`;
		}).join('') || '<p class="text-xs italic text-center text-gray-500 col-span-full">No building upgrades for sale.</p>';
	} else {
		// Hero context: render all hero-related tabs
		const hero = contextEntity;
		
		const shopItems = gameData.system_shop.filter(si => si.itemId);
		itemsContent.innerHTML = shopItems.map(shopItem => {
			const entity = findEntityById(shopItem.itemId);
			if (!entity) return '';
			
			let canUse = true;
			if (entity.type === 'Armor' && entity.armorType && !hero.allowedArmorTypes.includes(entity.armorType)) canUse = false;
			if ((entity.type === 'Weapon' || entity.type === 'Shield') && entity.weaponType && !hero.allowedWeaponTypes.includes(entity.weaponType)) canUse = false;
			if (entity.magicUserOnly && !hero.isMagicUser) canUse = false;
			if (entity.type === 'Consumable' && entity.class && !entity.class.includes(hero.class)) canUse = false;
			if (!canUse) return '';
			
			let details = '';
			if (entity.damageMitigation) details = `Mitigation: ${entity.damageMitigation}`;
			else if (entity.damage) details = `Damage: ${entity.damage}`;
			else if (entity.spellPower) details = `Spell Power: x${entity.spellPower}`;
			else if (entity.effect) details = `Effect: ${entity.effect.type === 'heal_hp' ? `+${entity.effect.value} HP` : `+${entity.effect.value} MP`}`;
			
			const canAfford = hero.tokens >= shopItem.price;
			
			return `
				<div class="bg-base-300/50 rounded p-2 flex gap-2">
					<div class="flex-shrink-0"><img src="${entity.image}" alt="${entity.name}" class="w-[50px] h-[50px] object-contain bg-base-100 rounded" /></div>
					<div class="flex-grow flex flex-col justify-between gap-1 min-w-0">
						<div>
							<div class="flex justify-between items-center gap-2">
								<span class="font-bold text-sm truncate" title="${entity.name}">${entity.name}</span>
								<span class="badge badge-warning flex-shrink-0">${shopItem.price} T</span>
							</div>
							<div class="text-[10px] text-gray-400 italic">${details}</div>
							<p class="text-xs mt-1">${entity.description || ''}</p>
						</div>
						<button class="btn btn-sm btn-accent w-full mt-1" data-buy-item-id="${entity.id}" data-hero-id="${hero.id}" ${!canAfford ? 'disabled' : ''}>Buy</button>
					</div>
				</div>
			`;
		}).join('') || '<p class="text-xs italic text-center text-gray-500 col-span-full">No items for sale.</p>';
		
		const shopSkills = gameData.system_shop.filter(si => si.skillId);
		skillsContent.innerHTML = shopSkills.map(shopItem => {
			const entity = gameData.skills.find(s => s.id === shopItem.skillId);
			if (!entity || (entity.class && entity.class !== hero.class)) return '';
			
			const details = `Req: Lvl ${entity.levelRequirement} | Cost: ${entity.mpCost || entity.rageCost || 0} ${entity.rageCost ? 'Rage' : 'MP'}`;
			const canAfford = hero.tokens >= shopItem.price;
			const hasSkill = hero.skills.some(s => s.id === shopItem.skillId);
			
			return `
				<div class="bg-base-300/50 rounded p-2 flex gap-2">
					<div class="w-[50px] h-[50px] flex-shrink-0 flex items-center justify-center bg-base-100 rounded"><span class="text-2xl">📜</span></div>
					<div class="flex-grow flex flex-col justify-between gap-1 min-w-0">
						<div>
							<div class="flex justify-between items-center gap-2">
								<span class="font-bold text-sm truncate" title="${entity.name}">${entity.name}</span>
								<span class="badge badge-warning flex-shrink-0">${shopItem.price} T</span>
							</div>
							<div class="text-[10px] text-gray-400 italic">${details}</div>
							<p class="text-xs mt-1">${entity.description || ''}</p>
						</div>
						<button class="btn btn-sm btn-accent w-full mt-1" data-buy-skill-id="${entity.id}" data-hero-id="${hero.id}" ${!canAfford || hasSkill ? 'disabled' : ''}>${hasSkill ? 'Learned' : 'Buy'}</button>
					</div>
				</div>
			`;
		}).join('') || '<p class="text-xs italic text-center text-gray-500 col-span-full">No skills for sale.</p>';
		
		buildingUpgradesContent.innerHTML = '<p class="text-xs italic text-center text-gray-500 col-span-full p-4">Building upgrades must be purchased by the building itself from the Buildings tab.</p>';
		
		carUpgradesContent.innerHTML = gameData.car_upgrades.map(upgrade => {
			const canAfford = hero.tokens >= upgrade.cost;
			return `
				<div class="bg-base-300/50 rounded p-2 flex flex-col gap-1">
					<div class="flex justify-between items-center gap-2">
						<span class="font-bold text-sm truncate" title="${upgrade.name}">${upgrade.name}</span>
						<span class="badge badge-warning flex-shrink-0">${upgrade.cost} T</span>
					</div>
					<p class="text-xs mt-1 flex-grow">${upgrade.description || ''}</p>
					<button class="btn btn-sm btn-accent w-full mt-1" data-buy-upgrade-id="${upgrade.id}" data-hero-id="${hero.id}" ${!canAfford ? 'disabled' : ''}>Buy & Apply</button>
				</div>
			`;
		}).join('') || '<p class="text-xs italic text-center text-gray-500 col-span-full">No car upgrades for sale.</p>';
		
		const inventoryItems = Object.entries(hero.inventory);
		if (inventoryItems.length > 0) {
			inventoryContent.innerHTML = inventoryItems.map(([itemId, totalQty]) => {
				if (totalQty <= 0) return '';
				const entity = findEntityById(itemId);
				if (!entity) return '';
				
				const equippedCount = Object.values(hero.equipment).filter(eqId => eqId === itemId).length;
				const canSell = totalQty > equippedCount;
				const isAnyEquipped = equippedCount > 0;
				
				return `
					<div class="bg-base-300/50 rounded p-2 flex gap-2">
						<div class="relative w-[50px] h-[50px] flex-shrink-0">
							<img src="${entity.image}" alt="${entity.name}" class="w-full h-full object-contain bg-base-100 rounded" />
							<span class="absolute bottom-0 right-0 bg-black bg-opacity-60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-tl-md">${totalQty}</span>
							${isAnyEquipped ? '<span class="absolute top-1 left-1 badge badge-primary badge-xs" title="Equipped">E</span>' : ''}
						</div>
						<div class="flex-grow flex flex-col justify-between gap-1 min-w-0">
							<div>
								<div class="flex justify-between items-center gap-2">
									<span class="font-bold text-sm truncate" title="${entity.name}">${entity.name}</span>
									<span class="badge badge-warning flex-shrink-0">${entity.sellPrice} T</span>
								</div>
								<div class="text-[10px] text-gray-400 italic">${entity.type} - Lvl ${entity.level}</div>
							</div>
							<div>
								<button class="btn btn-sm btn-error w-full mt-1" data-sell-item-id="${itemId}" data-hero-id="${hero.id}" ${!canSell ? 'disabled' : ''}>Sell</button>
								${!canSell && isAnyEquipped ? '<p class="text-xs text-center text-error mt-1">Cannot sell last equipped item.</p>' : ''}
							</div>
						</div>
					</div>
				`;
			}).join('');
		} else {
			inventoryContent.innerHTML = '<p class="text-xs italic text-center text-gray-500 col-span-full">Inventory is empty.</p>';
		}
	}
	
	modal.showModal();
}
