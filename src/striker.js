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
			addToLog(`${hero.name} equipped Car #${availableCar.id} and is ready to fight.`);
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
		
		const levelBoost = 1 + (hero.level * 0.1);
		
		const damageBoost = getSkillEffect(hero, 'damage') || 0;
		const baseDamage = parseRange('10-20');
		const damageDealt = Math.ceil((baseDamage + damageBoost) * levelBoost);
		monster.currentHp -= damageDealt;
		addToLog(`${hero.name} dealt ${damageDealt} damage to ${monster.name} (#${monster.id}).`);
		
		const armor = gameData.armor.find(a => a.id === hero.armorId);
		const armorMitigation = armor ? parseRange(armor.damageMitigation) : 0;
		const monsterDamage = parseRange(monster.damage);
		const damageTaken = Math.max(1, monsterDamage - armorMitigation);
		hero.hp.current -= damageTaken;
		addToLog(`${monster.name} (#${monster.id}) attacked ${hero.name}, dealing ${damageTaken} damage (${monsterDamage} raw - ${armorMitigation} mitigated).`);
		
		const activeSkill = hero.skills.find(s => {
			const data = gameData.skills.find(d => d.id === s.id);
			return data && data.effect === 'damage';
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
			hero.targetMonsterId = null;
		}
	}
}
