import { gameState, gameData } from './state.js';
import { addToLog, getSkillEffect } from './utils.js';

export function processStriker(hero) {
	if (hero.hp.current <= 0) return;

	if (!hero.hasCar && gameState.city.cars > 0) {
		hero.hasCar = true;
		gameState.city.cars--;
		addToLog(`${hero.name} equipped a Mana Battery Car and is ready to fight.`);
	}

	if (!hero.hasCar) return;

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

		const damageBoost = getSkillEffect(hero, 'damage_boost') || 0;
		const damageDealt = 15 + damageBoost;
		monster.currentHp -= damageDealt;

		hero.hp.current -= monster.damage;

		if (hero.hp.current <= 0) {
			hero.hp.current = 0;
			hero.hasCar = false;
			monster.assigned = false;
			hero.targetMonster = null;
			addToLog(`${hero.name} was incapacitated by ${monster.name}!`);
		} else if (monster.currentHp <= 0) {
			hero.xp.current += monster.xp;
			addToLog(`${hero.name} defeated ${monster.name} and gained ${monster.xp} XP.`);
			hero.targetMonster = null;

			// Updated Loot drop logic to use the shared inventory
			if (Math.random() < 0.4) {
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
				hero.hp.max += 15;
				hero.mp.max += 10;
				hero.hp.current = hero.hp.max;
				addToLog(`${hero.name} reached Level ${hero.level}!`);
			}
		}
	}
}
