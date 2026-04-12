import { gameState, gameData } from './state.js';
import { addToLog, updateTextIfChanged, updateProgressIfChanged } from './utils.js';
import { handleExitBuilding, handleEnterBuilding } from './buildings.js';
import { recalculateHeroStats } from './heroes.js'; // Added import

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Renders the mission control panel using a granular update strategy.
 * This includes mission status, survivor counts, and action buttons.
 * @param {number} alpha - The interpolation factor (0.0 to 1.0) for smooth rendering between ticks.
 */
export function renderMissionControl (alpha = 0) {
	const missionControlArea = getEl('mission-control-area');
	if (!missionControlArea) return;
	
	// If the static structure isn't there, create it.
	if (!missionControlArea.querySelector('[data-mission-status]')) {
		missionControlArea.innerHTML = `
			<div class="flex-grow flex flex-col gap-2">
				<div>
					<h3 class="font-bold text-lg">Party Mission</h3>
					<p class="text-sm text-gray-400" data-mission-status></p>
				</div>
				<div data-mission-progress-container class="h-4"></div>
			</div>
			<div class="flex gap-4" data-mission-buttons>
				<!-- Buttons will be injected here -->
			</div>
		`;
	}
	
	// Get references to the dynamic elements.
	const statusEl = missionControlArea.querySelector('[data-mission-status]');
	const progressContainerEl = missionControlArea.querySelector('[data-mission-progress-container]');
	const buttonsEl = missionControlArea.querySelector('[data-mission-buttons]');
	
	const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
	// Calculate max population by summing up capacities of all player-owned bases.
	const maxPopulation = playerBases.reduce((sum, b) => sum + b.maxPopulation, 0);
	const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
	const isFull = currentPopulation >= maxPopulation;
	const partyState = gameState.party;
	
	// Interpolate distance for smooth progress bar and text updates.
	const startDistance = partyState.previousMissionDistance || 0;
	const endDistance = partyState.missionDistance;
	const interpolatedDistance = startDistance + (endDistance - startDistance) * alpha;
	
	// Determine status text
	let statusText;
	const heroesInField = gameState.heroes.filter(h => h.location === 'field');
	const allIncapacitated = heroesInField.length > 0 && heroesInField.every(h => h.hp.current <= 0);
	
	if (partyState.missionState === 'in_combat') {
		if (allIncapacitated) {
			statusText = 'Party incapacitated! Waiting for heroes to be healed to continue...';
		} else {
			if (partyState.pausedMission && partyState.pausedMission.attackTargetId) {
				const monster = gameState.activeMonsters.find(m => m.id === partyState.pausedMission.attackTargetId);
				const monsterName = monster ? monster.name : 'the target';
				statusText = `Attacking ${monsterName}!`;
			} else {
				statusText = 'Ambushed! Fighting for survival!';
			}
		}
	} else if (partyState.missionState === 'driving_out') {
		statusText = `Driving out... Distance: ${Math.floor(interpolatedDistance)}m.`;
	} else if (partyState.missionState === 'driving_back') {
		statusText = `Driving back... Distance: ${Math.floor(interpolatedDistance)}m.`;
	} else if (partyState.missionState === 'driving_to_attack') {
		const monster = gameState.activeMonsters.find(m => m.id === partyState.targetMonsterId);
		const monsterName = monster ? monster.name : 'a monster';
		const totalDistance = partyState.missionTargetDistance;
		statusText = `Driving to intercept ${monsterName}... (${Math.floor(interpolatedDistance)}/${totalDistance}m)`;
	} else { // 'idle'
		statusText = 'The party is idle at the base.';
	}
	
	// Update the elements if their content has changed.
	updateTextIfChanged(statusEl, statusText);
	
	const isMissionActive = partyState.missionState !== 'idle';
	const progressBarStateKey = String(isMissionActive);
	
	if (progressContainerEl.getAttribute('data-prev-state') !== progressBarStateKey) {
		if (isMissionActive) {
			progressContainerEl.innerHTML = '<progress class="progress progress-primary w-full"></progress>';
		} else {
			progressContainerEl.innerHTML = '';
		}
		progressContainerEl.setAttribute('data-prev-state', progressBarStateKey);
	}
	
	const buttonText = isFull ? 'Look for Monsters' : 'Look for Survivors';
	const buttonDisabled = partyState.missionState !== 'idle';
	const activeMonsters = gameState.activeMonsters;
	const canFight = activeMonsters.length > 0 && partyState.missionState === 'idle';
	
	const buttonsStateKey = `${partyState.missionState}-${buttonDisabled}-${activeMonsters.length}`;
	
	if (buttonsEl.getAttribute('data-prev-state') !== buttonsStateKey) {
		let buttonsHtml = '';
		if (partyState.missionState === 'in_combat') {
			buttonsHtml += '<button id="flee-btn" class="btn btn-warning">Flee</button>';
		}
		
		buttonsHtml += `
            <button id="mission-btn" class="btn btn-primary" ${buttonDisabled ? 'disabled' : ''}>
                ${buttonText}
            </button>
        `;
		
		buttonsHtml += `
			<div class="dropdown dropdown-top">
				<div tabindex="0" role="button" class="btn btn-error" ${!canFight ? 'disabled' : ''}>Fight</div>
				<ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-72 max-h-60 overflow-y-auto">
					${activeMonsters.map(monster => `
						<li>
							<a data-attack-monster-id="${monster.id}" class="justify-between">
								<div>
									<div>Lv.${monster.level} ${monster.name}</div>
									<div class="text-xs opacity-60">${Math.floor(monster.currentHp)}/${monster.maxHp} HP</div>
								</div>
								<div class="badge badge-ghost">${Math.floor(monster.distanceFromCity)}m</div>
							</a>
						</li>
					`).join('')}
				</ul>
			</div>
		`;
		
		buttonsEl.innerHTML = buttonsHtml;
		buttonsEl.setAttribute('data-prev-state', buttonsStateKey);
	}
}

