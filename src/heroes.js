import { gameState, gameData } from './state.js';
import { addToLog, updateTextIfChanged, updateHtmlIfChanged, updateProgressIfChanged } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

export function autoEquipBestGear (hero) {
	const slots = {
		mainHand: [],
		offHand: [],
		body: []
	};
	
	Object.keys(hero.inventory).forEach(itemId => {
		const item = gameData.items.find(i => i.id === itemId);
		if (item && item.equipSlot && slots[item.equipSlot] && hero.inventory[itemId] > 0) {
			const canUse = !item.class || (Array.isArray(item.class) ? item.class.includes(hero.class) : item.class === hero.class);
			if (canUse) {
				slots[item.equipSlot].push(item);
			}
		}
	});
	
	for (const slot in slots) {
		let bestItem = null;
		if (slots[slot].length > 0) {
			bestItem = slots[slot].sort((a, b) => b.level - a.level)[0];
		}
		
		const bestItemId = bestItem ? bestItem.id : null;
		const currentItemId = hero.equipment[slot];
		
		if (currentItemId !== bestItemId) {
			const oldItem = gameData.items.find(i => i.id === currentItemId);
			hero.equipment[slot] = bestItemId;
			
			if (bestItem && oldItem) {
				addToLog(`upgraded ${slot}: ${oldItem.name} -> ${bestItem.name}.`, hero.id);
			} else if (bestItem) {
				addToLog(`equipped ${bestItem.name} (${slot}).`, hero.id);
			} else if (oldItem) {
				addToLog(`unequipped ${oldItem.name} (${slot}).`, hero.id);
			}
		}
	}
}

