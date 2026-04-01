import { gameState, gameData } from './state.js';
import { handleAegisAction } from './aegis.js';
import { processStriker } from './striker.js';
import { processVanguard } from './vanguard.js';
import { addToLog, parseRange } from './utils.js';
import { renderSandbox, applySandboxChanges } from './sandbox.js';
// MODIFIED: Imported handleAutoCraft for the new auto-craft buttons.
import { findValidRecipe, handleCraftAttempt, handleAutoCraft } from './crafting.js';
import { handleItemDrop, handleUnequipArmor, handleEquipArmor, handleUseConsumable } from './inventory.js';
import { renderHeroes } from './heroes.js';
import { renderMonsters } from './monsters.js';
import { renderHeader, renderTabs, renderBuildings, renderCars, renderCity, renderLog } from './ui.js';

const TABS = ['Heroes', 'Buildings', 'Cars', 'Monsters', 'City', 'Log', 'Sandbox'];
let activeTab = 'Heroes';

// --- DOM ELEMENTS ---
const getEl = (id) => document.getElementById(id);
const tabsContainer = getEl('tabs-container');
const contentArea = getEl('content-area');

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

/**
 * NEW: Manages combat assignments for Strikers and Vanguards.
 * Vanguards taunt monsters, and Strikers prioritize those taunted monsters.
 */
function manageCombatAssignments() {
	const combatHeroes = gameState.heroes.filter(h =>
		(h.class === 'Striker' || h.class === 'Vanguard') &&
		h.hp.current > 0 &&
		h.carId
	);
	
	// Clear targets for heroes whose monster is already defeated
	combatHeroes.forEach(hero => {
		if (hero.targetMonsterId && !gameState.activeMonsters.some(m => m.id === hero.targetMonsterId)) {
			hero.targetMonsterId = null;
		}
	});
	
	const vanguards = combatHeroes.filter(h => h.class === 'Vanguard');
	const strikers = combatHeroes.filter(h => h.class === 'Striker');
	
	// 1. Vanguards find targets if they are idle
	vanguards.forEach(vanguard => {
		if (!vanguard.targetMonsterId) {
			// Prefer monsters not engaged by anyone
			const target = gameState.activeMonsters.find(m => !gameState.heroes.some(h => h.targetMonsterId === m.id));
			if (target) {
				vanguard.targetMonsterId = target.id;
			}
		}
	});
	
	// 2. Strikers prioritize Vanguard targets
	const vanguardTargets = vanguards
		.map(v => gameState.activeMonsters.find(m => m.id === v.targetMonsterId))
		.filter(Boolean);
	
	strikers.forEach(striker => {
		const isTargetingVanguardMonster = vanguardTargets.some(m => m.id === striker.targetMonsterId);
		
		if (vanguardTargets.length > 0 && !isTargetingVanguardMonster) {
			// If Vanguards have targets, Strikers MUST assist.
			striker.targetMonsterId = vanguardTargets[0].id; // Assist the first Vanguard's target.
		} else if (vanguardTargets.length === 0 && !striker.targetMonsterId) {
			// No Vanguards fighting, Striker is idle. Find a target.
			const target = gameState.activeMonsters.find(m => !gameState.heroes.some(h => h.targetMonsterId === m.id));
			if (target) {
				striker.targetMonsterId = target.id;
			}
		}
	});
	
	// Sync monster 'assignedTo' arrays based on final hero targets
	gameState.activeMonsters.forEach(m => {
		m.assignedTo = gameState.heroes
			.filter(h => h.targetMonsterId === m.id)
			.map(h => h.id);
	});
}


// --- GAME LOOP ---
function gameLoop() {
	gameState.time++;
	
	// 1. Spawn Monsters
	const currentDay = Math.floor(gameState.time / 10) + 1;
	
	// Filter monsters that are eligible to spawn based on the current day.
	const availableMonsters = gameData.monsters.filter(m => m.spawnDay <= currentDay);
	
	availableMonsters.forEach(monsterData => {
		// Each monster has its own independent chance to spawn each tick.
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
				assignedTo: [],
				targetBuilding: null
			};
			gameState.activeMonsters.push(newMonster);
			addToLog(`A Lv.${monsterData.level} ${monsterData.name} (#${newMonster.id}) has appeared!`);
		}
	});
	
	// 2. Process Heroes
	manageCombatAssignments();
	
	gameState.heroes.forEach(hero => {
		if (!hero.targetMonsterId) { // Check targetMonsterId for regen.
			if (hero.hp.current > 0) {
				hero.hp.current = Math.min(hero.hp.max, hero.hp.current + hero.hpRegen);
			}
			hero.mp.current = Math.min(hero.mp.max, hero.mp.current + hero.mpRegen);
		}
		
		// NEW: Auto-consume items if health or mana is low.
		if (hero.hp.current > 0 && hero.hp.current / hero.hp.max < 0.6) {
			// Prioritize better healing items first.
			const hpItems = ['ITM009', 'ITM002'];
			for (const itemId of hpItems) {
				if (hero.inventory[itemId]) {
					if (handleUseConsumable(hero.id, itemId)) {
						break; // Stop after using one item.
					}
				}
			}
		}
		
		if (hero.mp.current / hero.mp.max < 0.6) {
			// Prioritize better mana items first.
			const mpItems = ['ITM013', 'ITM005'];
			for (const itemId of mpItems) {
				if (hero.inventory[itemId]) {
					if (handleUseConsumable(hero.id, itemId)) {
						break; // Stop after using one item.
					}
				}
			}
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
		if (monster.assignedTo.length === 0) { // A monster attacks if no one is fighting it.
			if (!monster.targetBuilding) {
				const validTargets = gameState.city.buildings.filter(b => b.state !== 'ruined');
				if (validTargets.length > 0) {
					monster.targetBuilding = validTargets[Math.floor(Math.random() * validTargets.length)].id;
				}
			}
			
			if (monster.targetBuilding) {
				const bldg = gameState.city.buildings.find(b => b.id === monster.targetBuilding);
				if (bldg && bldg.state !== 'ruined') {
					// NEW: Monsters now use their damage range against buildings.
					const monsterDamage = parseRange(monster.damage);
					if (bldg.shieldHp > 0) {
						const damageToShield = Math.min(bldg.shieldHp, monsterDamage);
						bldg.shieldHp -= damageToShield;
						// NEW: Log damage dealt to building shields.
						addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) dealt ${damageToShield} damage to the shield on Building #${bldg.id}.`);
						if (bldg.shieldHp === 0) {
							addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) destroyed the shield on Building #${bldg.id}!`);
						}
					} else {
						const damageToHp = Math.min(bldg.hp, monsterDamage);
						bldg.hp -= damageToHp;
						// NEW: Log damage dealt to building HP.
						addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) dealt ${damageToHp} damage to Building #${bldg.id}.`);
						if (bldg.hp <= 0) {
							bldg.hp = 0;
							bldg.state = 'ruined';
							bldg.population = 0;
							monster.targetBuilding = null;
							addToLog(`Building #${bldg.id} was ruined by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
						} else if (bldg.hp <= 5 && bldg.state === 'functional') {
							bldg.state = 'damaged';
							addToLog(`Building #${bldg.id} was damaged by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
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
		if (e.target.matches('[data-use-item-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const itemId = e.target.dataset.useItemId;
			if (handleUseConsumable(heroId, itemId)) {
				renderContent();
			}
		}
		// NEW: Add click handler for auto-crafting items.
		if (e.target.matches('[data-auto-craft-recipe-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const recipeResultId = e.target.dataset.autoCraftRecipeId;
			handleAutoCraft(heroId, recipeResultId);
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