/**
 * Starts a new mission, moving heroes out of buildings and into their cars.
 */
export function handleStartMission () {
	if (gameState.party.missionState !== 'idle') return;
	
	// Make all heroes exit any buildings they are in.
	gameState.heroes.forEach(hero => {
		if (hero.location !== 'field') {
			handleExitBuilding(hero.id);
		}
	});
	
	const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
	// Calculate max population by summing up capacities of all player-owned bases.
	const maxPopulation = playerBases.reduce((sum, b) => sum + b.maxPopulation, 0);
	const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
	const isFull = currentPopulation >= maxPopulation;
	
	const missionType = isFull ? 'monster hunt' : 'survivor rescue';
	addToLog(`The party is embarking on a ${missionType}!`);
	
	gameState.party.missionState = 'driving_out';
	gameState.party.missionDistance = 0;
	gameState.party.previousMissionDistance = 0;
}

/**
 * Handles the party fleeing from combat.
 * The party now immediately starts returning to base instead of resuming their mission.
 */
export function handleFlee () {
	addToLog('The party is fleeing from combat and returning to base!');
	
	const partyHeroes = gameState.heroes.filter(h => h.location === 'field');
	const monsterIdsFought = new Set(partyHeroes.map(h => h.targetMonsterId).filter(Boolean));
	
	monsterIdsFought.forEach(monsterId => {
		const monster = gameState.activeMonsters.find(m => m.id === monsterId);
		if (monster) {
			// Update monster distance based on party's mission distance.
			if (gameState.party.pausedMission) {
				monster.distanceFromCity = gameState.party.pausedMission.distance;
			}
			monster.assignedTo = [];
			monster.agro = {};
		}
	});
	
	gameState.heroes.forEach(h => { h.targetMonsterId = null; });
	
	// Logic now sets the mission distance for the return trip.
	const paused = gameState.party.pausedMission;
	if (paused) {
		if (paused.attackTargetId) {
			const targetMonster = gameState.activeMonsters.find(m => m.id === paused.attackTargetId);
			const distance = targetMonster ? targetMonster.distanceFromCity : 1500;
			
			gameState.party.missionState = 'driving_back';
			gameState.party.missionDistance = distance;
			gameState.party.previousMissionDistance = distance; // Sync to prevent visual jump.
		} else {
			gameState.party.missionState = 'driving_back';
			gameState.party.missionDistance = paused.distance;
			gameState.party.previousMissionDistance = paused.distance; // Sync to prevent visual jump.
		}
		
		gameState.party.pausedMission = null;
	} else {
		// This case should be rare, but as a fallback, go idle.
		gameState.party.missionState = 'idle';
		gameState.party.missionDistance = 0;
	}
}

