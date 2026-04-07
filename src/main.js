import { gameState, gameData } from './state.js';
import { handleCombatAction, handleAegisAction } from './hero-actions.js';
import { addToLog, parseRange } from './utils.js';
import { renderSandbox, applySandboxChanges } from './sandbox.js';
import { handleUseConsumable } from './inventory.js';
import { handleShopAndPurchaseClicks } from './shop.js';
import { renderHeroes, autoEquipBestGear, renderShopModal, renderSkillsPanel } from './heroes.js';
import { renderMonsters, processMonsterActions } from './monsters.js';
import { renderBuildings, handleBuyBuilding, handleEnterBuilding, handleExitBuilding } from './buildings.js';
import { renderHeader, renderTabs, renderCity, renderLog, renderItemsOverview, renderPartyCombat, renderPartyLog } from './ui.js';
import { renderCars, initiateCarPurchase } from './cars.js';
import { renderMissionControl, handleStartMission, handleFlee, processMissionTick, handleStartAttackMission, manageCombatAssignments, handleMonsterDefeat } from './missions.js';

const TABS = ['Heroes', 'Buildings', 'Cars', 'Monsters', 'City', 'Items', 'Log', 'Sandbox'];
let activeTab = 'Heroes';

// --- DOM ELEMENTS ---
const getEl = (id) => document.getElementById(id);
const tabsContainer = getEl('tabs-container');
const contentArea = getEl('content-area');

