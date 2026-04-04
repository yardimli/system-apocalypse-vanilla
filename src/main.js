import { gameState, gameData } from './state.js';
import { handleAegisAction } from './aegis.js';
import { handleCombatAction } from './combat.js';
import { addToLog, parseRange } from './utils.js';
import { renderSandbox, applySandboxChanges } from './sandbox.js';
import { handleUseConsumable } from './inventory.js';
// MODIFIED: Import handleBuyCar and handleBuyUpgrade from shop
import { handleBuyItem, handleSellItem, handleBuySkill, handleBuyUpgrade, handleBuyCar } from './shop.js';
import { renderHeroes, autoEquipBestGear, renderShopModal } from './heroes.js';
import { renderMonsters } from './monsters.js';
import { renderBuildings, handleBuyBuilding, handleEnterBuilding, handleExitBuilding } from './buildings.js';
import { renderHeader, renderTabs, renderCity, renderLog, renderItemsOverview } from './ui.js';
// MODIFIED: Import new car handlers, remove manual enter/exit
import { renderCars, initiateCarPurchase } from './cars.js';

const TABS = ['Heroes', 'Buildings', 'Cars', 'Monsters', 'City', 'Items', 'Log', 'Sandbox'];
let activeTab = 'Heroes';

// --- DOM ELEMENTS ---
const getEl = (id) => document.getElementById(id);
const tabsContainer = getEl('tabs-container');
const contentArea = getEl('content-area');

// NEW: Renders the mission control panel on the Heroes tab.
function renderMissionControl () {
	const missionControlArea = getEl('mission-control-area');
	if (!missionControlArea) return;
	
	const partyState = gameState.party;
	let html = '';
	
	const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
	// Assuming 10 is the max population per building
	const maxPopulation = playerBases.length * 10;
	const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
	const isFull = currentPopulation >= maxPopulation;
	
	// MODIFIED: Check for active combat and update status and button state accordingly.
	const isFighting = gameState.activeMonsters.length > 0;
	const buttonText = isFull ? 'Look for Monsters' : 'Look for Survivors';
	const buttonDisabled = partyState.missionState !== 'idle';
	
	let statusText = 'The party is idle at the base.';
	if (isFighting) {
		statusText = 'Ambushed! Fighting for survival!';
	} else if (partyState.missionState === 'driving_out') {
		statusText = `Driving out... Time remaining: ${partyState.missionTimer}s.`;
	} else if (partyState.missionState === 'driving_back') {
		const totalSurvivors = gameState.heroes.reduce((sum, h) => sum + h.survivorsCarried, 0);
		statusText = `Driving back with ${totalSurvivors} survivors... Time remaining: ${partyState.missionTimer}s.`;
	} else if (partyState.missionState === 'in_combat') { // NEW: Status for when mission is paused for combat.
		statusText = 'Ambushed! Mission paused.';
	}
	
	// NEW: Added a "Flee" button that appears during combat.
	html = `
        <div class="flex-grow">
            <h3 class="font-bold text-lg">Party Mission</h3>
            <p class="text-sm text-gray-400">${statusText}</p>
        </div>
        <div class="flex gap-2">
            ${isFighting ? '<button id="flee-btn" class="btn btn-warning">Flee</button>' : ''}
            <button id="mission-btn" class="btn btn-primary" ${buttonDisabled ? 'disabled' : ''}>
                ${buttonText}
            </button>
        </div>
    `;
	
	missionControlArea.innerHTML = html;
}

function renderContent () {
	switch (activeTab) {
		case 'Heroes':
			if (!getEl('heroes-tab-content')) {
				contentArea.innerHTML = `
                    <div id="heroes-tab-content" class="flex flex-col gap-4">
						<!-- NEW: Mission control area -->
						<div id="mission-control-area" class="card bg-base-200 shadow-md p-4 flex flex-col md:flex-row justify-between items-center gap-4">
							<!-- Content will be dynamically rendered -->
						</div>
                        <div id="heroes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                    </div>
                `;
			}
			// NEW: Call a new function to render the mission control area
			renderMissionControl();
			renderHeroes();
			break;
		case 'Buildings':
			renderBuildings(contentArea);
			break;
		case 'Cars':
			renderCars(contentArea);
			break;
		case 'Monsters':
			renderMonsters(contentArea);
			break;
		case 'City':
			renderCity(contentArea);
			break;
		case 'Items':
			renderItemsOverview(contentArea);
			break;
		case 'Log':
			renderLog(contentArea);
			break;
		case 'Sandbox':
			renderSandbox(contentArea);
			break;
	}
}

