import { gameState, gameData } from './state.js';
import { addToLog, getSkillEffect } from './utils.js';

export function processVanguard(hero) {
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
			hero.targetMonster = unassigned;
		}
	}

	if (hero.targetMonster) {
		const monster = hero.targetMonster;

		const damageDealt = 8;
		monster.currentHp -= damageDealt;

		const damageReduction = getSkillEffect(hero, 'damage_reduction') || 0;
		const damageTaken = Math.max(1, monster.damage - damageReduction);
		hero.hp.current -= damageTaken;

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

			// Updated Loot drop logic to include items and route health items to Aegis
			if (Math.random() < 0.4) {
				if (Math.random() < 0.5) {
					const classSkills = gameData.skills.filter(s => s.class === hero.class && s.type === 'Auto' && !s.id.includes('_C'));
					if (classSkills.length > 0) {
						const dropped = classSkills[Math.floor(Math.random() * classSkills.length)];
						hero.inventory[dropped.id] = (hero.inventory[dropped.id] || 0) + 1;
						addToLog(`${hero.name} found a skill card: ${dropped.name}!`);
					}
				} else {
					const items = gameData.items;
					const dropped = items[Math.floor(Math.random() * items.length)];

					// Route health-related items to Aegis
					if (dropped.type === 'Consumable' || dropped.name.includes('Medical') || dropped.name.includes('First Aid')) {
						const aegis = gameState.heroes.find(h => h.class === 'Aegis');
						if (aegis) {
							aegis.inventory[dropped.id] = (aegis.inventory[dropped.id] || 0) + 1;
							addToLog(`${hero.name} found ${dropped.name} and sent it to ${aegis.name}.`);
						}
					} else {
						hero.inventory[dropped.id] = (hero.inventory[dropped.id] || 0) + 1;
						addToLog(`${hero.name} found an item: ${dropped.name}!`);
					}
				}
			}

			if (hero.xp.current >= hero.xp.max) {
				hero.level++;
				hero.xp.current -= hero.xp.max;
				hero.xp.max = Math.floor(hero.xp.max * 1.5);
				hero.hp.max += 30;
				hero.mp.max += 5;
				hero.hp.current = hero.hp.max;
				addToLog(`${hero.name} reached Level ${hero.level}!`);
			}
		}
	}
}