/**
 * Processes the main mission state machine for each game tick.
 * This includes movement, monster spawning, and survivor searching.
 */
export function processMissionTick () {
	if (!['driving_out', 'driving_back', 'driving_to_attack'].includes(gameState.party.missionState)) {
		return;
	}
	
	// Store the distance from the start of the tick for smooth interpolation.
	gameState.party.previousMissionDistance = gameState.party.missionDistance;
	
	// 1. Handle Monster Spawning (Ambush)
	let wasAmbushed = false;
	if (['driving_out', 'driving_back'].includes(gameState.party.missionState)) {
		const heroesInCars = gameState.heroes.filter(h => h.carId && h.hp.current > 0).length;
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
						agro: {},
						speed: monsterData.speed || 50
					};
					// Set monster distance based on party's current distance.
					newMonster.distanceFromCity = gameState.party.missionDistance;
					
					gameState.activeMonsters.push(newMonster);
					addToLog(`AMBUSH! A Lv.${monsterData.level} ${monsterData.name} (#${newMonster.id}) appeared!`);
					
					// Pause mission state, storing current distance.
					gameState.party.pausedMission = {
						state: gameState.party.missionState,
						distance: gameState.party.missionDistance,
						ambushMonsterId: newMonster.id
					};
					gameState.party.missionState = 'in_combat';
					wasAmbushed = true;
					break;
				}
			}
		}
	}
	
	if (wasAmbushed) return;
	
	// 2. Handle Survivor Searching (while driving)
	const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
	// Calculate max population by summing up capacities of all player-owned bases.
	const maxPopulation = playerBases.reduce((sum, b) => sum + b.maxPopulation, 0);
	const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
	const isBaseFull = currentPopulation >= maxPopulation;
	
	if (!isBaseFull && Math.random() < 0.05) {
		const heroesOnMission = gameState.heroes.filter(h => h.carId && h.hp.current > 0);
		const totalCapacity = heroesOnMission.reduce((sum, h) => {
			const car = gameState.city.cars.find(c => c.id === h.carId);
			return sum + (car ? car.survivorCapacity : 0);
		}, 0);
		const currentCarried = heroesOnMission.reduce((sum, h) => sum + h.survivorsCarried, 0);
		const availableSpace = totalCapacity - currentCarried;
		
		if (availableSpace > 0) {
			const survivorsFound = Math.floor(Math.random() * 5) + 1;
			const survivorsToTake = Math.min(survivorsFound, availableSpace);
			addToLog(`The party found ${survivorsFound} survivors while travelling and picked up ${survivorsToTake}!`);
			
			const initialCounts = new Map();
			heroesOnMission.forEach(hero => {
				initialCounts.set(hero.id, hero.survivorsCarried);
			});
			
			let survivorsToDistribute = survivorsToTake;
			while (survivorsToDistribute > 0) {
				let distributedThisLoop = false;
				for (const hero of heroesOnMission) {
					const car = gameState.city.cars.find(c => c.id === hero.carId);
					if (survivorsToDistribute > 0 && car && hero.survivorsCarried < car.survivorCapacity) {
						hero.survivorsCarried++;
						survivorsToDistribute--;
						distributedThisLoop = true;
					}
				}
				if (!distributedThisLoop) break;
			}
			
			heroesOnMission.forEach(hero => {
				const initialCount = initialCounts.get(hero.id);
				const finalCount = hero.survivorsCarried;
				const pickedUp = finalCount - initialCount;
				if (pickedUp > 0) {
					const car = gameState.city.cars.find(c => c.id === hero.carId);
					const carName = car ? car.name : 'their car';
					addToLog(`picked up ${pickedUp} survivor(s), bringing the total in ${carName} to ${finalCount}.`, hero.id);
				}
			});
		}
	}
	
	// 3. Process Mission Travel and State Changes
	const travelSpeed = 300; // meters per tick
	
	if (gameState.party.missionState === 'driving_out') {
		gameState.party.missionDistance += travelSpeed;
		if (gameState.party.missionDistance >= 3000) {
			gameState.party.missionDistance = 3000;
			addToLog('The party has reached the furthest point (3000m) and is returning to base.');
			gameState.party.missionState = 'driving_back';
		}
	} else if (gameState.party.missionState === 'driving_back') {
		gameState.party.missionDistance -= travelSpeed;
		if (gameState.party.missionDistance <= 0) {
			gameState.party.missionDistance = 0;
			const totalSurvivors = gameState.heroes.reduce((sum, h) => sum + h.survivorsCarried, 0);
			if (totalSurvivors > 0) {
				addToLog(`The party successfully returned with ${totalSurvivors} survivors!`);
				let survivorsToHouse = totalSurvivors;
				// Logic now finds any player-owned building with space according to its own maxPopulation.
				const playerBasesWithSpace = gameState.city.buildings.filter(b => b.owner === 'player' && b.population < b.maxPopulation);
				
				if (playerBasesWithSpace.length > 0) {
					while (survivorsToHouse > 0) {
						let housedThisLoop = false;
						for (const base of playerBasesWithSpace) {
							if (survivorsToHouse > 0 && base.population < base.maxPopulation) {
								base.population++;
								survivorsToHouse--;
								housedThisLoop = true;
							}
						}
						if (!housedThisLoop) break;
					}
				}
				
				if (survivorsToHouse > 0) {
					addToLog(`Could not house ${survivorsToHouse} survivors because all safezones are full! They have departed.`);
				}
			} else {
				addToLog('The party has successfully returned to base.');
			}
			
			const firstBase = gameState.city.buildings.find(b => b.owner === 'player');
			if (firstBase) {
				gameState.heroes.forEach(h => handleEnterBuilding(h.id, firstBase.id));
			}
			gameState.heroes.forEach(h => { h.survivorsCarried = 0; });
			gameState.party.missionState = 'idle';
			gameState.party.missionTargetDistance = 0;
		}
	} else if (gameState.party.missionState === 'driving_to_attack') {
		gameState.party.missionDistance += travelSpeed;
		const targetDistance = gameState.party.missionTargetDistance;
		
		if (gameState.party.missionDistance >= targetDistance) {
			gameState.party.missionDistance = targetDistance;
			const monster = gameState.activeMonsters.find(m => m.id === gameState.party.targetMonsterId);
			if (monster) {
				addToLog(`The party has reached ${monster.name} and is engaging in combat!`);
				
				gameState.heroes.forEach(hero => {
					if (hero.location === 'field' && (hero.class === 'Striker' || hero.class === 'Vanguard') && hero.hp.current > 0) {
						hero.targetMonsterId = monster.id;
					}
				});
				gameState.party.missionState = 'in_combat';
				
				gameState.party.pausedMission = {
					state: 'idle',
					distance: targetDistance,
					attackTargetId: gameState.party.targetMonsterId
				};
			} else {
				addToLog('The target monster is gone! Returning to base.');
				gameState.party.missionState = 'driving_back'; // Start returning
			}
			gameState.party.targetMonsterId = null;
		}
	}
}

