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
	
	// Target acquisition is handled in main.js. We just act on the assigned target.
	if (hero.targetMonsterId) {
		const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
		if (!monster) { // This can happen if monster was defeated by another hero in the same tick
			hero.targetMonsterId = null;
			return;
		}
		
		// Calculate 10% boost per level
		const levelBoost = 1 + (hero.level * 0.1);
		
		// Apply level boost to total damage dealt
		const damageDealt = Math.floor(8 * levelBoost);
		monster.currentHp -= damageDealt;
		
		const baseDamageReduction = getSkillEffect(hero, 'damage_reduction') || 0;
		// Apply level boost to skill damage reduction
		const skillReduction = Math.floor(baseDamageReduction * levelBoost);
		
		// Apply armor damage mitigation
		const armor = gameData.armor.find(a => a.id === hero.armorId);
		const armorMitigation = armor ? armor.damageMitigation : 0;
		
		const totalMitigation = skillReduction + armorMitigation;
		const damageTaken = Math.max(1, monster.damage - totalMitigation);
		
		hero.hp.current -= damageTaken;
		
		const activeSkill = hero.skills.find(s => {
			const data = gameData.skills.find(d => d.id === s.id);
			return data && data.effect === 'damage_reduction';
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
			
			hero.targetMonsterId = null;
			addToLog(`${hero.name} was incapacitated by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
		} else if (monster.currentHp <= 0) {
			hero.xp.current += monster.xp;
			addToLog(`${hero.name} helped defeat Lv.${monster.level} ${monster.name} (#${monster.id}) and gained ${monster.xp} XP.`);
			hero.targetMonsterId = null;
			
			if (Math.random() < 0.4) {
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
