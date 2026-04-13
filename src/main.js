import { gameState, gameData } from './state.js';
import { startAction, executeAction } from './hero-actions.js'; // MODIFIED: Import new unified functions
import { addToLog, parseRange } from './utils.js';
import { handleUseConsumable } from './inventory.js';
import { handleShopAndPurchaseClicks, renderShopModal } from './shop.js';
import { renderHeroes, autoEquipBestGear, renderSkillsPanel, recalculateHeroStats } from './heroes.js';
import { renderMonsters, processMonsterActions } from './monsters.js';
import { renderBuildings, handleBuyBuilding, handleEnterBuilding, handleExitBuilding } from './buildings.js';
import { renderHeader, renderTabs, renderLog, renderItemsOverview, renderPartyCombat, renderPartyLog } from './ui.js';
import { renderCars, initiateCarPurchase } from './cars.js';
import { renderMissionControl, handleStartMission, handleFlee, processMissionTick, handleStartAttackMission, manageCombatAssignments, handleMonsterDefeat } from './missions.js';

const TABS = ['Heroes', 'Buildings', 'Cars', 'Monsters', 'Items', 'Log'];
let activeTab = 'Heroes';

// --- DOM ELEMENTS ---
const getEl = (id) => document.getElementById(id);
const tabsContainer = getEl('tabs-container');
const contentArea = getEl('content-area');

function renderContent (alpha) {
	switch (activeTab) {
		case 'Heroes':
			if (!getEl('heroes-tab-content')) {
				contentArea.innerHTML = `
                    <div id="heroes-tab-content" class="flex flex-col lg:flex-row gap-4">
                        <div class="w-full lg:w-3/4 flex flex-col gap-4">
                            <div id="heroes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                            <div id="skills-panel-container" class="w-full"></div>
                        </div>
                        <div id="heroes-sidebar" class="w-full lg:w-1/4 flex flex-col gap-4">
                            <div id="mission-control-area" class="card bg-base-200 shadow-md p-4 flex flex-col gap-4"></div>
                            <div id="party-log-area" class="flex flex-col gap-1 bg-base-100 rounded p-2 h-60 overflow-y-auto text-xs font-mono"></div>
                            <div id="party-combat-area" class="w-full"></div>
                        </div>
                    </div>
                `;
			}
			renderMissionControl(alpha);
			renderPartyCombat();
			renderPartyLog();
			renderHeroes();
			renderSkillsPanel(alpha);
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
		case 'Items':
			renderItemsOverview(contentArea);
			break;
		case 'Log':
			renderLog(contentArea);
			break;
	}
}

