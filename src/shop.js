import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';
import { autoEquipBestGear } from './heroes.js';
import { handleBuyBuilding } from './buildings.js';
import { initiateCarPurchase } from './cars.js';

/**
 * Helper to get the correct image URL from the new card_images structure.
 * @param {object} entity - The entity containing card_images or a fallback image.
 * @returns {string} The formatted image URL.
 */
function getImageUrl(entity) {
	if (entity && entity.card_images && Array.isArray(entity.card_images)) {
		const normalImage = entity.card_images.find(img => img.state === 'normal') || entity.card_images[0];
		if (normalImage) {
			let folderPath = normalImage.image_folder.replace(/^public/, '');
			if (!folderPath.startsWith('/')) {
				folderPath = '/' + folderPath;
			}
			return `${folderPath}/thumbnails/${normalImage.image_file_name}`;
		}
	}
	return entity?.image || '';
}

/**
 * Calculates the total price of a skill based on its required cards.
 * @param {object} skill - The skill object.
 * @returns {number} The calculated price.
 */
function getSkillPrice(skill) {
	if (!skill.cards_needed || !Array.isArray(skill.cards_needed)) return 0;
	return skill.cards_needed.reduce((total, cardName) => {
		const card = gameData.cards.find(c => c.name === cardName);
		return total + (card ? (card.price || 0) : 0);
	}, 0);
}

/**
 * Finds an entity (item or card) by its ID from the game data.
 * @param {string} id - The ID of the entity to find.
 * @returns {object|null} The found entity or null.
 */
