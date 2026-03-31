import { gameState, gameData } from './state.js';
import { addToLog, getSkillEffect } from './utils.js';

export function processVanguard(hero) {
	if (hero.hp.current <= 0) return;
	
	// Equip an available car if hero doesn't have one
	if (!hero.carId) {
		const availableCar = gameState.city.cars.find(c => c.battery > 0 && c.driverId === null);
		if (availableCar) {
			hero.carId = availableCar.id;
			availableCar.driverId = hero.id;
			addToLog(`${hero.name} equipped Car #${availableCar.id} and is ready to fight.`);
		}
	}
	
	if (!hero.carId) return;
	
	if (!hero.targetMonster) {
		const unassigned = gameState.activeMonsters.find(m => !m.assigned);
		if (unassigned) {
			unassigned.assigned = true;
			unassigned.targetBuilding = null; // Monster stops attacking the building when engaged
			hero.targetMonster = unassigned;
		}
	}
	
	if (hero.targetMonster) {
		const monster = hero.targetMonster;
		
		// Calculate 10% boost per level
		const levelBoost = 1 + (hero.level * 0.1);
		
		// Apply level boost to total damage dealt
		const damageDealt = Math.floor(8 * levelBoost);
		monster.currentHp -= damageDealt;
		
		const baseDamageReduction = getSkillEffect(hero, 'damage_reduction') || 0;
		// Apply level boost to skill damage reduction
		const skillReduction = Math.floor(baseDamageReduction * levelBoost);
		
		// MODIFIED: Apply armor damage mitigation
		const armor = gameData.armor.find(a => a.id === hero.armorId);
		const armorMitigation = armor ? armor.damageMitigation : 0;
		
		const totalMitigation = skillReduction + armorMitigation;
		const damageTaken = Math.max(1, monster.damage - totalMitigation);
		
		hero.hp.current -= damageTaken;
		
		if (hero.hp.current <= 0) {
			hero.hp.current = 0;
			// Free the car without destroying it
			const car = gameState.city.cars.find(c => c.id === hero.carId);
			if (car) car.driverId = null;
			hero.carId = null;
			
			monster.assigned = false;
			hero.targetMonster = null;
			// MODIFIED: Added monster level to log
			addToLog(`${hero.name} was incapacitated by Lv.${monster.level} ${monster.name}!`);
		} else if (monster.currentHp <= 0) {
			hero.xp.current += monster.xp;
			// MODIFIED: Added monster level to log
			addToLog(`${hero.name} defeated Lv.${monster.level} ${monster.name} and gained ${monster.xp} XP.`);
			hero.targetMonster = null;
			
			// Increased Loot drop logic
			if (Math.random() < 0.8) {
				if (Math.random() < 0.5) {
					const classSkills = gameData.skills.filter(s => s.class === hero.class && s.type === 'Auto' && !s.id.includes('_C'));
					if (classSkills.length > 0) {
						const dropped = classSkills[Math.floor(Math.random() * classSkills.length)];
						gameState.inventory[dropped.id] = (gameState.inventory[dropped.id] || 0) + 1;
						addToLog(`${hero.name} found a skill card: ${dropped.name}!`);
					}
				} else {
					const items = gameData.items;
					const dropped = items[Math.floor(Math.random() * items.length)];
					gameState.inventory[dropped.id] = (gameState.inventory[dropped.id] || 0) + 1;
					addToLog(`${hero.name} found an item: ${dropped.name}!`);
				}
			}
			
			if (hero.xp.current >= hero.xp.max) {
				hero.level++;
				hero.xp.current -= hero.xp.max;
				hero.xp.max = Math.floor(hero.xp.max * 1.5);
				hero.hp.max += hero.hpMaxPerLevel;
				hero.mp.max += hero.mpMaxPerLevel;
				hero.hpRegen += hero.hpRegenPerLevel;
				hero.mpRegen += hero.mpRegenPerLevel;
				hero.hp.current = hero.hp.max;
				addToLog(`${hero.name} reached Level ${hero.level}!`);
			}
		}
	}
}