function manageCombatAssignments () {
	const combatHeroes = gameState.heroes.filter(h =>
		h.location === 'field' &&
		(h.class === 'Striker' || h.class === 'Vanguard') &&
		h.hp.current > 0 &&
		h.carId
	);
	
	combatHeroes.forEach(hero => {
		if (hero.targetMonsterId && !gameState.activeMonsters.some(m => m.id === hero.targetMonsterId)) {
			hero.targetMonsterId = null;
		}
	});
	
	const vanguards = combatHeroes.filter(h => h.class === 'Vanguard');
	const strikers = combatHeroes.filter(h => h.class === 'Striker');
	
	vanguards.forEach(vanguard => {
		if (!vanguard.targetMonsterId) {
			const target = gameState.activeMonsters.find(m => !gameState.heroes.some(h => h.targetMonsterId === m.id));
			if (target) {
				vanguard.targetMonsterId = target.id;
			}
		}
	});
	
	const vanguardTargets = vanguards
		.map(v => gameState.activeMonsters.find(m => m.id === v.targetMonsterId))
		.filter(Boolean);
	
	strikers.forEach(striker => {
		const isTargetingVanguardMonster = vanguardTargets.some(m => m.id === striker.targetMonsterId);
		
		if (vanguardTargets.length > 0 && !isTargetingVanguardMonster) {
			striker.targetMonsterId = vanguardTargets[0].id;
		} else if (vanguardTargets.length === 0 && !striker.targetMonsterId) {
			const target = gameState.activeMonsters.find(m => !gameState.heroes.some(h => h.targetMonsterId === m.id));
			if (target) {
				striker.targetMonsterId = target.id;
			}
		}
	});
	
	gameState.activeMonsters.forEach(m => {
		m.assignedTo = gameState.heroes
			.filter(h => h.targetMonsterId === m.id)
			.map(h => h.id);
	});
}


