import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Automatically finds and equips the best gear a hero has in their inventory for each slot.
 * Best is determined by the item's level.
 * @param {object} hero - The hero object from gameState.
 */
export function autoEquipBestGear(hero) {
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
function findEntityById(id) {
	if (!id) return null;
	return gameData.items.find(i => i.id === id);
}

/**
 * Renders all hero cards into the main content area.
 */
export function renderHeroes() {
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
		
		card.querySelector('[data-name]').textContent = `${hero.name} | Lv. ${hero.level}`;
		card.querySelector('[data-tokens]').textContent = `Tokens: ${hero.tokens}`;
		card.querySelector('[data-class]').textContent = hero.class;
		card.querySelector('[data-class]').className = `badge ${hero.class === 'Aegis' ? 'badge-info' : hero.class === 'Striker' ? 'badge-error' : 'badge-success'}`;
		
		// [MODIFIED] Render multi-slot equipment as images with tooltips
		const equipmentContainer = card.querySelector('[data-equipment-container]');
		const equippedItems = Object.entries(hero.equipment)
			.map(([slot, itemId]) => ({ slot, item: findEntityById(itemId) }))
			.filter(e => e.item);
		
		if (equippedItems.length > 0) {
			equipmentContainer.innerHTML = equippedItems.map(({ slot, item }) => {
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
			equipmentContainer.innerHTML = '<span class="text-xs italic text-gray-500">Nothing Equipped</span>';
		}
		
		card.querySelector('[data-xp-label]').textContent = `XP: ${hero.xp.current}/${hero.xp.max}`;
		card.querySelector('[data-xp-bar]').value = hero.xp.current;
		card.querySelector('[data-xp-bar]').max = hero.xp.max;
		
		const formatRegen = (val) => Number(val.toFixed(2));
		card.querySelector('[data-hp-label]').textContent = `HP: ${Math.floor(hero.hp.current)}/${hero.hp.max} (+${formatRegen(hero.hpRegen)}/s)`;
		card.querySelector('[data-hp-bar]').value = hero.hp.current;
		card.querySelector('[data-hp-bar]').max = hero.hp.max;
		
		card.querySelector('[data-mp-label]').textContent = `MP: ${Math.floor(hero.mp.current)}/${hero.mp.max} (+${formatRegen(hero.mpRegen)}/s)`;
		card.querySelector('[data-mp-bar]').value = hero.mp.current;
		card.querySelector('[data-mp-bar]').max = hero.mp.max;
		
		const dynamicArea = card.querySelector('[data-dynamic-area]');
		
		if (hero.class === 'Aegis') {
			const allSkillData = hero.skills.map(s => gameData.skills.find(gs => gs.id === s.id));
			const allManualSkills = allSkillData.filter(s => s && s.type === 'Manual');
			
			const autoSkills = hero.autoCast.map(id => allManualSkills.find(s => s.id === id)).filter(Boolean);
			const manualSkills = allManualSkills.filter(s => !hero.autoCast.includes(s.id));
			
			dynamicArea.innerHTML = `
                <div class="flex gap-2 w-full">
                    <div class="flex-1 bg-base-100 p-2 rounded border border-base-300 min-h-[100px]" data-drop-zone="manual" data-hero-id="${hero.id}">
                        <h4 class="text-xs font-bold mb-2 text-center text-gray-400">Manual Skills</h4>
                        <div class="flex flex-col gap-1">
                            ${manualSkills.map(skill => `
                                <div draggable="true" data-drag-skill="${skill.id}" class="badge badge-outline cursor-move w-full justify-between p-3">
                                    <span>${skill.name}</span>
                                    <button class="btn btn-xs btn-ghost" data-skill-id="${skill.id}" data-hero-id="${hero.id}" ${hero.mp.current < skill.mpCost ? 'disabled' : ''}>Cast</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="flex-1 bg-base-100 p-2 rounded border border-primary min-h-[100px]" data-drop-zone="auto" data-hero-id="${hero.id}">
                        <h4 class="text-xs font-bold mb-2 text-center text-primary">Auto Priority</h4>
                        <div class="flex flex-col gap-1">
                            ${autoSkills.map(skill => `
                                <div draggable="true" data-drag-skill="${skill.id}" class="badge badge-primary cursor-move w-full p-3">${skill.name}</div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <p class="text-[10px] text-center mt-1 text-gray-500">Drag skills between boxes to set auto-cast priority.</p>
            `;
		} else {
			if (hero.hp.current <= 0) {
				dynamicArea.innerHTML = `<p class="text-error font-bold text-center">INCAPACITATED</p><p class="text-xs text-center">Awaiting Aegis Healing...</p>`;
			} else if (!hero.carId) {
				dynamicArea.innerHTML = `<p class="text-warning text-center text-sm">Waiting for Mana Battery Car...</p>`;
			} else if (hero.targetMonsterId) {
				const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
				if (monster) {
					dynamicArea.innerHTML = `
                    <p class="text-sm font-bold text-error mb-1">Fighting: Lv.${monster.level} ${monster.name} (#${monster.id})</p>
                    <progress class="progress progress-error w-full" value="${monster.currentHp}" max="${monster.maxHp}"></progress>
                    <p class="text-xs text-right mt-1">${Math.floor(monster.currentHp)}/${monster.maxHp} HP</p>
                `;
				} else {
					// This case can happen if a monster is defeated but the hero's target ID hasn't been cleared yet.
					dynamicArea.innerHTML = `<p class="text-success text-center text-sm">Patrolling in Car #${hero.carId}. No targets.</p>`;
				}
			} else {
				dynamicArea.innerHTML = `<p class="text-success text-center text-sm">Patrolling in Car #${hero.carId}. No targets.</p>`;
			}
		}
		
		// [MODIFIED] Inventory rendering logic to show stacked images.
		const invContainer = card.querySelector('[data-inventory-container]');
		if (invContainer) {
			let inventoryHtml = '';
			const inventoryItems = Object.entries(hero.inventory);
			
			if (inventoryItems.length > 0) {
				inventoryItems.forEach(([id, qty]) => {
					if (qty <= 0) return;
					const entity = findEntityById(id);
					if (entity) {
						const isEquipped = Object.values(hero.equipment).includes(id);
						// The container itself is the hover target for the new tooltip system.
						inventoryHtml += `
							<div
								class="relative w-[100px] h-[100px] bg-base-300/50 rounded flex items-center justify-center p-1 group cursor-pointer"
								data-inventory-item
								data-item-id="${id}"
								data-hero-id="${hero.id}"
							>
								<img src="${entity.image}" alt="${entity.name}" class="w-full h-full object-contain ${isEquipped ? 'border-2 border-primary rounded' : ''}" />
								<span class="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs font-bold px-2 py-1 rounded">${qty}</span>
								${isEquipped ? '<span class="absolute top-1 left-1 badge badge-primary badge-xs" title="Equipped">E</span>' : ''}
							</div>
						`;
					}
				});
				invContainer.innerHTML = inventoryHtml;
			} else {
				invContainer.innerHTML = '<span class="text-xs text-gray-500 italic">Empty</span>';
			}
		}
		
		// [MODIFIED] Render System Shop with item images.
		const shopContainer = card.querySelector('[data-shop-list]');
		if (shopContainer) {
			shopContainer.innerHTML = gameData.system_shop.map(shopItem => {
				const isSkill = !!shopItem.skillId;
				const entity = isSkill
					? gameData.skills.find(s => s.id === shopItem.skillId)
					: findEntityById(shopItem.itemId);
				
				if (!entity) return '';
				
				let details = '';
				if (isSkill) {
					details = entity.description;
				} else if (entity.damageMitigation) {
					details = `(Mitigation: ${entity.damageMitigation})`;
				} else if (entity.damage) {
					details = `(Damage: ${entity.damage})`;
				} else if (entity.spellPower) {
					details = `(Spell Power: x${entity.spellPower})`;
				} else if (entity.effect) {
					const { type, value } = entity.effect;
					const effectText = type === 'heal_hp' ? `+${value} HP` : `+${value} MP`;
					details = `(${effectText})`;
				}
				
				const canAfford = hero.tokens >= shopItem.price;
				const hasSkill = isSkill && hero.skills.some(s => s.id === shopItem.skillId);
				
				const imageHtml = !isSkill && entity.image
					? `<img src="${entity.image}" alt="${entity.name}" class="w-[50px] h-[50px] object-contain bg-base-100 rounded" />`
					: '';
				
				return `
					<div class="flex items-center p-2 bg-base-100 rounded gap-2">
						${imageHtml}
						<div class="flex-grow">
							<div class="flex justify-between items-center">
								<span class="font-bold text-sm">${entity.name}</span>
								<button
									class="btn btn-xs btn-accent"
									data-buy-${isSkill ? 'skill' : 'item'}-id="${isSkill ? entity.id : entity.id}"
									data-hero-id="${hero.id}"
									${!canAfford || hasSkill ? 'disabled' : ''}
								>
									${hasSkill ? 'Learned' : `Buy (${shopItem.price} T)`}
								</button>
							</div>
							<div class="text-[10px] text-gray-400 italic">${details}</div>
						</div>
					</div>
				`;
			}).join('');
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
		
		const skillsListContainer = card.querySelector('[data-skills-list]');
		if (skillsListContainer) {
			skillsListContainer.innerHTML = hero.skills.map(heroSkill => {
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
	});
}