function renderContent () {
	switch (activeTab) {
		case 'Heroes':
			// MODIFIED: The layout is changed from a flex-column to a more complex grid.
			// This positions the skills panel under the 3-column hero grid,
			// while the sidebar spans both rows in the 4th column.
			if (!getEl('heroes-tab-content')) {
				contentArea.innerHTML = `
                    <div id="heroes-tab-content" class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        <!-- Hero Cards Area (spans 3 columns) -->
                        <!-- MODIFIED: Added 'items-start' to prevent hero cards from stretching vertically when the grid row height changes. -->
                        <div id="heroes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 col-span-1 lg:col-span-3 gap-4 items-start">
                            <!-- Hero cards will be injected here -->
                        </div>

                        <!-- Sidebar Area (4th column, spans 2 rows on large screens) -->
                        <div id="heroes-sidebar" class="lg:row-span-2 flex flex-col gap-4">

                            <!-- Mission Control -->
                            <div id="mission-control-area" class="card bg-base-200 shadow-md p-4 flex flex-col gap-4">
                                <!-- Mission control content will be dynamically rendered here -->
                            </div>

                            <!-- Party Log Area -->
                            <div id="party-log-area" class="flex flex-col gap-1 bg-base-100 rounded p-2 h-60 overflow-y-auto text-xs font-mono">
                                <!-- Party log content will be injected by renderPartyLog -->
                            </div>
                            
                            <!-- Shared Party Combat Area -->
                            <div id="party-combat-area" class="w-full">
                                <!-- Shared combat info will be injected here -->
                            </div>
                        </div>

                        <!-- Skills Panel Area (spans 3 columns, on the next row) -->
                        <div id="skills-panel-container" class="col-span-1 lg:col-span-3 w-full">
                            <!-- The shared skills panel will be injected here -->
                        </div>
                    </div>
                `;
			}
			renderMissionControl();
			renderPartyCombat();
			renderPartyLog();
			renderHeroes();
			renderSkillsPanel();
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

// REMOVED: manageCombatAssignments function was moved to missions.js

// --- GAME LOOP ---

// These variables manage the timing of game logic ticks.
let lastTickTime = 0;
const tickDuration = 1000; // A game tick is 1 second in real time.

/**
 * This function contains all the logic that advances the game state by one tick.
 * It was previously the body of gameLoop().
 */
function processGameTick () {
	gameState.time++;
	
	processMissionTick();
	
	// World Monster Spawning
	const currentDay = Math.floor(gameState.time / 10) + 1;
	const availableMonsters = gameData.monsters.filter(m => m.spawnDay <= currentDay);
	for (const monsterData of availableMonsters) {
		if (Math.random() < (monsterData.worldSpawnRatio || 0)) {
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
				speed: monsterData.speed || 50,
				distanceFromCity: Math.floor(Math.random() * 2001) + 1000, // 1000-3000m
				assignedTo: [],
				targetBuilding: null,
				agro: {}
			};
			gameState.activeMonsters.push(newMonster);
			addToLog(`A wild Lv.${newMonster.level} ${newMonster.name} (#${newMonster.id}) has appeared ${newMonster.distanceFromCity}m from the city!`);
		}
	}
	
	// 2. Process Heroes
	// NEW: Call the combat assignment logic, now managed in missions.js
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
		
		if (hero.hp.current > 0) {
			hero.hp.current = Math.min(hero.hp.max, hero.hp.current + hero.hpRegen);
			if (hero.mp) {
				hero.mp.current = Math.min(hero.mp.max, hero.mp.current + hero.mpRegen);
			}
		}
		
		if (hero.class === 'Vanguard' && !hero.targetMonsterId && hero.rage.current > 0) {
			hero.rage.current = Math.max(0, hero.rage.current - 10);
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
					if (skill.class === 'Aegis') {
						let shouldCast = false;
						const options = {};
						
						if (skill.actionType === 'heal') {
							const targetId = hero.skillTargets[skillId];
							const targetHero = gameState.heroes.find(h => h.id === targetId);
							if (targetHero && targetHero.hp.current < (targetHero.hp.max * 0.85)) {
								shouldCast = true;
								options.targetHeroId = targetId;
							}
						}
						
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
	
	// NEW: Call the centralized monster action handler from monsters.js
	processMonsterActions();
	
	// NEW: Call the centralized monster defeat handler from missions.js
	handleMonsterDefeat();
}

/**
 * The main game loop, now running multiple times per second.
 * It's responsible for triggering game logic ticks based on real time passed
 * and for calling the render functions on every frame.
 */
function gameLoop () {
	const currentTime = performance.now();
	if (!lastTickTime) {
		lastTickTime = currentTime;
		gameState.lastTickTime = lastTickTime; // MODIFIED: Set initial tick time in global state
	}
	
	const elapsed = currentTime - lastTickTime;
	// Calculate how many milliseconds should pass for one tick at the current speed.
	const timePerTick = tickDuration / gameState.gameSettings.speedMultiplier;
	
	// If enough real time has passed, process one or more game ticks.
	if (elapsed >= timePerTick) {
		const ticksToProcess = Math.floor(elapsed / timePerTick);
		for (let i = 0; i < ticksToProcess; i++) {
			processGameTick();
		}
		// Update lastTickTime, carrying over any remainder time.
		lastTickTime += ticksToProcess * timePerTick;
		gameState.lastTickTime = lastTickTime; // MODIFIED: Update tick time in global state
	}
	
	// --- RENDER LOGIC (runs every interval) ---
	renderHeader();
	renderTabs(activeTab, TABS);
	renderContent();
}

// --- INITIALIZATION ---
async function init () {
	try {
		const [items, skills, monsters, systemShop, buildingUpgrades, carUpgrades, cars] = await Promise.all([
			fetch('./data/items.json').then(res => res.json()),
			fetch('./data/skills.json').then(res => res.json()),
			fetch('./data/monsters.json').then(res => res.json()),
			fetch('./data/system_shop.json').then(res => res.json()),
			fetch('./data/building_upgrades.json').then(res => res.json()),
			fetch('./data/car_upgrades.json').then(res => res.json()),
			fetch('./data/cars.json').then(res => res.json())
		]);
		gameData.items = items;
		gameData.skills = skills;
		gameData.monsters = monsters;
		gameData.system_shop = systemShop;
		gameData.building_upgrades = buildingUpgrades;
		gameData.car_upgrades = carUpgrades;
		gameData.cars = cars;
		
		gameState.city.cars = gameData.cars.map(carData => ({
			id: carData.id,
			ownerId: null,
			name: carData.name,
			upgrades: [...carData.upgrades],
			maxOccupants: 1,
			survivorCapacity: 4
		}));
		
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
				building.population = 0;
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
	
	document.body.addEventListener('click', (e) => {
		const speedBtn = e.target.closest('[data-speed]');
		if (speedBtn) {
			const newSpeed = parseFloat(speedBtn.dataset.speed);
			if (gameState.gameSettings.speedMultiplier !== newSpeed) {
				gameState.gameSettings.speedMultiplier = newSpeed;
				// The header will be updated on the next render cycle, no need to call it here.
				addToLog(`[SYSTEM]: Game speed set to ${newSpeed}x.`);
			}
			return;
		}
		
		// Added event listener for tab switching.
		const tabBtn = e.target.closest('[data-tab]');
		if (tabBtn) {
			const newTab = tabBtn.dataset.tab;
			if (newTab !== activeTab) {
				activeTab = newTab;
				renderTabs(activeTab, TABS);
				renderContent();
			}
			return; // Stop further processing to prevent other listeners from firing.
		}
		
		// Centralized shop and purchase click handling.
		// The new handler returns true if it processed an event that requires a re-render.
		if (handleShopAndPurchaseClicks(e)) {
			renderContent();
			return;
		}
		
		const inventoryItem = e.target.closest('[data-inventory-item]');
		if (inventoryItem && !e.target.closest('#system-shop-modal')) {
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
		
		const openShopForHeroBtn = e.target.closest('[data-open-shop-for-hero]');
		if (openShopForHeroBtn) {
			const heroId = parseInt(openShopForHeroBtn.dataset.openShopForHero, 10);
			renderShopModal(heroId);
			if (document.activeElement) document.activeElement.blur();
			return;
		}
		
		const autoCastBtn = e.target.closest('[data-autocast-skill-id]');
		if (autoCastBtn) {
			const heroId = parseInt(autoCastBtn.dataset.heroId, 10);
			const skillId = autoCastBtn.dataset.autocastSkillId;
			const hero = gameState.heroes.find(h => h.id === heroId);
			if (hero) {
				hero.autoCastSkillId = hero.autoCastSkillId === skillId ? null : skillId;
				const skillName = gameData.skills.find(s => s.id === skillId).name;
				const action = hero.autoCastSkillId ? `set auto-cast to: ${skillName}` : 'disabled auto-cast';
				addToLog(`${action}.`, hero.id);
				renderContent();
			}
			return;
		}
		
		const castSkillBtn = e.target.closest('[data-skill-id]');
		if (castSkillBtn) {
			const heroId = parseInt(castSkillBtn.dataset.heroId, 10);
			const skillId = castSkillBtn.dataset.skillId;
			const hero = gameState.heroes.find(h => h.id === heroId);
			const skillData = gameData.skills.find(s => s.id === skillId);
			const targetHeroId = castSkillBtn.dataset.targetHeroId ? parseInt(castSkillBtn.dataset.targetHeroId, 10) : null;
			
			if (skillData.class === 'Aegis') {
				const options = {};
				if (skillData.actionType === 'heal') {
					if (targetHeroId) {
						hero.skillTargets[skillId] = targetHeroId;
					}
					options.targetHeroId = hero.skillTargets[skillId];
				}
				handleAegisAction(heroId, skillId, options);
			} else {
				handleCombatAction(heroId, skillId);
			}
			renderContent();
			return;
		}
		
		const enterBuildingBtn = e.target.closest('[data-enter-building-hero]');
		if (enterBuildingBtn) {
			const heroId = parseInt(enterBuildingBtn.dataset.enterBuildingHero, 10);
			const buildingId = parseInt(enterBuildingBtn.dataset.enterBuildingBldg, 10);
			handleEnterBuilding(heroId, buildingId);
			renderContent();
			return;
		}
		
		const exitBuildingBtn = e.target.closest('[data-exit-building-hero]');
		if (exitBuildingBtn) {
			const heroId = parseInt(exitBuildingBtn.dataset.exitBuildingHero, 10);
			handleExitBuilding(heroId);
			renderContent();
			return;
		}
		
		// MODIFIED: Handle attacking a specific monster and switch tabs if needed.
		const attackMonsterBtn = e.target.closest('[data-attack-monster-id]');
		if (attackMonsterBtn) {
			const monsterId = parseInt(attackMonsterBtn.dataset.attackMonsterId, 10);
			handleStartAttackMission(monsterId);
			
			// If the attack was initiated from the Monsters tab, switch back to the Heroes tab.
			if (activeTab === 'Monsters') {
				activeTab = 'Heroes';
				// The main game loop will handle re-rendering the content and tabs.
			}
			return;
		}
		
		const missionBtn = e.target.closest('#mission-btn');
		if (missionBtn) {
			handleStartMission();
			return;
		}
		
		const fleeBtn = e.target.closest('#flee-btn');
		if (fleeBtn) {
			handleFlee();
			return;
		}
		
		const extraLogToggle = e.target.closest('[data-toggle-extra-log]');
		if (extraLogToggle) {
			if (activeTab === 'Heroes') renderContent();
			return;
		}
		
		const logToggler = e.target.closest('[data-toggle-log]');
		if (logToggler) {
			const logContainer = logToggler.parentElement.nextElementSibling;
			if (logContainer) logContainer.classList.toggle('hidden');
			return;
		}
		
		if (e.target.id === 'sandbox-apply') {
			applySandboxChanges();
			renderContent();
		}
	});
	
	setInterval(gameLoop, 200);
}

document.addEventListener('DOMContentLoaded', init);
