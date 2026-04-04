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
				addToLog(`${hero.name} upgraded ${slot}: ${oldItem.name} -> ${bestItem.name}.`, hero.id);
			} else if (bestItem) {
				addToLog(`${hero.name} equipped ${bestItem.name} (${slot}).`, hero.id);
			} else if (oldItem) {
				addToLog(`${hero.name} unequipped ${oldItem.name} (${slot}).`, hero.id);
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
		
		const dynamicArea = card.querySelector('[data-dynamic-area]');
		let dynamicHtml = '';
		let dynamicStateKey = '';
		
		// MODIFIED: Always generate survivor HTML when on a mission to show capacity.
		let survivorHtml = '';
		if (hero.carId && hero.hp.current > 0) {
			const car = gameState.city.cars.find(c => c.id === hero.carId);
			if (car) {
				const capacity = car.survivorCapacity || 4;
				const textClass = hero.survivorsCarried > 0 ? 'text-success' : 'text-gray-500';
				survivorHtml = `<p class="text-xs text-center ${textClass} mb-1">Carrying: ${hero.survivorsCarried} / ${capacity} Survivors</p>`;
			}
		}
		
		if (hero.hp.current <= 0) {
			dynamicHtml = `<p class="text-error font-bold text-center">INCAPACITATED</p><p class="text-xs text-center">Awaiting Aegis Healing...</p>`;
			if (hero.location !== 'field') {
				dynamicHtml += `<p class="text-xs text-center text-warning">Cannot be healed at base.</p>`;
			}
			dynamicStateKey = `incapacitated-${hero.location}`;
		} else if (hero.location !== 'field') {
			const building = gameState.city.buildings.find(b => b.id === hero.location);
			const buildingName = building ? building.name : `Building #${hero.location}`;
			dynamicHtml = `<p class="text-info text-center text-sm">Resting in ${buildingName}.</p>`;
			dynamicStateKey = `resting-${hero.location}`;
		} else if (!hero.carId) {
			dynamicHtml = `<p class="text-warning text-center text-sm">Waiting for an available car...</p>`;
			dynamicStateKey = 'no-car';
		} else if (hero.targetMonsterId) {
			const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
			if (monster) {
				const agroEntries = Object.entries(monster.agro)
					.map(([heroId, value]) => ({ heroId: parseInt(heroId, 10), value }))
					.sort((a, b) => b.value - a.value);
				
				let agroHtml = '<div class="text-xs text-gray-500 italic">No threat</div>';
				if (agroEntries.length > 0) {
					agroHtml = agroEntries.map((entry, index) => {
						const threatHero = gameState.heroes.find(h => h.id === entry.heroId);
						if (!threatHero) return '';
						const isTarget = index === 0;
						return `
							<div class="badge ${isTarget ? 'badge-error' : 'badge-neutral'} gap-1">
								${threatHero.name}
								<div class="badge badge-sm badge-circle ${isTarget ? 'badge-ghost' : 'badge-secondary'}">${Math.floor(entry.value)}</div>
							</div>
						`;
					}).join(' ');
				}
				
				const car = gameState.city.cars.find(c => c.id === hero.carId);
				const carName = car ? (car.name || `Car #${car.id}`) : 'Unknown Car';
				
				dynamicHtml = `
                    <p class="text-sm font-bold text-error mb-1">Fighting: Lv.${monster.level} ${monster.name} (#${monster.id})</p>
                    <p class="text-xs text-center text-info mb-1">From: ${carName}</p>
					${survivorHtml}
                    <progress class="progress progress-error w-full" value="${monster.currentHp}" max="${monster.maxHp}"></progress>
                    <p class="text-xs text-right mt-1">${Math.floor(monster.currentHp)}/${monster.maxHp} HP</p>
                    <div class="mt-2 border-t border-base-100 pt-1">
                        <h4 class="font-semibold text-xs mb-1 text-center">Threat List</h4>
                        <div class="flex flex-wrap gap-1 justify-center">${agroHtml}</div>
                    </div>
                `;
				// MODIFIED: Add car survivor capacity to state key to force updates
				const carCapacity = car ? car.survivorCapacity : 0;
				dynamicStateKey = `fighting-${monster.id}-${monster.currentHp}-${JSON.stringify(monster.agro)}-${hero.survivorsCarried}-${carCapacity}`;
			} else {
				hero.targetMonsterId = null;
				const car = gameState.city.cars.find(c => c.id === hero.carId);
				const carName = car ? (car.name || `Car #${car.id}`) : 'Unknown Car';
				dynamicHtml = `<p class="text-info text-center text-sm">Resting at base in ${carName}.</p>`;
				dynamicStateKey = `resting-base-${hero.carId}`;
			}
		} else {
			const car = gameState.city.cars.find(c => c.id === hero.carId);
			const carName = car ? (car.name || `Car #${car.id}`) : 'Unknown Car';
			const carCapacity = car ? car.survivorCapacity : 0; // Get capacity for state key
			
			if (gameState.party.missionState === 'idle') {
				dynamicHtml = `<p class="text-info text-center text-sm">Resting at base in ${carName}.</p>`;
				dynamicStateKey = `resting-base-${hero.carId}`;
			} else if (gameState.party.missionState === 'driving_out') {
				dynamicHtml = `<p class="text-success text-center text-sm">Searching for survivors in ${carName}.</p>${survivorHtml}`; // MODIFIED: Added survivorHtml
				dynamicStateKey = `driving-out-${hero.carId}-${hero.survivorsCarried}-${carCapacity}`; // MODIFIED: Added state data
			} else if (gameState.party.missionState === 'driving_back') {
				dynamicHtml = `<p class="text-success text-center text-sm">Returning to base in ${carName}.</p>${survivorHtml}`;
				dynamicStateKey = `driving-back-${hero.carId}-${hero.survivorsCarried}-${carCapacity}`; // MODIFIED: Added state data
			} else if (gameState.party.missionState === 'in_combat') {
				dynamicHtml = `<p class="text-error text-center text-sm">Ambushed! Waiting for combat to resolve...</p>`;
				dynamicStateKey = `in-combat-${hero.carId}`;
			}
		}
		updateHtmlIfChanged(dynamicArea, dynamicHtml, dynamicStateKey);
		
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
			
			const skillsStateKey = JSON.stringify(hero.skills) + hero.autoCastSkillId + hero.level + (hero.mp ? hero.mp.current : '') + (hero.rage ? hero.rage.current : '') + JSON.stringify(hero.skillTargets) + JSON.stringify(hero.skillCooldowns) + JSON.stringify(hero.skillFlash) + gameState.time;
			updateHtmlIfChanged(skillsListContainer, skillsHtml, skillsStateKey);
		}
		
		const heroLogContainer = card.querySelector('[data-hero-log-list]');
		if (heroLogContainer) {
			const battleLogToggle = card.querySelector('[data-toggle-battle-log]');
			const showBattleLogs = battleLogToggle ? battleLogToggle.checked : false;
			
			const filteredLogs = hero.log.filter(entry => {
				if (showBattleLogs) {
					return true;
				}
				const isBattleDamageLog = /attacked.*, dealing|deals \d+ damage/.test(entry);
				return !isBattleDamageLog;
			});
			
			const logHtml = filteredLogs.map(entry => `<p>${entry}</p>`).join('');
			const logStateKey = (hero.log.length > 0 ? hero.log[0] : '') + showBattleLogs;
			updateHtmlIfChanged(heroLogContainer, logHtml, logStateKey);
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
	// NEW: Get new, separate upgrade tab content elements.
	const buildingUpgradesContent = getEl('shop-modal-building-upgrades-content');
	const carUpgradesContent = getEl('shop-modal-car-upgrades-content');
	
	if (!modal || !header || !itemsContent || !skillsContent || !inventoryContent || !buildingUpgradesContent || !carUpgradesContent) return;
	
	// MODIFIED: Shop is now hero-based, showing the individual hero's tokens.
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
		
		// MODIFIED: Check hero's tokens for buying items.
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
		// MODIFIED: Check hero's tokens for buying skills.
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
	
	// NEW: Render the Building Upgrades tab.
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
	
	// NEW: Render the Car Upgrades tab.
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
