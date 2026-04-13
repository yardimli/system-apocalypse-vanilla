import { gameState, gameData } from './state.js';
import { addToLog, parseRange } from './utils.js';
import { recalculateHeroStats } from './heroes.js';

export function executeCombatEffect (hero, skill, monster) {
	if (!monster || monster.currentHp <= 0) return;
	
	let success = false;
	const rageCost = skill.rageCost || 0;
	const hasEnoughRage = hero.rage && hero.rage.current >= rageCost;
	
	// INFER ACTION TYPE
	let actionType = skill.actionType;
	if (!actionType) {
		if (skill.class === 'Tanking' && skill.name.includes('Taunt')) actionType = 'taunt';
		else if (skill.damage) actionType = 'attack';
	}
	
	switch (actionType) {
		case 'attack': {
			const levelBoost = 1 + (hero.level * 0.1);
			let statMultiplier = 1;
			if (hero.class === 'Vanguard') {
				statMultiplier = 1 + (hero.stats.str * 0.02);
			} else if (hero.class === 'Striker') {
				statMultiplier = 1 + (hero.stats.agi * 0.02);
			} else {
				statMultiplier = 1 + (hero.stats.int * 0.02);
			}
			
			const totalBoost = levelBoost * statMultiplier;
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
				
				damageDealt = Math.ceil(finalDamage * totalBoost);
				agroGenerated = damageDealt * finalAgroMultiplier;
			} else {
				const wand = gameData.items.find(i => i.id === hero.equipment.mainHand);
				const spellPower = wand && wand.spellPower ? wand.spellPower : 1;
				const baseDamage = parseRange(skill.damage);
				damageDealt = Math.ceil((baseDamage * spellPower) * totalBoost);
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

export function startCombatAction (heroId, skillId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	const isOnCooldown = (hero.skillCooldowns[skillId] || 0) > gameState.time;
	if (!hero || !skill || hero.casting || !hero.targetMonsterId || (skill.levelRequirement && hero.level < skill.levelRequirement) || isOnCooldown) return;
	
	const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
	if (!monster) return;
	
	const mpCost = skill.mpCost || 0;
	const rageCost = skill.rageCost || 0;
	
	// INFER ACTION TYPE
	let actionType = skill.actionType;
	if (!actionType) {
		if (skill.class === 'Tanking' && skill.name.includes('Taunt')) actionType = 'taunt';
		else if (skill.damage) actionType = 'attack';
	}
	
	if (hero.class === 'Vanguard') {
		if (actionType === 'taunt' && (!hero.rage || hero.rage.current < rageCost)) {
			return;
		}
	} else {
		if (hero.mp.current < mpCost) {
			return;
		}
	}
	
	if (skill.castTime === 0) {
		executeCombatEffect(hero, skill, monster);
	} else {
		hero.casting = {
			skillId: skill.id,
			castEndTime: gameState.time + skill.castTime,
			options: {}
		};
		addToLog(`begins casting ${skill.name}.`, hero.id);
	}
}

export function executeAegisEffect (hero, skill, options = {}) {
	let success = false;
	const levelBoost = 1 + (hero.level * 0.1);
	
	const statMultiplier = 1 + (hero.stats.spr * 0.02);
	const totalBoost = levelBoost * statMultiplier;
	
	// INFER ACTION TYPE
	let actionType = skill.actionType;
	if (!actionType && skill.class === 'Healing') actionType = 'heal';
	
	switch (actionType) {
		case 'heal':
			const targetHero = gameState.heroes.find(h => h.id === options.targetHeroId);
			if (targetHero && targetHero.hp.current < targetHero.hp.max) {
				const wasIncapacitated = targetHero.hp.current <= 0;
				
				const wand = gameData.items.find(i => i.id === hero.equipment.mainHand);
				const spellPower = wand && wand.spellPower ? wand.spellPower : 1;
				
				const baseHealAmount = skill.id.includes('III') ? 500 : skill.id.includes('II') ? 250 : 100;
				const healAmount = Math.ceil((baseHealAmount * spellPower) * totalBoost);
				
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
			hero.unspentStatPoints += 3;
			recalculateHeroStats(hero);
			addToLog(`reached Level ${hero.level}! Gained 3 Stat Points.`, hero.id);
		}
	}
}

export function startAegisAction (heroId, skillId, options = {}) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	const isOnCooldown = (hero.skillCooldowns[skillId] || 0) > gameState.time;
	if (!hero || !skill || hero.casting || hero.mp.current < skill.mpCost || (skill.levelRequirement && hero.level < skill.levelRequirement) || isOnCooldown) return;
	
	// INFER ACTION TYPE
	let actionType = skill.actionType;
	if (!actionType && skill.class === 'Healing') actionType = 'heal';
	
	if (actionType === 'heal') {
		const targetHero = gameState.heroes.find(h => h.id === options.targetHeroId);
		if (!targetHero || targetHero.hp.current >= targetHero.hp.max) {
			if (targetHero) addToLog(`cannot heal ${targetHero.name}, they are already at full health.`, hero.id);
			return;
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