let lastTickTime = 0;
const tickDuration = 1000;

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
				distanceFromCity: Math.floor(Math.random() * 2001) + 1000,
				assignedTo: [],
				targetBuilding: null,
				agro: {}
			};
			gameState.activeMonsters.push(newMonster);
			addToLog(`A wild Lv.${newMonster.level} ${newMonster.name} (#${newMonster.id}) has appeared ${newMonster.distanceFromCity}m from the city!`);
		}
	}
	
	manageCombatAssignments();
	
	// Process completed skill casts at the beginning of the hero loop.
	gameState.heroes.forEach(hero => {
		if (hero.casting && gameState.time >= hero.casting.castEndTime) {
			const skill = gameData.skills.find(s => s.id === hero.casting.skillId);
			if (skill) {
				// MODIFIED: Use the unified executeAction function
				executeAction(hero, skill, hero.casting.options);
			}
			hero.casting = null; // Clear casting state after execution.
		}
	});
	
	gameState.heroes.forEach(hero => {
		autoEquipBestGear(hero);
		
		if (hero.location !== 'field') {
			const building = gameState.city.buildings.find(b => b.id === hero.location);
			const baseRegenMultiplier = building?.regenMultiplier || 10;
			const hpPercentage = (building && building.maxHp > 0) ? (building.hp / building.maxHp) : 1;
			const regenMultiplier = baseRegenMultiplier * hpPercentage;
			
			if (hero.hp.current > 0) {
				hero.hp.current = Math.min(hero.hp.max, hero.hp.current + (hero.hpRegen * regenMultiplier));
				hero.stamina.current = Math.min(hero.stamina.max, hero.stamina.current + (hero.staminaRegen * regenMultiplier)); // NEW
				hero.mp.current = Math.min(hero.mp.max, hero.mp.current + (hero.mpRegen * regenMultiplier));
			}
			return;
		}
		
		if (hero.hp.current > 0) {
			hero.hp.current = Math.min(hero.hp.max, hero.hp.current + hero.hpRegen);
			hero.stamina.current = Math.min(hero.stamina.max, hero.stamina.current + hero.staminaRegen); // NEW
			hero.mp.current = Math.min(hero.mp.max, hero.mp.current + hero.mpRegen);
		}
		
		// Rage decay
		if (!hero.targetMonsterId && hero.rage.current > 0 && hero.location === 'field') {
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
		
		// MODIFIED: Auto-cast logic now uses the unified startAction function
		if (hero.autoCastSkillId && hero.hp.current > 0 && !hero.casting) {
			const skillId = hero.autoCastSkillId;
			const skill = gameData.skills.find(s => s.id === skillId);
			
			// BUG FIX: Check if the hero meets the auto-cast level requirement for the skill.
			const canAutoCast = skill && (!skill.autoCastUnlockLevel || hero.level >= skill.autoCastUnlockLevel);
			
			if (skill && canAutoCast) {
				// Infer action type for auto-cast to correctly route heal vs attack
				let actionType = skill.actionType;
				if (!actionType) {
					if (skill.skillClass === 'Healing') actionType = 'heal';
					else if (skill.damage) actionType = 'attack';
					// Add other types as needed
				}
				
				if (actionType === 'heal') {
					let shouldCast = false;
					const options = {};
					
					const targetId = hero.skillTargets[skillId] || hero.id;
					const targetHero = gameState.heroes.find(h => h.id === targetId);
					if (targetHero && targetHero.hp.current < (targetHero.hp.max * 0.85)) {
						shouldCast = true;
						options.targetHeroId = targetId;
					}
					
					if (shouldCast) {
						startAction(hero.id, skill.id, options);
					}
				} else { // For any other auto-castable action (e.g., attack)
					if (hero.targetMonsterId) {
						startAction(hero.id, skill.id);
					}
				}
			}
		}
	});
	
	// Process building population effects (HP regen and token generation for the city).
	let totalCityPopulation = 0;
	gameState.city.buildings.forEach(building => {
		if (building.owner === 'player' && building.population > 0) {
			totalCityPopulation += building.population;
			// Population restores HP to the building.
			if (building.hp < building.maxHp) {
				building.hp = Math.min(building.maxHp, building.hp + building.population);
			}
		}
	});
	// Calculate and add city-wide income based on total population.
	if (totalCityPopulation > 0) {
		const incomeThisTick = totalCityPopulation * gameState.city.tokensPerPopulationPerTick;
		gameState.city.tokens += incomeThisTick;
	}
	
	processMonsterActions();
	
	handleMonsterDefeat();
}

function gameLoop (currentTime) {
	// Initialize lastTickTime on the first frame.
	if (!lastTickTime) {
		lastTickTime = currentTime;
		gameState.lastTickTime = lastTickTime;
	}
	
	// Calculate the time elapsed since the last logic tick.
	const elapsed = currentTime - lastTickTime;
	const timePerTick = tickDuration / gameState.gameSettings.speedMultiplier;
	
	// Process game logic ticks if enough time has passed.
	if (elapsed >= timePerTick) {
		const ticksToProcess = Math.floor(elapsed / timePerTick);
		for (let i = 0; i < ticksToProcess; i++) {
			processGameTick();
		}
		// Update lastTickTime, ensuring it stays aligned with the tick grid.
		lastTickTime += ticksToProcess * timePerTick;
		gameState.lastTickTime = lastTickTime;
	}
	
	// Calculate alpha: the progress (0.0 to 1.0) towards the next game tick.
	// This is the key to smooth animations.
	const frameElapsed = currentTime - lastTickTime;
	const alpha = Math.min(1.0, frameElapsed / timePerTick);
	
	// Render the game state on every frame, passing alpha for interpolation.
	renderHeader();
	renderTabs(activeTab, TABS);
	renderContent(alpha);
	
	// Request the next frame to continue the loop.
	requestAnimationFrame(gameLoop);
}

