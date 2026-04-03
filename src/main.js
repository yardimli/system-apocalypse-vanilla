import { gameState, gameData } from './state.js';
import { handleAegisAction } from './aegis.js';
import { handleCombatAction } from './combat.js';
import { addToLog, parseRange } from './utils.js';
import { renderSandbox, applySandboxChanges } from './sandbox.js';
import { handleUseConsumable } from './inventory.js';
import { handleBuyItem, handleSellItem, handleBuySkill } from './shop.js';
import { renderHeroes, autoEquipBestGear, renderShopModal } from './heroes.js';
import { renderMonsters } from './monsters.js';
// MODIFIED: Import building functions from the new buildings.js file
import { renderBuildings, handleBuyBuilding, handleEnterBuilding, handleExitBuilding } from './buildings.js';
// MODIFIED: renderBuildings is no longer imported from ui.js
import { renderHeader, renderTabs, renderCars, renderCity, renderLog, renderItemsOverview } from './ui.js';

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
	// MODIFIED: Heroes inside buildings cannot participate in combat.
	const combatHeroes = gameState.heroes.filter(h =>
		h.location === 'field' && // NEW: Must be in the field
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
				targetBuilding: null,
				agro: {} // NEW: Agro table for each monster
			};
			gameState.activeMonsters.push(newMonster);
			addToLog(`A Lv.${monsterData.level} ${monsterData.name} (#${newMonster.id}) has appeared!`);
		}
	});
	
	// 2. Process Heroes
	manageCombatAssignments();
	
	gameState.heroes.forEach(hero => {
		autoEquipBestGear(hero);
		
		// MODIFIED: If hero is in a safezone, apply boosted regen based on building HP.
		if (hero.location !== 'field') {
			const building = gameState.city.buildings.find(b => b.id === hero.location);
			// NEW: Regen multiplier is based on building HP percentage.
			const baseRegenMultiplier = building?.regenMultiplier || 10;
			const hpPercentage = (building && building.maxHp > 0) ? (building.hp / building.maxHp) : 1;
			const regenMultiplier = baseRegenMultiplier * hpPercentage;
			
			if (hero.hp.current > 0) {
				hero.hp.current = Math.min(hero.hp.max, hero.hp.current + (hero.hpRegen * regenMultiplier));
				if (hero.mp) {
					hero.mp.current = Math.min(hero.mp.max, hero.mp.current + (hero.mpRegen * regenMultiplier));
				}
			}
			return; // Skip the rest of the logic for this hero
		}
		
		// MODIFIED: This logic now only runs for heroes in the 'field'
		if (!hero.carId && hero.hp.current > 0) {
			const availableCar = gameState.city.cars.find(c => c.battery > 0 && c.driverId === null);
			if (availableCar) {
				hero.carId = availableCar.id;
				availableCar.driverId = hero.id;
				addToLog(`${hero.name} entered Car #${availableCar.id}.`, hero.id);
			}
		}
		
		if (hero.hp.current > 0) {
			hero.hp.current = Math.min(hero.hp.max, hero.hp.current + hero.hpRegen);
			if (hero.mp) {
				hero.mp.current = Math.min(hero.mp.max, hero.mp.current + hero.mpRegen);
			}
		}
		
		if (hero.class === 'Vanguard' && !hero.targetMonsterId && hero.rage.current > 0) {
			hero.rage.current = Math.max(0, hero.rage.current - 1);
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
				// MODIFIED: Level check for auto-casting
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
				
				if (meetsLevelReq && canAutoCast && hasResources) { // MODIFIED: Added meetsLevelReq
					let shouldCast = false;
					if (skill.class === 'Aegis') {
						// MODIFIED: Removed repair/shield auto-cast checks
						if (skill.actionType === 'battery' && gameState.city.cars.some(c => c.battery <= 0)) shouldCast = true;
						if (skill.actionType === 'heal' && gameState.heroes.some(h => h.hp.current < (h.hp.max * 0.7))) shouldCast = true;
						
						if (shouldCast) handleAegisAction(hero.id, skill.id);
					} else { // For Striker and Vanguard
						if (hero.targetMonsterId) {
							shouldCast = true;
						}
						if (shouldCast) handleCombatAction(hero.id, skill.id);
					}
				}
			}
		}
	});
	
	// 3. Monsters Attack Heroes based on Agro
	gameState.activeMonsters.forEach(monster => {
		if (monster.assignedTo.length > 0) {
			let targetHeroId = null;
			let maxAgro = -1;
			
			for (const heroId in monster.agro) {
				const hero = gameState.heroes.find(h => h.id === parseInt(heroId, 10));
				if (hero && hero.hp.current > 0 && monster.assignedTo.includes(hero.id)) {
					if (monster.agro[heroId] > maxAgro) {
						maxAgro = monster.agro[heroId];
						targetHeroId = parseInt(heroId, 10);
					}
				}
			}
			
			if (targetHeroId) {
				const targetHero = gameState.heroes.find(h => h.id === targetHeroId);
				const armor = gameData.items.find(a => a.id === targetHero.equipment.body);
				const shield = gameData.items.find(s => s.id === targetHero.equipment.offHand);
				const armorMitigation = armor ? parseRange(armor.damageMitigation) : 0;
				const shieldMitigation = shield ? parseRange(shield.damageMitigation) : 0;
				const totalMitigation = armorMitigation + shieldMitigation;
				
				const monsterDamage = parseRange(monster.damage);
				const damageTaken = Math.max(1, monsterDamage - totalMitigation);
				
				targetHero.hp.current -= damageTaken;
				addToLog(`${monster.name} (#${monster.id}) attacked ${targetHero.name}, dealing ${damageTaken} damage!`, targetHero.id);
				
				if (targetHero.hp.current <= 0) {
					targetHero.hp.current = 0;
					// MODIFIED: When incapacitated, hero also exits any building they were in (shouldn't happen, but good failsafe)
					handleExitBuilding(targetHero.id);
					const car = gameState.city.cars.find(c => c.id === targetHero.carId);
					if (car) car.driverId = null;
					targetHero.carId = null;
					targetHero.targetMonsterId = null;
					addToLog(`${targetHero.name} was incapacitated by ${monster.name} (#${monster.id})!`, targetHero.id);
				}
			}
		}
	});
	
	// 4. Unassigned Monsters Attack City
	gameState.activeMonsters.forEach(monster => {
		if (monster.assignedTo.length === 0) {
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
						// NEW: Player-owned buildings cannot drop below 1 shield/hp
						if (bldg.owner === 'player' && bldg.shieldHp < 1) bldg.shieldHp = 1;
						addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) dealt ${damageToShield} damage to the shield on ${bldg.name || `Building #${bldg.id}`}.`);
						if (bldg.shieldHp === 0 || (bldg.owner === 'player' && bldg.shieldHp === 1)) {
							addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) effectively destroyed the shield on ${bldg.name || `Building #${bldg.id}`}!`);
						}
					} else {
						const damageToHp = Math.min(bldg.hp, monsterDamage);
						bldg.hp -= damageToHp;
						if (bldg.owner === 'player' && bldg.hp < 1) bldg.hp = 1;
						addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) dealt ${damageToHp} damage to ${bldg.name || `Building #${bldg.id}`}.`);
						if (bldg.hp <= 0 && bldg.owner !== 'player') { // MODIFIED: Only non-player buildings can be ruined
							bldg.hp = 0;
							bldg.state = 'ruined';
							bldg.population = 0;
							monster.targetBuilding = null;
							addToLog(`${bldg.name || `Building #${bldg.id}`} was ruined by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
						} else if (bldg.hp <= 5 && bldg.state === 'functional') {
							bldg.state = 'damaged';
							addToLog(`${bldg.name || `Building #${bldg.id}`} was damaged by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
						}
					}
				} else {
					monster.targetBuilding = null;
				}
			}
		}
	});
	
	// 5. Centralized monster defeat and reward logic
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
					addToLog(`${hero.name} gained ${xpPerHero} XP and ${tokensPerHero} Tokens.`, hero.id);
					
					const lootChance = hero.class === 'Vanguard' ? 0.4 : 0.25;
					if (Math.random() < lootChance) {
						const possibleDrops = gameData.items.filter(item => item.level === monster.level && item.type !== 'Junk');
						if (possibleDrops.length > 0) {
							const dropped = possibleDrops[Math.floor(Math.random() * possibleDrops.length)];
							hero.inventory[dropped.id] = (hero.inventory[dropped.id] || 0) + 1;
							addToLog(`${hero.name} found an item: ${dropped.name}!`, hero.id);
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
						addToLog(`${hero.name} reached Level ${hero.level}!`, hero.id);
					}
				});
			}
		});
		
		gameState.activeMonsters = gameState.activeMonsters.filter(m => m.currentHp > 0);
	}
	
	// 6. Daily Updates
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
						addToLog(`${driver.name}'s car ran out of battery!`, driver.id);
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
		// NEW: Load building upgrades data
		const [items, skills, monsters, systemShop, buildingUpgrades] = await Promise.all([
			fetch('./data/items.json').then(res => res.json()),
			fetch('./data/skills.json').then(res => res.json()),
			fetch('./data/monsters.json').then(res => res.json()),
			fetch('./data/system_shop.json').then(res => res.json()),
			fetch('./data/building_upgrades.json').then(res => res.json()) // NEW
		]);
		gameData.items = items;
		gameData.skills = skills;
		gameData.monsters = monsters;
		gameData.system_shop = systemShop;
		gameData.building_upgrades = buildingUpgrades; // NEW
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
		// Handle selling an item - This must be checked before data-inventory-item
		if (e.target.matches('[data-sell-item-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const itemId = e.target.dataset.sellItemId;
			handleSellItem(heroId, itemId);
			const modal = getEl('system-shop-modal');
			if (modal.open) {
				renderShopModal(heroId);
			}
			renderContent();
			return;
		}
		
		const inventoryItem = e.target.closest('[data-inventory-item]');
		const inShopModal = e.target.closest('#system-shop-modal');
		if (inventoryItem && !inShopModal) {
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
		
		if (e.target.matches('[data-open-shop-btn]')) {
			const card = e.target.closest('.card');
			if (card && card.id.startsWith('hero-card-')) {
				const heroId = parseInt(card.id.replace('hero-card-', ''), 10);
				renderShopModal(heroId);
			}
			return;
		}
		
		const autoCastBtn = e.target.closest('[data-autocast-skill-id]');
		if (autoCastBtn) {
			const heroId = parseInt(autoCastBtn.dataset.heroId, 10);
			const skillId = autoCastBtn.dataset.autocastSkillId;
			const hero = gameState.heroes.find(h => h.id === heroId);
			if (hero) {
				if (hero.autoCastSkillId === skillId) {
					hero.autoCastSkillId = null;
					addToLog(`${hero.name} disabled auto-cast.`, hero.id);
				} else {
					hero.autoCastSkillId = skillId;
					const skillName = gameData.skills.find(s => s.id === skillId).name;
					addToLog(`${hero.name} set auto-cast skill to: ${skillName}.`, hero.id);
				}
				renderContent();
			}
			return;
		}
		
		const setTargetBtn = e.target.closest('[data-set-target-hero-id]');
		if (setTargetBtn) {
			const casterId = parseInt(setTargetBtn.dataset.casterHeroId, 10);
			const targetId = parseInt(setTargetBtn.dataset.setTargetHeroId, 10);
			const skillId = setTargetBtn.dataset.skillId;
			const caster = gameState.heroes.find(h => h.id === casterId);
			if (caster) {
				caster.skillTargets[skillId] = targetId;
				renderContent();
			}
			return;
		}
		
		if (e.target.matches('[data-skill-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const skillId = e.target.dataset.skillId;
			const hero = gameState.heroes.find(h => h.id === heroId);
			const skillData = gameData.skills.find(s => s.id === skillId);
			
			if (skillData.class === 'Aegis') {
				const options = {};
				if (skillData.actionType === 'heal') {
					options.targetHeroId = hero.skillTargets[skillId];
				}
				handleAegisAction(heroId, skillId, options);
			} else {
				handleCombatAction(heroId, skillId);
			}
			renderContent();
		}
		
		if (e.target.matches('[data-buy-item-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const itemId = e.target.dataset.buyItemId;
			handleBuyItem(heroId, itemId);
			renderShopModal(heroId);
			renderContent();
		}
		if (e.target.matches('[data-buy-skill-id]')) {
			const heroId = parseInt(e.target.dataset.heroId, 10);
			const skillId = e.target.dataset.buySkillId;
			handleBuySkill(heroId, skillId);
			renderShopModal(heroId);
			renderContent();
		}
		// NEW: Event handlers for building actions
		if (e.target.matches('[data-buy-building-id]')) {
			const buildingId = parseInt(e.target.dataset.buyBuildingId, 10);
			handleBuyBuilding(buildingId);
			renderContent();
		}
		if (e.target.matches('[data-enter-building-hero]')) {
			const heroId = parseInt(e.target.dataset.enterBuildingHero, 10);
			const buildingId = parseInt(e.target.dataset.enterBuildingBldg, 10);
			handleEnterBuilding(heroId, buildingId);
			renderContent();
		}
		if (e.target.matches('[data-exit-building-hero]')) {
			const heroId = parseInt(e.target.dataset.exitBuildingHero, 10);
			handleExitBuilding(heroId);
			renderContent();
		}
		if (e.target.matches('[data-open-upgrade-modal]')) {
			// Placeholder for rendering the upgrade modal
			const buildingId = parseInt(e.target.dataset.openUpgradeModal, 10);
			alert(`Placeholder: Open upgrade modal for Building #${buildingId}`);
			// renderBuildingUpgradeModal(buildingId);
		}
		// NEW: Event handler for collapsible hero log
		const logToggler = e.target.closest('[data-toggle-log]');
		if (logToggler) {
			const logContainer = logToggler.nextElementSibling;
			if (logContainer && logContainer.matches('[data-hero-log-list]')) {
				logContainer.classList.toggle('hidden');
			}
			return; // Prevent other actions
		}
		if (e.target.id === 'sandbox-apply') {
			applySandboxChanges();
			renderContent();
		}
	});
	
	setInterval(gameLoop, 1000);
}

document.addEventListener('DOMContentLoaded', init);
