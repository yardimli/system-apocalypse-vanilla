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
			// Find a ruined building first, otherwise a damaged one
			let targetBldg = gameState.city.buildings.find(b => b.state === 'ruined');
			if (!targetBldg) targetBldg = gameState.city.buildings.find(b => b.state === 'damaged');

			if (targetBldg) {
				targetBldg.state = 'functional';
				targetBldg.hp = targetBldg.maxHp;
				addToLog(`${hero.name} repaired Building #${targetBldg.id}.`);
				success = true;
			}
			break;
		case 'shield':
			// Find a functional building without a shield
			const unshieldedBldg = gameState.city.buildings.find(b => b.state === 'functional' && b.shieldHp === 0);
			if (unshieldedBldg) {
				unshieldedBldg.shieldHp = unshieldedBldg.maxShieldHp;
				addToLog(`${hero.name} shielded Building #${unshieldedBldg.id}.`);
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