/**
 * Starts a mission to intercept a specific monster.
 * @param {number} monsterId - The ID of the monster to attack.
 */
export function handleStartAttackMission (monsterId) {
	if (gameState.party.missionState !== 'idle') {
		addToLog('Cannot start an attack mission while another mission is active.');
		return;
	}
	
	const monster = gameState.activeMonsters.find(m => m.id === monsterId);
	if (!monster) {
		addToLog(`Error: Could not find monster #${monsterId} to attack.`);
		return;
	}
	
	// Make all heroes exit any buildings they are in.
	gameState.heroes.forEach(hero => {
		if (hero.location !== 'field') {
			handleExitBuilding(hero.id);
		}
	});
	
	addToLog(`The party is embarking on a mission to hunt ${monster.name}!`);
	
	const distanceToTravel = monster.distanceFromCity > 0 ? monster.distanceFromCity : 100;
	
	// Initialize distance-based attack mission.
	gameState.party.missionState = 'driving_to_attack';
	gameState.party.missionDistance = 0;
	gameState.party.previousMissionDistance = 0;
	gameState.party.targetMonsterId = monsterId;
	gameState.party.missionTargetDistance = distanceToTravel;
}

/**
 * Manages hero combat assignments, clearing dead targets and assigning idle heroes.
 */
