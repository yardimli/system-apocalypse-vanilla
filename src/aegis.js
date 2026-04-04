import {gameState, gameData} from './state.js';
import {addToLog} from './utils.js';

export function handleAegisAction(heroId, skillId, options = {}) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	const isOnCooldown = (hero.skillCooldowns[skillId] || 0) > gameState.time;
	if (!hero || !skill || hero.mp.current < skill.mpCost || (skill.levelRequirement && hero.level < skill.levelRequirement) || isOnCooldown) return;
	
	let success = false;
	
	const levelBoost = 1 + (hero.level * 0.1);
	
	switch (skill.actionType) {
		case 'heal':
			const targetHero = gameState.heroes.find(h => h.id === options.targetHeroId);
			const injured = targetHero || gameState.heroes.filter(h => h.hp.current < h.hp.max).sort((a, b) => a.hp.current - b.hp.current)[0];
			
			if (injured && injured.hp.current <= 0 && injured.location !== 'field') {
				addToLog(`${hero.name} cannot heal ${injured.name} while they are incapacitated at base.`, hero.id);
				return;
			}
			
			if (injured && injured.hp.current < injured.hp.max) {
				const wasIncapacitated = injured.hp.current <= 0;
				
				const wand = gameData.items.find(i => i.id === hero.equipment.mainHand);
				const spellPower = wand && wand.spellPower ? wand.spellPower : 1;
				
				const baseHealAmount = skill.id.includes('III') ? 500 : skill.id.includes('II') ? 250 : 100;
				const healAmount = Math.ceil((baseHealAmount * spellPower) * levelBoost);
				
				injured.hp.current = Math.min(injured.hp.max, injured.hp.current + healAmount);
				addToLog(`${hero.name} healed ${injured.name} for ${healAmount} HP.`, hero.id);
				success = true;
				
				// MODIFIED: Logic to handle hero revival in the field
				if (wasIncapacitated && injured.hp.current > 0 && injured.location === 'field') {
					addToLog(`${injured.name} has recovered and is returning to their vehicle.`, injured.id);
					const ownedCar = gameState.city.cars.find(c => c.ownerId === injured.id);
					if (ownedCar) {
						injured.carId = ownedCar.id;
						
						// NEW: Immediately assign a combat target to the revived hero to prevent a lost turn.
						if (gameState.activeMonsters.length > 0 && (injured.class === 'Striker' || injured.class === 'Vanguard')) {
							// A simple assignment logic: target the first available monster.
							// manageCombatAssignments() will refine this on the next tick if needed.
							const targetMonster = gameState.activeMonsters[0];
							injured.targetMonsterId = targetMonster.id;
							addToLog(`${injured.name} has re-entered the fight, targeting ${targetMonster.name} (#${targetMonster.id})!`, injured.id);
						}
					}
				}
				
				if (injured.targetMonsterId) {
					const monster = gameState.activeMonsters.find(m => m.id === injured.targetMonsterId);
					if (monster) {
						const agroAmount = skill.agroValue || 0;
						monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroAmount;
						
						if (!monster.assignedTo.includes(hero.id)) {
							monster.assignedTo.push(hero.id);
						}
						hero.targetMonsterId = monster.id;
						
						addToLog(`${hero.name} drew the attention of ${monster.name} (#${monster.id}) by healing!`, hero.id);
					}
				}
			}
			break;
	}
	
	if (success) {
		hero.mp.current -= skill.mpCost;
		hero.xp.current += 25;
		
		hero.skillCooldowns[skillId] = gameState.time + skill.cooldown;
		hero.skillFlash = { id: skillId, clearAtTime: gameState.time + 1 };
		
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
			addToLog(`${hero.name} reached Level ${hero.level}! Stats increased.`, hero.id);
		}
	}
}
