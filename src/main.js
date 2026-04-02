import { gameState, gameData } from './state.js';
import { handleAegisAction } from './aegis.js';
import { processStriker } from './striker.js';
import { processVanguard } from './vanguard.js';
import { addToLog, parseRange } from './utils.js';
import { renderSandbox, applySandboxChanges } from './sandbox.js';
import { handleUseConsumable } from './inventory.js';
import { handleBuyItem, handleSellItem, handleBuySkill } from './shop.js';
import { renderHeroes, autoEquipBestGear, renderShopModal } from './heroes.js';
import { renderMonsters } from './monsters.js';
import { renderHeader, renderTabs, renderBuildings, renderCars, renderCity, renderLog, renderItemsOverview } from './ui.js';

const TABS = ['Heroes', 'Buildings', 'Cars', 'Monsters', 'City', 'Items', 'Log', 'Sandbox'];
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

/**
 * Manages combat assignments for Strikers and Vanguards.
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
				tokens: monsterData.tokens,
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
		autoEquipBestGear(hero);
		
		if (!hero.targetMonsterId) { // Check targetMonsterId for regen.
			if (hero.hp.current > 0) {
				hero.hp.current = Math.min(hero.hp.max, hero.hp.current + hero.hpRegen);
			}
			hero.mp.current = Math.min(hero.mp.max, hero.mp.current + hero.mpRegen);
		}
		
		// MODIFIED: Auto-use is always enabled. The check for `hero.autoUse.hp` has been removed.
		if (hero.hp.current < hero.hp.max) {
			const missingHp = hero.hp.max - hero.hp.current;
			const availableHpItems = Object.keys(hero.inventory)
				.map(itemId => gameData.items.find(i => i.id === itemId && hero.inventory[itemId] > 0))
				.filter(item => item && item.type === 'Consumable' && item.effect?.type === 'heal_hp');
			
			if (availableHpItems.length > 0) {
				let bestItemToUse = null;
				const hpThreshold = hero.hp.max * 0.25;
				
				// If HP is below 25%, use the strongest item available, even if it's wasteful.
				if (hero.hp.current < hpThreshold) {
					bestItemToUse = availableHpItems.sort((a, b) => b.effect.value - a.effect.value)[0];
				} else {
					// Otherwise, use the strongest item that won't be wasted.
					bestItemToUse = availableHpItems
						.filter(item => missingHp >= item.effect.value)
						.sort((a, b) => b.effect.value - a.effect.value)[0];
				}
				
				if (bestItemToUse) {
					handleUseConsumable(hero.id, bestItemToUse.id);
				}
			}
		}
		
		// MODIFIED: Auto-use is always enabled. The check for `hero.autoUse.mp` has been removed.
		if (hero.mp.current < hero.mp.max) {
			const missingMp = hero.mp.max - hero.mp.current;
			const availableMpItems = Object.keys(hero.inventory)
				.map(itemId => gameData.items.find(i => i.id === itemId && hero.inventory[itemId] > 0))
				.filter(item => item && item.type === 'Consumable' && item.effect?.type === 'heal_mp');
			
			if (availableMpItems.length > 0) {
				let bestItemToUse = null;
				const mpThreshold = hero.mp.max * 0.25;
				
				// If MP is below 25%, use the strongest item available, even if it's wasteful.
				if (hero.mp.current < mpThreshold) {
					bestItemToUse = availableMpItems.sort((a, b) => b.effect.value - a.effect.value)[0];
				} else {
					// Otherwise, use the strongest item that won't be wasted.
					bestItemToUse = availableMpItems
						.filter(item => missingMp >= item.effect.value)
						.sort((a, b) => b.effect.value - a.effect.value)[0];
				}
				
				if (bestItemToUse) {
					handleUseConsumable(hero.id, bestItemToUse.id);
				}
			}
		}
		
		// MODIFIED: Simplified Aegis auto-cast logic
		if (hero.class === 'Aegis' && hero.autoCastSkillId) {
			const skillId = hero.autoCastSkillId;
			const skill = gameData.skills.find(s => s.id === skillId);
			if (skill && hero.mp.current >= skill.mpCost) {
				let shouldCast = false;
				if (skill.actionType === 'repair' && gameState.city.buildings.some(b => b.state !== 'functional')) shouldCast = true;
				if (skill.actionType === 'shield' && gameState.city.buildings.some(b => b.state === 'functional' && b.shieldHp === 0)) shouldCast = true;
				if (skill.actionType === 'battery' && gameState.city.cars.some(c => c.battery <= 0)) shouldCast = true;
				if (skill.actionType === 'heal' && gameState.heroes.some(h => h.hp.current < h.hp.max)) shouldCast = true;
				
				if (shouldCast) {
					handleAegisAction(hero.id, skill.id);
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
					const monsterDamage = parseRange(monster.damage);
					if (bldg.shieldHp > 0) {
						const damageToShield = Math.min(bldg.shieldHp, monsterDamage);
						bldg.shieldHp -= damageToShield;
						addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) dealt ${damageToShield} damage to the shield on Building #${bldg.id}.`);
						if (bldg.shieldHp === 0) {
							addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) destroyed the shield on Building #${bldg.id}!`);
						}
					} else {
						const damageToHp = Math.min(bldg.hp, monsterDamage);
						bldg.hp -= damageToHp;
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
	
	// Centralized monster defeat and reward logic
	const defeatedMonsters = gameState.activeMonsters.filter(m => m.currentHp <= 0);
	if (defeatedMonsters.length > 0) {
		defeatedMonsters.forEach(monster => {
			addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) was defeated!`);
			
			// Find heroes who were assigned to this monster
			const attackers = monster.assignedTo
				.map(id => gameState.heroes.find(h => h.id === id))
				.filter(Boolean); // Filter out any nulls if a hero somehow disappears
			
			if (attackers.length > 0) {
				const xpPerHero = Math.ceil(monster.xp / attackers.length);
				const tokensPerHero = Math.ceil((monster.tokens || 0) / attackers.length);
				
				attackers.forEach(hero => {
					// Clear target so they don't keep attacking a dead monster
					if (hero.targetMonsterId === monster.id) {
						hero.targetMonsterId = null;
					}
					
					// Grant XP and Tokens
					hero.xp.current += xpPerHero;
					hero.tokens += tokensPerHero;
					addToLog(`${hero.name} gained ${xpPerHero} XP and ${tokensPerHero} Tokens.`);
					
					// Loot Drop Chance (Striker: 25%, Vanguard: 40%)
					const lootChance = hero.class === 'Vanguard' ? 0.4 : 0.25;
					if (Math.random() < lootChance) {
						const possibleDrops = gameData.items.filter(item => item.level === monster.level && item.type !== 'Junk'); // Don't drop junk
						if (possibleDrops.length > 0) {
							const dropped = possibleDrops[Math.floor(Math.random() * possibleDrops.length)];
							hero.inventory[dropped.id] = (hero.inventory[dropped.id] || 0) + 1;
							addToLog(`${hero.name} found an item: ${dropped.name}!`);
						}
					}
					
					// Check for Level Up
					if (hero.xp.current >= hero.xp.max) {
						hero.level++;
						hero.xp.current -= hero.xp.max;
						hero.xp.max = Math.ceil(hero.xp.max * 1.5);
						hero.hp.max += hero.hpMaxPerLevel;
						hero.mp.max += hero.mpMaxPerLevel;
						hero.hpRegen += hero.hpRegenPerLevel;
						hero.mpRegen += hero.mpRegenPerLevel;
						hero.hp.current = hero.hp.max;
						addToLog(`${hero.name} reached Level ${hero.level}!`);
					}
				});
			}
		});
		
		// Remove defeated monsters from the active list
		gameState.activeMonsters = gameState.activeMonsters.filter(m => m.currentHp > 0);
	}
	
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
	if (activeTab === 'Items') renderItemsOverview(contentArea);
	if (activeTab === 'Log') renderLog(contentArea);
	if (activeTab === 'Sandbox') renderSandbox(contentArea);
}

// --- INITIALIZATION ---
async function init() {
	try {
		const [items, skills, monsters, systemShop] = await Promise.all([
			fetch('./data/items.json').then(res => res.json()),
			fetch('./data/skills.json').then(res => res.json()),
			fetch('./data/monsters.json').then(res => res.json()),
			fetch('./data/system_shop.json').then(res => res.json())
		]);
		gameData.items = items;
		gameData.skills = skills;
		gameData.monsters = monsters;
		gameData.system_shop = systemShop;
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
		// MODIFIED: Removed the event handler for expanding/collapsing shop items.
		
		// Handle selling an item - This must be checked before data-inventory-item
		if (e.target.matches('[data-sell-item-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const itemId = e.target.dataset.sellItemId;
			handleSellItem(heroId, itemId);
			// If the shop is open, re-render it to reflect the change.
			const modal = getEl('system-shop-modal');
			if (modal.open) {
				renderShopModal(heroId);
			}
			renderContent();
			return; // Stop further processing
		}
		
		// Handle clicking on an inventory item on the HERO CARD to use it
		const inventoryItem = e.target.closest('[data-inventory-item]');
		const inShopModal = e.target.closest('#system-shop-modal');
		if (inventoryItem && !inShopModal) { // Only process clicks outside the shop modal
			const heroId = parseInt(inventoryItem.dataset.heroId, 10);
			const itemId = inventoryItem.dataset.itemId;
			const itemData = gameData.items.find(i => i.id === itemId);
			// Only try to use items that are consumables
			if (itemData && itemData.type === 'Consumable') {
				if (handleUseConsumable(heroId, itemId)) {
					renderContent(); // Re-render to show updated inventory count
				}
			}
			return; // Prevent other click handlers from firing
		}
		
		// Handle opening the system shop modal
		if (e.target.matches('[data-open-shop-btn]')) {
			const card = e.target.closest('.card');
			if (card && card.id.startsWith('hero-card-')) {
				const heroId = parseInt(card.id.replace('hero-card-', ''), 10);
				renderShopModal(heroId);
			}
			return;
		}
		
		// Handle Aegis auto-cast buttons
		const autoCastBtn = e.target.closest('[data-autocast-skill-id]');
		if (autoCastBtn) {
			const heroId = parseInt(autoCastBtn.dataset.heroId, 10);
			const skillId = autoCastBtn.dataset.autocastSkillId;
			const hero = gameState.heroes.find(h => h.id === heroId);
			if (hero) {
				// If clicking the currently active skill, toggle it off.
				if (hero.autoCastSkillId === skillId) {
					hero.autoCastSkillId = null;
					addToLog(`${hero.name} disabled auto-cast.`);
				} else {
					// Otherwise, set the new skill as active.
					hero.autoCastSkillId = skillId;
					const skillName = gameData.skills.find(s => s.id === skillId).name;
					addToLog(`${hero.name} set auto-cast skill to: ${skillName}.`);
				}
				renderContent();
			}
			return; // Prevent other handlers
		}
		
		if (e.target.matches('[data-skill-id]')) {
			const { heroId, skillId } = e.target.dataset;
			handleAegisAction(parseInt(heroId), skillId);
			renderContent();
		}
		if (e.target.matches('[data-buy-item-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const itemId = e.target.dataset.buyItemId;
			handleBuyItem(heroId, itemId);
			// Re-render the modal content after a purchase
			renderShopModal(heroId);
			renderContent();
		}
		if (e.target.matches('[data-buy-skill-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const skillId = e.target.dataset.buySkillId;
			handleBuySkill(heroId, skillId);
			// Re-render the modal content after a purchase
			renderShopModal(heroId);
			renderContent();
		}
		if (e.target.id === 'sandbox-apply') {
			applySandboxChanges();
			renderContent();
		}
	});
	
	// MODIFIED: Removed the 'change' event listener for auto-use toggles as they no longer exist.
	
	// MODIFIED: Removed all tooltip-related event listeners
	
	setInterval(gameLoop, 1000);
}

document.addEventListener('DOMContentLoaded', init);
