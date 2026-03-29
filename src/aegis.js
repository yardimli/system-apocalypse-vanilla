import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

export function handleAegisAction(heroId, skillId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);

	if (!hero || !skill || hero.mp.current < skill.mpCost) return;

	let success = false;

	// Pre-check conditions to avoid wasting MP and spamming logs
	switch (skill.actionType) {
		case 'repair':
			if (gameState.city.damaged > 0) {
				gameState.city.damaged--;
				gameState.city.functional++;
				addToLog(`${hero.name} repaired a damaged building.`);
				success = true;
			} else if (gameState.city.ruined > 0) {
				gameState.city.ruined--;
				gameState.city.functional++;
				addToLog(`${hero.name} repaired a ruined building.`);
				success = true;
			}
			break;
		case 'shield':
			if (gameState.city.functional > gameState.city.shielded) {
				gameState.city.shielded++;
				addToLog(`${hero.name} shielded a functional building.`);
				success = true;
			}
			break;
		case 'battery':
			gameState.city.cars++;
			addToLog(`${hero.name} created a Mana Battery Car for combat.`);
			success = true;
			break;
		case 'heal':
			const injured = gameState.heroes.filter(h => h.hp.current < h.hp.max).sort((a, b) => a.hp.current - b.hp.current)[0];
			if (injured) {
				const healAmount = skill.id === 'AEG004_II' ? 250 : 100; // Scale healing based on skill version
				injured.hp.current = Math.min(injured.hp.max, injured.hp.current + healAmount);
				addToLog(`${hero.name} healed ${injured.name} for ${healAmount} HP.`);
				success = true;
			}
			break;
	}

	// If the action was successful, consume MP and grant XP
	if (success) {
		hero.mp.current -= skill.mpCost;
		hero.xp.current += 25; // Aegis gains XP per successful cast

		// Level up logic for Aegis
		if (hero.xp.current >= hero.xp.max) {
			hero.level++;
			hero.xp.current -= hero.xp.max;
			hero.xp.max = Math.floor(hero.xp.max * 1.5);
			hero.mp.max += 50; // Max mana increases on level up
			hero.manaRegen = (hero.manaRegen || 1) + 1; // Mana restore speed increases
			hero.mp.current = hero.mp.max;
			addToLog(`${hero.name} reached Level ${hero.level}! Mana capacity and regen increased.`);
		}
	}
}
