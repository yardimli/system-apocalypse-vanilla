import { gameState, gameData } from './state.js';
import { addToLog, getSkillEffect, parseRange } from './utils.js';

export function processStriker(hero) {
	if (hero.hp.current <= 0) return;
	
	// Equip an available car if hero doesn't have one
	if (!hero.carId) {
		const availableCar = gameState.city.cars.find(c => c.battery > 0 && c.driverId === null);
		if (availableCar) {
			hero.carId = availableCar.id;
			availableCar.driverId = hero.id;
			addToLog(`${hero.name} equipped Car #${availableCar.id} and is ready to fight.`, hero.id); // MODIFIED
		}
	}
	
	if (!hero.carId) return;
	
	// Target acquisition is now handled in main.js. We just act on the assigned target.
	if (hero.targetMonsterId) {
		const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
		if (!monster) { // This can happen if monster was defeated by another hero in the same tick
			hero.targetMonsterId = null;
			return;
		}
		
		// Active spell casting logic. Find the best usable skill based on available MP.
		const usableSkills = hero.skills
			.map(s => gameData.skills.find(gs => gs.id === s.id))
			.filter(s => s && s.class === 'Striker' && s.type === 'Combat' && hero.mp.current >= s.mpCost)
			.sort((a, b) => b.mpCost - a.mpCost); // Prioritize more expensive (and powerful) spells.
		
		if (usableSkills.length > 0) {
			const skillToUse = usableSkills[0];
			hero.mp.current -= skillToUse.mpCost;
			
			const levelBoost = 1 + (hero.level * 0.1);
			const wand = gameData.items.find(i => i.id === hero.equipment.mainHand);
			const spellPower = wand && wand.spellPower ? wand.spellPower : 1;
			
			const baseDamage = parseRange(skillToUse.value);
			// Damage is now multiplied by the wand's spell power.
			const damageDealt = Math.ceil((baseDamage * spellPower) * levelBoost);
			monster.currentHp -= damageDealt;
			addToLog(`${hero.name} casts ${skillToUse.name}, dealing ${damageDealt} damage to ${monster.name} (#${monster.id}).`, hero.id); // MODIFIED
			
			// Grant skill XP to the used skill
			const heroSkill = hero.skills.find(s => s.id === skillToUse.id);
			if (heroSkill) {
				heroSkill.xp += 5; // Grant 5 XP per cast in combat
			}
		} else {
			// If no mana for any skill, do nothing this tick.
			addToLog(`${hero.name} is low on mana and conserves energy.`, hero.id); // MODIFIED
		}
		
		const armor = gameData.items.find(a => a.id === hero.equipment.body);
		const armorMitigation = armor ? parseRange(armor.damageMitigation) : 0;
		const monsterDamage = parseRange(monster.damage);
		const damageTaken = Math.max(1, monsterDamage - armorMitigation);
		hero.hp.current -= damageTaken;
		addToLog(`${monster.name} (#${monster.id}) attacked ${hero.name}, dealing ${damageTaken} damage (${monsterDamage} raw - ${armorMitigation} mitigated).`, hero.id); // MODIFIED
		
		// Check for skill level-ups
		hero.skills.forEach(heroSkill => {
			const skillData = gameData.skills.find(s => s.id === heroSkill.id);
			if (skillData && heroSkill.xp >= skillData.xpMax) {
				const upgradeSkill = gameData.skills.find(s => s.replaces === heroSkill.id);
				if (upgradeSkill) {
					heroSkill.id = upgradeSkill.id;
					heroSkill.xp = 0;
					addToLog(`${hero.name}'s ${skillData.name} has upgraded to ${upgradeSkill.name}!`, hero.id); // MODIFIED
				}
			}
		});
		
		if (hero.hp.current <= 0) {
			hero.hp.current = 0;
			// Free the car without destroying it
			const car = gameState.city.cars.find(c => c.id === hero.carId);
			if (car) car.driverId = null;
			hero.carId = null;
			
			hero.targetMonsterId = null;
			addToLog(`${hero.name} was incapacitated by Lv.${monster.level} ${monster.name} (#${monster.id})!`, hero.id); // MODIFIED
		} else if (monster.currentHp <= 0) {
			hero.targetMonsterId = null;
		}
	}
}
