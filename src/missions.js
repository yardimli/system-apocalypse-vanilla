import { gameState, gameData } from './state.js';
import { addToLog, updateTextIfChanged, updateProgressIfChanged } from './utils.js';
import { handleExitBuilding, handleEnterBuilding } from './buildings.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Renders the mission control panel using a granular update strategy.
 * This includes mission status, progress, survivor counts, and action buttons.
 */
export function renderMissionControl () {
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
				<progress class="progress progress-primary w-full" value="0" max="100" data-mission-progress></progress>
			</div>
			<div class="flex gap-4" data-mission-buttons>
				<!-- Buttons will be injected here -->
			</div>
		`;
	}
	
	// Get references to the dynamic elements.
	const statusEl = missionControlArea.querySelector('[data-mission-status]');
	const progressEl = missionControlArea.querySelector('[data-mission-progress]');
	const buttonsEl = missionControlArea.querySelector('[data-mission-buttons]');
	
	// --- Logic from the old function ---
	const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
	const maxPopulation = playerBases.length * 10;
	const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
	const isFull = currentPopulation >= maxPopulation;
	const isFighting = gameState.activeMonsters.length > 0;
	const partyState = gameState.party;
	
	// Determine status text
	let statusText = 'The party is idle at the base.';
	// Check if party is incapacitated and waiting to heal.
	const heroesInField = gameState.heroes.filter(h => h.location === 'field');
	const allIncapacitated = heroesInField.length > 0 && heroesInField.every(h => h.hp.current <= 0);
	
	if (isFighting) {
		statusText = 'Ambushed! Fighting for survival!';
	} else if (partyState.missionState === 'in_combat' && allIncapacitated) { // NEW
		statusText = 'Party incapacitated! Waiting for heroes to be healed to continue...';
	} else if (partyState.missionState === 'driving_out') {
		const distance = Math.floor(3000 * (partyState.missionProgress / 100));
		statusText = `Driving out... Distance: ${distance}m.`;
	} else if (partyState.missionState === 'driving_back') {
		const distance = Math.floor(3000 * (partyState.missionProgress / 100));
		statusText = `Driving back... Distance: ${distance}m.`;
	} else if (partyState.missionState === 'driving_to_attack') { // NEW
		const monster = gameState.activeMonsters.find(m => m.id === partyState.targetMonsterId);
		const monsterName = monster ? monster.name : 'a monster';
		statusText = `Driving to intercept ${monsterName}...`;
	} else if (partyState.missionState === 'in_combat') {
		statusText = 'Ambushed! Mission paused.';
	}
	
	// Update the elements if their content has changed.
	updateTextIfChanged(statusEl, statusText);
	updateProgressIfChanged(progressEl, partyState.missionProgress, 100);
	
	// Determine button state and update HTML only if necessary.
	const buttonText = isFull ? 'Look for Monsters' : 'Look for Survivors';
	const buttonDisabled = partyState.missionState !== 'idle';
	const buttonsStateKey = `${isFighting}-${buttonDisabled}`;
	
	if (buttonsEl.getAttribute('data-prev-state') !== buttonsStateKey) {
		let buttonsHtml = '';
		if (isFighting) {
			buttonsHtml += '<button id="flee-btn" class="btn btn-warning">Flee</button>';
		}
		buttonsHtml += `
            <button id="mission-btn" class="btn btn-primary" ${buttonDisabled ? 'disabled' : ''}>
                ${buttonText}
            </button>
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
	const maxPopulation = playerBases.length * 10;
	const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
	const isFull = currentPopulation >= maxPopulation;
	
	const missionType = isFull ? 'monster hunt' : 'survivor rescue';
	addToLog(`The party is embarking on a ${missionType}!`);
	
	gameState.party.missionState = 'driving_out';
	gameState.party.missionTimer = 10; // 10-second trip out
	gameState.party.missionProgress = 0;
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
			// Set the monster's distance based on how far the party was on their mission.
			if (gameState.party.pausedMission) {
				const missionProgress = gameState.party.pausedMission.progress;
				monster.distanceFromCity = 3000 * (missionProgress / 100);
			}
			// The monster is now unassigned and will act independently.
			monster.assignedTo = [];
		}
	});
	
	gameState.heroes.forEach(h => { h.targetMonsterId = null; });
	
	// MODIFIED SECTION START
	const paused = gameState.party.pausedMission;
	if (paused) {
		// If it was a specific attack mission, calculate the return trip based on the monster's distance.
		if (paused.attackTargetId) {
			const targetMonster = gameState.activeMonsters.find(m => m.id === paused.attackTargetId);
			const distance = targetMonster ? targetMonster.distanceFromCity : 1500; // Fallback distance
			
			gameState.party.missionState = 'driving_back';
			// Progress is based on distance, assuming 3000m is 100%
			gameState.party.missionProgress = (distance / 3000) * 100;
			// Timer is based on progress (10 ticks for a full 100% trip)
			gameState.party.missionTimer = Math.ceil(gameState.party.missionProgress / 10);
		} else {
			// Original logic for ambushes on regular missions.
			gameState.party.missionState = 'driving_back';
			gameState.party.missionProgress = paused.progress;
			gameState.party.missionTimer = Math.ceil(paused.progress / 10);
		}
		
		gameState.party.pausedMission = null;
	} else {
		// Fallback if flee is somehow triggered outside of a mission ambush.
		gameState.party.missionState = 'idle';
		// Reset progress and timer for a clean state.
		gameState.party.missionProgress = 0;
		gameState.party.missionTimer = 0;
	}
	// MODIFIED SECTION END
}