async function init () {
	try {
		const [items, magicSkills, martialSkills, cards, monsters, buildingUpgrades, carUpgrades, cars, buildings, heroes] = await Promise.all([
			fetch('/data/items.json').then(res => res.json()),
			fetch('/data/new_magic_skills.json').then(res => res.json()),
			fetch('/data/new_martial_skills.json').then(res => res.json()),
			fetch('/data/new_cards.json').then(res => res.json()),
			fetch('/data/monsters.json').then(res => res.json()),
			fetch('/data/building_upgrades.json').then(res => res.json()),
			fetch('/data/car_upgrades.json').then(res => res.json()),
			fetch('/data/cars.json').then(res => res.json()),
			fetch('/data/buildings.json').then(res => res.json()),
			fetch('/data/heroes.json').then(res => res.json()) // Load heroes
		]);
		gameData.items = items;
		gameData.magic_skills = magicSkills;
		gameData.martial_skills = martialSkills;
		gameData.skills = [...magicSkills, ...martialSkills]; // Combine for combat logic
		gameData.cards = cards;
		gameData.monsters = monsters;
		gameData.building_upgrades = buildingUpgrades;
		gameData.car_upgrades = carUpgrades;
		gameData.cars = cars;
		gameData.buildings = buildings;
		gameData.heroes = heroes;
		
		// Initialize Heroes from JSON data
		gameState.heroes = gameData.heroes.map(hData => ({
			id: hData.id,
			name: hData.name,
			class: hData.class,
			skillClasses: hData.skillClasses || [], // NEW: Added skillClasses
			isMagicUser: hData.isMagicUser,
			allowedArmorTypes: hData.allowedArmorTypes,
			allowedWeaponTypes: hData.allowedWeaponTypes,
			level: 1,
			xp: { current: 0, max: 100 },
			hp: { current: 0, max: 0 },
			mp: { current: 0, max: 0 }, // MODIFIED: Always initialize
			rage: { current: 0, max: 100 }, // MODIFIED: Always initialize
			stamina: { current: 0, max: 0 }, // NEW: Added stamina
			hpRegen: 0,
			mpRegen: 0,
			staminaRegen: 0, // NEW: Added stamina regen
			stats: { ...hData.baseStats },
			unspentStatPoints: 0,
			equipment: { ...hData.startingEquipment },
			inventory: { ...hData.startingInventory },
			skills: hData.startingSkills.map(id => ({ id })),
			autoCastSkillId: hData.autoCastSkillId,
			skillTargets: {},
			skillCooldowns: {},
			skillFlash: null,
			casting: null,
			carId: null,
			survivorsCarried: 0,
			targetMonsterId: null,
			location: 1,
			tokens: 100
		}));
		
		// Apply derived stats and fill HP/MP/Stamina to max for start
		gameState.heroes.forEach(recalculateHeroStats);
		gameState.heroes.forEach(h => {
			h.hp.current = h.hp.max;
			h.mp.current = h.mp.max;
			h.stamina.current = h.stamina.max; // NEW
		});
		
		// Populate game state with buildings from the new JSON file.
		gameState.city.buildings = gameData.buildings.map(buildingData => ({
			...buildingData, // Spread properties from JSON file.
			owner: null, // Add dynamic properties not in the file.
			isSafezone: false,
			heroesInside: []
		}));
		
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
		
		const potentialSafezoneBuildings = gameState.city.buildings.filter(b => b.state === 'functional');
		
		let firstBaseId = null;
		if (potentialSafezoneBuildings[0]) {
			const building = potentialSafezoneBuildings[0];
			building.owner = 'player';
			building.name = 'Alpha Base';
			// These properties are now set to higher "safezone" values upon purchase/setup.
			building.maxHp = 1000;
			building.hp = 1000;
			building.maxShieldHp = 1000;
			building.shieldHp = 1000;
			building.isSafezone = true;
			firstBaseId = building.id;
		}
		
		// Ensure all heroes start in the single base.
		if (firstBaseId) {
			gameState.heroes.forEach(hero => {
				hero.location = firstBaseId;
				const building = gameState.city.buildings.find(b => b.id === firstBaseId);
				if (building && !building.heroesInside.includes(hero.id)) {
					building.heroesInside.push(hero.id);
				}
			});
		}
		
		addToLog('[SYSTEM]: Initial safezone Alpha Base has been established.');
	} catch (error) {
		console.error('Failed to load game data:', error);
		contentArea.innerHTML = `<p class="text-error">Error: Could not load game data. Please check the console.</p>`;
		return;
	}
	
	// Initial render before the loop starts.
	renderHeader();
	renderTabs(activeTab, TABS);
	renderContent(0);
	
	document.body.addEventListener('click', (e) => {
		const speedBtn = e.target.closest('[data-speed]');
		if (speedBtn) {
			const newSpeed = parseFloat(speedBtn.dataset.speed);
			if (gameState.gameSettings.speedMultiplier !== newSpeed) {
				gameState.gameSettings.speedMultiplier = newSpeed;
				addToLog(`[SYSTEM]: Game speed set to ${newSpeed}x.`);
			}
			return;
		}
		
		const tabBtn = e.target.closest('[data-tab]');
		if (tabBtn) {
			const newTab = tabBtn.dataset.tab;
			if (newTab !== activeTab) {
				activeTab = newTab;
				// Re-render content immediately on tab switch.
				renderContent(0);
			}
			return;
		}
		
		if (handleShopAndPurchaseClicks(e)) {
			// Re-render content immediately after a shop action.
			renderContent(0);
			return;
		}
		
		const inventoryItem = e.target.closest('[data-inventory-item]');
		if (inventoryItem && !e.target.closest('#system-shop-modal')) {
			const heroId = parseInt(inventoryItem.dataset.heroId, 10);
			const itemId = inventoryItem.dataset.itemId;
			const itemData = gameData.items.find(i => i.id === itemId);
			if (itemData && itemData.type === 'Consumable') {
				if (handleUseConsumable(heroId, itemId)) {
					renderContent(0);
				}
			}
			return;
		}
		
		const openShopForHeroBtn = e.target.closest('[data-open-shop-for-hero]');
		if (openShopForHeroBtn) {
			const heroId = parseInt(openShopForHeroBtn.dataset.openShopForHero, 10);
			renderShopModal({ heroId });
			if (document.activeElement) document.activeElement.blur();
			return;
		}
		
		const openShopForBuildingBtn = e.target.closest('[data-open-shop-for-building]');
		if (openShopForBuildingBtn) {
			const buildingId = parseInt(openShopForBuildingBtn.dataset.openShopForBuilding, 10);
			renderShopModal({ buildingId, defaultTab: 'building-upgrades' });
			if (document.activeElement) document.activeElement.blur();
			return;
		}
		
		const renameBuildingBtn = e.target.closest('[data-rename-building-id]');
		if (renameBuildingBtn) {
			const buildingId = parseInt(renameBuildingBtn.dataset.renameBuildingId, 10);
			const building = gameState.city.buildings.find(b => b.id === buildingId);
			if (building && building.owner === 'player') {
				const newName = prompt(`Enter a new name for ${building.name}:`, building.name);
				if (newName && newName.trim() !== '') {
					addToLog(`Renamed ${building.name} to ${newName.trim()}.`);
					building.name = newName.trim();
					renderContent(0); // Re-render to show new name.
				}
			}
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
				renderContent(0);
			}
			return;
		}
		
		const castSkillBtn = e.target.closest('[data-skill-id]');
		if (castSkillBtn) {
			const heroId = parseInt(castSkillBtn.dataset.heroId, 10);
			const skillId = castSkillBtn.dataset.skillId;
			const hero = gameState.heroes.find(h => h.id === heroId);
			const targetHeroId = castSkillBtn.dataset.targetHeroId ? parseInt(castSkillBtn.dataset.targetHeroId, 10) : null;
			
			// MODIFIED: Use the unified startAction function
			const options = {};
			// Save the selected target for multi-target skills
			if (targetHeroId) {
				hero.skillTargets[skillId] = targetHeroId;
			}
			// Use the saved target, or default to self if applicable
			options.targetHeroId = hero.skillTargets[skillId] || hero.id;
			startAction(heroId, skillId, options);
			
			renderContent(0);
			return;
		}
		
		const enterBuildingBtn = e.target.closest('[data-enter-building-hero]');
		if (enterBuildingBtn) {
			const heroId = parseInt(enterBuildingBtn.dataset.enterBuildingHero, 10);
			const buildingId = parseInt(enterBuildingBtn.dataset.enterBuildingBldg, 10);
			handleEnterBuilding(heroId, buildingId);
			renderContent(0);
			return;
		}
		
		const exitBuildingBtn = e.target.closest('[data-exit-building-hero]');
		if (exitBuildingBtn) {
			const heroId = parseInt(exitBuildingBtn.dataset.exitBuildingHero, 10);
			handleExitBuilding(heroId);
			renderContent(0);
			return;
		}
		
		const attackMonsterBtn = e.target.closest('[data-attack-monster-id]');
		if (attackMonsterBtn) {
			const monsterId = parseInt(attackMonsterBtn.dataset.attackMonsterId, 10);
			handleStartAttackMission(monsterId);
			
			if (activeTab === 'Monsters') {
				activeTab = 'Heroes';
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
			if (activeTab === 'Heroes') renderContent(0);
			return;
		}
		
		const logToggler = e.target.closest('[data-toggle-log]');
		if (logToggler) {
			const logContainer = logToggler.parentElement.nextElementSibling;
			if (logContainer) logContainer.classList.toggle('hidden');
			return;
		}
		
		const addStatBtn = e.target.closest('[data-add-stat]');
		if (addStatBtn) {
			const stat = addStatBtn.dataset.addStat;
			const heroId = parseInt(addStatBtn.dataset.heroId, 10);
			const hero = gameState.heroes.find(h => h.id === heroId);
			
			if (hero && hero.unspentStatPoints > 0) {
				hero.stats[stat]++;
				hero.unspentStatPoints--;
				recalculateHeroStats(hero); // Update max HP/MP if END/INT changed
				addToLog(`increased ${stat.toUpperCase()} to ${hero.stats[stat]}.`, hero.id);
				renderContent(0);
			}
			return;
		}
	});
	
	requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', init);