function findEntityById (id) {
	if (!id) return null;
	return gameData.items.find(i => i.id === id);
}

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
		
		const nameText = `${hero.name} | Lv. ${hero.level}`;
		updateTextIfChanged(card.querySelector('[data-name]'), nameText);
		
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
		
		const xpText = `XP: ${hero.xp.current}/${hero.xp.max}`;
		updateTextIfChanged(card.querySelector('[data-xp-label]'), xpText);
		updateProgressIfChanged(card.querySelector('[data-xp-bar]'), hero.xp.current, hero.xp.max);
		
		const formatRegen = (val) => Number(val.toFixed(2));
		const hpText = `HP: ${Math.floor(hero.hp.current)}/${hero.hp.max} (+${formatRegen(hero.hpRegen)}/s)`;
		updateTextIfChanged(card.querySelector('[data-hp-label]'), hpText);
		updateProgressIfChanged(card.querySelector('[data-hp-bar]'), hero.hp.current, hero.hp.max);
		
		const mpContainer = card.querySelector('[data-mp-container]');
		if (hero.class === 'Vanguard') {
			mpContainer.style.display = 'none';
		} else {
			mpContainer.style.display = 'flex';
			const mpText = `MP: ${Math.floor(hero.mp.current)}/${hero.mp.max} (+${formatRegen(hero.mpRegen)}/s)`;
			updateTextIfChanged(card.querySelector('[data-mp-label]'), mpText);
			updateProgressIfChanged(card.querySelector('[data-mp-bar]'), hero.mp.current, hero.mp.max);
		}
		
		const rageContainer = card.querySelector('[data-rage-container]');
		if (hero.class === 'Vanguard') {
			rageContainer.style.display = 'flex';
			const rageText = `Rage: ${Math.floor(hero.rage.current)}/${hero.rage.max}`;
			updateTextIfChanged(card.querySelector('[data-rage-label]'), rageText);
			updateProgressIfChanged(card.querySelector('[data-rage-bar]'), hero.rage.current, hero.rage.max);
		} else {
			rageContainer.style.display = 'none';
		}
		
		const statusArea = card.querySelector('[data-hero-status]');
		let statusHtml = '';
		let statusStateKey = '';
		
		// Generate survivor count text to append to relevant statuses.
		let survivorText = '';
		if (hero.carId && hero.hp.current > 0) {
			const car = gameState.city.cars.find(c => c.id === hero.carId);
			if (car && hero.survivorsCarried > 0) {
				const capacity = car.survivorCapacity || 4;
				survivorText = ` (Carrying: ${hero.survivorsCarried}/${capacity}).`;
			}
		}
		
		if (hero.hp.current <= 0) {
			statusHtml = `<span class="text-error font-bold">INCAPACITATED</span>`;
			if (hero.location !== 'field') {
				statusHtml += ` (at base)`;
			}
			statusStateKey = `incapacitated-${hero.location}`;
		} else if (hero.location !== 'field') {
			const building = gameState.city.buildings.find(b => b.id === hero.location);
			const buildingName = building ? building.name : `Building #${hero.location}`;
			statusHtml = `<span class="text-info">Resting in ${buildingName}.</span>`;
			statusStateKey = `resting-${hero.location}`;
		} else if (!hero.carId) {
			statusHtml = `<span class="text-warning">Waiting for an available car...</span>`;
			statusStateKey = 'no-car';
		} else if (hero.targetMonsterId) {
			// The detailed combat view is now in the shared panel.
			// We just show a simple status here.
			const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
			if (monster) {
				statusHtml = `<span class="text-error">Fighting ${monster.name}!</span>`;
				statusStateKey = `fighting-${monster.id}`;
			} else {
				// Monster is dead, but target ID not cleared yet.
				hero.targetMonsterId = null;
				statusHtml = `<span class="text-success">Searching for targets...</span>`;
				statusStateKey = 'searching-after-kill';
			}
		} else {
			const car = gameState.city.cars.find(c => c.id === hero.carId);
			const carName = car ? (car.name || `Car #${car.id}`) : 'Unknown Car';
			
			if (gameState.party.missionState === 'idle') {
				statusHtml = `<span class="text-info">Resting at base in ${carName}.</span>`;
				statusStateKey = `resting-base-${hero.carId}`;
			} else if (gameState.party.missionState === 'driving_out') {
				statusHtml = `<span class="text-success">Searching! ${survivorText}</span>`;
				const carCapacity = car ? car.survivorCapacity : 0;
				statusStateKey = `driving-out-${hero.carId}-${hero.survivorsCarried}-${carCapacity}`;
			} else if (gameState.party.missionState === 'driving_back') {
				statusHtml = `<span class="text-success">Returning! ${survivorText}</span>`;
				const carCapacity = car ? car.survivorCapacity : 0;
				statusStateKey = `driving-back-${hero.carId}-${hero.survivorsCarried}-${carCapacity}`;
			} else if (gameState.party.missionState === 'in_combat') {
				statusHtml = `<span class="text-error">Ambushed!</span>`;
				statusStateKey = `in-combat-${hero.carId}`;
			}
		}
		updateHtmlIfChanged(statusArea, statusHtml, statusStateKey);
		
		const skillsListContainer = card.querySelector('[data-skills-list]');
		if (skillsListContainer) {
			let skillsHtml = '';
			
			const learnedSkills = hero.skills
				.map(hs => gameData.skills.find(s => s.id === hs.id))
				.filter(Boolean);
			
			if (learnedSkills.length > 0) {
				skillsHtml = learnedSkills.map(skillData => {
					const isAutoCasting = hero.autoCastSkillId === skillData.id;
					const meetsLevelReq = !skillData.levelRequirement || hero.level >= skillData.levelRequirement;
					
					const cooldownEndTime = hero.skillCooldowns[skillData.id] || 0;
					const isOnCooldown = gameState.time < cooldownEndTime;
					const remainingCd = Math.ceil(cooldownEndTime - gameState.time);
					const shouldFlash = hero.skillFlash && hero.skillFlash.id === skillData.id && gameState.time < hero.skillFlash.clearAtTime;
					
					let baseSkill = skillData;
					while (baseSkill.replaces) {
						const parent = gameData.skills.find(s => s.id === baseSkill.replaces);
						if (!parent) break;
						baseSkill = parent;
					}
					
					const unlockLevel = baseSkill.autoCastUnlockLevel;
					const canAutoCast = unlockLevel && hero.level >= unlockLevel;
					
					let autoButtonHtml = '';
					if (canAutoCast) {
						autoButtonHtml = `<button class="btn btn-xs ${isAutoCasting ? 'btn-primary' : 'btn-ghost'}" data-autocast-skill-id="${skillData.id}" data-hero-id="${hero.id}">Auto</button>`;
					} else if (unlockLevel) {
						autoButtonHtml = `<div class="tooltip" data-tip="Unlocks at Hero Level ${unlockLevel}"><button class="btn btn-xs btn-ghost" disabled>Auto</button></div>`;
					}
					
					const mpCost = skillData.mpCost || 0;
					const rageCost = skillData.rageCost || 0;
					// Vanguard skills can be used without rage, so we don't check for it when disabling the button.
					const hasResources = hero.class === 'Vanguard' || (hero.mp.current >= mpCost);
					const isCastDisabled = !meetsLevelReq || !hasResources || isOnCooldown;
					const costText = rageCost > 0 ? `${rageCost} Rage` : (mpCost > 0 ? `${mpCost} MP` : '');
					
					return `
						<div class="card bg-base-100 shadow-md flex flex-col ${shouldFlash ? 'flash-effect' : ''}">
							<div class="p-2 flex-grow">
								<div class="flex justify-between items-center">
									<div class="font-bold text-xs">${skillData.name} ${isOnCooldown ? `<span class="text-error">(${remainingCd}s)</span>` : ''}</div>
									${skillData.levelRequirement > 1 ? `<div class="badge badge-neutral badge-sm">Lvl ${skillData.levelRequirement}</div>` : ''}
								</div>
								<p class="text-[10px] italic text-gray-400 my-1 min-h-[20px]">${skillData.description}</p>
								<div class="flex flex-wrap gap-1 items-center justify-end mt-1">
									${autoButtonHtml}
								</div>
							</div>
							${(() => {
						if (skillData.actionType === 'heal') {
							const currentTargetId = hero.skillTargets[skillData.id] || hero.id;
							const buttons = gameState.heroes.map(targetHero => {
								const isActive = currentTargetId === targetHero.id;
								return `<button
													class="btn btn-sm ${isActive ? 'btn-secondary' : 'btn-ghost'}"
													data-skill-id="${skillData.id}"
													data-hero-id="${hero.id}"
													data-target-hero-id="${targetHero.id}"
													${isCastDisabled ? 'disabled' : ''}>
													Cast on ${targetHero.name} ${costText ? `(${costText})` : ''}
												</button>`;
							}).join('');
							return `<div class="card-actions p-1 flex flex-col gap-1">${buttons}</div>`;
						} else {
							return `
										<div class="card-actions p-1">
											<button class="btn btn-sm btn-ghost w-full" data-skill-id="${skillData.id}" data-hero-id="${hero.id}" ${isCastDisabled ? 'disabled' : ''}>
												Cast ${costText ? `(${costText})` : ''}
											</button>
										</div>
									`;
						}
					})()}
						</div>
					`;
				}).join('');
			}
			
			const keyParts = [
				hero.level,
				hero.autoCastSkillId,
				JSON.stringify(hero.skillTargets),
				JSON.stringify(hero.skillFlash),
				JSON.stringify(hero.skillCooldowns), // Always include to detect when a new cooldown starts.
				// Create a boolean flag for each skill based on whether the hero can afford it.
				// This part of the key only changes when MP crosses a skill's cost threshold.
				learnedSkills.map(s => (s.mpCost && hero.mp) ? (hero.mp.current >= s.mpCost) : true).join(',')
			];
			
			// Only add the rapidly-changing `gameState.time` to the key if a skill is actively on cooldown.
			// This is necessary to make the countdown timer update every tick.
			const anySkillOnCooldown = learnedSkills.some(skill => (hero.skillCooldowns[skill.id] || 0) > gameState.time);
			if (anySkillOnCooldown) {
				keyParts.push(gameState.time);
			}
			
			const skillsStateKey = keyParts.join('|');
			updateHtmlIfChanged(skillsListContainer, skillsHtml, skillsStateKey);
		}
	});
}

