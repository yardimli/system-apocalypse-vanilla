import { gameState, gameData } from './state.js';
import { addToLog, updateTextIfChanged, updateHtmlIfChanged, updateProgressIfChanged } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

// NEW: Helper to get image URL, adapted from shop.js for reuse here.
function getImageUrl (entity) {
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
	return entity?.image || '/images/placeholder.png'; // Fallback for entities without card_images
}

/**
 * Recalculates derived stats (Max HP, MP, Stamina, Rage, and Regen rates) based on a hero's core stats.
 * @param {object} hero - The hero object to update.
 */
export function recalculateHeroStats(hero) {
	// MODIFIED: Store old max values to correctly add to current resources on level up/stat increase.
	const oldMaxHp = hero.hp.max;
	const oldMaxMp = hero.mp.max;
	const oldMaxStamina = hero.stamina.max;
	
	// --- STAT FORMULAS ---
	// HP: Base 100, +10 per level, +10 per END point.
	hero.hp.max = 100 + (hero.level * 10) + (hero.stats.end * 10);
	
	// MP: Base 50, +5 per level, +5 per INT point.
	hero.mp.max = 50 + (hero.level * 5) + (hero.stats.int * 5);
	
	// Stamina: Base 100, +5 per AGI, +3 per END.
	hero.stamina.max = 100 + (hero.stats.agi * 5) + (hero.stats.end * 3);
	
	// Rage: Base 100, +2 per STR.
	hero.rage.max = 100 + (hero.stats.str * 2);
	
	// HP Regen: Base 1.0/s, +0.1 per SPR point.
	hero.hpRegen = 1.0 + (hero.stats.spr * 0.1);
	
	// MP Regen: Base 1.0/s, +0.1 per SPR point.
	hero.mpRegen = 1.0 + (hero.stats.spr * 0.1);
	
	// Stamina Regen: Base 2.0/s, +0.2 per AGI point.
	hero.staminaRegen = 2.0 + (hero.stats.agi * 0.2);
	
	// Add the difference to current resources so leveling up/adding stats heals for the gained amount.
	if (hero.hp.max > oldMaxHp) hero.hp.current += (hero.hp.max - oldMaxHp);
	if (hero.mp.max > oldMaxMp) hero.mp.current += (hero.mp.max - oldMaxMp);
	if (hero.stamina.max > oldMaxStamina) hero.stamina.current += (hero.stamina.max - oldMaxStamina);
}

// MODIFICATION START: The autoEquipBestGear function has been completely rewritten again.
// This version fixes the dual-wielding bug and the tank un-equipping bug by using a more robust method
// for determining which weapons a hero can use and by correctly checking inventory counts.
export function autoEquipBestGear (hero) {
	// 1. Derive the hero's true allowed weapon types by checking their learnable skills.
	// This corrects for data inconsistencies where `allowedWeaponTypes` might be too restrictive.
	const trueAllowedWeaponTypes = new Set(hero.allowedWeaponTypes);
	hero.skillClasses.forEach(sc => {
		gameData.skills.forEach(skill => {
			if (skill.skillClass === sc && skill.requiredWeaponType) {
				trueAllowedWeaponTypes.add(skill.requiredWeaponType);
			}
		});
	});
	
	// 2. Get a list of all equippable items for the hero from their inventory and current gear.
	const availableItemIds = new Set(Object.keys(hero.inventory).filter(id => hero.inventory[id] > 0));
	Object.values(hero.equipment).forEach(itemId => {
		if (itemId) availableItemIds.add(itemId);
	});
	
	const equippableItems = [...availableItemIds]
		.map(itemId => gameData.items.find(i => i.id === itemId))
		.filter(item => {
			if (!item || !item.equipSlot) return false;
			// Use the derived `trueAllowedWeaponTypes` for the check.
			if ((item.type === 'Weapon' || item.type === 'Shield') && item.requiredWeaponType && !trueAllowedWeaponTypes.has(item.requiredWeaponType)) return false;
			if (item.type === 'Armor' && item.armorType && !hero.allowedArmorTypes.includes(item.armorType)) return false;
			if (item.class && !(Array.isArray(item.class) ? item.class.includes(hero.class) : item.class === hero.class)) return false;
			if (item.magicUserOnly && !hero.isMagicUser) return false;
			return true;
		});
	
	// 3. Separate items by slot and sort by level (best first).
	const itemsBySlot = {
		mainHand: equippableItems.filter(i => i.equipSlot === 'mainHand').sort((a, b) => b.level - a.level),
		offHand: equippableItems.filter(i => i.equipSlot === 'offHand').sort((a, b) => b.level - a.level),
		body: equippableItems.filter(i => i.equipSlot === 'body').sort((a, b) => b.level - a.level)
	};
	
	const oldEquipment = { ...hero.equipment };
	const newEquipment = { mainHand: null, offHand: null, body: null };
	
	// 4. Determine best body armor.
	if (itemsBySlot.body.length > 0) {
		newEquipment.body = itemsBySlot.body[0].id;
	}
	
	// 5. Determine best weapon combination.
	const bestMainHand = itemsBySlot.mainHand.length > 0 ? itemsBySlot.mainHand[0] : null;
	
	if (bestMainHand) {
		newEquipment.mainHand = bestMainHand.id;
		// A weapon is considered two-handed if it's a Bow. This could be a flag in item data later.
		const isTwoHanded = bestMainHand.requiredWeaponType === 'Bow';
		
		if (!isTwoHanded) {
			// For one-handed weapons, find the best possible off-hand.
			// The pool includes dedicated off-hands (shields) and other one-handed main-hand weapons.
			const potentialOffHands = [
				...itemsBySlot.offHand,
				...itemsBySlot.mainHand.filter(i => i.requiredWeaponType !== 'Bow') // Filter to 1H weapons
			].sort((a, b) => b.level - a.level);
			
			// Find the best valid off-hand from the sorted pool.
			for (const candidate of potentialOffHands) {
				if (candidate.id !== newEquipment.mainHand) {
					// If the best candidate is a *different* item, we can equip it.
					newEquipment.offHand = candidate.id;
					break;
				} else {
					// If the best candidate is the *same* item, we must check if the hero has a second one.
					// This check now correctly uses the total inventory count.
					if (hero.inventory[candidate.id] >= 2) {
						newEquipment.offHand = candidate.id;
						break;
					}
					// If not, we continue the loop to find the next-best (different) item.
				}
			}
		}
	} else if (itemsBySlot.offHand.length > 0) {
		// If no main-hand is available, the hero can still equip a shield.
		newEquipment.offHand = itemsBySlot.offHand[0].id;
	}
	
	// 6. Compare new and old equipment, log changes, and apply the new set.
	for (const slot of ['mainHand', 'offHand', 'body']) {
		if (newEquipment[slot] !== oldEquipment[slot]) {
			const newItem = newEquipment[slot] ? gameData.items.find(i => i.id === newEquipment[slot]) : null;
			const oldItem = oldEquipment[slot] ? gameData.items.find(i => i.id === oldEquipment[slot]) : null;
			
			if (newItem && oldItem) {
				addToLog(`upgraded ${slot}: ${oldItem.name} -> ${newItem.name}.`, hero.id);
			} else if (newItem) {
				addToLog(`equipped ${newItem.name} (${slot}).`, hero.id);
			} else if (oldItem) {
				addToLog(`unequipped ${oldItem.name} (${slot}).`, hero.id);
			}
		}
	}
	hero.equipment = newEquipment;
};
// MODIFICATION END