/**
 * Processes the main mission state machine for each game tick.
 * This includes movement, monster spawning, and survivor searching.
 */
export function processMissionTick () {
	if (!['driving_out', 'driving_back', 'driving_to_attack'].includes(gameState.party.missionState)) {
		return;
	}
	
	// 1. Handle Monster Spawning (Ambush)
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
					agro: {},
					speed: monsterData.speed || 50
				};
				// Set the monster's distance from the city based on mission progress.
				newMonster.distanceFromCity = 3000 * (gameState.party.missionProgress / 100);
				
				gameState.activeMonsters.push(newMonster);
				addToLog(`AMBUSH! A Lv.${monsterData.level} ${monsterData.name} (#${newMonster.id}) appeared!`);
				
				// Pause the mission for combat
				gameState.party.pausedMission = {
					state: gameState.party.missionState,
					timer: gameState.party.missionTimer,
					progress: gameState.party.missionProgress
				};
				gameState.party.missionState = 'in_combat';
				gameState.party.missionTimer = 0;
				wasAmbushed = true;
				break; // Only one ambush per tick
			}
		}
	}
	
	// If ambushed, stop mission processing for this tick
	if (wasAmbushed) return;
	
	// 2. Handle Survivor Searching (while driving)
	const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
	const maxPopulation = playerBases.length * 10;
	const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
	const isBaseFull = currentPopulation >= maxPopulation;
	
	// Only search for survivors if the base is not full.
	if (!isBaseFull && Math.random() < 0.05) { // 5% chance per tick to find survivors
		const heroesOnMission = gameState.heroes.filter(h => h.carId && h.hp.current > 0);
		const totalCapacity = heroesOnMission.reduce((sum, h) => {
			const car = gameState.city.cars.find(c => c.id === h.carId);
			return sum + (car ? car.survivorCapacity : 0);
		}, 0);
		const currentCarried = heroesOnMission.reduce((sum, h) => sum + h.survivorsCarried, 0);
		const availableSpace = totalCapacity - currentCarried;
		
		if (availableSpace > 0) {
			const survivorsFound = Math.floor(Math.random() * 5) + 1; // Find 1-5 survivors
			const survivorsToTake = Math.min(survivorsFound, availableSpace);
			addToLog(`The party found ${survivorsFound} survivors while travelling and picked up ${survivorsToTake}!`);
			
			// Store initial survivor counts to log the distribution delta.
			const initialCounts = new Map();
			heroesOnMission.forEach(hero => {
				initialCounts.set(hero.id, hero.survivorsCarried);
			});
			
			let survivorsToDistribute = survivorsToTake;
			// Distribute survivors among cars with available space.
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
				if (!distributedThisLoop) {
					break; // Safeguard against infinite loops if no space is available.
				}
			}
			
			// Log the detailed distribution of survivors to each hero's log.
			heroesOnMission.forEach(hero => {
				const initialCount = initialCounts.get(hero.id);
				const finalCount = hero.survivorsCarried;
				const pickedUp = finalCount - initialCount;
				if (pickedUp > 0) {
					const car = gameState.city.cars.find(c => c.id === hero.carId);
					const carName = car ? car.name : 'their car';
					// Add the log entry to the specific hero's log.
					addToLog(`picked up ${pickedUp} survivor(s), bringing the total in ${carName} to ${finalCount}.`, hero.id);
				}
			});
		}
	}
	
	// 3. Process Mission Timer and State
	gameState.party.missionTimer--;
	
	// Handle progress for different mission types.
	if (gameState.party.missionState === 'driving_out') {
		const totalTime = 10;
		gameState.party.missionProgress = 100 - ((gameState.party.missionTimer / totalTime) * 100);
	} else if (gameState.party.missionState === 'driving_back') {
		const totalTime = 10;
		gameState.party.missionProgress = (gameState.party.missionTimer / totalTime) * 100;
	} else if (gameState.party.missionState === 'driving_to_attack') {
		// Progress for attack missions is not visually important in the same way.
		gameState.party.missionProgress = 0;
	}
	
	if (gameState.party.missionTimer <= 0) {
		if (gameState.party.missionState === 'driving_out') {
			// The party no longer waits at the destination. They immediately start the return trip.
			addToLog('The party has reached the furthest point and is returning to base.');
			gameState.party.missionState = 'driving_back';
			gameState.party.missionTimer = 10; // 10-second trip back
		} else if (gameState.party.missionState === 'driving_back') {
			// Arrived back at base
			const totalSurvivors = gameState.heroes.reduce((sum, h) => sum + h.survivorsCarried, 0);
			if (totalSurvivors > 0) {
				addToLog(`The party successfully returned with ${totalSurvivors} survivors!`);
				let survivorsToHouse = totalSurvivors;
				// Logic to distribute survivors among available player buildings.
				const playerBasesWithSpace = gameState.city.buildings.filter(b => b.owner === 'player' && b.population < 10);
				
				if (playerBasesWithSpace.length > 0) {
					while (survivorsToHouse > 0) {
						let housedThisLoop = false;
						for (const base of playerBasesWithSpace) {
							if (survivorsToHouse > 0 && base.population < 10) {
								base.population++;
								survivorsToHouse--;
								housedThisLoop = true;
							}
						}
						if (!housedThisLoop) {
							break; // Break if a full loop occurs with no one housed (all bases are full).
						}
					}
				}
				
				// Add a log message if any survivors could not be housed.
				if (survivorsToHouse > 0) {
					addToLog(`Could not house ${survivorsToHouse} survivors because all safezones are full! They have departed.`);
				}
			} else {
				addToLog('The party has successfully returned to base.');
			}
			
			// Move all heroes into a base building and reset mission state
			const firstBase = gameState.city.buildings.find(b => b.owner === 'player');
			if (firstBase) {
				gameState.heroes.forEach(h => handleEnterBuilding(h.id, firstBase.id));
			}
			gameState.heroes.forEach(h => { h.survivorsCarried = 0; });
			gameState.party.missionState = 'idle';
			gameState.party.missionTimer = 0;
			gameState.party.missionProgress = 0;
			// MODIFIED SECTION START
		} else if (gameState.party.missionState === 'driving_to_attack') {
			const monster = gameState.activeMonsters.find(m => m.id === gameState.party.targetMonsterId);
			if (monster) {
				addToLog(`The party has reached ${monster.name} and is engaging in combat!`);
				// Assign all combat-capable heroes to the target monster.
				gameState.heroes.forEach(hero => {
					if (hero.location === 'field' && (hero.class === 'Striker' || hero.class === 'Vanguard') && hero.hp.current > 0) {
						hero.targetMonsterId = monster.id;
					}
				});
				gameState.party.missionState = 'in_combat';
				// The mission is effectively over, it just becomes a combat encounter.
				// We pause a mission and add the target ID to know it was a specific hunt.
				// This allows the main game loop to handle the "return to base" logic upon victory.
				gameState.party.pausedMission = {
					state: 'idle', // This state is a placeholder; the main loop will override it.
					timer: 0,
					progress: 0,
					attackTargetId: gameState.party.targetMonsterId // Flag this as a specific attack mission.
				};
			} else {
				addToLog(`The target monster is gone! Returning to base.`);
				gameState.party.missionState = 'idle';
			}
			gameState.party.targetMonsterId = null;
			gameState.party.missionProgress = 0;
		}
		// MODIFIED SECTION END
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
	
	// If monster is at the city, travel distance is short. Otherwise, it's their current distance.
	const distanceToTravel = monster.distanceFromCity > 0 ? monster.distanceFromCity : 100;
	// Travel time is 1 tick per 300 meters.
	const travelTime = Math.ceil(distanceToTravel / 300);
	
	gameState.party.missionState = 'driving_to_attack';
	gameState.party.missionTimer = travelTime;
	gameState.party.missionProgress = 0;
	gameState.party.targetMonsterId = monsterId;
}