export function renderShopModal (heroId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	if (!hero) return;
	
	const modal = getEl('system-shop-modal');
	const header = getEl('shop-modal-header');
	const itemsContent = getEl('shop-modal-items-content');
	const skillsContent = getEl('shop-modal-skills-content');
	const inventoryContent = getEl('shop-modal-inventory-content');
	const buildingUpgradesContent = getEl('shop-modal-building-upgrades-content');
	const carUpgradesContent = getEl('shop-modal-car-upgrades-content');
	
	if (!modal || !header || !itemsContent || !skillsContent || !inventoryContent || !buildingUpgradesContent || !carUpgradesContent) return;
	
	header.innerHTML = `
        <div class="flex justify-between items-center">
            <h3 class="font-bold text-lg">System Shop (${hero.name})</h3>
            <span class="badge badge-warning">Your Tokens: ${hero.tokens}</span>
        </div>
    `;
	
	const shopItems = gameData.system_shop.filter(si => si.itemId);
	itemsContent.innerHTML = shopItems.map(shopItem => {
		const entity = findEntityById(shopItem.itemId);
		if (!entity) return '';
		
		let details = '';
		if (entity.damageMitigation) details = `Mitigation: ${entity.damageMitigation}`;
		else if (entity.damage) details = `Damage: ${entity.damage}`;
		else if (entity.spellPower) details = `Spell Power: x${entity.spellPower}`;
		else if (entity.effect) {
			const { type, value } = entity.effect;
			details = `Effect: ${type === 'heal_hp' ? `+${value} HP` : `+${value} MP`}`;
		}
		
		// Check hero's tokens for buying items.
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
		if (!entity) return '';
		
		const details = `Req: Lvl ${entity.levelRequirement} | Cost: ${entity.mpCost || entity.rageCost || 0} ${entity.rageCost ? 'Rage' : 'MP'}`;
		// Check hero's tokens for buying skills.
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
					<button class="btn btn-sm btn-accent w-full mt-1" data-buy-skill-id="${entity.id}" data-hero-id="${hero.id}" ${!canAfford || hasSkill ? 'disabled' : ''}>${hasSkill ? 'Learned' : `Buy`}</button>
				</div>
			</div>
		`;
	}).join('') || '<p class="text-xs italic text-center text-gray-500 col-span-full">No skills for sale.</p>';
	
	// Render the Building Upgrades tab.
	buildingUpgradesContent.innerHTML = gameData.building_upgrades.map(upgrade => {
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
	}).join('') || '<p class="text-xs italic text-center text-gray-500 col-span-full">No building upgrades for sale.</p>';
	
	// Render the Car Upgrades tab.
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
	
	modal.showModal();
}
