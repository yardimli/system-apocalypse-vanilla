import { gameState, gameData } from './state.js';
import { addToLog, parseRange } from './utils.js';

export function handleCombatAction(heroId, skillId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	const isOnCooldown = (hero.skillCooldowns[skillId] || 0) > gameState.time;
	if (!hero || !skill || !hero.targetMonsterId || (skill.levelRequirement && hero.level < skill.levelRequirement) || isOnCooldown) return;
	
	const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
	if (!monster) return;
	
	let success = false;
	
	const mpCost = skill.mpCost || 0;
	if (hero.class !== 'Vanguard' && hero.mp.current < mpCost) {
		return;
	}
	
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
						addToLog(`${hero.name} uses ${skill.name} with Rage!`, hero.id);
					} else {
						finalDamage = Math.ceil(finalDamage / 2);
						finalAgroMultiplier /= 4;
						addToLog(`${hero.name} uses ${skill.name} without enough Rage, with reduced effect.`, hero.id);
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
			
			// NEW: Apply damage bonus from car upgrades if the hero is in a car.
			const car = hero.carId ? gameState.city.cars.find(c => c.id === hero.carId) : null;
			if (car) {
				const damageBonus = car.upgrades
					.map(upgId => gameData.car_upgrades.find(u => u.id === upgId))
					.filter(upg => upg && upg.effect.type === 'increase_occupant_damage_bonus')
					.reduce((sum, upg) => sum + upg.effect.value, 0);
				
				if (damageBonus > 0) {
					const bonusDamage = Math.ceil(damageDealt * damageBonus);
					damageDealt += bonusDamage;
					addToLog(`${hero.name}'s car provided a ${Math.round(damageBonus * 100)}% damage bonus!`, hero.id);
				}
			}
			
			monster.currentHp -= damageDealt;
			monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroGenerated;
			
			if (skill.rageGen) {
				hero.rage.current = Math.min(hero.rage.max, hero.rage.current + skill.rageGen);
			}
			
			addToLog(`${hero.name} deals ${damageDealt} damage to ${monster.name} (#${monster.id}).`, hero.id);
			success = true;
			break;
		}
		case 'taunt': {
			let agroAmount = skill.value || 0;
			
			if (hero.class === 'Vanguard') {
				if (hasEnoughRage) {
					hero.rage.current -= rageCost;
					addToLog(`${hero.name} uses ${skill.name} with Rage for a massive threat boost!`, hero.id);
				} else {
					agroAmount = Math.ceil(agroAmount / 10);
					addToLog(`${hero.name} uses ${skill.name} without enough Rage, generating minimal threat.`, hero.id);
				}
			}
			
			monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroAmount;
			success = true;
			break;
		}
	}
	
	if (success) {
		if (hero.class !== 'Vanguard') {
			hero.mp.current -= mpCost;
		}
		
		hero.skillCooldowns[skillId] = gameState.time + skill.cooldown;
		hero.skillFlash = { id: skillId, clearAtTime: gameState.time + 1 };
	}
}
