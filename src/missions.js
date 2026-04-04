import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';
import { handleExitBuilding, handleEnterBuilding } from './buildings.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Renders the mission control panel on the Heroes tab.
 * This includes mission status, progress, survivor counts, and action buttons.
 */
export function renderMissionControl () {
	const missionControlArea = getEl('mission-control-area');
	if (!missionControlArea) return;
	
	const partyState = gameState.party;
	let html = '';
	
	const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
	const maxPopulation = playerBases.length * 10;
	const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
	const isFull = currentPopulation >= maxPopulation;
	
	const isFighting = gameState.activeMonsters.length > 0;
	const buttonText = isFull ? 'Look for Monsters' : 'Look for Survivors';
	const buttonDisabled = partyState.missionState !== 'idle';
	const distance = Math.floor(3000 * (partyState.missionProgress / 100));
	
	let statusText = 'The party is idle at the base.';
	if (isFighting) {
		statusText = 'Ambushed! Fighting for survival!';
	} else if (partyState.missionState === 'driving_out') {
		statusText = `Driving out... Distance: ${distance}m.`;
	} else if (partyState.missionState === 'driving_back') {
		statusText = `Driving back... Distance: ${distance}m.`;
	} else if (partyState.missionState === 'in_combat') {
		statusText = 'Ambushed! Mission paused.';
	}
	
	const heroesOnMission = gameState.heroes.filter(h => h.carId && h.hp.current > 0);
	
	html = `
        <div class="flex-grow flex flex-col gap-2">
            <div>
				<h3 class="font-bold text-lg">Party Mission</h3>
				<p class="text-sm text-gray-400">${statusText}</p>
			</div>
			<progress class="progress progress-primary w-full" value="${partyState.missionProgress}" max="100"></progress>
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
 * Handles the party fleeing from combat, clearing all active monsters.
 */
export function handleFlee () {
	addToLog('The party is fleeing from combat!');
	gameState.activeMonsters = [];
	gameState.heroes.forEach(h => { h.targetMonsterId = null; });
	
	if (gameState.party.pausedMission) {
		addToLog('Resuming mission after fleeing...');
		gameState.party.missionState = gameState.party.pausedMission.state;
		gameState.party.missionTimer = gameState.party.pausedMission.timer;
		// Restore progress from before the ambush
		gameState.party.missionProgress = gameState.party.pausedMission.progress;
		gameState.party.pausedMission = null;
	} else {
		// Fallback if flee is somehow triggered outside of a mission ambush
		gameState.party.missionState = 'idle';
	}
}

/**
 * Processes the main mission state machine for each game tick.
 * This includes movement, monster spawning, and survivor searching.
 */
export function processMissionTick () {
	if (!['driving_out', 'driving_back'].includes(gameState.party.missionState)) {
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
					agro: {}
				};
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
				
				// Survivors being transported are lost in the ambush
				gameState.heroes.forEach(hero => {
					if (hero.survivorsCarried > 0) {
						addToLog(`The ${hero.survivorsCarried} survivors in ${hero.name}'s car were lost in the ambush!`, hero.id);
						hero.survivorsCarried = 0;
					}
				});
				break; // Only one ambush per tick
			}
		}
	}
	
	// If ambushed, stop mission processing for this tick
	if (wasAmbushed) return;
	
	// 2. Process Mission Timer and State
	gameState.party.missionTimer--;
	
	if (gameState.party.missionState === 'driving_out') {
		gameState.party.missionProgress = 100 - (gameState.party.missionTimer * 10);
	} else if (gameState.party.missionState === 'driving_back') {
		gameState.party.missionProgress = gameState.party.missionTimer * 10;
	}
	
	if (gameState.party.missionTimer <= 0) {
		if (gameState.party.missionState === 'driving_out') {
			// MODIFIED: Check if the base is full. If so, the party was just patrolling and should return immediately.
			const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
			const maxPopulation = playerBases.length * 10;
			const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
			const isBaseFull = currentPopulation >= maxPopulation;
			
			if (isBaseFull) {
				addToLog('The base is full. The party completed a patrol and is returning.');
				gameState.party.missionState = 'driving_back';
				gameState.party.missionTimer = 10;
				return; // Exit here to prevent the survivor search logic below.
			}
			
			// Reached max distance, now searching for survivors
			const heroesOnMission = gameState.heroes.filter(h => h.carId && h.hp.current > 0);
			const totalCapacity = heroesOnMission.reduce((sum, h) => {
				const car = gameState.city.cars.find(c => c.id === h.carId);
				return sum + (car ? car.survivorCapacity : 0);
			}, 0);
			const currentCarried = heroesOnMission.reduce((sum, h) => sum + h.survivorsCarried, 0);
			const availableSpace = totalCapacity - currentCarried;
			
			if (availableSpace <= 0) {
				// Cars are full, start heading back
				addToLog('All vehicles are full. Returning to base.');
				gameState.party.missionState = 'driving_back';
				gameState.party.missionTimer = 10; // 10-second trip back
			} else {
				// Search for survivors (10% chance per tick at max distance)
				if (Math.random() < 0.1) {
					const survivorsFound = Math.floor(Math.random() * 10) + 1; // 1-10 survivors
					const survivorsToTake = Math.min(survivorsFound, availableSpace);
					addToLog(`The party found ${survivorsFound} survivors and picked up ${survivorsToTake}!`);
					
					let survivorsToDistribute = survivorsToTake;
					// MODIFIED: Added a safeguard to the distribution loop to prevent infinite loops.
					while (survivorsToDistribute > 0) {
						let distributedThisLoop = false; // Prevent infinite loops if all cars become full
						for (const hero of heroesOnMission) {
							const car = gameState.city.cars.find(c => c.id === hero.carId);
							if (survivorsToDistribute > 0 && car && hero.survivorsCarried < car.survivorCapacity) {
								hero.survivorsCarried++;
								survivorsToDistribute--;
								distributedThisLoop = true;
							}
						}
						if (!distributedThisLoop) {
							break; // Exit if no survivors could be placed in any car
						}
					}
				}
				// Whether survivors were found or not, check capacity again. If now full, return. Otherwise, search again next tick.
				const newCarried = heroesOnMission.reduce((sum, h) => sum + h.survivorsCarried, 0);
				if (newCarried >= totalCapacity) {
					addToLog('All vehicles are now full. Returning to base.');
					gameState.party.missionState = 'driving_back';
					gameState.party.missionTimer = 10;
				} else {
					gameState.party.missionTimer = 1; // Search again next tick
				}
			}
		} else if (gameState.party.missionState === 'driving_back') {
			// Arrived back at base
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
			
			// Move all heroes into a base building and reset mission state
			const firstBase = gameState.city.buildings.find(b => b.owner === 'player');
			if (firstBase) {
				gameState.heroes.forEach(h => handleEnterBuilding(h.id, firstBase.id));
			}
			gameState.heroes.forEach(h => { h.survivorsCarried = 0; });
			gameState.party.missionState = 'idle';
			gameState.party.missionTimer = 0;
			gameState.party.missionProgress = 0;
		}
	}
}
