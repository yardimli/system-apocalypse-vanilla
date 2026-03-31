import { gameState, gameData } from './state.js';
import { handleAegisAction } from './aegis.js';
import { processStriker } from './striker.js';
import { processVanguard } from './vanguard.js';
import { addToLog } from './utils.js';
import { renderSandbox, applySandboxChanges } from './sandbox.js';
import { findValidRecipe, handleCraftAttempt } from './crafting.js';
// MODIFIED: Import armor handlers and item drop from inventory.js
import { handleItemDrop, handleUnequipArmor, handleEquipArmor } from './inventory.js';
// MODIFIED: Import new render functions
import { renderHeroes } from './heroes.js';
import { renderMonsters } from './monsters.js';
import { renderHeader, renderTabs, renderBuildings, renderCars, renderCity, renderLog } from './ui.js';

// MODIFIED: Added 'Monsters' tab
const TABS = ['Heroes', 'Buildings', 'Cars', 'Monsters', 'City', 'Log', 'Sandbox'];
let activeTab = 'Heroes';

// --- DOM ELEMENTS ---
const getEl = (id) => document.getElementById(id);
const tabsContainer = getEl('tabs-container');
const contentArea = getEl('content-area');

// --- ACTION HANDLERS ---
// MODIFIED: handleUnequipArmor and handleEquipArmor moved to inventory.js

// --- RENDERING FUNCTIONS ---
// MODIFIED: All render functions have been moved to their own dedicated files (heroes.js, monsters.js, ui.js)

function renderContent() {
	switch (activeTab) {
		case 'Heroes':
			if (!getEl('heroes-tab-content')) {
				contentArea.innerHTML = `
                    <div id="heroes-tab-content" class="flex flex-col gap-4">
                        <div id="heroes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                    </div>
                `;
			}
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
		case 'Log':
			renderLog(contentArea);
			break;
		case 'Sandbox':
			renderSandbox(contentArea);
			break;
	}
}

