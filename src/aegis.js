import {gameState, gameData} from './state.js';
import {addToLog} from './utils.js';

// MODIFIED: Function signature updated to accept an options object for targeting
export function handleAegisAction(heroId, skillId, options = {}) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	// MODIFIED: Added check for skill level requirement
	if (!hero || !skill || hero.mp.current < skill.mpCost || (skill.levelRequirement && hero.level < skill.levelRequirement)) return;
	
	let success = false;
	
	// Calculate 10% boost per level
	const levelBoost = 1 + (hero.level * 0.1);
	
	// Pre-check conditions to avoid wasting MP and spamming logs
	switch (skill.actionType) {
		// MODIFIED: Removed 'repair' and 'shield' cases as these skills are no longer part of the Aegis kit.
		case 'battery':
			const baseChargeCount = skill.id.includes('III') ? 3 : skill.id.includes('II') ? 2 : 1;
			const chargeCount = Math.ceil(baseChargeCount * levelBoost);
			let charged = 0;
			const chargedCarIds = []; // NEW: Array to store IDs of charged cars
			for (let i = 0; i < chargeCount; i++) {
				const emptyCar = gameState.city.cars.find(c => c.battery <= 0);
				if (emptyCar) {
					emptyCar.battery = 30; // 30 days of charge
					chargedCarIds.push(emptyCar.id); // store ID
					charged++;
				} else break;
			}
			if (charged > 0) {
				//  Update log message with car IDs
				addToLog(`${hero.name} recharged ${charged} Mana Battery Car(s): #${chargedCarIds.join(', #')}.`, hero.id);
				success = true;
			}
			break;
		case 'heal':
			// MODIFIED: Prioritize manual target, fallback to auto-cast logic
			const targetHero = gameState.heroes.find(h => h.id === options.targetHeroId);
			const injured = targetHero || gameState.heroes.filter(h => h.hp.current < h.hp.max).sort((a, b) => a.hp.current - b.hp.current)[0];
			
			if (injured && injured.hp.current < injured.hp.max) { // MODIFIED: Ensure target actually needs healing
				// NEW: Factor in spell power from wands
				const wand = gameData.items.find(i => i.id === hero.equipment.mainHand);
				const spellPower = wand && wand.spellPower ? wand.spellPower : 1;
				
				const baseHealAmount = skill.id.includes('III') ? 500 : skill.id.includes('II') ? 250 : 100;
				const healAmount = Math.ceil((baseHealAmount * spellPower) * levelBoost);
				
				injured.hp.current = Math.min(injured.hp.max, injured.hp.current + healAmount);
				addToLog(`${hero.name} healed ${injured.name} for ${healAmount} HP.`, hero.id);
				success = true;
				
				// NEW: Agro generation logic for healing
				if (injured.targetMonsterId) {
					const monster = gameState.activeMonsters.find(m => m.id === injured.targetMonsterId);
					if (monster) {
						const agroAmount = skill.agroValue || 0;
						monster.agro[hero.id] = (monster.agro[hero.id] || 0) + agroAmount;
						
						// Add Aegis to the combat encounter if not already present
						if (!monster.assignedTo.includes(hero.id)) {
							monster.assignedTo.push(hero.id);
						}
						// Aegis now targets this monster
						hero.targetMonsterId = monster.id;
						
						addToLog(`${hero.name} drew the attention of ${monster.name} (#${monster.id}) by healing!`, hero.id);
					}
				}
			}
			break;
	}
	
	// If the action was successful, consume MP and grant XP
	if (success) {
		hero.mp.current -= skill.mpCost;
		hero.xp.current += 25; // Aegis gains XP per successful cast
		
		// MODIFIED: Removed all skill XP and skill upgrade logic
		
		if (hero.xp.current >= hero.xp.max) {
			hero.level++;
			hero.xp.current -= hero.xp.max;
			hero.xp.max = Math.ceil(hero.xp.max * 1.5);
			hero.hp.max += hero.hpMaxPerLevel;
			hero.mp.max += hero.mpMaxPerLevel;
			hero.hpRegen += hero.hpRegenPerLevel;
			hero.mpRegen += hero.mpRegenPerLevel;
			hero.hp.current = hero.hp.max;
			hero.mp.current = hero.mp.max;
			addToLog(`${hero.name} reached Level ${hero.level}! Stats increased.`, hero.id);
		}
	}
}