export function manageCombatAssignments () {
	const combatHeroes = gameState.heroes.filter(h =>
		h.location === 'field' &&
		h.hp.current > 0 &&
		h.carId
	);
	
	combatHeroes.forEach(hero => {
		if (hero.targetMonsterId && !gameState.activeMonsters.some(m => m.id === hero.targetMonsterId)) {
			hero.targetMonsterId = null;
		}
	});
	
	if (gameState.party.missionState === 'in_combat') {
		const isAttackMission = gameState.party.pausedMission && gameState.party.pausedMission.attackTargetId;
		
		if (!isAttackMission) {
			const ambushMonsterId = gameState.party.pausedMission ? gameState.party.pausedMission.ambushMonsterId : null;
			if (ambushMonsterId) {
				const targetMonster = gameState.activeMonsters.find(m => m.id === ambushMonsterId);
				if (targetMonster) {
					const idleHeroes = combatHeroes.filter(h => !h.targetMonsterId);
					idleHeroes.forEach(hero => {
						hero.targetMonsterId = targetMonster.id;
					});
				}
			}
		}
	}
	
	gameState.activeMonsters.forEach(m => {
		m.assignedTo = gameState.heroes
			.filter(h => h.targetMonsterId === m.id)
			.map(h => h.id);
	});
}

/**
 * Handles monster defeat, distributing rewards and managing after-combat mission state.
 */
export function handleMonsterDefeat () {
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
					addToLog(`gained ${xpPerHero} XP and ${tokensPerHero} Tokens.`, hero.id);
					
					const lootChance = hero.class === 'Vanguard' ? 0.4 : 0.25;
					if (Math.random() < lootChance) {
						const possibleDrops = gameData.items.filter(item => item.level === monster.level && item.type !== 'Junk');
						if (possibleDrops.length > 0) {
							const dropped = possibleDrops[Math.floor(Math.random() * possibleDrops.length)];
							hero.inventory[dropped.id] = (hero.inventory[dropped.id] || 0) + 1;
							addToLog(`found an item: ${dropped.name}!`, hero.id);
						}
					}
					
					if (hero.xp.current >= hero.xp.max) {
						hero.level++;
						hero.xp.current -= hero.xp.max;
						hero.xp.max = Math.ceil(hero.xp.max * 1.5);
						hero.unspentStatPoints += 3; // Grant 3 stat points per level
						recalculateHeroStats(hero); // Update derived stats
						addToLog(`reached Level ${hero.level}! Gained 3 Stat Points.`, hero.id);
					}
				});
			}
		});
		
		gameState.activeMonsters = gameState.activeMonsters.filter(m => m.currentHp > 0);
		
		const paused = gameState.party.pausedMission;
		if (paused) {
			// Logic now uses distance for mission state changes.
			if (paused.attackTargetId && defeatedMonsters.some(m => m.id === paused.attackTargetId)) {
				addToLog('Target monster defeated! The party is returning to base.');
				gameState.heroes.forEach(h => { h.targetMonsterId = null; });
				
				gameState.party.missionState = 'driving_back';
				// The party's missionDistance is already at the correct location for the return trip.
				gameState.party.previousMissionDistance = gameState.party.missionDistance;
				gameState.party.pausedMission = null;
			} else if (paused.ambushMonsterId && defeatedMonsters.some(m => m.id === paused.ambushMonsterId)) {
				addToLog('Ambush monster defeated. Resuming mission...');
				gameState.party.missionState = paused.state;
				gameState.party.missionDistance = paused.distance;
				gameState.party.previousMissionDistance = paused.distance;
				gameState.party.pausedMission = null;
			}
		}
	}
}
