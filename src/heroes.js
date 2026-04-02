import { gameState, gameData } from './state.js';
// Modified: Import new helper functions from utils.js
import { addToLog, updateTextIfChanged, updateHtmlIfChanged, updateProgressIfChanged } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

// Removed local definitions of updateTextIfChanged, updateHtmlIfChanged, and updateProgressIfChanged

/**
 * Automatically finds and equips the best gear a hero has in their inventory for each slot.
 * Best is determined by the item's level.
 * @param {object} hero - The hero object from gameState.
 */
export function autoEquipBestGear (hero) {
	const slots = {
		mainHand: [],
		offHand: [],
		body: []
	};
	
	// 1. Categorize all owned equipment by slot
	Object.keys(hero.inventory).forEach(itemId => {
		const item = gameData.items.find(i => i.id === itemId);
		// Check if the item is equippable in a valid slot
		if (item && item.equipSlot && slots[item.equipSlot] && hero.inventory[itemId] > 0) {
			// Check if the hero's class can use the item (if a class is specified)
			if (!item.class || item.class === hero.class) {
				slots[item.equipSlot].push(item);
			}
		}
	});
	
	// 2. For each slot, find the best item and equip it if it's not already the best
	for (const slot in slots) {
		let bestItem = null;
		if (slots[slot].length > 0) {
			// Sort by level descending to find the best item
			bestItem = slots[slot].sort((a, b) => b.level - a.level)[0];
		}
		
		const bestItemId = bestItem ? bestItem.id : null;
		const currentItemId = hero.equipment[slot];
		
		// Only update and log if the equipped item changes
		if (currentItemId !== bestItemId) {
			const oldItem = gameData.items.find(i => i.id === currentItemId);
			hero.equipment[slot] = bestItemId;
			
			if (bestItem && oldItem) {
				addToLog(`${hero.name} upgraded ${slot}: ${oldItem.name} -> ${bestItem.name}.`);
			} else if (bestItem) {
				addToLog(`${hero.name} equipped ${bestItem.name} (${slot}).`);
			} else if (oldItem) {
				addToLog(`${hero.name} unequipped ${oldItem.name} (${slot}).`);
			}
		}
	}
}

/**
 * Finds an item by its ID from the game data.
 * @param {string} id - The ID of the item to find.
 * @returns {object|null} The found item or null.
 */
function findEntityById (id) {
	if (!id) return null;
	return gameData.items.find(i => i.id === id);
}

/**
 * Renders all hero cards into the main content area.
 */
