import { gameState, gameData } from './state.js';
import { addToLog, updateTextIfChanged, updateHtmlIfChanged, updateProgressIfChanged } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Recalculates derived stats (Max HP, Max MP, Regen) based on the hero's core stats.
 * Endurance boosts HP, Intelligence boosts MP, Spirit boosts Regen.
 * @param {object} hero - The hero object to update.
 */
export function recalculateHeroStats(hero) {
	const baseHp = hero.class === 'Vanguard' ? 200 : 100;
	const baseMp = hero.class === 'Aegis' ? 150 : 100;
	
	const oldMaxHp = hero.hp.max;
	const oldMaxMp = hero.mp ? hero.mp.max : 0;
	
	// Base scaling per level + Stat scaling
	hero.hp.max = baseHp + (hero.level * 10) + (hero.stats.end * 10);
	if (hero.class !== 'Vanguard') {
		hero.mp.max = baseMp + (hero.level * 10) + (hero.stats.int * 5);
	}
	
	// Spirit increases regeneration rates
	hero.hpRegen = (hero.class === 'Vanguard' ? 2.0 : 1.0) + (hero.stats.spr * 0.1);
	if (hero.class !== 'Vanguard') {
		hero.mpRegen = (hero.class === 'Aegis' ? 2.0 : 1.0) + (hero.stats.spr * 0.1);
	}
	
	// Add the difference to current HP/MP so leveling up/adding stats heals for the gained amount
	if (hero.hp.max > oldMaxHp) hero.hp.current += (hero.hp.max - oldMaxHp);
	if (hero.mp && hero.mp.max > oldMaxMp) hero.mp.current += (hero.mp.max - oldMaxMp);
}

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
};

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
				
				let imageUrl = '';
				if (item.card_images && Array.isArray(item.card_images)) {
					const normalImage = item.card_images.find(img => img.state === 'normal');
					if (normalImage) {
						// Remove 'public' from the beginning of the folder path if it exists
						let folderPath = normalImage.image_folder.replace(/^public/, '');
						if (!folderPath.startsWith('/')) {
							folderPath = '/' + folderPath;
						}
						imageUrl = `${folderPath}/thumbnails/${normalImage.image_file_name}`;
					}
				}
				
				return `
          <div class="tooltip" data-tip="${item.name} (${details}) | Slot: ${slot}">
            <img src="${imageUrl}" alt="${item.name}" class="w-[40px] aspect-[3/4] bg-base-300 rounded flex-shrink-0 object-contain" />
          </div>
        `;
			}).join(' ');
		} else {
			equipHtml = '<span class="text-xs italic text-gray-500">Nothing Equipped</span>';
		}
		const equipStateKey = JSON.stringify(hero.equipment);
		updateHtmlIfChanged(equipmentContainer, equipHtml, equipStateKey);
		
		// Render Stats Container
		const statsContainer = card.querySelector('[data-stats-container]');
		if (statsContainer) {
			const statsStateKey = JSON.stringify(hero.stats) + hero.unspentStatPoints;
			if (statsContainer.getAttribute('data-prev-state') !== statsStateKey) {
				const makeStatRow = (label, key, tooltip) => `
					<div class="flex justify-between items-center bg-base-300 px-2 py-1 rounded">
						<span title="${tooltip}">${label}: ${hero.stats[key]}</span>
						${hero.unspentStatPoints > 0 ? `<button class="btn btn-xs btn-ghost text-success px-1 min-h-0 h-5" data-add-stat="${key}" data-hero-id="${hero.id}">+</button>` : ''}
					</div>
				`;
				
				let statsHtml = `
					${makeStatRow('STR', 'str', 'Strength: Boosts Melee Damage')}
					${makeStatRow('AGI', 'agi', 'Agility: Boosts Ranged Damage')}
					${makeStatRow('INT', 'int', 'Intelligence: Boosts Magic Damage & Max MP')}
					${makeStatRow('END', 'end', 'Endurance: Boosts Max HP')}
					${makeStatRow('SPR', 'spr', 'Spirit: Boosts Healing & Regen')}
				`;
				
				if (hero.unspentStatPoints > 0) {
					statsHtml += `<div class="col-span-2 text-center text-warning font-bold mt-1">Unspent Points: ${hero.unspentStatPoints}</div>`;
				}
				
				statsContainer.innerHTML = statsHtml;
				statsContainer.setAttribute('data-prev-state', statsStateKey);
			}
		}
		
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
		} else if (hero.casting) {
			const skillName = gameData.skills.find(s => s.id === hero.casting.skillId)?.name || 'a skill';
			statusHtml = `<span class="text-warning">Casting ${skillName}...</span>`;
			statusStateKey = `casting-${hero.casting.skillId}-${hero.casting.castEndTime}`;
		} else if (hero.location !== 'field') {
			const building = gameState.city.buildings.find(b => b.id === hero.location);
			const buildingName = building ? building.name : `Building #${hero.location}`;
			statusHtml = `<span class="text-info">Resting in ${buildingName}.</span>`;
			statusStateKey = `resting-${hero.location}`;
		} else if (!hero.carId) {
			statusHtml = `<span class="text-warning">Waiting for an available car...</span>`;
			statusStateKey = 'no-car';
		} else if (hero.targetMonsterId) {
			const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
			if (monster) {
				statusHtml = `<span class="text-error">Fighting ${monster.name}!</span>`;
				statusStateKey = `fighting-${monster.id}`;
			} else {
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
	});
};