function findEntityById (id) {
	if (!id) return null;
	let entity = gameData.items.find(i => i.id === id);
	if (!entity) entity = gameData.cards.find(c => c.card_id === id);
	return entity;
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
	
	const buyCardBtn = e.target.closest('[data-buy-card-id]');
	if (buyCardBtn) {
		const heroId = parseInt(buyCardBtn.dataset.heroId, 10);
		const cardId = buyCardBtn.dataset.buyCardId;
		handleBuyCard(heroId, cardId);
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
	const itemData = findEntityById(itemId);
	
	if (!hero || !itemData) {
		addToLog('Shop Error: Hero or item not found.');
		return;
	}
	
	const price = itemData.price || 0;
	if (hero.tokens < price) {
		addToLog(`does not have enough tokens to buy ${itemData.name}.`, hero.id);
		return;
	}
	
	// Process transaction
	hero.tokens -= price;
	// MODIFIED: Purchase a full stack of items if stackSize is defined.
	const qtyToAdd = itemData.stackSize || 1;
	hero.inventory[itemId] = (hero.inventory[itemId] || 0) + qtyToAdd;
	
	addToLog(`bought ${itemData.name} for ${price} tokens.`, hero.id);
	
	// If the bought item was equippable, run auto-equip logic
	if (itemData.equipSlot) {
		autoEquipBestGear(hero);
	}
}

/**
 * Handles a hero buying a card from the System Shop.
 * @param {number} heroId - The ID of the hero buying the card.
 * @param {string} cardId - The ID of the card to buy.
 */
export function handleBuyCard (heroId, cardId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const cardData = gameData.cards.find(c => c.card_id === cardId);
	
	if (!hero || !cardData) {
		addToLog('Shop Error: Hero or card not found.');
		return;
	}
	
	const price = cardData.price || 0;
	if (hero.tokens < price) {
		addToLog(`does not have enough tokens to buy ${cardData.name}.`, hero.id);
		return;
	}
	
	// Process transaction
	hero.tokens -= price;
	hero.inventory[cardId] = (hero.inventory[cardId] || 0) + 1;
	
	addToLog(`bought ${cardData.name} for ${price} tokens.`, hero.id);
}

/**
 * Handles a hero buying a skill from the System Shop.
 * @param {number} heroId - The ID of the hero buying the skill.
 * @param {string} skillId - The ID of the skill to buy.
 */
export function handleBuySkill (heroId, skillId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skillData = gameData.skills.find(s => s.id === skillId);
	
	if (!hero || !skillData) {
		addToLog('Shop Error: Hero or skill not found.');
		return;
	}
	
	const price = getSkillPrice(skillData);
	if (hero.tokens < price) {
		addToLog(`does not have enough tokens to learn ${skillData.name}.`, hero.id);
		return;
	}
	
	if (hero.skills.some(s => s.id === skillId)) {
		addToLog(`already knows ${skillData.name}.`, hero.id);
		return;
	}
	
	// Process transaction
	hero.tokens -= price;
	hero.skills.push({ id: skillId });
	
	addToLog(`learned ${skillData.name} for ${price} tokens.`, hero.id);
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
	
	const sellPrice = itemData.sellPrice || Math.floor((itemData.price || 0) / 2);
	
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
	const cost = upgrade.price || upgrade.cost || 0;
	
	// Case 1: A building is buying an upgrade for itself.
	if (buildingId) {
		const building = gameState.city.buildings.find(b => b.id === buildingId);
		if (!building) {
			addToLog(`Shop Error: Building #${buildingId} not found.`);
			return;
		}
		
		if (gameState.city.tokens < cost) {
			addToLog(`The city doesn't have enough tokens to buy ${upgrade.name} for ${building.name}. (Need ${cost})`, null);
			return;
		}
		
		if (building.upgrades.includes(upgradeId)) {
			addToLog(`${building.name} already has the ${upgrade.name} upgrade.`, null);
			return;
		}
		
		// Process transaction
		gameState.city.tokens -= cost;
		building.upgrades.push(upgradeId);
		
		// Apply one-time effects
		const { effect } = upgrade;
		if (effect) {
			if (effect.type === 'add_shield') {
				building.maxShieldHp = (building.maxShieldHp || 0) + effect.value;
				building.shieldHp = (building.shieldHp || 0) + effect.value;
				if (!gameState.city.firstShieldInstalled) {
					gameState.city.firstShieldInstalled = true;
					const aegisHero = gameState.heroes.find(h => h.class === 'Aegis');
					if (aegisHero) {
						const oldName = building.name;
						building.name = `${aegisHero.name}'s Bastion`;
						addToLog(`As the first shielded safezone, ${oldName} has been renamed to ${building.name}!`, null);
					}
				}
			} else if (effect.type === 'increase_max_hp') {
				building.maxHp += effect.value;
				building.hp += effect.value;
			}
		}
		addToLog(`${building.name} purchased the ${upgrade.name} upgrade for ${cost} tokens! (Paid by city)`, null);
		return;
	}
	
	// Case 2: A hero is buying a car upgrade.
	if (heroId) {
		const hero = gameState.heroes.find(h => h.id === heroId);
		if (!hero) {
			addToLog(`Shop Error: Hero #${heroId} not found.`);
			return;
		}
		
		if (hero.tokens < cost) {
			addToLog(`doesn't have enough tokens to buy ${upgrade.name}. (Need ${cost})`, hero.id);
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
			
			hero.tokens -= cost;
			targetAsset.upgrades.push(upgradeId);
			addToLog(`purchased ${upgrade.name} for ${targetAsset.name} for ${cost} tokens!`, hero.id);
		} else {
			addToLog('Heroes can no longer purchase building upgrades directly. The building must purchase it with its own tokens.', hero.id);
		}
	}
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
	const cardsContent = getEl('shop-modal-cards-content');
	const martialSkillsContent = getEl('shop-modal-martial-skills-content');
	const magicSkillsContent = getEl('shop-modal-magic-skills-content');
	const inventoryContent = getEl('shop-modal-inventory-content');
	const buildingUpgradesContent = getEl('shop-modal-building-upgrades-content');
	const carUpgradesContent = getEl('shop-modal-car-upgrades-content');
	
	if (!header || !itemsContent || !cardsContent || !martialSkillsContent || !magicSkillsContent || !inventoryContent || !buildingUpgradesContent || !carUpgradesContent) return;
	
	// 1. Update Header
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
		el.style.display = groups.includes(activeGroup) ? '' : 'none';
	});
	
	// 3. Set Default Tab
	const tabInput = getEl(`shop-tab-${defaultTab}`);
	if (tabInput && tabInput.style.display !== 'none') {
		tabInput.checked = true;
	} else {
		const firstVisibleTab = modal.querySelector('input[role="tab"]:not([style*="display: none"])');
		if (firstVisibleTab) firstVisibleTab.checked = true;
	}
	
	// 4. Render Content
	if (isBuildingContext) {
		const building = contextEntity;
		buildingUpgradesContent.innerHTML = gameData.building_upgrades.map(upgrade => {
			const cost = upgrade.price || upgrade.cost || 0;
			const canAfford = gameState.city.tokens >= cost;
			const hasUpgrade = building.upgrades.includes(upgrade.id);
			return `
				<div class="bg-base-300/50 rounded p-2 flex flex-col gap-1">
					<div class="flex justify-between items-center gap-2">
						<span class="font-bold text-sm truncate" title="${upgrade.name}">${upgrade.name}</span>
						<span class="badge badge-warning flex-shrink-0">${cost} T</span>
					</div>
					<p class="text-xs mt-1 flex-grow">${upgrade.description || ''}</p>
					<button class="btn btn-sm btn-accent w-full mt-1" data-buy-upgrade-id="${upgrade.id}" data-building-id="${building.id}" ${!canAfford || hasUpgrade ? 'disabled' : ''}>
						${hasUpgrade ? 'Installed' : 'Buy & Install'}
					</button>
				</div>
			`;
		}).join('') || '<p class="text-xs italic text-center text-gray-500 col-span-full">No building upgrades for sale.</p>';
	} else {
		const hero = contextEntity;
		
		// Items
		itemsContent.innerHTML = gameData.items.map(entity => {
			let canUse = true;
			// Armor type check
			if (entity.type === 'Armor' && entity.armorType && !hero.allowedArmorTypes.includes(entity.armorType)) canUse = false;
			
			// MODIFIED: New logic for weapon purchasing
			if ((entity.type === 'Weapon' || entity.type === 'Shield')) {
				const requiredType = entity.requiredWeaponType;
				if (requiredType) {
					// Check if the hero can learn any skill that uses this weapon type.
					const canLearnSkillForWeapon = gameData.skills.some(skill =>
						skill.requiredWeaponType === requiredType && hero.skillClasses.includes(skill.skillClass)
					);
					if (!canLearnSkillForWeapon) canUse = false;
				}
			}
			
			// Magic user check
			if (entity.magicUserOnly && !hero.isMagicUser) canUse = false;
			if (!canUse) return '';
			
			let details = '';
			if (entity.damageMitigation) details = `Mitigation: ${entity.damageMitigation}`;
			else if (entity.damage) details = `Damage: ${entity.damage}`;
			else if (entity.spellPower) details = `Spell Power: x${entity.spellPower}`;
			else if (entity.effect) details = `Effect: ${entity.effect.type === 'heal_hp' ? `+${entity.effect.value} HP` : `+${entity.effect.value} MP`}`;
			
			const price = entity.price || 0;
			const canAfford = hero.tokens >= price;
			const imageUrl = getImageUrl(entity);
			
			return `
				<div class="bg-base-300/50 rounded p-2 flex gap-2">
					<div class="flex-shrink-0"><img src="${imageUrl}" alt="${entity.name}" class="w-[100px] aspect-[3/4] bg-base-300 rounded flex-shrink-0" /></div>
					<div class="flex-grow flex flex-col justify-between gap-1 min-w-0">
						<div>
							<div class="flex justify-between items-center gap-2">
								<span class="font-bold text-sm truncate" title="${entity.name}">${entity.name}</span>
								<span class="badge badge-warning flex-shrink-0">${price} T</span>
							</div>
							<div class="text-[10px] text-gray-400 italic">${details}</div>
							<p class="text-xs mt-1">${entity.description || ''}</p>
						</div>
						<button class="btn btn-sm btn-accent w-full mt-1" data-buy-item-id="${entity.id}" data-hero-id="${hero.id}" ${!canAfford ? 'disabled' : ''}>Buy</button>
					</div>
				</div>
			`;
		}).join('') || '<p class="text-xs italic text-center text-gray-500 col-span-full">No items for sale.</p>';
		
		// Cards
		cardsContent.innerHTML = gameData.cards.map(card => {
			const price = card.price || 0;
			const canAfford = hero.tokens >= price;
			const imageUrl = getImageUrl(card);
			return `
				<div class="bg-base-300/50 rounded p-2 flex gap-2">
					<div class="flex-shrink-0"><img src="${imageUrl}" alt="${card.name}" class="w-[100px] aspect-[3/4] bg-base-300 rounded flex-shrink-0" /></div>
					<div class="flex-grow flex flex-col justify-between gap-1 min-w-0">
						<div>
							<div class="flex justify-between items-center gap-2">
								<span class="font-bold text-sm truncate" title="${card.name}">${card.name}</span>
								<span class="badge badge-warning flex-shrink-0">${price} T</span>
							</div>
							<div class="text-[10px] text-gray-400 italic">Tier ${card.cardTier}</div>
							<p class="text-xs mt-1">${card.description || ''}</p>
						</div>
						<button class="btn btn-sm btn-accent w-full mt-1" data-buy-card-id="${card.card_id}" data-hero-id="${hero.id}" ${!canAfford ? 'disabled' : ''}>Buy</button>
					</div>
				</div>
			`;
		}).join('') || '<p class="text-xs italic text-center text-gray-500 col-span-full">No cards for sale.</p>';
		
		// Skills Helper
		const renderSkillList = (skillList) => skillList.map(skill => {
			// MODIFIED: Show skill if its class is in the hero's allowed skillClasses
			if (!hero.skillClasses.includes(skill.skillClass)) return '';
			
			const price = getSkillPrice(skill);
			const canAfford = hero.tokens >= price;
			const hasSkill = hero.skills.some(s => s.id === skill.id);
			const imageUrl = getImageUrl(skill);
			const details = `Req: Lvl ${skill.levelRequirement} | Cost: ${skill.mpCost || skill.rageCost || skill.staminaCost || 0} ${skill.rageCost ? 'Rage' : (skill.staminaCost ? 'Stam' : 'MP')}`;
			
			return `
				<div class="bg-base-300/50 rounded p-2 flex gap-2">
					<div class="flex-shrink-0"><img src="${imageUrl}" alt="${skill.name}" class="w-[100px] aspect-[3/4] bg-base-300 rounded flex-shrink-0" /></div>
					<div class="flex-grow flex flex-col justify-between gap-1 min-w-0">
						<div>
							<div class="flex justify-between items-center gap-2">
								<span class="font-bold text-sm truncate" title="${skill.name}">${skill.name}</span>
								<span class="badge badge-warning flex-shrink-0">${price} T</span>
							</div>
							<div class="text-[10px] text-gray-400 italic">${details}</div>
							<p class="text-xs mt-1">${skill.description || ''}</p>
						</div>
						<button class="btn btn-sm btn-accent w-full mt-1" data-buy-skill-id="${skill.id}" data-hero-id="${hero.id}" ${!canAfford || hasSkill ? 'disabled' : ''}>${hasSkill ? 'Learned' : 'Buy'}</button>
					</div>
				</div>
			`;
		}).join('');
		
		martialSkillsContent.innerHTML = renderSkillList(gameData.martial_skills) || '<p class="text-xs italic text-center text-gray-500 col-span-full">No martial skills for sale.</p>';
		magicSkillsContent.innerHTML = renderSkillList(gameData.magic_skills) || '<p class="text-xs italic text-center text-gray-500 col-span-full">No magic skills for sale.</p>';
		
		buildingUpgradesContent.innerHTML = '<p class="text-xs italic text-center text-gray-500 col-span-full p-4">Building upgrades must be purchased by the building itself from the Buildings tab.</p>';
		
		carUpgradesContent.innerHTML = gameData.car_upgrades.map(upgrade => {
			const cost = upgrade.price || upgrade.cost || 0;
			const canAfford = hero.tokens >= cost;
			const imageUrl = getImageUrl(upgrade);
			return `
				<div class="bg-base-300/50 rounded p-2 flex gap-2">
					<div class="flex-shrink-0"><img src="${imageUrl}" alt="${upgrade.name}" class="w-[100px] aspect-[3/4] bg-base-300 rounded flex-shrink-0" /></div>
					<div class="flex-grow flex flex-col justify-between gap-1 min-w-0">
						<div class="flex justify-between items-center gap-2">
							<span class="font-bold text-sm truncate" title="${upgrade.name}">${upgrade.name}</span>
							<span class="badge badge-warning flex-shrink-0">${cost} T</span>
						</div>
						<p class="text-xs mt-1 flex-grow">${upgrade.description || ''}</p>
						<button class="btn btn-sm btn-accent w-full mt-1" data-buy-upgrade-id="${upgrade.id}" data-hero-id="${hero.id}" ${!canAfford ? 'disabled' : ''}>Buy & Apply</button>
					</div>
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
				const sellPrice = entity.sellPrice || Math.floor((entity.price || 0) / 2);
				const imageUrl = getImageUrl(entity);
				
				return `
					<div class="bg-base-300/50 rounded p-2 flex gap-2">
						<div class="relative w-[100px] aspect-[3/4] flex-shrink-0">
							<img src="${imageUrl}" alt="${entity.name}" class="w-full h-full object-contain bg-base-100 rounded" />
							<span class="absolute bottom-0 right-0 bg-black bg-opacity-60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-tl-md">${totalQty}</span>
							${isAnyEquipped ? '<span class="absolute top-1 left-1 badge badge-primary badge-xs" title="Equipped">E</span>' : ''}
						</div>
						<div class="flex-grow flex flex-col justify-between gap-1 min-w-0">
							<div>
								<div class="flex justify-between items-center gap-2">
									<span class="font-bold text-sm truncate" title="${entity.name}">${entity.name}</span>
									<span class="badge badge-warning flex-shrink-0">${sellPrice} T</span>
								</div>
								<div class="text-[10px] text-gray-400 italic">${entity.type || 'Card'} - Lvl ${entity.level || entity.cardTier || 1}</div>
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
