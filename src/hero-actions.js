import { gameState, gameData } from './state.js';
import { addToLog, parseRange } from './utils.js';
import { recalculateHeroStats } from './heroes.js';

// NEW: Unified function to execute any skill effect after casting is complete.
export function executeAction (hero, skill, options = {}) {
	let success = false;
	const monster = options.targetMonsterId ? gameState.activeMonsters.find(m => m.id === options.targetMonsterId) : null;
	
	// --- Determine Action Type from Skill Data ---
	let actionType = skill.actionType;
	if (!actionType) {
		if (skill.skillClass === 'Healing') actionType = 'heal';
		else if (skill.skillClass === 'Tanking' && skill.name.includes('Taunt')) actionType = 'taunt';
		else if (skill.damage) actionType = 'attack';
	}
	
	const levelBoost = 1 + (hero.level * 0.1);
	
	switch (actionType) {
		case 'attack': {
			if (!monster || monster.currentHp <= 0) return;
			
			// MODIFIED: Consume ammo for ranged attacks before dealing damage.
			if (skill.requiredWeaponType === 'Ranged') {
				const ammoId = 'AMMO001';
				if (hero.inventory[ammoId]) { // Check existence just in case, though startAction should have prevented this.
					hero.inventory[ammoId]--;
					if (hero.inventory[ammoId] === 0) {
						delete hero.inventory[ammoId];
					}
				}
			}
			
			// Determine which stat to use for damage calculation
			let statMultiplier = 1;
			// Prioritize stats based on skill types to support hybrid heroes
			if (skill.skillClass.includes('Dps') || skill.skillClass.includes('Control')) {
				statMultiplier = 1 + (hero.stats.int * 0.02);
			} else if (skill.skillClass.includes('Ranged')) {
				statMultiplier = 1 + (hero.stats.agi * 0.02);
			} else { // OneHand, TwoHanded, Tanking attacks
				statMultiplier = 1 + (hero.stats.str * 0.02);
			}
			
			const totalBoost = levelBoost * statMultiplier;
			let damageDealt;
			let agroGenerated;
			let calcDetails = '';
			
			const baseDamage = skill.damage ? parseRange(skill.damage) : parseRange('1-2');
			
			// Handle weapon-based vs. spell-based damage
			const weapon = gameData.items.find(i => i.id === hero.equipment.mainHand);
			const isSpell = skill.mpCost > 0;
			
			if (isSpell) {
				const spellPower = weapon && weapon.spellPower ? weapon.spellPower : 1;
				damageDealt = Math.ceil((baseDamage * spellPower) * totalBoost);
				calcDetails = `(Base: ${baseDamage}, SP: x${spellPower}, Boost: x${totalBoost.toFixed(2)})`;
			} else {
				damageDealt = Math.ceil(baseDamage * totalBoost);
				calcDetails = `(Base: ${baseDamage}, Boost: x${totalBoost.toFixed(2)})`;
			}
			
			// Car damage bonus
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
					calcDetails = calcDetails.replace(')', `, Car: +${Math.round(damageBonus * 100)}%)`);
				}
			}
			
			monster.currentHp -= damageDealt;
			monster.agro[hero.id] = (monster.agro[hero.id] || 0) + skill.agroValue;
			
			// Rage generation is a property of the skill
			if (skill.rageGen) {
				hero.rage.current = Math.min(hero.rage.max, hero.rage.current + skill.rageGen);
			}
			
			addToLog(`deals ${damageDealt} damage ${calcDetails} to ${monster.name} (#${monster.id}).`, hero.id);
			success = true;
			break;
		}
		
		case 'heal': {
			const targetHero = gameState.heroes.find(h => h.id === options.targetHeroId);
			if (targetHero && targetHero.hp.current < targetHero.hp.max) {
				const wasIncapacitated = targetHero.hp.current <= 0;
				
				const statMultiplier = 1 + (hero.stats.spr * 0.02);
				const totalBoost = levelBoost * statMultiplier;
				
				const weapon = gameData.items.find(i => i.id === hero.equipment.mainHand);
				const spellPower = weapon && weapon.spellPower ? weapon.spellPower : 1;
				
				const baseHealAmount = parseRange(skill.hpHealing) || 100;
				const healAmount = Math.ceil((baseHealAmount * spellPower) * totalBoost);
				
				targetHero.hp.current = Math.min(targetHero.hp.max, targetHero.hp.current + healAmount);
				
				const calcDetails = `(Base: ${baseHealAmount}, SP: x${spellPower}, Boost: x${totalBoost.toFixed(2)})`;
				addToLog(`healed ${targetHero.name} for ${healAmount} HP ${calcDetails}.`, hero.id);
				success = true;
				
				// Handle reviving an incapacitated hero
				if (wasIncapacitated && targetHero.hp.current > 0 && targetHero.location === 'field') {
					addToLog(`${targetHero.name} has recovered and is returning to their vehicle.`, targetHero.id);
					const ownedCar = gameState.city.cars.find(c => c.ownerId === targetHero.id);
					if (ownedCar) {
						targetHero.carId = ownedCar.id;
						
						// MODIFIED: Logic to re-engage the correct monster after revival.
						// A revived hero should rejoin the current fight if the party is in combat.
						if (gameState.party.missionState === 'in_combat' && gameState.party.pausedMission) {
							const paused = gameState.party.pausedMission;
							const monsterIdToTarget = paused.attackTargetId || paused.ambushMonsterId;
							
							if (monsterIdToTarget) {
								const targetMonster = gameState.activeMonsters.find(m => m.id === monsterIdToTarget);
								if (targetMonster) {
									targetHero.targetMonsterId = targetMonster.id;
									addToLog(`${targetHero.name} has re-entered the fight, targeting ${targetMonster.name} (#${targetMonster.id})!`, targetHero.id);
								}
							}
						}
						// END MODIFICATION
					}
				}
				
				// Generate threat if healing a hero who is in combat
				if (targetHero.targetMonsterId) {
					const monsterForAgro = gameState.activeMonsters.find(m => m.id === targetHero.targetMonsterId);
					if (monsterForAgro) {
						const agroAmount = skill.agroValue || 0;
						monsterForAgro.agro[hero.id] = (monsterForAgro.agro[hero.id] || 0) + agroAmount;
						if (!monsterForAgro.assignedTo.includes(hero.id)) {
							monsterForAgro.assignedTo.push(hero.id);
						}
						hero.targetMonsterId = monsterForAgro.id;
						addToLog(`drew the attention of ${monsterForAgro.id} by healing!`, hero.id);
					}
				}
				
				// MODIFIED: XP for healing logic has been changed.
				// Heals in combat grant XP when the monster is defeated.
				// Heals outside combat grant a small, reduced amount of XP immediately.
				const isOutOfCombat = !hero.targetMonsterId && !targetHero.targetMonsterId;
				
				if (isOutOfCombat) {
					const baseXp = 25;
					const reducedXp = Math.ceil(baseXp * 0.2); // 80% reduction
					hero.xp.current += reducedXp;
					addToLog(`gained ${reducedXp} XP for out-of-combat healing.`, hero.id);
					
					// Check for level up
					if (hero.xp.current >= hero.xp.max) {
						hero.level++;
						hero.xp.current -= hero.xp.max;
						hero.xp.max = Math.ceil(hero.xp.max * 1.5);
						hero.unspentStatPoints += 3;
						recalculateHeroStats(hero);
						addToLog(`reached Level ${hero.level}! Gained 3 Stat Points.`, hero.id);
					}
				}
			}
			break;
		}
		
		case 'taunt': {
			if (!monster || monster.currentHp <= 0) return;
			const agroAmount = skill.agroValue || 0;
			monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroAmount;
			addToLog(`unleashes ${skill.name} on ${monster.name}!`, hero.id);
			success = true;
			break;
		}
	}
	
	if (success) {
		// Deduct resource cost
		if (skill.mpCost) hero.mp.current -= skill.mpCost;
		if (skill.staminaCost) hero.stamina.current -= skill.staminaCost;
		if (skill.rageCost) hero.rage.current -= skill.rageCost;
		
		// Set cooldown and UI flash
		hero.skillCooldowns[skill.id] = gameState.time + skill.cooldown;
		hero.skillFlash = { id: skill.id, clearAtTime: gameState.time + 1, targetHeroId: options.targetHeroId };
	}
}

