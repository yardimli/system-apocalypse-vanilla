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
	
	const playerBases = gameState.city.buildings.filter(b => b.owner === 'player');
	const maxPopulation = playerBases.length * 10;
	const currentPopulation = playerBases.reduce((sum, b) => sum + b.population, 0);
	const isFull = currentPopulation >= maxPopulation;
	const partyState = gameState.party;
	
	// Determine status text
	let statusText;
	const heroesInField = gameState.heroes.filter(h => h.location === 'field');
	const allIncapacitated = heroesInField.length > 0 && heroesInField.every(h => h.hp.current <= 0);
	
	if (partyState.missionState === 'in_combat') {
		if (allIncapacitated) {
			statusText = 'Party incapacitated! Waiting for heroes to be healed to continue...';
		} else {
			// --- MODIFIED SECTION START ---
			// Check if this combat is from a specific attack mission to show a different message.
			if (partyState.pausedMission && partyState.pausedMission.attackTargetId) {
				const monster = gameState.activeMonsters.find(m => m.id === partyState.pausedMission.attackTargetId);
				const monsterName = monster ? monster.name : 'the target';
				statusText = `Attacking ${monsterName}!`;
			} else {
				statusText = 'Ambushed! Fighting for survival!';
			}
			// --- MODIFIED SECTION END ---
		}
	} else if (partyState.missionState === 'driving_out') {
		const distance = Math.floor(3000 * (partyState.missionProgress / 100));
		statusText = `Driving out... Distance: ${distance}m.`;
	} else if (partyState.missionState === 'driving_back') {
		const distance = Math.floor(3000 * (partyState.missionProgress / 100));
		statusText = `Driving back... Distance: ${distance}m.`;
	} else if (partyState.missionState === 'driving_to_attack') {
		const monster = gameState.activeMonsters.find(m => m.id === partyState.targetMonsterId);
		const monsterName = monster ? monster.name : 'a monster';
		const totalDistance = gameState.party.missionTargetDistance;
		const distanceTraveled = Math.floor(totalDistance * (partyState.missionProgress / 100));
		statusText = `Driving to intercept ${monsterName}... (${distanceTraveled}/${totalDistance}m)`;
	} else { // 'idle'
		statusText = 'The party is idle at the base.';
	}
	
	// Update the elements if their content has changed.
	updateTextIfChanged(statusEl, statusText);
	updateProgressIfChanged(progressEl, partyState.missionProgress, 100);
	
	// Determine button state and update HTML only if necessary.
	const buttonText = isFull ? 'Look for Monsters' : 'Look for Survivors';
	const buttonDisabled = partyState.missionState !== 'idle';
	const buttonsStateKey = `${partyState.missionState}-${buttonDisabled}`;
	
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
			// MODIFIED: Clear the monster's threat list so it doesn't re-engage immediately.
			monster.agro = {};
		}
	});
	
	gameState.heroes.forEach(h => { h.targetMonsterId = null; });
	
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
	let wasAmbushed = false;
	// Ambushes should only happen during general exploration ('driving_out','driving_back'), not on the way to a specific target or on any return trip.
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
					// Set the monster's distance from the city based on mission progress.
					newMonster.distanceFromCity = 3000 * (gameState.party.missionProgress / 100);
					
					gameState.activeMonsters.push(newMonster);
					addToLog(`AMBUSH! A Lv.${monsterData.level} ${monsterData.name} (#${newMonster.id}) appeared!`);
					
					// Pause the mission for combat
					gameState.party.pausedMission = {
						state: gameState.party.missionState,
						timer: gameState.party.missionTimer,
						progress: gameState.party.missionProgress,
						ambushMonsterId: newMonster.id // MODIFIED: Track the ambushing monster.
					};
					gameState.party.missionState = 'in_combat';
					gameState.party.missionTimer = 0;
					wasAmbushed = true;
					break; // Only one ambush per tick
				}
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
					const car = gameState.city.cars.find(c => c.id === h.carId);
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
		// Calculate progress based on time elapsed towards the target.
		const totalTime = gameState.party.missionTotalTime;
		if (totalTime > 0) {
			const timeElapsed = totalTime - gameState.party.missionTimer;
			gameState.party.missionProgress = Math.min(100, (timeElapsed / totalTime) * 100);
		}
	}
	
	if (gameState.party.missionTimer <= 0) {
		if (gameState.party.missionState === 'driving_out') {
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
			// Clean up attack mission state variables.
			gameState.party.missionTargetDistance = 0;
			gameState.party.missionTotalTime = 0;
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
					// --- MODIFIED SECTION START ---
					// Set progress to 100 as the party has arrived at the target.
					progress: 100,
					// --- MODIFIED SECTION END ---
					attackTargetId: gameState.party.targetMonsterId // Flag this as a specific attack mission.
				};
			} else {
				addToLog(`The target monster is gone! Returning to base.`);
				gameState.party.missionState = 'idle';
			}
			gameState.party.targetMonsterId = null;
			// Clean up attack mission state variables.
			gameState.party.missionTargetDistance = 0;
			gameState.party.missionTotalTime = 0;
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
	
	// If monster is at the city, travel distance is short. Otherwise, it's their current distance.
	const distanceToTravel = monster.distanceFromCity > 0 ? monster.distanceFromCity : 100;
	// Travel time is 1 tick per 300 meters.
	const travelTime = Math.ceil(distanceToTravel / 300);
	
	gameState.party.missionState = 'driving_to_attack';
	gameState.party.missionTimer = travelTime;
	gameState.party.missionProgress = 0;
	gameState.party.targetMonsterId = monsterId;
	// Store the total distance and time for progress calculation.
	gameState.party.missionTargetDistance = distanceToTravel;
	gameState.party.missionTotalTime = travelTime;
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
	
	// Only perform auto-assignment of new targets if the party is in an active combat state.
	// This prevents heroes from automatically re-engaging a monster after fleeing.
	if (gameState.party.missionState === 'in_combat') {
		const isAttackMission = gameState.party.pausedMission && gameState.party.pausedMission.attackTargetId;
		
		// For random ambushes (not specific attack missions), auto-assign idle heroes to targets.
		if (!isAttackMission) {
			// --- MODIFIED SECTION START ---
			// When ambushed, assign all idle party members to the specific monster that appeared.
			const ambushMonsterId = gameState.party.pausedMission ? gameState.party.pausedMission.ambushMonsterId : null;
			if (ambushMonsterId) {
				const targetMonster = gameState.activeMonsters.find(m => m.id === ambushMonsterId);
				if (targetMonster) {
					// Find all combat heroes who don't have a target yet.
					const idleHeroes = combatHeroes.filter(h => !h.targetMonsterId);
					// Assign them all to the ambush monster. This includes all classes.
					idleHeroes.forEach(hero => {
						hero.targetMonsterId = targetMonster.id;
					});
				}
			}
			// --- MODIFIED SECTION END ---
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
						hero.hp.max += hero.hpMaxPerLevel;
						hero.mp.max += hero.mpMaxPerLevel;
						hero.hpRegen += hero.hpRegenPerLevel;
						hero.mpRegen += hero.mpRegenPerLevel;
						hero.hp.current = hero.hp.max;
						addToLog(`reached Level ${hero.level}!`, hero.id);
					}
				});
			}
		});
		
		gameState.activeMonsters = gameState.activeMonsters.filter(m => m.currentHp > 0);
		
		// After-combat logic.
		const paused = gameState.party.pausedMission;
		if (paused) {
			// Check if a specific attack mission target was defeated this tick.
			if (paused.attackTargetId && defeatedMonsters.some(m => m.id === paused.attackTargetId)) {
				const defeatedMonsterData = defeatedMonsters.find(m => m.id === paused.attackTargetId);
				// Use the defeated monster's distance to calculate the return trip.
				const distance = defeatedMonsterData ? defeatedMonsterData.distanceFromCity : 1500; // Fallback
				
				addToLog('Target monster defeated! The party is returning to base.');
				// Unassign all heroes to prevent them from engaging other monsters.
				gameState.heroes.forEach(h => { h.targetMonsterId = null; });
				
				// Set the party state to return to base.
				gameState.party.missionState = 'driving_back';
				// Progress is based on distance, assuming 3000m is 100%
				gameState.party.missionProgress = (distance / 3000) * 100;
				// Timer is based on progress (10 ticks for a full 100% trip)
				gameState.party.missionTimer = Math.ceil(gameState.party.missionProgress / 10);
				gameState.party.pausedMission = null; // The mission is now resolved.
			}
				// --- MODIFIED SECTION START ---
			// If the defeated monster was from a random ambush, resume the mission.
			else if (paused.ambushMonsterId && defeatedMonsters.some(m => m.id === paused.ambushMonsterId)) {
				addToLog('Ambush monster defeated. Resuming mission...');
				gameState.party.missionState = paused.state;
				gameState.party.missionTimer = paused.timer;
				gameState.party.missionProgress = paused.progress;
				gameState.party.pausedMission = null;
			}
			// --- MODIFIED SECTION END ---
		}
	}
}
