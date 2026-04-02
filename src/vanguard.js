import { gameState, gameData } from './state.js';
import { addToLog, getSkillEffect, parseRange } from './utils.js';

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
		
		const levelBoost = 1 + (hero.level * 0.1);
		
		// Damage calculation based on equipped weapon and passive skills
		const sword = gameData.items.find(i => i.id === hero.equipment.mainHand);
		const baseDamage = sword ? parseRange(sword.damage) : parseRange('1-2'); // Unarmed damage
		
		const damageBoost = getSkillEffect(hero, 'damage'); // From passive skills like Shield Bash
		const damageDealt = Math.ceil((baseDamage + damageBoost) * levelBoost);
		monster.currentHp -= damageDealt;
		addToLog(`${hero.name} dealt ${damageDealt} damage to ${monster.name} (#${monster.id}).`);
		
		// Mitigation from both armor and shield
		const armor = gameData.items.find(a => a.id === hero.equipment.body);
		const shield = gameData.items.find(s => s.id === hero.equipment.offHand);
		const armorMitigation = armor ? parseRange(armor.damageMitigation) : 0;
		const shieldMitigation = shield ? parseRange(shield.damageMitigation) : 0;
		const totalMitigation = armorMitigation + shieldMitigation;
		
		const monsterDamage = parseRange(monster.damage);
		const damageTaken = Math.max(1, monsterDamage - totalMitigation);
		
		hero.hp.current -= damageTaken;
		addToLog(`${monster.name} (#${monster.id}) attacked ${hero.name}, dealing ${damageTaken} damage (${monsterDamage} raw - ${totalMitigation} mitigated).`);
		
		// Grant XP to all passive combat skills
		hero.skills.forEach(heroSkill => {
			const skillData = gameData.skills.find(s => s.id === heroSkill.id);
			if (skillData && skillData.type === 'Passive' && skillData.class === 'Vanguard') {
				heroSkill.xp += 1; // Grant 1 XP per tick of combat
				if (skillData && heroSkill.xp >= skillData.xpMax) {
					const upgradeSkill = gameData.skills.find(s => s.replaces === heroSkill.id);
					if (upgradeSkill) {
						heroSkill.id = upgradeSkill.id;
						heroSkill.xp = 0;
						addToLog(`${hero.name}'s ${skillData.name} has upgraded to ${upgradeSkill.name}!`);
					}
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
			addToLog(`${hero.name} was incapacitated by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
		} else if (monster.currentHp <= 0) {
			hero.targetMonsterId = null;
		}
	}
}