// NEW: Unified function to begin any skill cast.
export function startAction (heroId, skillId, options = {}) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	// --- Validation ---
	const isOnCooldown = (hero.skillCooldowns[skillId] || 0) > gameState.time;
	if (!hero || !skill || hero.casting || (skill.levelRequirement && hero.level < skill.levelRequirement) || isOnCooldown) return;
	
	// Resource Check
	const mpCost = skill.mpCost || 0;
	const staminaCost = skill.staminaCost || 0;
	const rageCost = skill.rageCost || 0;
	if (hero.mp.current < mpCost || hero.stamina.current < staminaCost || hero.rage.current < rageCost) {
		return;
	}
	
	// NEW: Ammo Check for Ranged Skills
	if (skill.requiredWeaponType === 'Ranged') {
		const ammoId = 'AMMO001'; // Assuming a single arrow type for now.
		if (!hero.inventory[ammoId] || hero.inventory[ammoId] <= 0) {
			return; // Silently fail if out of ammo.
		}
	}
	
	// Target and State Check
	let actionOptions = { ...options };
	let actionType = skill.actionType;
	if (!actionType) {
		if (skill.skillClass === 'Healing') actionType = 'heal';
		else if (skill.skillClass === 'Tanking' && skill.name.includes('Taunt')) actionType = 'taunt';
		else if (skill.damage) actionType = 'attack';
	}
	
	if (actionType === 'attack' || actionType === 'taunt') {
		if (!hero.targetMonsterId) return;
		const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
		if (!monster) return;
		actionOptions.targetMonsterId = monster.id;
	}
	
	if (actionType === 'heal') {
		const targetHero = gameState.heroes.find(h => h.id === options.targetHeroId);
		if (!targetHero || targetHero.hp.current >= targetHero.hp.max) {
			if (targetHero) addToLog(`cannot heal ${targetHero.name}, they are already at full health.`, hero.id);
			return;
		}
	}
	
	// --- Execution ---
	if (skill.castTime === 0) {
		executeAction(hero, skill, actionOptions);
	} else {
		hero.casting = {
			skillId: skill.id,
			castEndTime: gameState.time + skill.castTime,
			options: actionOptions
		};
		addToLog(`begins casting ${skill.name}.`, hero.id);
	}
}
