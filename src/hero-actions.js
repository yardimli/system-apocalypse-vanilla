import { gameState, gameData } from './state.js';
import { addToLog, parseRange } from './utils.js';

/**
 * Executes the effect of a combat skill after its cast time is complete.
 * This function handles damage, resource consumption, cooldowns, and visual feedback.
 * @param {object} hero - The hero object performing the action.
 * @param {object} skill - The skill data object.
 * @param {object} monster - The target monster object.
 */
export function executeCombatEffect (hero, skill, monster) {
	if (!monster || monster.currentHp <= 0) return; // Stop if monster is already dead
	
	let success = false;
	const rageCost = skill.rageCost || 0;
	const hasEnoughRage = hero.rage && hero.rage.current >= rageCost;
	
	switch (skill.actionType) {
		case 'attack': {
			const levelBoost = 1 + (hero.level * 0.1);
			let damageDealt;
			let agroGenerated;
			
			if (hero.class === 'Vanguard') {
				const baseDamage = skill.damage ? parseRange(skill.damage) : parseRange('1-2');
				let finalDamage = baseDamage;
				let finalAgroMultiplier = skill.agroMultiplier || 1.0;
				
				if (rageCost > 0) {
					if (hasEnoughRage) {
						hero.rage.current -= rageCost;
						addToLog(`unleashes ${skill.name} with Rage!`, hero.id);
					} else {
						finalDamage = Math.ceil(finalDamage / 2);
						finalAgroMultiplier /= 4;
						addToLog(`uses ${skill.name} without enough Rage, with reduced effect.`, hero.id);
					}
				}
				
				damageDealt = Math.ceil(finalDamage * levelBoost);
				agroGenerated = damageDealt * finalAgroMultiplier;
			} else {
				const wand = gameData.items.find(i => i.id === hero.equipment.mainHand);
				const spellPower = wand && wand.spellPower ? wand.spellPower : 1;
				const baseDamage = parseRange(skill.damage);
				damageDealt = Math.ceil((baseDamage * spellPower) * levelBoost);
				agroGenerated = damageDealt * (skill.agroMultiplier || 1.0);
			}
			
			const car = hero.carId ? gameState.city.cars.find(c => c.id === hero.carId) : null;
			if (car) {
				const damageBonus = car.upgrades
					.map(upgId => gameData.car_upgrades.find(u => u.id === upgId))
					.filter(upg => upg && upg.effect.type === 'increase_occupant_damage_bonus')
					.reduce((sum, upg) => sum + upg.effect.value, 0);
				
				if (damageBonus > 0) {
					const bonusDamage = Math.ceil(damageDealt * damageBonus);
					damageDealt += bonusDamage;
					addToLog(`car provided a ${Math.round(damageBonus * 100)}% damage bonus!`, hero.id);
				}
			}
			
			monster.currentHp -= damageDealt;
			monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroGenerated;
			
			if (skill.rageGen) {
				hero.rage.current = Math.min(hero.rage.max, hero.rage.current + skill.rageGen);
			}
			
			addToLog(`deals ${damageDealt} damage to ${monster.name} (#${monster.id}).`, hero.id);
			success = true;
			break;
		}
		case 'taunt': {
			let agroAmount = skill.agroValue || 0;
			
			if (hero.class === 'Vanguard') {
				if (hasEnoughRage) {
					hero.rage.current -= rageCost;
					addToLog(`${skill.name} with Rage for a massive threat boost!`, hero.id);
				} else {
					agroAmount = Math.ceil(agroAmount / 10);
					addToLog(`uses ${skill.name} without enough Rage, generating minimal threat.`, hero.id);
				}
			}
			
			monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroAmount;
			success = true;
			break;
		}
	}
	
	if (success) {
		if (hero.class !== 'Vanguard') {
			hero.mp.current -= skill.mpCost || 0;
		}
		
		hero.skillCooldowns[skill.id] = gameState.time + skill.cooldown;
		hero.skillFlash = { id: skill.id, clearAtTime: gameState.time + 1 };
	}
}

/**
 * Initiates a combat action, checking for cast time.
 * If the skill is instant, its effect is executed immediately.
 * If it has a cast time, the hero's 'casting' state is set.
 * @param {number} heroId - The ID of the hero performing the action.
 * @param {string} skillId - The ID of the skill being used.
 */
export function startCombatAction (heroId, skillId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	const isOnCooldown = (hero.skillCooldowns[skillId] || 0) > gameState.time;
	if (!hero || !skill || hero.casting || !hero.targetMonsterId || (skill.levelRequirement && hero.level < skill.levelRequirement) || isOnCooldown) return;
	
	const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
	if (!monster) return;
	
	const mpCost = skill.mpCost || 0;
	const rageCost = skill.rageCost || 0;
	
	if (hero.class === 'Vanguard') {
		if (skill.actionType === 'taunt' && (!hero.rage || hero.rage.current < rageCost)) {
			return; // Not enough rage for Challenge, so abort.
		}
	} else {
		// For other classes, check MP.
		if (hero.mp.current < mpCost) {
			return; // Not enough MP, so abort.
		}
	}
	
	// For instant-cast skills, execute the effect immediately.
	if (skill.castTime === 0) {
		executeCombatEffect(hero, skill, monster);
	} else {
		// For skills with a cast time, set the hero's casting state.
		hero.casting = {
			skillId: skill.id,
			castEndTime: gameState.time + skill.castTime,
			options: {} // Store any relevant options for when the cast completes
		};
		addToLog(`begins casting ${skill.name}.`, hero.id);
	}
}

