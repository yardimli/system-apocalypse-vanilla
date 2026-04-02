import {gameState, gameData} from './state.js';
import {addToLog} from './utils.js';

export function handleAegisAction(heroId, skillId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const skill = gameData.skills.find(s => s.id === skillId);
	
	if (!hero || !skill || hero.mp.current < skill.mpCost) return;
	
	let success = false;
	
	// Calculate 10% boost per level
	const levelBoost = 1 + (hero.level * 0.1);
	
	// Pre-check conditions to avoid wasting MP and spamming logs
	switch (skill.actionType) {
		case 'repair':
			const baseRepairCount = skill.id.includes('III') ? 3 : skill.id.includes('II') ? 2 : 1;
			const repairCount = Math.ceil(baseRepairCount * levelBoost);
			let repaired = 0;
			for (let i = 0; i < repairCount; i++) {
				let targetBldg = gameState.city.buildings.find(b => b.state === 'ruined');
				if (!targetBldg) targetBldg = gameState.city.buildings.find(b => b.state === 'damaged');
				
				if (targetBldg) {
					targetBldg.state = 'functional';
					targetBldg.hp = targetBldg.maxHp;
					repaired++;
				} else break;
			}
			if (repaired > 0) {
				addToLog(`${hero.name} repaired ${repaired} building(s).`);
				success = true;
			}
			break;
		case 'shield':
			const baseShieldCount = skill.id.includes('III') ? 3 : skill.id.includes('II') ? 2 : 1;
			const shieldCount = Math.ceil(baseShieldCount * levelBoost);
			let shielded = 0;
			for (let i = 0; i < shieldCount; i++) {
				const unshieldedBldg = gameState.city.buildings.find(b => b.state === 'functional' && b.shieldHp === 0);
				if (unshieldedBldg) {
					unshieldedBldg.shieldHp = unshieldedBldg.maxShieldHp;
					shielded++;
				} else break;
			}
			if (shielded > 0) {
				addToLog(`${hero.name} shielded ${shielded} building(s).`);
				success = true;
			}
			break;
		case 'battery':
			const baseChargeCount = skill.id.includes('III') ? 3 : skill.id.includes('II') ? 2 : 1;
			const chargeCount = Math.ceil(baseChargeCount * levelBoost);
			let charged = 0;
			for (let i = 0; i < chargeCount; i++) {
				const emptyCar = gameState.city.cars.find(c => c.battery <= 0);
				if (emptyCar) {
					emptyCar.battery = 30; // 30 days of charge
					charged++;
				} else break;
			}
			if (charged > 0) {
				addToLog(`${hero.name} recharged ${charged} Mana Battery Car(s).`);
				success = true;
			}
			break;
		case 'heal':
			const injured = gameState.heroes.filter(h => h.hp.current < h.hp.max).sort((a, b) => a.hp.current - b.hp.current)[0];
			if (injured) {
				const baseHealAmount = skill.id.includes('III') ? 500 : skill.id.includes('II') ? 250 : 100;
				const healAmount = Math.ceil(baseHealAmount * levelBoost);
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
		
		const heroSkill = hero.skills.find(s => s.id === skillId);
		if (heroSkill) {
			heroSkill.xp += 10; // Grant 10 XP per cast
			const skillData = gameData.skills.find(s => s.id === skillId);
			if (skillData && heroSkill.xp >= skillData.xpMax) {
				const upgradeSkill = gameData.skills.find(s => s.replaces === skillId);
				if (upgradeSkill) {
					heroSkill.id = upgradeSkill.id;
					heroSkill.xp = 0;
					// MODIFIED: If the upgraded skill was on auto-cast, update the ID there too
					if (hero.autoCastSkillId === skillId) {
						hero.autoCastSkillId = upgradeSkill.id;
					}
					addToLog(`${hero.name}'s ${skillData.name} has upgraded to ${upgradeSkill.name}!`);
				}
			}
		}
		
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
			addToLog(`${hero.name} reached Level ${hero.level}! Stats increased.`);
		}
	}
}
