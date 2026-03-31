import { gameState, gameData } from './state.js';
import { addToLog, getSkillEffect } from './utils.js';

export function processStriker(hero) {
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
		
		const damageBoost = getSkillEffect(hero, 'damage_boost') || 0;
		// Apply level boost to total damage dealt
		const damageDealt = Math.floor((15 + damageBoost) * levelBoost);
		monster.currentHp -= damageDealt;
		
		// MODIFIED: Apply armor damage mitigation
		const armor = gameData.armor.find(a => a.id === hero.armorId);
		const armorMitigation = armor ? armor.damageMitigation : 0;
		const damageTaken = Math.max(1, monster.damage - armorMitigation);
		
		hero.hp.current -= damageTaken;
		
		const activeSkill = hero.skills.find(s => {
			const data = gameData.skills.find(d => d.id === s.id);
			return data && data.effect === 'damage_boost';
		});
		if (activeSkill) {
			activeSkill.xp += 1; // Grant 1 XP per tick of combat
			const skillData = gameData.skills.find(s => s.id === activeSkill.id);
			if (skillData && activeSkill.xp >= skillData.xpMax) {
				const upgradeSkill = gameData.skills.find(s => s.replaces === activeSkill.id);
				if (upgradeSkill) {
					activeSkill.id = upgradeSkill.id;
					activeSkill.xp = 0;
					addToLog(`${hero.name}'s ${skillData.name} has upgraded to ${upgradeSkill.name}!`);
				}
			}
		}
		
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
			
			// MODIFIED: Loot drops directly into the hero's personal inventory.
			// MODIFIED: Removed skill card drops to keep inventory item-focused.
			if (Math.random() < 0.8) {
				const items = gameData.items;
				const dropped = items[Math.floor(Math.random() * items.length)];
				hero.inventory[dropped.id] = (hero.inventory[dropped.id] || 0) + 1;
				addToLog(`${hero.name} found an item: ${dropped.name}!`);
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
