import { gameState, gameData } from './state.js';
import { addToLog, parseRange } from './utils.js';

/**
 * Handles a hero performing a combat action (attack, taunt, etc.).
 * @param {number} heroId - The ID of the hero performing the action.
 * @param {string} skillId - The ID of the skill being used.
 */
export function handleCombatAction(heroId, skillId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	if (!hero || !skill || !hero.targetMonsterId) return;
	
	const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
	if (!monster) return;
	
	let success = false;
	
	// Conditional resource check for non-Vanguards
	const mpCost = skill.mpCost || 0;
	if (hero.class !== 'Vanguard' && hero.mp.current < mpCost) {
		return; // Not enough MP
	}
	
	const rageCost = skill.rageCost || 0;
	const hasEnoughRage = hero.rage && hero.rage.current >= rageCost;
	
	switch (skill.actionType) {
		case 'attack': {
			const levelBoost = 1 + (hero.level * 0.1);
			let damageDealt;
			let agroGenerated;
			
			// MODIFIED: Logic for Vanguard casting with or without Rage
			if (hero.class === 'Vanguard') {
				const baseDamage = skill.damage ? parseRange(skill.damage) : parseRange('1-2');
				let finalDamage = baseDamage;
				let finalAgroMultiplier = skill.agroMultiplier || 1.0;
				
				if (rageCost > 0) {
					if (hasEnoughRage) {
						hero.rage.current -= rageCost;
						addToLog(`${hero.name} uses ${skill.name} with Rage!`, hero.id);
						// Full effect is applied by default
					} else {
						// Apply diminished effect if not enough rage
						finalDamage = Math.ceil(finalDamage / 2); // Half damage
						finalAgroMultiplier /= 4; // Quarter threat
						addToLog(`${hero.name} uses ${skill.name} without enough Rage, with reduced effect.`, hero.id);
					}
				}
				
				damageDealt = Math.ceil(finalDamage * levelBoost);
				agroGenerated = damageDealt * finalAgroMultiplier;
			} else { // Standard Striker logic
				const wand = gameData.items.find(i => i.id === hero.equipment.mainHand);
				const spellPower = wand && wand.spellPower ? wand.spellPower : 1;
				const baseDamage = parseRange(skill.damage);
				damageDealt = Math.ceil((baseDamage * spellPower) * levelBoost);
				agroGenerated = damageDealt * (skill.agroMultiplier || 1.0);
			}
			
			monster.currentHp -= damageDealt;
			monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroGenerated;
			
			// Handle rage generation from skills like Heroic Strike
			if (skill.rageGen) {
				hero.rage.current = Math.min(hero.rage.max, hero.rage.current + skill.rageGen);
			}
			
			addToLog(`${hero.name} deals ${damageDealt} damage to ${monster.name} (#${monster.id}).`, hero.id);
			success = true;
			break;
		}
		case 'taunt': {
			let agroAmount = skill.value || 0;
			
			// MODIFIED: Logic for Taunt with or without Rage
			if (hero.class === 'Vanguard') {
				if (hasEnoughRage) {
					hero.rage.current -= rageCost;
					addToLog(`${hero.name} uses ${skill.name} with Rage for a massive threat boost!`, hero.id);
					// Full effect is applied
				} else {
					// Diminished effect
					agroAmount = Math.ceil(agroAmount / 10); // Only 10% threat
					addToLog(`${hero.name} uses ${skill.name} without enough Rage, generating minimal threat.`, hero.id);
				}
			}
			
			monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroAmount;
			success = true;
			break;
		}
	}
	
	if (success) {
		// Consume resources (MP for non-Vanguards, Rage is handled above)
		if (hero.class !== 'Vanguard') {
			hero.mp.current -= mpCost;
		}
		
		// Grant skill XP
		const heroSkill = hero.skills.find(s => s.id === skillId);
		if (heroSkill) {
			heroSkill.xp += 5;
			const skillData = gameData.skills.find(s => s.id === skillId);
			if (skillData && heroSkill.xp >= skillData.xpMax) {
				const upgradeSkill = gameData.skills.find(s => s.replaces === skillId);
				if (upgradeSkill) {
					heroSkill.id = upgradeSkill.id;
					heroSkill.xp = 0;
					if (hero.autoCastSkillId === skillId) {
						hero.autoCastSkillId = upgradeSkill.id;
					}
					addToLog(`${hero.name}'s ${skillData.name} has upgraded to ${upgradeSkill.name}!`, hero.id);
				}
			}
		}
	}
}