export function renderHeroes () {
	const grid = getEl('heroes-grid');
	if (!grid) return;
	const template = getEl('hero-card-template');
	
	gameState.heroes.forEach(hero => {
		let card = getEl(`hero-card-${hero.id}`);
		
		if (!card) {
			const clone = template.content.cloneNode(true);
			card = clone.querySelector('.card');
			card.id = `hero-card-${hero.id}`;
			grid.appendChild(clone);
			card = getEl(`hero-card-${hero.id}`);
		}
		
		// Modified to use updateTextIfChanged
		const nameText = `${hero.name} | Lv. ${hero.level}`;
		updateTextIfChanged(card.querySelector('[data-name]'), nameText);
		
		const tokensText = `Tokens: ${hero.tokens}`;
		updateTextIfChanged(card.querySelector('[data-tokens]'), tokensText);
		
		const classEl = card.querySelector('[data-class]');
		if (classEl) {
			updateTextIfChanged(classEl, hero.class);
			const newClassName = `badge ${hero.class === 'Aegis' ? 'badge-info' : hero.class === 'Striker' ? 'badge-error' : 'badge-success'}`;
			if (classEl.className !== newClassName) {
				classEl.className = newClassName;
			}
		}
		
		const equipmentContainer = card.querySelector('[data-equipment-container]');
		const equippedItems = Object.entries(hero.equipment)
			.map(([slot, itemId]) => ({ slot, item: findEntityById(itemId) }))
			.filter(e => e.item);
		
		// Modified to use updateHtmlIfChanged based on equipment state
		let equipHtml = '';
		if (equippedItems.length > 0) {
			equipHtml = equippedItems.map(({ slot, item }) => {
				let details = '';
				if (item.damageMitigation) details = `Mit: ${item.damageMitigation}`;
				if (item.damage) details = `Dmg: ${item.damage}`;
				if (item.spellPower) details = `SP: x${item.spellPower}`;
				return `
          <div class="tooltip" data-tip="${item.name} (${details}) | Slot: ${slot}">
            <img src="${item.image}" alt="${item.name}" class="w-[50px] h-[50px] object-contain bg-base-300/50 rounded" />
          </div>
        `;
			}).join(' ');
		} else {
			equipHtml = '<span class="text-xs italic text-gray-500">Nothing Equipped</span>';
		}
		const equipStateKey = JSON.stringify(hero.equipment);
		updateHtmlIfChanged(equipmentContainer, equipHtml, equipStateKey);
		
		// Modified to use updateTextIfChanged and updateProgressIfChanged
		const xpText = `XP: ${hero.xp.current}/${hero.xp.max}`;
		updateTextIfChanged(card.querySelector('[data-xp-label]'), xpText);
		updateProgressIfChanged(card.querySelector('[data-xp-bar]'), hero.xp.current, hero.xp.max);
		
		const formatRegen = (val) => Number(val.toFixed(2));
		const hpText = `HP: ${Math.floor(hero.hp.current)}/${hero.hp.max} (+${formatRegen(hero.hpRegen)}/s)`;
		updateTextIfChanged(card.querySelector('[data-hp-label]'), hpText);
		updateProgressIfChanged(card.querySelector('[data-hp-bar]'), hero.hp.current, hero.hp.max);
		
		const mpText = `MP: ${Math.floor(hero.mp.current)}/${hero.mp.max} (+${formatRegen(hero.mpRegen)}/s)`;
		updateTextIfChanged(card.querySelector('[data-mp-label]'), mpText);
		updateProgressIfChanged(card.querySelector('[data-mp-bar]'), hero.mp.current, hero.mp.max);
		
		const dynamicArea = card.querySelector('[data-dynamic-area]');
		let dynamicHtml = '';
		let dynamicStateKey = '';
		
		// MODIFIED: Aegis no longer uses the dynamic area for skills.
		if (hero.class === 'Aegis') {
			dynamicHtml = '<p class="text-info text-center text-sm">Manage skills below.</p>';
			dynamicStateKey = 'aegis-idle';
		} else {
			if (hero.hp.current <= 0) {
				dynamicHtml = `<p class="text-error font-bold text-center">INCAPACITATED</p><p class="text-xs text-center">Awaiting Aegis Healing...</p>`;
				dynamicStateKey = 'incapacitated';
			} else if (!hero.carId) {
				dynamicHtml = `<p class="text-warning text-center text-sm">Waiting for Mana Battery Car...</p>`;
				dynamicStateKey = 'no-car';
			} else if (hero.targetMonsterId) {
				const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
				if (monster) {
					dynamicHtml = `
                    <p class="text-sm font-bold text-error mb-1">Fighting: Lv.${monster.level} ${monster.name} (#${monster.id})</p>
                    <progress class="progress progress-error w-full" value="${monster.currentHp}" max="${monster.maxHp}"></progress>
                    <p class="text-xs text-right mt-1">${Math.floor(monster.currentHp)}/${monster.maxHp} HP</p>
                `;
					dynamicStateKey = `fighting-${monster.id}-${monster.currentHp}`;
				} else {
					dynamicHtml = `<p class="text-success text-center text-sm">Patrolling in Car #${hero.carId}. No targets.</p>`;
					dynamicStateKey = `patrolling-${hero.carId}`;
				}
			} else {
				dynamicHtml = `<p class="text-success text-center text-sm">Patrolling in Car #${hero.carId}. No targets.</p>`;
				dynamicStateKey = `patrolling-${hero.carId}`;
			}
		}
		updateHtmlIfChanged(dynamicArea, dynamicHtml, dynamicStateKey);
		
		// MODIFIED: Inventory rendering logic now only shows unequipped items.
		const invContainer = card.querySelector('[data-inventory-container]');
		if (invContainer) {
			let inventoryHtml = '';
			const inventoryItems = Object.entries(hero.inventory);
			
			if (inventoryItems.length > 0) {
				inventoryItems.forEach(([itemId, totalQty]) => {
					if (totalQty <= 0) return;
					const entity = findEntityById(itemId);
					if (entity) {
						// Count how many of this item are equipped to determine unequipped quantity.
						const equippedCount = Object.values(hero.equipment).filter(eqId => eqId === itemId).length;
						const unequippedQty = totalQty - equippedCount;
						
						// Only render if there are unequipped items of this type.
						if (unequippedQty > 0) {
							const isAnyEquipped = equippedCount > 0;
							inventoryHtml += `
								<div
									class="relative w-[50px] h-[50px] bg-base-300/50 rounded flex items-center justify-center p-1 group cursor-pointer"
									data-inventory-item
									data-item-id="${itemId}"
									data-hero-id="${hero.id}"
								>
									<img src="${entity.image}" alt="${entity.name}" class="w-full h-full object-contain" />
									<span class="absolute bottom-0 right-0 bg-black bg-opacity-60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-tl-md">${unequippedQty}</span>
									${isAnyEquipped ? '<span class="absolute top-1 left-1 badge badge-primary badge-xs" title="An item of this type is equipped">E</span>' : ''}
								</div>
							`;
						}
					}
				});
			}
			
			if (inventoryHtml === '') {
				inventoryHtml = '<span class="text-xs text-gray-500 italic">Empty</span>';
			}
			
			const invStateKey = JSON.stringify(hero.inventory) + JSON.stringify(hero.equipment);
			updateHtmlIfChanged(invContainer, inventoryHtml, invStateKey);
		}
		
		// MODIFIED: Removed inline System Shop rendering
		const shopContainer = card.querySelector('[data-shop-list]');
		if (shopContainer) {
			shopContainer.innerHTML = ''; // Clear it in case old template is cached
		}
		
		const autoUseContainer = card.querySelector('[data-auto-use-container]');
		if (autoUseContainer) {
			const hpToggle = autoUseContainer.querySelector('[data-auto-use-type="hp"]');
			const mpToggle = autoUseContainer.querySelector('[data-auto-use-type="mp"]');
			
			if (hpToggle) {
				hpToggle.checked = !!hero.autoUse?.hp;
				hpToggle.dataset.heroId = hero.id;
			}
			if (mpToggle) {
				mpToggle.checked = !!hero.autoUse?.mp;
				mpToggle.dataset.heroId = hero.id;
			}
		}
		
		// Skills list rendering modified to use updateHtmlIfChanged
		const skillsListContainer = card.querySelector('[data-skills-list]');
		if (skillsListContainer) {
			let skillsHtml = '';
			// MODIFIED: Aegis heroes get a redesigned, more compact interactive skill list.
			if (hero.class === 'Aegis') {
				const manualSkills = hero.skills
					.map(hs => gameData.skills.find(s => s.id === hs.id))
					.filter(s => s && s.type === 'Manual');
				
				skillsHtml = manualSkills.map(skillData => {
					const heroSkill = hero.skills.find(hs => hs.id === skillData.id);
					const isAutoCasting = hero.autoCastSkillId === skillData.id;
					return `
						<div class="text-xs bg-base-100 p-2 rounded">
							<div class="flex justify-between items-center mb-1">
								<div class="flex items-center gap-2">
									<span class="font-bold">${skillData.name}</span>
									<button class="btn btn-xs btn-ghost" data-skill-id="${skillData.id}" data-hero-id="${hero.id}" ${hero.mp.current < skillData.mpCost ? 'disabled' : ''}>
										Cast (${skillData.mpCost} MP)
									</button>
									<button class="btn btn-xs ${isAutoCasting ? 'btn-primary' : 'btn-ghost'}"
										data-autocast-skill-id="${skillData.id}" data-hero-id="${hero.id}">
										Auto
									</button>
								</div>
								<span class="text-gray-400">${heroSkill.xp} / ${skillData.xpMax}</span>
							</div>
							<progress class="progress progress-secondary w-full" value="${heroSkill.xp}" max="${skillData.xpMax}"></progress>
						</div>
					`;
				}).join('');
			} else {
				// Original rendering for other classes
				skillsHtml = hero.skills.map(heroSkill => {
					const skillData = gameData.skills.find(s => s.id === heroSkill.id);
					if (!skillData) return '';
					
					return `
						<div class="text-xs">
							<div class="flex justify-between items-center">
								<span>${skillData.name}</span>
								<span class="text-gray-400">${heroSkill.xp} / ${skillData.xpMax}</span>
							</div>
							<progress class="progress progress-secondary w-full" value="${heroSkill.xp}" max="${skillData.xpMax}"></progress>
						</div>
					`;
				}).join('');
			}
			
			const skillsStateKey = JSON.stringify(hero.skills) + hero.autoCastSkillId + hero.mp.current;
			updateHtmlIfChanged(skillsListContainer, skillsHtml, skillsStateKey);
		}
	});
}