// --- GAME LOOP ---
function gameLoop() {
	gameState.time++;
	
	// 1. Spawn Monsters
	// MODIFIED: Spawning logic now uses spawnDay and spawnRatio from monster data.
	const currentDay = Math.floor(gameState.time / 10) + 1;
	gameState.threatLevel = 10 + Math.floor(gameState.time / 60);
	
	if (Math.random() < (gameState.threatLevel / 100)) {
		// Filter monsters that are eligible to spawn based on the current day.
		const availableMonsters = gameData.monsters.filter(m => m.spawnDay <= currentDay);
		
		if (availableMonsters.length > 0) {
			// Use spawnRatio for weighted random selection.
			const totalRatio = availableMonsters.reduce((sum, m) => sum + m.spawnRatio, 0);
			let randomWeight = Math.random() * totalRatio;
			let chosenMonster = null;
			
			for (const monster of availableMonsters) {
				randomWeight -= monster.spawnRatio;
				if (randomWeight <= 0) {
					chosenMonster = monster;
					break;
				}
			}
			// Fallback in case of floating point inaccuracies
			if (!chosenMonster) {
				chosenMonster = availableMonsters[availableMonsters.length - 1];
			}
			
			gameState.activeMonsters.push({
				id: Math.random().toString(36).substr(2, 9), // Unique ID for this instance
				name: chosenMonster.name,
				level: chosenMonster.level,
				maxHp: chosenMonster.hp,
				currentHp: chosenMonster.hp,
				damage: chosenMonster.damage,
				xp: chosenMonster.xp,
				assigned: false,
				targetBuilding: null
			});
			addToLog(`A Lv.${chosenMonster.level} ${chosenMonster.name} has appeared!`);
		}
	}
	
	// 2. Process Heroes
	gameState.heroes.forEach(hero => {
		if (!hero.targetMonster) {
			if (hero.hp.current > 0) {
				hero.hp.current = Math.min(hero.hp.max, hero.hp.current + hero.hpRegen);
			}
			hero.mp.current = Math.min(hero.mp.max, hero.mp.current + hero.mpRegen);
		}
		
		if (hero.class === 'Aegis' && Array.isArray(hero.autoCast)) {
			for (const skillId of hero.autoCast) {
				const skill = gameData.skills.find(s => s.id === skillId);
				if (skill && hero.mp.current >= skill.mpCost) {
					let shouldCast = false;
					if (skill.actionType === 'repair' && gameState.city.buildings.some(b => b.state !== 'functional')) shouldCast = true;
					if (skill.actionType === 'shield' && gameState.city.buildings.some(b => b.state === 'functional' && b.shieldHp === 0)) shouldCast = true;
					if (skill.actionType === 'battery' && gameState.city.cars.some(c => c.battery <= 0)) shouldCast = true;
					if (skill.actionType === 'heal' && gameState.heroes.some(h => h.hp.current < h.hp.max)) shouldCast = true;
					
					if (shouldCast) {
						handleAegisAction(hero.id, skill.id);
						break;
					}
				}
			}
		}
		
		if (hero.class === 'Striker') processStriker(hero);
		if (hero.class === 'Vanguard') processVanguard(hero);
	});
	
	// 3. Unassigned Monsters Attack City
	gameState.activeMonsters.forEach(monster => {
		if (!monster.assigned) {
			if (!monster.targetBuilding) {
				const validTargets = gameState.city.buildings.filter(b => b.state !== 'ruined');
				if (validTargets.length > 0) {
					monster.targetBuilding = validTargets[Math.floor(Math.random() * validTargets.length)].id;
				}
			}
			
			if (monster.targetBuilding) {
				const bldg = gameState.city.buildings.find(b => b.id === monster.targetBuilding);
				if (bldg && bldg.state !== 'ruined') {
					if (bldg.shieldHp > 0) {
						bldg.shieldHp--;
						if (bldg.shieldHp === 0) {
							addToLog(`Lv.${monster.level} ${monster.name} destroyed the shield on Building #${bldg.id}!`);
						}
					} else {
						bldg.hp--;
						if (bldg.hp <= 0) {
							bldg.hp = 0;
							bldg.state = 'ruined';
							bldg.population = 0;
							monster.targetBuilding = null;
							addToLog(`Building #${bldg.id} was ruined by Lv.${monster.level} ${monster.name}!`);
						} else if (bldg.hp <= 5 && bldg.state === 'functional') {
							bldg.state = 'damaged';
							addToLog(`Building #${bldg.id} was damaged by Lv.${monster.level} ${monster.name}!`);
						}
					}
				} else {
					monster.targetBuilding = null;
				}
			}
		}
	});
	
	gameState.activeMonsters = gameState.activeMonsters.filter(m => m.currentHp > 0);
	
	// 4. Daily Updates
	if (gameState.time % 10 === 0) {
		gameState.city.buildings.forEach(b => {
			if (b.state !== 'ruined' && b.population < 10) {
				b.population++;
			}
		});
		
		gameState.city.cars.forEach(car => {
			if (car.driverId !== null) {
				car.battery--;
				if (car.battery <= 0) {
					car.battery = 0;
					const driver = gameState.heroes.find(h => h.id === car.driverId);
					if (driver) {
						driver.carId = null;
						addToLog(`${driver.name}'s car ran out of battery!`);
					}
					car.driverId = null;
				}
			}
		});
	}
	
	renderHeader();
	// MODIFIED: Calls to render functions now use the imported versions
	if (activeTab === 'Heroes') renderHeroes();
	if (activeTab === 'Buildings') renderBuildings(contentArea);
	if (activeTab === 'Monsters') renderMonsters(contentArea);
	if (activeTab === 'Cars') renderCars(contentArea);
	if (activeTab === 'City') renderCity(contentArea);
	if (activeTab === 'Log') renderLog(contentArea);
	if (activeTab === 'Sandbox') renderSandbox(contentArea);
}

