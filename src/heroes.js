import { gameState, gameData } from './state.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Finds an entity (item or armor) by its ID from the game data.
 * @param {string} id - The ID of the entity to find.
 * @returns {object|null} The found entity or null.
 */
function findEntityById(id) {
	if (!id) return null;
	return gameData.items.find(i => i.id === id) || gameData.armor.find(a => a.id === id);
}

/**
 * Determines which recipes a hero can craft based on their current inventory.
 * @param {object} hero - The hero object from gameState.
 * @returns {Array<object>} An array of recipe objects the hero can craft.
 */
function getCraftableRecipes(hero) {
	const craftable = [];
	for (const recipe of gameData.recipes) {
		// Count the required ingredients for the current recipe
		const ingredientsCount = {};
		for (const ingredientId of recipe.ingredients) {
			ingredientsCount[ingredientId] = (ingredientsCount[ingredientId] || 0) + 1;
		}
		
		let canCraft = true;
		// Check if the hero has enough of each required ingredient
		for (const [itemId, requiredQty] of Object.entries(ingredientsCount)) {
			const heroQty = hero.inventory[itemId] || 0;
			if (heroQty < requiredQty) {
				canCraft = false;
				break;
			}
		}
		
		if (canCraft) {
			craftable.push(recipe);
		}
	}
	return craftable;
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
		card.querySelector('[data-class]').textContent = hero.class;
		card.querySelector('[data-class]').className = `badge ${hero.class === 'Aegis' ? 'badge-info' : hero.class === 'Striker' ? 'badge-error' : 'badge-success'}`;
		
		const armorTextEl = card.querySelector('[data-armor-text]');
		const unequipButton = card.querySelector('[data-unequip-button]');
		const armor = gameData.armor.find(a => a.id === hero.armorId);
		
		if (armor) {
			armorTextEl.textContent = `${armor.name} (Mitigation: ${armor.damageMitigation})`;
			unequipButton.classList.remove('hidden');
			unequipButton.dataset.heroId = hero.id;
		} else {
			armorTextEl.textContent = 'No Armor';
			unequipButton.classList.add('hidden');
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
		
		const hintsContainer = card.querySelector('[data-crafting-hints-list]');
		if (hintsContainer) {
			const craftableRecipes = getCraftableRecipes(hero);
			if (craftableRecipes.length > 0) {
				hintsContainer.innerHTML = craftableRecipes.map(recipe => {
					const resultEntity = findEntityById(recipe.resultId);
					if (!resultEntity) return '';
					
					// Count ingredients for a concise display (e.g., "2x Salvaged Parts").
					const ingredientsCount = {};
					recipe.ingredients.forEach(id => {
						ingredientsCount[id] = (ingredientsCount[id] || 0) + 1;
					});
					
					const ingredientsHtml = Object.entries(ingredientsCount).map(([id, qty]) => {
						const ingredientEntity = findEntityById(id);
						return `${qty}x ${ingredientEntity ? ingredientEntity.name : 'Unknown'}`;
					}).join(' + ');
					
					return `
                        <div class="flex flex-col p-2 bg-base-100 rounded gap-1">
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-sm">${resultEntity.name}</span>
                                <button class="btn btn-xs btn-secondary" data-auto-craft-recipe-id="${recipe.resultId}" data-hero-id="${hero.id}">Craft</button>
                            </div>
                            <div class="text-[10px] text-gray-400 italic">${ingredientsHtml}</div>
                        </div>
                    `;
				}).join('');
			} else {
				hintsContainer.innerHTML = '<span class="text-xs text-gray-500 italic text-center w-full block">None</span>';
			}
		}
		
		const invContainer = card.querySelector('[data-inventory-container]');
		if (invContainer) {
			let inventoryHtml = '';
			const inventoryItems = Object.entries(hero.inventory);
			
			if (inventoryItems.length > 0) {
				inventoryItems.forEach(([id, qty]) => {
					const entity = findEntityById(id);
					if (entity) {
						let count = qty;
						const isEquipped = hero.armorId === id;
						const isArmor = gameData.armor.some(a => a.id === id);
						const isConsumable = entity.type === 'Consumable';
						
						let displayName = entity.name;
						if (isConsumable && entity.effect) {
							const { type, value } = entity.effect;
							const effectText = type === 'heal_hp' ? `HP: +${value}` : `MP: +${value}`;
							displayName = `${entity.name} (${effectText})`;
						}
						
						if (isEquipped) {
							const equipAttribute = isArmor ? `data-equip-item-id="${id}"` : '';
							inventoryHtml += `<div data-hero-id="${hero.id}" ${equipAttribute} class="badge badge-primary badge-lg p-3 cursor-pointer">${displayName} (Equipped)</div>`;
							count--;
						}
						
						for (let i = 0; i < count; i++) {
							const equipAttribute = isArmor ? `data-equip-item-id="${id}"` : '';
							const useAttribute = isConsumable ? `data-use-item-id="${id}"` : '';
							const cursorClass = (isArmor || isConsumable) ? 'cursor-pointer' : '';
							inventoryHtml += `<div data-hero-id="${hero.id}" ${equipAttribute} ${useAttribute} class="badge badge-outline badge-lg p-3 ${cursorClass}">${displayName}</div>`;
						}
					}
				});
				invContainer.innerHTML = inventoryHtml;
			} else {
				invContainer.innerHTML = '<span class="text-xs text-gray-500 italic">Empty</span>';
			}
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