export function renderSkillsPanel (alpha = 0) {
	const container = getEl('skills-panel-container');
	if (!container) return;
	
	if (!container.querySelector('#skills-panel-list')) {
		container.innerHTML = `
            <div class="card bg-base-200 shadow-md p-4">
                <h3 class="font-bold text-lg mb-2">Party Skills</h3>
                <div id="skills-panel-list" class="flex flex-col gap-1"></div>
            </div>
        `;
	}
	const listContainer = getEl('skills-panel-list');
	if (!listContainer) return;
	
	const activeSkillRowIds = new Set();
	
	gameState.heroes.forEach(hero => {
		const learnedSkills = hero.skills
			.map(hs => gameData.skills.find(s => s.id === hs.id))
			.filter(Boolean);
		
		const isHeroCasting = !!hero.casting;
		
		learnedSkills.forEach(skillData => {
			const skillRowDomId = `skill-row-${hero.id}-${skillData.id}`;
			activeSkillRowIds.add(skillRowDomId);
			
			let skillRowEl = getEl(skillRowDomId);
			
			if (!skillRowEl) {
				const div = document.createElement('div');
				div.id = skillRowDomId;
				div.innerHTML = `
					<div class="flex items-center justify-between p-2 bg-base-100 rounded gap-4">
						<div class="w-20 font-bold text-primary truncate" title="${hero.name}">${hero.name}</div>
						<div class="flex-grow flex items-center gap-2 min-w-0">
							<div class="flex-grow truncate" title="${skillData.description}">
								<span class="font-bold text-sm">${skillData.name}</span>
								<span class="text-gray-400 italic text-xs ml-2">${skillData.description}</span>
							</div>
							<div data-autocast-container class="flex-shrink-0 w-24 flex justify-end"></div>
						</div>
						<div data-cast-container class="flex-shrink-0" style="width: 360px;"></div>
					</div>
				`;
				listContainer.appendChild(div);
				skillRowEl = div;
			}
			
			const isAutoCasting = hero.autoCastSkillId === skillData.id;
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
				autoButtonHtml = `<button class="btn btn-xs ${isAutoCasting ? 'btn-primary' : 'btn-neutral'}" data-autocast-skill-id="${skillData.id}" data-hero-id="${hero.id}">Auto</button>`;
			} else if (unlockLevel) {
				autoButtonHtml = `<div class="tooltip" data-tip="Unlocks at Lvl ${unlockLevel}"><button class="btn btn-xs btn-neutral" disabled>Auto</button></div>`;
			}
			
			const autoCastContainer = skillRowEl.querySelector('[data-autocast-container]');
			const autoCastStateKey = `${isAutoCasting}-${canAutoCast}`;
			updateHtmlIfChanged(autoCastContainer, autoButtonHtml, autoCastStateKey);
			
			const castContainer = skillRowEl.querySelector('[data-cast-container]');
			
			const isCastingThisSkill = hero.casting && hero.casting.skillId === skillData.id;
			const cooldownEndTime = hero.skillCooldowns[skillData.id] || 0;
			const isOnCooldown = gameState.time < cooldownEndTime;
			
			const meetsLevelReq = !skillData.levelRequirement || hero.level >= skillData.levelRequirement;
			const mpCost = skillData.mpCost || 0;
			const rageCost = skillData.rageCost || 0;
			
			// INFER ACTION TYPE FROM JSON DATA
			let actionType = skillData.actionType;
			if (!actionType) {
				if (skillData.class === 'Healing') actionType = 'heal';
				else if (skillData.class === 'Tanking' && skillData.name.includes('Taunt')) actionType = 'taunt';
				else if (skillData.damage) actionType = 'attack';
			}
			
			let hasResources;
			if (hero.class === 'Vanguard') {
				if (actionType === 'taunt') {
					hasResources = hero.rage && hero.rage.current >= rageCost;
				} else {
					hasResources = true;
				}
			} else {
				hasResources = hero.mp && hero.mp.current >= mpCost;
			}
			
			let canUseInCurrentState = true;
			if (actionType === 'attack' || actionType === 'taunt') {
				canUseInCurrentState = !!hero.targetMonsterId;
			}
			
			const shouldFlash = hero.skillFlash && hero.skillFlash.id === skillData.id && gameState.time < hero.skillFlash.clearAtTime;
			const costText = rageCost > 0 ? `${rageCost} Rage` : (mpCost > 0 ? `${mpCost} MP` : '');
			
			if (actionType === 'heal') {
				if (!castContainer.querySelector('.btn-group-wrapper')) {
					const buttonHtml = gameState.heroes.map(targetHero => {
						const buttonContent = `<span class="relative">${targetHero.name.substring(0, 3)} ${costText ? `(${costText})` : ''}</span>`;
						return `<button class="btn btn-sm border border-base-300 hover:border-base-content" data-skill-id="${skillData.id}" data-hero-id="${hero.id}" data-target-hero-id="${targetHero.id}">${buttonContent}</button>`;
					}).join('');
					castContainer.innerHTML = `<div class="btn-group-wrapper flex items-center gap-1 justify-end">${buttonHtml}</div>`;
				}
				
				const currentTargetId = hero.skillTargets[skillData.id] || hero.id;
				const buttons = castContainer.querySelectorAll('button');
				buttons.forEach((button, index) => {
					const targetHero = gameState.heroes[index];
					if (!targetHero) return;
					
					const isActive = currentTargetId === targetHero.id;
					const wasButtonPressed = shouldFlash && hero.skillFlash.targetHeroId === targetHero.id;
					
					let progressPercent = 0;
					let inProgress = false;
					
					if (isCastingThisSkill) {
						const castTime = skillData.castTime;
						const castEndTime = hero.casting.castEndTime;
						const remainingCastTime = castEndTime - gameState.time;
						const smoothRemaining = Math.max(0, remainingCastTime - alpha);
						const elapsedSmooth = castTime - smoothRemaining;
						progressPercent = (elapsedSmooth / castTime) * 100;
						inProgress = true;
					} else if (isOnCooldown) {
						const remainingCd = cooldownEndTime - gameState.time;
						const smoothRemaining = Math.max(0, remainingCd - alpha);
						progressPercent = (smoothRemaining / skillData.cooldown) * 100;
						inProgress = true;
					}
					
					button.disabled = isHeroCasting || isOnCooldown || !meetsLevelReq || !hasResources || !canUseInCurrentState;
					button.style.width = '110px';
					button.style.setProperty('--cooldown-percent', `${progressPercent}%`);
					button.classList.toggle('btn-secondary', isActive && !inProgress);
					button.classList.toggle('btn-neutral', !isActive || inProgress);
					button.classList.toggle('cooldown-progress', inProgress);
					button.classList.toggle('flash-effect', wasButtonPressed);
				});
			} else {
				if (!castContainer.querySelector('button')) {
					const buttonContent = `<span class="relative">Cast ${costText ? `(${costText})` : ''}</span>`;
					castContainer.innerHTML = `<button class="btn btn-sm btn-neutral w-full border border-base-300 hover:border-base-content" data-skill-id="${skillData.id}" data-hero-id="${hero.id}">${buttonContent}</button>`;
				}
				
				const button = castContainer.querySelector('button');
				let progressPercent = 0;
				let inProgress = false;
				
				if (isCastingThisSkill) {
					const castTime = skillData.castTime;
					const castEndTime = hero.casting.castEndTime;
					const remainingCastTime = castEndTime - gameState.time;
					const smoothRemaining = Math.max(0, remainingCastTime - alpha);
					const elapsedSmooth = castTime - smoothRemaining;
					progressPercent = (elapsedSmooth / castTime) * 100;
					inProgress = true;
				} else if (isOnCooldown) {
					const remainingCd = cooldownEndTime - gameState.time;
					const smoothRemaining = Math.max(0, remainingCd - alpha);
					progressPercent = (smoothRemaining / skillData.cooldown) * 100;
					inProgress = true;
				}
				
				button.disabled = isHeroCasting || isOnCooldown || !meetsLevelReq || !hasResources || !canUseInCurrentState;
				button.style.setProperty('--cooldown-percent', `${progressPercent}%`);
				button.classList.toggle('cooldown-progress', inProgress);
				button.classList.toggle('flash-effect', shouldFlash);
			}
		});
	});
	
	listContainer.querySelectorAll('div[id^="skill-row-"]').forEach(row => {
		if (!activeSkillRowIds.has(row.id)) {
			row.remove();
		}
	});
};