/**
 * NEW: Renders the System Shop modal for a specific hero.
 * @param {number} heroId - The ID of the hero to open the shop for.
 */
export function renderShopModal (heroId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	if (!hero) return;
	
	const modal = getEl('system-shop-modal');
	const header = getEl('shop-modal-header');
	const content = getEl('shop-modal-content');
	const inventoryContent = getEl('shop-modal-inventory'); // NEW: Get inventory container
	
	if (!modal || !header || !content || !inventoryContent) return;
	
	// Populate header
	header.innerHTML = `
        <div class="flex justify-between items-center">
            <h3 class="font-bold text-lg">System Shop for ${hero.name}</h3>
            <span class="badge badge-warning">Tokens: ${hero.tokens}</span>
        </div>
    `;
	
	// MODIFIED: Populate content with expandable shop items
	content.innerHTML = gameData.system_shop.map(shopItem => {
		const isSkill = !!shopItem.skillId;
		const entity = isSkill
			? gameData.skills.find(s => s.id === shopItem.skillId)
			: findEntityById(shopItem.itemId);
		
		if (!entity) return '';
		
		let details = '';
		if (isSkill) {
			details = `MP Cost: ${entity.mpCost || 0}`;
		} else if (entity.damageMitigation) {
			details = `Mitigation: ${entity.damageMitigation}`;
		} else if (entity.damage) {
			details = `Damage: ${entity.damage}`;
		} else if (entity.spellPower) {
			details = `Spell Power: x${entity.spellPower}`;
		} else if (entity.effect) {
			const { type, value } = entity.effect;
			const effectText = type === 'heal_hp' ? `+${value} HP` : `+${value} MP`;
			details = `Effect: ${effectText}`;
		}
		
		const canAfford = hero.tokens >= shopItem.price;
		const hasSkill = isSkill && hero.skills.some(s => s.id === shopItem.skillId);
		
		const imageHtml = !isSkill && entity.image
			? `<img src="${entity.image}" alt="${entity.name}" class="w-[50px] h-[50px] object-contain bg-base-100 rounded" />`
			: '<div class="w-[50px] h-[50px] flex items-center justify-center bg-base-100 rounded"><span class="text-2xl">📜</span></div>'; // Placeholder for skills
		
		return `
			<div class="bg-base-100 rounded">
				<div class="flex items-center p-2 gap-2 cursor-pointer" data-shop-item-toggle>
					${imageHtml}
					<div class="flex-grow">
						<div class="flex justify-between items-center">
							<span class="font-bold text-sm">${entity.name}</span>
							<span class="badge badge-warning">${shopItem.price} T</span>
						</div>
					</div>
				</div>
				<div class="p-2 border-t border-base-300 hidden" data-shop-item-details>
					<p class="text-xs mb-2">${entity.description || 'No description available.'}</p>
					<div class="text-[10px] text-gray-400 italic mb-2">${details}</div>
					<button
						class="btn btn-sm btn-accent w-full"
						data-buy-${isSkill ? 'skill' : 'item'}-id="${isSkill ? entity.id : entity.id}"
						data-hero-id="${hero.id}"
						${!canAfford || hasSkill ? 'disabled' : ''}
					>
						${hasSkill ? 'Learned' : `Buy (${shopItem.price} T)`}
					</button>
				</div>
			</div>
		`;
	}).join('');
	
	// MODIFIED: Populate the hero's inventory section with expandable items.
	let inventoryHtml = '';
	const inventoryItems = Object.entries(hero.inventory);
	if (inventoryItems.length > 0) {
		inventoryHtml = inventoryItems.map(([itemId, totalQty]) => {
			if (totalQty <= 0) return '';
			const entity = findEntityById(itemId);
			if (!entity) return '';
			
			const equippedCount = Object.values(hero.equipment).filter(eqId => eqId === itemId).length;
			const canSell = totalQty > equippedCount;
			const isAnyEquipped = equippedCount > 0;
			
			return `
				<div class="bg-base-300/50 rounded">
					<div class="flex items-center p-2 gap-2 cursor-pointer" data-shop-item-toggle>
						<div class="relative w-[50px] h-[50px]">
							<img src="${entity.image}" alt="${entity.name}" class="w-full h-full object-contain bg-base-100 rounded" />
							<span class="absolute bottom-0 right-0 bg-black bg-opacity-60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-tl-md">${totalQty}</span>
							${isAnyEquipped ? '<span class="absolute top-1 left-1 badge badge-primary badge-xs" title="Equipped">E</span>' : ''}
						</div>
						<div class="flex-grow">
							<span class="font-bold text-sm">${entity.name}</span>
						</div>
					</div>
					<div class="p-2 border-t border-base-300 hidden" data-shop-item-details>
						<p class="text-xs mb-2">${entity.description || 'No description available.'}</p>
						<div class="text-[10px] text-gray-400 italic mb-2">${entity.type} - Lvl ${entity.level}</div>
						<button
							class="btn btn-sm btn-error w-full"
							data-sell-item-id="${itemId}"
							data-hero-id="${hero.id}"
							${!canSell ? 'disabled' : ''}
						>
							Sell (${entity.sellPrice} T)
						</button>
						${!canSell && isAnyEquipped ? '<p class="text-xs text-center text-error mt-1">Cannot sell last equipped item.</p>' : ''}
					</div>
				</div>
			`;
		}).join('');
	}
	
	inventoryContent.innerHTML = inventoryHtml || '<p class="text-xs italic text-center text-gray-500 col-span-full">Inventory is empty.</p>';
	
	modal.showModal();
}