function findEntityById (id) {
	if (!id) return null;
	return gameData.items.find(i => i.id === id);
}

export function renderHeroes (alpha = 0) {
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
			const isHealingTarget = gameState.party.healingTargetId === hero.id;
			classEl.classList.toggle('border-2', isHealingTarget);
			classEl.classList.toggle('border-info', isHealingTarget);
			classEl.classList.toggle('cursor-pointer', true); // Always show as clickable
			if (classEl.dataset.heroId !== String(hero.id)) {
				classEl.dataset.heroId = hero.id;
			}
		}
		
		const equipmentContainer = card.querySelector('[data-equipment-container]');
		// MODIFICATION START: Define a specific order for displaying equipment slots
		// to ensure a consistent layout (mainHand, offHand, body).
		const slotOrder = ['mainHand', 'offHand', 'body'];
		const equippedItems = slotOrder
			.map(slot => ({ slot, itemId: hero.equipment[slot] }))
			.map(({ slot, itemId }) => ({ slot, item: findEntityById(itemId) }))
			.filter(e => e.item);
		// MODIFICATION END
		
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
		
		const staminaContainer = card.querySelector('[data-stamina-container]');
		const canUseStamina = hero.skillClasses.some(sc => ['OneHandBlade', 'Ranged', 'TwoHanded'].includes(sc));
		if (canUseStamina) {
			staminaContainer.style.display = 'flex';
			const staminaText = `Stamina: ${Math.floor(hero.stamina.current)}/${hero.stamina.max} (+${formatRegen(hero.staminaRegen)}/s)`;
			updateTextIfChanged(card.querySelector('[data-stamina-label]'), staminaText);
			updateProgressIfChanged(card.querySelector('[data-stamina-bar]'), hero.stamina.current, hero.stamina.max);
		} else {
			staminaContainer.style.display = 'none';
		}
		
		const mpContainer = card.querySelector('[data-mp-container]');
		const canUseMp = hero.skillClasses.some(sc => ['Healing', 'CrowdControl', 'DpsFire', 'DpsFrost', 'DpsElec', 'DpsArcane'].includes(sc));
		if (canUseMp) {
			mpContainer.style.display = 'flex';
			const mpText = `MP: ${Math.floor(hero.mp.current)}/${hero.mp.max} (+${formatRegen(hero.mpRegen)}/s)`;
			updateTextIfChanged(card.querySelector('[data-mp-label]'), mpText);
			updateProgressIfChanged(card.querySelector('[data-mp-bar]'), hero.mp.current, hero.mp.max);
		} else {
			mpContainer.style.display = 'none';
		}
		
		const rageContainer = card.querySelector('[data-rage-container]');
		const canUseRage = hero.skillClasses.includes('Tanking');
		if (canUseRage) {
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
		
		const skillsContainer = card.querySelector('[data-skills-container]');
		if (skillsContainer) {
			const learnedSkills = hero.skills
				.map(hs => gameData.skills.find(s => s.id === hs.id))
				.filter(Boolean);
			
			const activeSkillIds = new Set(learnedSkills.map(s => s.id));
			
			learnedSkills.forEach(skillData => {
				const skillCardId = `skill-card-${hero.id}-${skillData.id}`;
				let skillCard = getEl(skillCardId);
				
				const isCastingThisSkill = hero.casting && hero.casting.skillId === skillData.id;
				const cooldownEndTime = hero.skillCooldowns[skillData.id] || 0;
				const isOnCooldown = gameState.time < cooldownEndTime;
				const isHeroCasting = !!hero.casting;
				const meetsLevelReq = !skillData.levelRequirement || hero.level >= skillData.levelRequirement;
				const mpCost = skillData.mpCost || 0;
				const rageCost = skillData.rageCost || 0;
				const staminaCost = skillData.staminaCost || 0;
				const hasResources = hero.mp.current >= mpCost && hero.stamina.current >= staminaCost && hero.rage.current >= rageCost;
				const isDisabled = isHeroCasting || isOnCooldown || !meetsLevelReq || !hasResources;
				const isAutoCasting = hero.autoCastSkillId === skillData.id;
				const canAutoCast = skillData.autoCastUnlockLevel && hero.level >= skillData.autoCastUnlockLevel;
				const shouldFlash = hero.skillFlash && hero.skillFlash.id === skillData.id && gameState.time < hero.skillFlash.clearAtTime;
				
				if (!skillCard) {
					const imageUrl = getImageUrl(skillData);
					const newCardHtml = `
						<div
							id="${skillCardId}"
							class="relative w-[100px] text-center"
							data-cast-skill-id="${skillData.id}"
							data-hero-id="${hero.id}"
							title="${skillData.name}: ${skillData.description}"
						>
							<div class="relative rounded-lg overflow-hidden border-2 border-base-100">
								<img src="${imageUrl}" alt="${skillData.name}" class="w-full aspect-[3/4] object-cover bg-base-300">
								<div class="absolute top-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate font-bold">${skillData.name}</div>
								<div data-cooldown-overlay></div>
							</div>
							${canAutoCast ? `
							<div class="absolute bottom-1 left-1">
								<input type="checkbox" class="checkbox checkbox-xs checkbox-primary"
									   data-autocast-skill-id="${skillData.id}"
									   data-hero-id="${hero.id}"
									   title="Toggle Auto-Cast"
								/>
							</div>
							` : ''}
						</div>
					`;
					skillsContainer.insertAdjacentHTML('beforeend', newCardHtml);
					skillCard = getEl(skillCardId);
				}
				
				if (skillCard.hasAttribute('disabled') !== isDisabled) {
					isDisabled ? skillCard.setAttribute('disabled', '') : skillCard.removeAttribute('disabled');
				}
				const imageContainer = skillCard.querySelector('.relative.rounded-lg');
				if (imageContainer) {
					imageContainer.classList.toggle('cursor-not-allowed', isDisabled);
					imageContainer.classList.toggle('grayscale', isDisabled);
					imageContainer.classList.toggle('cursor-pointer', !isDisabled);
				}
				
				skillCard.classList.toggle('flash-effect', shouldFlash);
				
				const overlay = skillCard.querySelector('[data-cooldown-overlay]');
				if (overlay) {
					let overlayHeightPercent = 0;
					if (isCastingThisSkill) {
						const castTime = skillData.castTime;
						const castEndTime = hero.casting.castEndTime;
						const remainingCastTime = castEndTime - gameState.time;
						const smoothRemaining = Math.max(0, remainingCastTime - alpha);
						const elapsed = castTime - smoothRemaining;
						overlayHeightPercent = (elapsed / castTime) * 100;
					} else if (isOnCooldown) {
						const remainingCd = cooldownEndTime - gameState.time;
						const smoothRemaining = Math.max(0, remainingCd - alpha);
						overlayHeightPercent = (smoothRemaining / skillData.cooldown) * 100;
					}
					
					const targetHeight = `${overlayHeightPercent.toFixed(2)}%`;
					if (overlay.style.height !== targetHeight) {
						overlay.style.height = targetHeight;
					}
					
					const targetColor = isCastingThisSkill ? 'rgba(0,255,0,0.5)' : 'rgba(255,0,0,0.5)';
					if (overlay.style.backgroundColor !== targetColor) {
						overlay.style.backgroundColor = targetColor;
					}
				}
				
				const checkbox = skillCard.querySelector('[data-autocast-skill-id]');
				if (checkbox && checkbox.checked !== isAutoCasting) {
					checkbox.checked = isAutoCasting;
				}
			});
			
			for (const child of skillsContainer.children) {
				const skillId = child.id.split('-').pop();
				if (!activeSkillIds.has(skillId)) {
					child.remove();
				}
			}
		}
	});
};
