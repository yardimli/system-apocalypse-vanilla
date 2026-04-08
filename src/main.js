import { gameState, gameData } from './state.js';
// MODIFIED: Renamed function imports to reflect the new casting logic.
import { startCombatAction, startAegisAction, executeCombatEffect, executeAegisEffect } from './hero-actions.js';
import { addToLog, parseRange } from './utils.js';
import { renderSandbox, applySandboxChanges } from './sandbox.js';
import { handleUseConsumable } from './inventory.js';
import { handleShopAndPurchaseClicks, renderShopModal } from './shop.js';
import { renderHeroes, autoEquipBestGear, renderSkillsPanel } from './heroes.js';
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
			// MODIFIED: Pass alpha to renderMissionControl for smooth progress rendering.
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
	
	// NEW: Process completed skill casts at the beginning of the hero loop.
	gameState.heroes.forEach(hero => {
		if (hero.casting && gameState.time >= hero.casting.castEndTime) {
			const skill = gameData.skills.find(s => s.id === hero.casting.skillId);
			if (skill) {
				if (skill.class === 'Aegis') {
					// The options (like targetHeroId) were stored in the casting object.
					executeAegisEffect(hero, skill, hero.casting.options);
				} else {
					const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
					if (monster) {
						executeCombatEffect(hero, skill, monster);
					}
				}
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
		
		// MODIFIED: Added check for hero.location to prevent rage decay while in a building.
		if (hero.class === 'Vanguard' && !hero.targetMonsterId && hero.rage.current > 0 && hero.location === 'field') {
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
		
		// MODIFIED: Auto-cast logic now checks if the hero is already casting.
		if (hero.autoCastSkillId && hero.hp.current > 0 && !hero.casting) {
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
							startAegisAction(hero.id, skill.id, options);
						}
					} else { // For Striker and Vanguard
						if (hero.targetMonsterId) {
							startCombatAction(hero.id, skill.id);
						}
					}
				}
			}
		}
	});
	
	// MODIFIED: Process building population effects (HP regen and token generation for the city).
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
	// NEW: Calculate and add city-wide income based on total population.
	if (totalCityPopulation > 0) {
		const incomeThisTick = totalCityPopulation * gameState.city.tokensPerPopulationPerTick;
		gameState.city.tokens += incomeThisTick;
	}
	// END MODIFIED
	
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
		const [items, skills, monsters, systemShop, buildingUpgrades, carUpgrades, cars] = await Promise.all([
			fetch('/data/items.json').then(res => res.json()),
			fetch('/data/skills.json').then(res => res.json()),
			fetch('/data/monsters.json').then(res => res.json()),
			fetch('/data/system_shop.json').then(res => res.json()),
			fetch('/data/building_upgrades.json').then(res => res.json()),
			fetch('/data/car_upgrades.json').then(res => res.json()),
			fetch('/data/cars.json').then(res => res.json())
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
		
		// MODIFIED: Create only one starting base.
		let firstBaseId = null;
		if (shuffledBuildings[0]) {
			const building = shuffledBuildings[0];
			building.owner = 'player';
			building.name = 'Alpha Base';
			building.state = 'functional';
			building.maxHp = 1000;
			building.hp = 1000;
			building.maxShieldHp = 1000;
			building.shieldHp = 1000;
			building.isSafezone = true;
			building.population = 10; // NEW: Give starting population for income.
			firstBaseId = building.id;
		}
		
		// MODIFIED: Ensure all heroes start in the single base.
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
			renderShopModal({ heroId }); // MODIFIED: Pass an options object.
			if (document.activeElement) document.activeElement.blur();
			return;
		}
		
		// NEW: Add handler for opening the shop for a building.
		const openShopForBuildingBtn = e.target.closest('[data-open-shop-for-building]');
		if (openShopForBuildingBtn) {
			const buildingId = parseInt(openShopForBuildingBtn.dataset.openShopForBuilding, 10);
			renderShopModal({ buildingId, defaultTab: 'building-upgrades' });
			if (document.activeElement) document.activeElement.blur();
			return;
		}
		// END NEW
		
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
				startAegisAction(heroId, skillId, options);
			} else {
				startCombatAction(heroId, skillId);
			}
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
		
		if (e.target.id === 'sandbox-apply') {
			applySandboxChanges();
			renderContent(0);
		}
	});
	
	// MODIFIED: Start the new requestAnimationFrame game loop instead of setInterval.
	requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', init);