/**
 * Executes the effect of an Aegis skill after its cast time is complete.
 * @param {object} hero - The hero object performing the action.
 * @param {object} skill - The skill data object.
 * @param {object} options - Options for the skill, e.g., { targetHeroId }.
 */
export function executeAegisEffect (hero, skill, options = {}) {
	let success = false;
	const levelBoost = 1 + (hero.level * 0.1);
	
	switch (skill.actionType) {
		case 'heal':
			const targetHero = gameState.heroes.find(h => h.id === options.targetHeroId);
			if (targetHero && targetHero.hp.current < targetHero.hp.max) {
				const wasIncapacitated = targetHero.hp.current <= 0;
				
				const wand = gameData.items.find(i => i.id === hero.equipment.mainHand);
				const spellPower = wand && wand.spellPower ? wand.spellPower : 1;
				
				const baseHealAmount = skill.id.includes('III') ? 500 : skill.id.includes('II') ? 250 : 100;
				const healAmount = Math.ceil((baseHealAmount * spellPower) * levelBoost);
				
				targetHero.hp.current = Math.min(targetHero.hp.max, targetHero.hp.current + healAmount);
				addToLog(`healed ${targetHero.name} for ${healAmount} HP.`, hero.id);
				success = true;
				
				if (wasIncapacitated && targetHero.hp.current > 0 && targetHero.location === 'field') {
					addToLog(`${targetHero.name} has recovered and is returning to their vehicle.`, targetHero.id);
					const ownedCar = gameState.city.cars.find(c => c.ownerId === targetHero.id);
					if (ownedCar) {
						targetHero.carId = ownedCar.id;
						if (gameState.activeMonsters.length > 0 && (targetHero.class === 'Striker' || targetHero.class === 'Vanguard')) {
							const targetMonster = gameState.activeMonsters[0];
							targetHero.targetMonsterId = targetMonster.id;
							addToLog(`${targetHero.name} has re-entered the fight, targeting ${targetMonster.name} (#${targetMonster.id})!`, targetHero.id);
						}
					}
				}
				
				if (targetHero.targetMonsterId) {
					const monster = gameState.activeMonsters.find(m => m.id === targetHero.targetMonsterId);
					if (monster) {
						const agroAmount = skill.agroValue || 0;
						monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroAmount;
						if (!monster.assignedTo.includes(hero.id)) {
							monster.assignedTo.push(hero.id);
						}
						hero.targetMonsterId = monster.id;
						addToLog(`drew the attention of ${monster.name} (#${monster.id}) by healing!`, hero.id);
					}
				}
			}
			break;
	}
	
	if (success) {
		hero.mp.current -= skill.mpCost;
		hero.xp.current += 25;
		
		hero.skillCooldowns[skill.id] = gameState.time + skill.cooldown;
		hero.skillFlash = { id: skill.id, clearAtTime: gameState.time + 1, targetHeroId: options.targetHeroId };
		
		if (hero.xp.current >= hero.xp.max) {
			hero.level++;
			hero.xp.current -= hero.xp.max;
			hero.xp.max = Math.ceil(hero.xp.max * 1.5);
			hero.hp.max += hero.hpMaxPerLevel;
			hero.mp.max += hero.mpMaxPerLevel;
			hero.hpRegen += hero.hpRegenPerLevel;
			hero.mpRegen += hero.mpRegenPerLevel;
			hero.hp.current = hero.hp.max;
			hero.mp.current = hero.mp.max;
			addToLog(`reached Level ${hero.level}! Stats increased.`, hero.id);
		}
	}
}

/**
 * Initiates an Aegis action, checking for cast time.
 * @param {number} heroId - The ID of the hero performing the action.
 * @param {string} skillId - The ID of the skill being used.
 * @param {object} options - Options for the skill, e.g., { targetHeroId }.
 */
export function startAegisAction (heroId, skillId, options = {}) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	const isOnCooldown = (hero.skillCooldowns[skillId] || 0) > gameState.time;
	if (!hero || !skill || hero.casting || hero.mp.current < skill.mpCost || (skill.levelRequirement && hero.level < skill.levelRequirement) || isOnCooldown) return;
	
	if (skill.actionType === 'heal') {
		const targetHero = gameState.heroes.find(h => h.id === options.targetHeroId);
		if (!targetHero || targetHero.hp.current >= targetHero.hp.max) {
			if (targetHero) addToLog(`cannot heal ${targetHero.name}, they are already at full health.`, hero.id);
			return; // Don't start cast if target is full health
		}
	}
	
	if (skill.castTime === 0) {
		executeAegisEffect(hero, skill, options);
	} else {
		hero.casting = {
			skillId: skill.id,
			castEndTime: gameState.time + skill.castTime,
			options: options
		};
		addToLog(`begins casting ${skill.name}.`, hero.id);
	}
}