// --- GAME LOOP ---
function gameLoop () {
	gameState.time++;
	
	// MODIFIED: Monster spawning is moved into the new mission logic.
	
	// 1. Process Party Mission
	// MODIFIED: New mission state machine.
	if (['driving_out', 'driving_back'].includes(gameState.party.missionState)) {
		// Only spawn monsters if heroes are driving
		const heroesInCars = gameState.heroes.filter(h => h.carId && h.hp.current > 0).length;
		let wasAmbushed = false;
		if (heroesInCars > 0) {
			const currentDay = Math.floor(gameState.time / 10) + 1;
			const availableMonsters = gameData.monsters.filter(m => m.spawnDay <= currentDay);
			
			for (const monsterData of availableMonsters) {
				if (Math.random() < monsterData.spawnRatio) {
					const newMonster = {
						id: gameState.nextMonsterId++,
						spawnTime: gameState.time,
						name: monsterData.name,
						level: monsterData.level,
						maxHp: monsterData.hp,
						currentHp: monsterData.hp,
						damage: monsterData.damage,
						xp: monsterData.xp,
						tokens: monsterData.tokens,
						assignedTo: [],
						targetBuilding: null,
						agro: {}
					};
					gameState.activeMonsters.push(newMonster);
					addToLog(`AMBUSH! A Lv.${monsterData.level} ${monsterData.name} (#${newMonster.id}) appeared!`);
					
					// NEW: Pause the mission for combat.
					gameState.party.pausedMission = {
						state: gameState.party.missionState,
						timer: gameState.party.missionTimer
					};
					gameState.party.missionState = 'in_combat';
					gameState.party.missionTimer = 0;
					wasAmbushed = true;
					
					// If they were returning with survivors, the survivors are lost
					if (gameState.party.survivorsAwaitingRescue > 0) {
						gameState.heroes.forEach(hero => {
							if (hero.survivorsCarried > 0) {
								addToLog(`The ${hero.survivorsCarried} survivors in ${hero.name}'s car were lost in the ambush!`, hero.id);
								hero.survivorsCarried = 0;
							}
						});
						gameState.party.survivorsAwaitingRescue = 0;
					}
					break; // Only one ambush per tick
				}
			}
		}
		
		// If not ambushed, continue mission timer
		if (!wasAmbushed) {
			gameState.party.missionTimer--;
			
			if (gameState.party.missionTimer <= 0) {
				if (gameState.party.missionState === 'driving_out') {
					// NEW: Survivor search logic. 10% chance per second.
					if (Math.random() < 0.1) {
						const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
						const maxPopulation = playerBases.length * 10;
						const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
						const isFull = currentPopulation >= maxPopulation;
						
						if (isFull) {
							addToLog('The party completed a patrol but found no survivors as the base is full.');
							gameState.party.missionState = 'driving_back';
							gameState.party.missionTimer = 5; // Return trip is 5 seconds
						} else {
							const survivorsFound = Math.floor(Math.random() * 3) + 1; // 1-3 survivors
							gameState.party.survivorsAwaitingRescue = survivorsFound;
							addToLog(`The party found ${survivorsFound} survivors! Now returning to base.`);
							
							const heroesOnMission = gameState.heroes.filter(h => h.carId && h.hp.current > 0);
							let survivorsToDistribute = survivorsFound;
							if (heroesOnMission.length > 0) {
								while (survivorsToDistribute > 0) {
									for (const hero of heroesOnMission) {
										if (survivorsToDistribute > 0) {
											hero.survivorsCarried++;
											survivorsToDistribute--;
										}
									}
								}
							}
							gameState.party.missionState = 'driving_back';
							gameState.party.missionTimer = 5; // Return trip is 5 seconds
						}
					} else {
						// If no survivors found, just reset the timer for another search cycle.
						gameState.party.missionTimer = 1;
					}
				} else if (gameState.party.missionState === 'driving_back') {
					const totalSurvivors = gameState.heroes.reduce((sum, h) => sum + h.survivorsCarried, 0);
					if (totalSurvivors > 0) {
						addToLog(`The party successfully returned with ${totalSurvivors} survivors!`);
						let survivorsToHouse = totalSurvivors;
						const playerBases = gameState.city.buildings.filter(b => b.owner === 'player' && b.population < 10);
						if (playerBases.length > 0) {
							while (survivorsToHouse > 0) {
								for (const base of playerBases) {
									if (survivorsToHouse > 0 && base.population < 10) {
										base.population++;
										survivorsToHouse--;
									}
								}
							}
						}
					} else {
						addToLog('The party has successfully returned to base.');
					}
					
					// Move all heroes into a base building.
					const firstBase = gameState.city.buildings.find(b => b.owner === 'player');
					if (firstBase) {
						gameState.heroes.forEach(h => handleEnterBuilding(h.id, firstBase.id));
					}
					
					gameState.heroes.forEach(h => { h.survivorsCarried = 0; });
					gameState.party.survivorsAwaitingRescue = 0;
					gameState.party.missionState = 'idle';
					gameState.party.missionTimer = 0;
				}
			}
		}
	}
	
	// 2. Process Heroes
	manageCombatAssignments();
	
	gameState.heroes.forEach(hero => {
		autoEquipBestGear(hero);
		
		if (hero.location !== 'field') {
			const building = gameState.city.buildings.find(b => b.id === hero.location);
			const baseRegenMultiplier = building?.regenMultiplier || 10;
			const hpPercentage = (building && building.maxHp > 0) ? (building.hp / building.maxHp) : 1;
			const regenMultiplier = baseRegenMultiplier * hpPercentage;
			
			if (hero.hp.current > 0) {
				hero.hp.current = Math.min(hero.hp.max, hero.hp.current + (hero.hpRegen * regenMultiplier));
				if (hero.mp) {
					hero.mp.current = Math.min(hero.mp.max, hero.mp.current + (hero.mpRegen * regenMultiplier));
				}
			}
			return;
		}
		
		// MODIFIED: Removed automatic car entry logic. This is now handled when exiting buildings.
		
		if (hero.hp.current > 0) {
			hero.hp.current = Math.min(hero.hp.max, hero.hp.current + hero.hpRegen);
			if (hero.mp) {
				hero.mp.current = Math.min(hero.mp.max, hero.mp.current + hero.mpRegen);
			}
		}
		
		if (hero.class === 'Vanguard' && !hero.targetMonsterId && hero.rage.current > 0) {
			hero.rage.current = Math.max(0, hero.rage.current - 1);
		}
		
		if (hero.hp.current < hero.hp.max) {
			const missingHp = hero.hp.max - hero.hp.current;
			const availableHpItems = Object.keys(hero.inventory)
				.map(itemId => gameData.items.find(i => i.id === itemId && hero.inventory[itemId] > 0))
				.filter(item => item && item.type === 'Consumable' && item.effect?.type === 'heal_hp');
			
			if (availableHpItems.length > 0) {
				let bestItemToUse = null;
				const hpThreshold = hero.hp.max * 0.25;
				
				if (hero.hp.current < hpThreshold) {
					bestItemToUse = availableHpItems.sort((a, b) => b.effect.value - a.effect.value)[0];
				} else {
					bestItemToUse = availableHpItems
						.filter(item => missingHp >= item.effect.value)
						.sort((a, b) => b.effect.value - a.effect.value)[0];
				}
				
				if (bestItemToUse) {
					handleUseConsumable(hero.id, bestItemToUse.id);
				}
			}
		}
		
		if (hero.mp && hero.mp.current < hero.mp.max) {
			const missingMp = hero.mp.max - hero.mp.current;
			const availableMpItems = Object.keys(hero.inventory)
				.map(itemId => gameData.items.find(i => i.id === itemId && hero.inventory[itemId] > 0))
				.filter(item => item && item.type === 'Consumable' && item.effect?.type === 'heal_mp');
			
			if (availableMpItems.length > 0) {
				let bestItemToUse = null;
				const mpThreshold = hero.mp.max * 0.25;
				
				if (hero.mp.current < mpThreshold) {
					bestItemToUse = availableMpItems.sort((a, b) => b.effect.value - a.effect.value)[0];
				} else {
					bestItemToUse = availableMpItems
						.filter(item => missingMp >= item.effect.value)
						.sort((a, b) => b.effect.value - a.effect.value)[0];
				}
				
				if (bestItemToUse) {
					handleUseConsumable(hero.id, bestItemToUse.id);
				}
			}
		}
		
		if (hero.autoCastSkillId && hero.hp.current > 0) {
			const skillId = hero.autoCastSkillId;
			const skill = gameData.skills.find(s => s.id === skillId);
			
			if (skill) {
				const meetsLevelReq = !skill.levelRequirement || hero.level >= skill.levelRequirement;
				
				let baseSkill = skill;
				while (baseSkill.replaces) {
					const parent = gameData.skills.find(s => s.id === baseSkill.replaces);
					if (!parent) break;
					baseSkill = parent;
				}
				
				const unlockLevel = baseSkill ? baseSkill.autoCastUnlockLevel : null;
				const canAutoCast = unlockLevel && hero.level >= unlockLevel;
				
				const mpCost = skill.mpCost || 0;
				const rageCost = skill.rageCost || 0;
				const hasMp = !mpCost || (hero.mp && hero.mp.current >= mpCost);
				const hasRage = !rageCost || (hero.rage && hero.rage.current >= rageCost);
				const hasResources = hasMp && hasRage;
				
				const isOnCooldown = (hero.skillCooldowns[skillId] || 0) > gameState.time;
				
				if (meetsLevelReq && canAutoCast && hasResources && !isOnCooldown) {
					// MODIFIED: Reworked auto-cast logic for clarity and to implement new Aegis healing behavior.
					if (skill.class === 'Aegis') {
						let shouldCast = false;
						const options = {};
						
						if (skill.actionType === 'heal') {
							// Auto-cast heal on the designated target if their HP is below 85%.
							const targetId = hero.skillTargets[skillId];
							const targetHero = gameState.heroes.find(h => h.id === targetId);
							if (targetHero && targetHero.hp.current < (targetHero.hp.max * 0.85)) {
								shouldCast = true;
								options.targetHeroId = targetId;
							}
						}
						// Future Aegis auto-cast skills can be added here.
						
						if (shouldCast) {
							handleAegisAction(hero.id, skill.id, options);
						}
					} else { // For Striker and Vanguard
						if (hero.targetMonsterId) {
							handleCombatAction(hero.id, skill.id);
						}
					}
				}
			}
		}
	});
	
	// 3. Monsters Attack Heroes based on Agro
	gameState.activeMonsters.forEach(monster => {
		if (monster.assignedTo.length > 0) {
			let targetHeroId = null;
			let maxAgro = -1;
			
			for (const heroId in monster.agro) {
				const hero = gameState.heroes.find(h => h.id === parseInt(heroId, 10));
				if (hero && hero.hp.current > 0 && monster.assignedTo.includes(hero.id)) {
					if (monster.agro[heroId] > maxAgro) {
						maxAgro = monster.agro[heroId];
						targetHeroId = parseInt(heroId, 10);
					}
				}
			}
			
			if (targetHeroId) {
				const targetHero = gameState.heroes.find(h => h.id === targetHeroId);
				const armor = gameData.items.find(a => a.id === targetHero.equipment.body);
				const shield = gameData.items.find(s => s.id === targetHero.equipment.offHand);
				const armorMitigation = armor ? parseRange(armor.damageMitigation) : 0;
				const shieldMitigation = shield ? parseRange(shield.damageMitigation) : 0;
				const totalMitigation = armorMitigation + shieldMitigation;
				
				const monsterDamage = parseRange(monster.damage);
				let damageTaken = Math.max(1, monsterDamage - totalMitigation);
				
				// Apply mitigation bonus from car upgrades if the hero is in a car.
				const car = targetHero.carId ? gameState.city.cars.find(c => c.id === targetHero.carId) : null;
				if (car) {
					const mitigationBonus = car.upgrades
						.map(upgId => gameData.car_upgrades.find(u => u.id === upgId))
						.filter(upg => upg && upg.effect.type === 'increase_occupant_mitigation_bonus')
						.reduce((sum, upg) => sum + upg.effect.value, 0);
					
					if (mitigationBonus > 0) {
						const mitigatedAmount = Math.floor(damageTaken * mitigationBonus);
						damageTaken -= mitigatedAmount;
						addToLog(`${targetHero.name}'s car mitigated ${mitigatedAmount} damage!`, targetHero.id);
					}
				}
				damageTaken = Math.max(1, damageTaken); // Ensure at least 1 damage is dealt after all mitigation.
				
				targetHero.hp.current -= damageTaken;
				addToLog(`${monster.name} (#${monster.id}) attacked ${targetHero.name}, dealing ${damageTaken} damage!`, targetHero.id);
				
				if (targetHero.hp.current <= 0) {
					targetHero.hp.current = 0;
					handleExitBuilding(targetHero.id);
					// MODIFIED: A hero being incapacitated now only clears their carId, not the car's occupants list.
					if (targetHero.carId) {
						targetHero.carId = null;
					}
					// NEW: Check for survivor loss
					if (targetHero.survivorsCarried > 0) {
						addToLog(`The ${targetHero.survivorsCarried} survivors with ${targetHero.name} were killed when they were incapacitated!`, targetHero.id);
						targetHero.survivorsCarried = 0;
					}
					targetHero.targetMonsterId = null;
					addToLog(`${targetHero.name} was incapacitated by ${monster.name} (#${monster.id})!`, targetHero.id);
				}
			}
		}
	});
	
	// 4. Unassigned Monsters Attack City
	gameState.activeMonsters.forEach(monster => {
		if (monster.assignedTo.length === 0) {
			if (!monster.targetBuilding) {
				const validTargets = gameState.city.buildings.filter(b => b.state !== 'ruined');
				if (validTargets.length > 0) {
					monster.targetBuilding = validTargets[Math.floor(Math.random() * validTargets.length)].id;
				}
			}
			
			if (monster.targetBuilding) {
				const bldg = gameState.city.buildings.find(b => b.id === monster.targetBuilding);
				if (bldg && bldg.state !== 'ruined') {
					const monsterDamage = parseRange(monster.damage);
					if (bldg.shieldHp > 0) {
						const damageToShield = Math.min(bldg.shieldHp, monsterDamage);
						bldg.shieldHp -= damageToShield;
						if (bldg.owner === 'player' && bldg.shieldHp < 1) bldg.shieldHp = 1;
						addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) dealt ${damageToShield} damage to the shield on ${bldg.name || `Building #${bldg.id}`}.`);
						if (bldg.shieldHp === 0 || (bldg.owner === 'player' && bldg.shieldHp === 1)) {
							addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) effectively destroyed the shield on ${bldg.name || `Building #${bldg.id}`}!`);
						}
					} else {
						const damageToHp = Math.min(bldg.hp, monsterDamage);
						bldg.hp -= damageToHp;
						if (bldg.owner === 'player' && bldg.hp < 1) bldg.hp = 1;
						addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) dealt ${damageToHp} damage to ${bldg.name || `Building #${bldg.id}`}.`);
						if (bldg.hp <= 0 && bldg.owner !== 'player') {
							bldg.hp = 0;
							bldg.state = 'ruined';
							bldg.population = 0;
							monster.targetBuilding = null;
							addToLog(`${bldg.name || `Building #${bldg.id}`} was ruined by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
						} else if (bldg.hp <= 5 && bldg.state === 'functional') {
							bldg.state = 'damaged';
							addToLog(`${bldg.name || `Building #${bldg.id}`} was damaged by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
						}
					}
				} else {
					monster.targetBuilding = null;
				}
			}
		}
	});
	
	// 5. Centralized monster defeat and reward logic
	const defeatedMonsters = gameState.activeMonsters.filter(m => m.currentHp <= 0);
	if (defeatedMonsters.length > 0) {
		defeatedMonsters.forEach(monster => {
			addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) was defeated!`);
			
			const attackers = monster.assignedTo
				.map(id => gameState.heroes.find(h => h.id === id))
				.filter(Boolean);
			
			if (attackers.length > 0) {
				const xpPerHero = Math.ceil(monster.xp / attackers.length);
				const tokensPerHero = Math.ceil((monster.tokens || 0) / attackers.length);
				
				attackers.forEach(hero => {
					if (hero.targetMonsterId === monster.id) {
						hero.targetMonsterId = null;
					}
					
					hero.xp.current += xpPerHero;
					hero.tokens += tokensPerHero;
					addToLog(`${hero.name} gained ${xpPerHero} XP and ${tokensPerHero} Tokens.`, hero.id);
					
					const lootChance = hero.class === 'Vanguard' ? 0.4 : 0.25;
					if (Math.random() < lootChance) {
						const possibleDrops = gameData.items.filter(item => item.level === monster.level && item.type !== 'Junk');
						if (possibleDrops.length > 0) {
							const dropped = possibleDrops[Math.floor(Math.random() * possibleDrops.length)];
							hero.inventory[dropped.id] = (hero.inventory[dropped.id] || 0) + 1;
							addToLog(`${hero.name} found an item: ${dropped.name}!`, hero.id);
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
						addToLog(`${hero.name} reached Level ${hero.level}!`, hero.id);
					}
				});
			}
		});
		
		gameState.activeMonsters = gameState.activeMonsters.filter(m => m.currentHp > 0);
		
		// NEW: If all monsters are defeated, resume the paused mission.
		if (gameState.activeMonsters.length === 0 && gameState.party.pausedMission) {
			addToLog('Combat finished. Resuming mission...');
			gameState.party.missionState = gameState.party.pausedMission.state;
			gameState.party.missionTimer = gameState.party.pausedMission.timer;
			gameState.party.pausedMission = null;
		}
	}
	
	// 6. Daily Updates
	// MODIFIED: Removed passive population and car battery logic.
	
	renderHeader();
	if (activeTab === 'Heroes') {
		renderMissionControl(); // NEW: Update mission UI
		renderHeroes();
	}
	if (activeTab === 'Buildings') renderBuildings(contentArea);
	if (activeTab === 'Monsters') renderMonsters(contentArea);
	if (activeTab === 'Cars') renderCars(contentArea);
	if (activeTab === 'City') renderCity(contentArea);
	if (activeTab === 'Items') renderItemsOverview(contentArea);
	if (activeTab === 'Log') renderLog(contentArea);
	if (activeTab === 'Sandbox') renderSandbox(contentArea);
}

// --- INITIALIZATION ---
async function init () {
	try {
		// MODIFIED: Fetch new cars.json and car_upgrades.json
		const [items, skills, monsters, systemShop, buildingUpgrades, carUpgrades, cars] = await Promise.all([
			fetch('./data/items.json').then(res => res.json()),
			fetch('./data/skills.json').then(res => res.json()),
			fetch('./data/monsters.json').then(res => res.json()),
			fetch('./data/system_shop.json').then(res => res.json()),
			fetch('./data/building_upgrades.json').then(res => res.json()),
			fetch('./data/car_upgrades.json').then(res => res.json()),
			fetch('./data/cars.json').then(res => res.json()) // NEW
		]);
		gameData.items = items;
		gameData.skills = skills;
		gameData.monsters = monsters;
		gameData.system_shop = systemShop;
		gameData.building_upgrades = buildingUpgrades;
		gameData.car_upgrades = carUpgrades;
		gameData.cars = cars; // NEW
		
		// MODIFIED: Populate gameState with cars using the new single-owner structure.
		gameState.city.cars = gameData.cars.map(carData => ({
			id: carData.id,
			ownerId: null, // NEW: Use ownerId to track the hero who owns the car.
			name: carData.name,
			upgrades: [...carData.upgrades], // Copy initial upgrades
			maxOccupants: 1 // NEW: All cars have a max capacity of 1.
		}));
		
		// NEW: Assign starting cars to heroes
		const basicCars = gameData.cars.filter(c => c.upgrades.length === 0);
		const shuffledBasicCars = basicCars.sort(() => 0.5 - Math.random());
		
		gameState.heroes.forEach((hero, index) => {
			if (shuffledBasicCars[index]) {
				const carId = shuffledBasicCars[index].id;
				const carInState = gameState.city.cars.find(c => c.id === carId);
				if (carInState && !carInState.ownerId) {
					carInState.ownerId = hero.id;
					hero.carId = carId;
				}
			}
		});
		addToLog('[SYSTEM]: Initial vehicles have been assigned to the starting heroes.');
		
		// NEW: Create initial player safezones
		const potentialSafezoneBuildings = gameState.city.buildings.filter(b => b.owner !== 'player');
		const shuffledBuildings = potentialSafezoneBuildings.sort(() => 0.5 - Math.random());
		const baseNames = ['Alpha Base', 'Beta Base', 'Delta Base'];
		
		for (let i = 0; i < 3; i++) {
			if (shuffledBuildings[i]) {
				const building = shuffledBuildings[i];
				building.owner = 'player';
				building.name = baseNames[i];
				building.state = 'functional';
				building.maxHp = 1000;
				building.hp = 1000;
				building.maxShieldHp = 1000;
				building.shieldHp = 1000;
				building.isSafezone = true;
				building.population = 0; // Start with zero population
			}
		}
		addToLog('[SYSTEM]: Initial safezones Alpha, Beta, and Delta have been established.');
	} catch (error) {
		console.error('Failed to load game data:', error);
		contentArea.innerHTML = `<p class="text-error">Error: Could not load game data. Please check the console.</p>`;
		return;
	}
	
	renderHeader();
	renderTabs(activeTab, TABS);
	renderContent();
	
	tabsContainer.addEventListener('click', (e) => {
		if (e.target.matches('[data-tab]')) {
			activeTab = e.target.dataset.tab;
			renderTabs(activeTab, TABS);
			renderContent();
		}
	});
	
	document.body.addEventListener('click', (e) => {
		if (e.target.matches('[data-sell-item-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const itemId = e.target.dataset.sellItemId;
			handleSellItem(heroId, itemId);
			const modal = getEl('system-shop-modal');
			if (modal.open) {
				renderShopModal(heroId);
			}
			renderContent();
			return;
		}
		
		const inventoryItem = e.target.closest('[data-inventory-item]');
		const inShopModal = e.target.closest('#system-shop-modal');
		if (inventoryItem && !inShopModal) {
			const heroId = parseInt(inventoryItem.dataset.heroId, 10);
			const itemId = inventoryItem.dataset.itemId;
			const itemData = gameData.items.find(i => i.id === itemId);
			if (itemData && itemData.type === 'Consumable') {
				if (handleUseConsumable(heroId, itemId)) {
					renderContent();
				}
			}
			return;
		}
		
		if (e.target.matches('[data-open-shop-btn]')) {
			const card = e.target.closest('.card');
			if (card && card.id.startsWith('hero-card-')) {
				const heroId = parseInt(card.id.replace('hero-card-', ''), 10);
				renderShopModal(heroId);
			}
			return;
		}
		
		const autoCastBtn = e.target.closest('[data-autocast-skill-id]');
		if (autoCastBtn) {
			const heroId = parseInt(autoCastBtn.dataset.heroId, 10);
			const skillId = autoCastBtn.dataset.autocastSkillId;
			const hero = gameState.heroes.find(h => h.id === heroId);
			if (hero) {
				if (hero.autoCastSkillId === skillId) {
					hero.autoCastSkillId = null;
					addToLog(`${hero.name} disabled auto-cast.`, hero.id);
				} else {
					hero.autoCastSkillId = skillId;
					const skillName = gameData.skills.find(s => s.id === skillId).name;
					addToLog(`${hero.name} set auto-cast skill to: ${skillName}.`, hero.id);
				}
				renderContent();
			}
			return;
		}
		
		// MODIFIED: Removed the separate target selection event listener as it's now obsolete.
		// const setTargetBtn = e.target.closest('[data-set-target-hero-id]');
		
		if (e.target.matches('[data-skill-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const skillId = e.target.dataset.skillId;
			const hero = gameState.heroes.find(h => h.id === heroId);
			const skillData = gameData.skills.find(s => s.id === skillId);
			
			// NEW: Get target hero ID from the button itself for targeted skills.
			const targetHeroId = e.target.dataset.targetHeroId ? parseInt(e.target.dataset.targetHeroId, 10) : null;
			
			if (skillData.class === 'Aegis') {
				const options = {};
				if (skillData.actionType === 'heal') {
					// NEW: If a target was clicked via a specific button, set it as the new default and pass it to the action.
					if (targetHeroId) {
						hero.skillTargets[skillId] = targetHeroId;
						options.targetHeroId = targetHeroId;
					} else {
						// Fallback to the currently stored target if the button didn't specify one.
						options.targetHeroId = hero.skillTargets[skillId];
					}
				}
				handleAegisAction(heroId, skillId, options);
			} else {
				handleCombatAction(heroId, skillId);
			}
			renderContent();
		}
		
		if (e.target.matches('[data-buy-item-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const itemId = e.target.dataset.buyItemId;
			handleBuyItem(heroId, itemId);
			renderShopModal(heroId);
			renderContent();
		}
		if (e.target.matches('[data-buy-skill-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const skillId = e.target.dataset.buySkillId;
			handleBuySkill(heroId, skillId);
			renderShopModal(heroId);
			renderContent();
		}
		// MODIFIED: Event listener for buying upgrades now passes heroId.
		if (e.target.matches('[data-buy-upgrade-id]')) {
			const upgradeId = e.target.dataset.buyUpgradeId;
			const heroId = parseInt(e.target.dataset.heroId, 10);
			handleBuyUpgrade(heroId, upgradeId);
			renderShopModal(heroId);
			renderContent();
		}
		if (e.target.matches('[data-buy-building-id]')) {
			const buildingId = parseInt(e.target.dataset.buyBuildingId, 10);
			handleBuyBuilding(buildingId);
			renderContent();
		}
		if (e.target.matches('[data-enter-building-hero]')) {
			const heroId = parseInt(e.target.dataset.enterBuildingHero, 10);
			const buildingId = parseInt(e.target.dataset.enterBuildingBldg, 10);
			handleEnterBuilding(heroId, buildingId);
			renderContent();
		}
		if (e.target.matches('[data-exit-building-hero]')) {
			const heroId = parseInt(e.target.dataset.exitBuildingHero, 10);
			handleExitBuilding(heroId);
			renderContent();
		}
		
		// NEW: Event listener for confirming car purchase from modal
		const confirmBuyCarBtn = e.target.closest('[data-confirm-buy-car]');
		if (confirmBuyCarBtn) {
			const heroId = parseInt(confirmBuyCarBtn.dataset.heroId, 10);
			const carId = confirmBuyCarBtn.dataset.carId;
			
			handleBuyCar(heroId, carId);
			
			const modal = getEl('car-purchase-modal');
			if (modal) {
				modal.close();
			}
			
			renderContent();
			return;
		}
		
		// MODIFIED: Event listener for initiating car purchase.
		if (e.target.matches('[data-buy-car-id]')) {
			const carId = e.target.dataset.buyCarId;
			initiateCarPurchase(carId);
		}
		
		// MODIFIED: Event listener for starting a mission now ensures all heroes leave buildings.
		const missionBtn = e.target.closest('#mission-btn');
		if (missionBtn) {
			if (gameState.party.missionState === 'idle') {
				// Make all heroes exit any buildings they are in.
				gameState.heroes.forEach(hero => {
					if (hero.location !== 'field') {
						handleExitBuilding(hero.id);
					}
				});
				
				const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
				const maxPopulation = playerBases.length * 10;
				const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
				const isFull = currentPopulation >= maxPopulation;
				
				const missionType = isFull ? 'monster hunt' : 'survivor rescue';
				addToLog(`The party is embarking on a ${missionType}!`);
				
				gameState.party.missionState = 'driving_out';
				gameState.party.missionTimer = 1; // Start with a 1-second timer for the first search cycle.
			}
			return;
		}
		
		// NEW: Event listener for the Flee button.
		const fleeBtn = e.target.closest('#flee-btn');
		if (fleeBtn) {
			addToLog('The party is fleeing from combat!');
			gameState.activeMonsters = [];
			gameState.heroes.forEach(h => { h.targetMonsterId = null; });
			
			if (gameState.party.pausedMission) {
				addToLog('Resuming mission after fleeing...');
				gameState.party.missionState = gameState.party.pausedMission.state;
				gameState.party.missionTimer = gameState.party.pausedMission.timer;
				gameState.party.pausedMission = null;
			} else {
				// Should not happen if flee is only available in combat, but as a fallback:
				gameState.party.missionState = 'idle';
			}
			return;
		}
		
		if (e.target.matches('[data-open-upgrade-modal]')) {
			const buildingId = parseInt(e.target.dataset.openUpgradeModal, 10);
			alert(`Placeholder: Open upgrade modal for Building #${buildingId}`);
		}
		
		// NEW: Event listener for the battle log toggle.
		if (e.target.matches('[data-toggle-battle-log]')) {
			// The checkbox state has already changed due to the click event.
			// We just need to re-render the heroes to update the log view instantly.
			if (activeTab === 'Heroes') {
				renderContent();
			}
			return; // This is a specific UI action, so we can stop further processing.
		}
		
		const logToggler = e.target.closest('[data-toggle-log]');
		if (logToggler) {
			const logContainer = logToggler.parentElement.nextElementSibling; // MODIFIED: Find sibling of parent
			if (logContainer && logContainer.matches('[data-hero-log-list]')) {
				logContainer.classList.toggle('hidden');
			}
			return;
		}
		if (e.target.id === 'sandbox-apply') {
			applySandboxChanges();
			renderContent();
		}
	});
	
	setInterval(gameLoop, 1000);
}

document.addEventListener('DOMContentLoaded', init);