// --- INITIALIZATION ---
async function init() {
	try {
		const [items, skills, recipes, monsters, armor] = await Promise.all([
			fetch('./data/items.json').then(res => res.json()),
			fetch('./data/skills.json').then(res => res.json()),
			fetch('./data/recipes.json').then(res => res.json()),
			fetch('./data/monsters.json').then(res => res.json()),
			fetch('./data/armor.json').then(res => res.json())
		]);
		gameData.items = items;
		gameData.skills = skills;
		gameData.recipes = recipes;
		gameData.monsters = monsters;
		gameData.armor = armor;
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
		if (e.target.matches('[data-skill-id]')) {
			const { heroId, skillId } = e.target.dataset;
			handleAegisAction(parseInt(heroId), skillId);
			renderContent();
		}
		if (e.target.matches('[data-craft-button]')) {
			const heroId = parseInt(e.target.dataset.heroId);
			handleCraftAttempt(heroId);
			renderContent();
		}
		if (e.target.matches('[data-unequip-button]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			handleUnequipArmor(heroId);
			renderContent();
		}
		if (e.target.matches('[data-equip-item-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const armorId = e.target.dataset.equipItemId;
			handleEquipArmor(heroId, armorId);
			renderContent();
		}
		if (e.target.id === 'sandbox-apply') {
			applySandboxChanges();
			renderContent();
		}
	});
	
	let draggedElement = null;
	
	document.body.addEventListener('dragstart', (e) => {
		draggedElement = e.target;
		
		if (e.target.matches('[data-drag-skill]')) {
			e.dataTransfer.setData('text/plain', e.target.dataset.dragSkill);
			e.dataTransfer.setData('heroId', e.target.closest('[data-hero-id]').dataset.heroId);
			e.target.classList.add('opacity-50');
		}
		if (e.target.matches('[data-drag-item-id]')) {
			e.dataTransfer.setData('source', 'inventory');
			e.dataTransfer.setData('itemId', e.target.dataset.dragItemId);
			e.dataTransfer.setData('heroId', e.target.dataset.heroId);
			e.target.classList.add('opacity-50');
		}
		if (e.target.matches('[data-drag-craft-item-id]')) {
			e.dataTransfer.setData('source', 'crafting');
			e.dataTransfer.setData('itemId', e.target.dataset.dragCraftItemId);
			e.dataTransfer.setData('heroId', e.target.dataset.heroId);
			e.dataTransfer.setData('itemIndex', e.target.dataset.itemIndex);
			e.target.classList.add('opacity-50');
		}
	});
	
	document.body.addEventListener('dragend', (e) => {
		if (draggedElement) {
			draggedElement.classList.remove('opacity-50');
			draggedElement = null;
		}
	});
	
	document.body.addEventListener('dragover', (e) => {
		if (e.target.closest('[data-drop-zone]')) {
			e.preventDefault();
			e.target.closest('[data-drop-zone]').classList.add('bg-primary/20');
		}
	});
	
	document.body.addEventListener('dragleave', (e) => {
		if (e.target.closest('[data-drop-zone]')) {
			e.target.closest('[data-drop-zone]').classList.remove('bg-primary/20');
		}
	});
	
	document.body.addEventListener('drop', (e) => {
		const dropZone = e.target.closest('[data-drop-zone]');
		if (!dropZone) return;
		e.preventDefault();
		dropZone.classList.remove('bg-primary/20');
		
		const zoneType = dropZone.dataset.dropZone;
		
		if (zoneType === 'inventory' || zoneType === 'crafting') {
			handleItemDrop(e);
			renderContent();
			return;
		}
		
		const aegisZoneType = dropZone.dataset.dropZone;
		if (aegisZoneType === 'auto' || aegisZoneType === 'manual') {
			const draggedSkill = e.dataTransfer.getData('text/plain');
			const heroId = parseInt(e.dataTransfer.getData('heroId'));
			const targetHeroId = parseInt(dropZone.dataset.heroId);
			
			if (heroId !== targetHeroId || !draggedSkill) return;
			
			const hero = gameState.heroes.find(h => h.id === heroId);
			hero.autoCast = hero.autoCast.filter(id => id !== draggedSkill);
			
			if (aegisZoneType === 'auto') {
				const targetBadge = e.target.closest('[data-drag-skill]');
				if (targetBadge && targetBadge.dataset.dragSkill !== draggedSkill) {
					const targetIndex = hero.autoCast.indexOf(targetBadge.dataset.dragSkill);
					hero.autoCast.splice(targetIndex, 0, draggedSkill);
				} else {
					hero.autoCast.push(draggedSkill);
				}
			}
			renderContent();
			return;
		}
	});
	
	setInterval(gameLoop, 1000);
}

document.addEventListener('DOMContentLoaded', init);
