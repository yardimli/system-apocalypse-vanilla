import { gameState, gameData } from './state.js';
import { handleCombatAction, handleAegisAction } from './hero-actions.js';
import { addToLog, parseRange } from './utils.js';
import { renderSandbox, applySandboxChanges } from './sandbox.js';
import { handleUseConsumable } from './inventory.js';
import { handleBuyItem, handleSellItem, handleBuySkill, handleBuyUpgrade, handleBuyCar } from './shop.js';
import { renderHeroes, autoEquipBestGear, renderShopModal } from './heroes.js';
import { renderMonsters } from './monsters.js';
import { renderBuildings, handleBuyBuilding, handleEnterBuilding, handleExitBuilding } from './buildings.js';
// Modified: Imported renderPartyLog
import { renderHeader, renderTabs, renderCity, renderLog, renderItemsOverview, renderPartyCombat, renderPartyLog } from './ui.js';
import { renderCars, initiateCarPurchase } from './cars.js';
import { renderMissionControl, handleStartMission, handleFlee, processMissionTick } from './missions.js';

const TABS = ['Heroes', 'Buildings', 'Cars', 'Monsters', 'City', 'Items', 'Log', 'Sandbox'];
let activeTab = 'Heroes';

// --- DOM ELEMENTS ---
const getEl = (id) => document.getElementById(id);
const tabsContainer = getEl('tabs-container');
const contentArea = getEl('content-area');

function renderContent () {
	switch (activeTab) {
		case 'Heroes':
			if (!getEl('heroes-tab-content')) {
				contentArea.innerHTML = `
                    <div id="heroes-tab-content" class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        <!-- Hero Cards Area (spans 3 columns on large screens) -->
                        <div id="heroes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 col-span-1 lg:col-span-3 gap-4">
                            <!-- Hero cards will be injected here -->
                        </div>

                        <!-- Sidebar Area (4th column) -->
                        <div id="heroes-sidebar" class="flex flex-col gap-4">

                            <!-- Mission Control -->
                            <div id="mission-control-area" class="card bg-base-200 shadow-md p-4 flex flex-col gap-4">
                                <!-- Mission control content will be dynamically rendered here -->
                            </div>

                            <!-- Shared Party Combat Area -->
                            <div id="party-combat-area" class="w-full">
                                <!-- Shared combat info will be injected here -->
                            </div>

                            <!-- New: Party Log Area -->
                            
                            <div id="party-log-area" class="flex flex-col gap-1 bg-base-100 rounded p-2 h-60 overflow-y-auto text-xs font-mono">
                                <!-- Party log content will be injected by renderPartyLog -->
                            </div>
                        </div>
                    </div>
                `;
			}
			renderMissionControl();
			renderPartyCombat();
			renderPartyLog(); // Added call to render the new party log
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

function manageCombatAssignments () {
	const combatHeroes = gameState.heroes.filter(h =>
		h.location === 'field' &&
		(h.class === 'Striker' || h.class === 'Vanguard') &&
		h.hp.current > 0 &&
		h.carId
	);
	
	combatHeroes.forEach(hero => {
		if (hero.targetMonsterId && !gameState.activeMonsters.some(m => m.id === hero.targetMonsterId)) {
			hero.targetMonsterId = null;
		}
	});
	
	const vanguards = combatHeroes.filter(h => h.class === 'Vanguard');
	const strikers = combatHeroes.filter(h => h.class === 'Striker');
	
	vanguards.forEach(vanguard => {
		if (!vanguard.targetMonsterId) {
			const target = gameState.activeMonsters.find(m => !gameState.heroes.some(h => h.targetMonsterId === m.id));
			if (target) {
				vanguard.targetMonsterId = target.id;
			}
		}
	});
	
	const vanguardTargets = vanguards
		.map(v => gameState.activeMonsters.find(m => m.id === v.targetMonsterId))
		.filter(Boolean);
	
	strikers.forEach(striker => {
		const isTargetingVanguardMonster = vanguardTargets.some(m => m.id === striker.targetMonsterId);
		
		if (vanguardTargets.length > 0 && !isTargetingVanguardMonster) {
			striker.targetMonsterId = vanguardTargets[0].id;
		} else if (vanguardTargets.length === 0 && !striker.targetMonsterId) {
			const target = gameState.activeMonsters.find(m => !gameState.heroes.some(h => h.targetMonsterId === m.id));
			if (target) {
				striker.targetMonsterId = target.id;
			}
		}
	});
	
	gameState.activeMonsters.forEach(m => {
		m.assignedTo = gameState.heroes
			.filter(h => h.targetMonsterId === m.id)
			.map(h => h.id);
	});
}


// --- GAME LOOP ---
function gameLoop () {
	gameState.time++;
	
	processMissionTick();
	
	// 2. Process Heroes
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
				let damageTaken = Math.max(1, monsterDamage - totalMitigation);
				
				const car = targetHero.carId ? gameState.city.cars.find(c => c.id === targetHero.carId) : null;
				if (car) {
					const mitigationBonus = car.upgrades
						.map(upgId => gameData.car_upgrades.find(u => u.id === upgId))
						.filter(upg => upg && upg.effect.type === 'increase_occupant_mitigation_bonus')
						.reduce((sum, upg) => sum + upg.effect.value, 0);
					
					if (mitigationBonus > 0) {
						const mitigatedAmount = Math.floor(damageTaken * mitigationBonus);
						damageTaken -= mitigatedAmount;
						addToLog(`${targetHero.name}'s car mitigated ${mitigatedAmount} damage!`, targetHero.id);
					}
				}
				damageTaken = Math.max(1, damageTaken);
				
				targetHero.hp.current -= damageTaken;
				addToLog(`${monster.name} (#${monster.id}) attacked ${targetHero.name}, dealing ${damageTaken} damage!`, targetHero.id);
				
				if (targetHero.hp.current <= 0) {
					targetHero.hp.current = 0;
					handleExitBuilding(targetHero.id);
					if (targetHero.carId) {
						targetHero.carId = null;
					}
					if (targetHero.survivorsCarried > 0) {
						addToLog(`The ${targetHero.survivorsCarried} survivors with ${targetHero.name} were killed when they were incapacitated!`, targetHero.id);
						targetHero.survivorsCarried = 0;
					}
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
						if (bldg.hp <= 0 && bldg.owner !== 'player') {
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
		
		if (gameState.activeMonsters.length === 0 && gameState.party.pausedMission) {
			addToLog('Combat finished. Resuming mission...');
			gameState.party.missionState = gameState.party.pausedMission.state;
			gameState.party.missionTimer = gameState.party.pausedMission.timer;
			gameState.party.missionProgress = gameState.party.pausedMission.progress;
			gameState.party.pausedMission = null;
		}
	}
	
	// 6. Daily Updates
	
	renderHeader();
	if (activeTab === 'Heroes') {
		renderMissionControl();
		renderPartyCombat();
		renderPartyLog(); // Added call to render the new party log
		renderHeroes();
	}
	if (activeTab === 'Buildings') renderBuildings(contentArea);
	if (activeTab === 'Monsters') renderMonsters(contentArea);
	if (activeTab === 'Cars') renderCars(contentArea);
	if (activeTab === 'City') renderCity(contentArea);
	if (activeTab === 'Items') renderItemsOverview(contentArea);
	if (activeTab === 'Log') renderLog(contentArea);
	if (activeTab === 'Sandbox') renderSandbox(contentArea);
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
		
		const sellBtn = e.target.closest('[data-sell-item-id]');
		if (sellBtn) {
			const heroId = parseInt(sellBtn.dataset.heroId, 10);
			const itemId = sellBtn.dataset.sellItemId;
			handleSellItem(heroId, itemId);
			const modal = getEl('system-shop-modal');
			if (modal.open) {
				renderShopModal(heroId);
			}
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
		
		const buyItemBtn = e.target.closest('[data-buy-item-id]');
		if (buyItemBtn) {
			const heroId = parseInt(buyItemBtn.dataset.heroId, 10);
			const itemId = buyItemBtn.dataset.buyItemId;
			handleBuyItem(heroId, itemId);
			renderShopModal(heroId);
			renderContent();
			return;
		}
		
		const buySkillBtn = e.target.closest('[data-buy-skill-id]');
		if (buySkillBtn) {
			const heroId = parseInt(buySkillBtn.dataset.heroId, 10);
			const skillId = buySkillBtn.dataset.buySkillId;
			handleBuySkill(heroId, skillId);
			renderShopModal(heroId);
			renderContent();
			return;
		}
		
		const buyUpgradeBtn = e.target.closest('[data-buy-upgrade-id]');
		if (buyUpgradeBtn) {
			const upgradeId = buyUpgradeBtn.dataset.buyUpgradeId;
			const heroId = parseInt(buyUpgradeBtn.dataset.heroId, 10);
			handleBuyUpgrade(heroId, upgradeId);
			renderShopModal(heroId);
			renderContent();
			return;
		}
		
		const buyBuildingBtn = e.target.closest('[data-buy-building-id]');
		if (buyBuildingBtn) {
			const buildingId = parseInt(buyBuildingBtn.dataset.buyBuildingId, 10);
			handleBuyBuilding(buildingId);
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
		
		const confirmBuyCarBtn = e.target.closest('[data-confirm-buy-car]');
		if (confirmBuyCarBtn) {
			const heroId = parseInt(confirmBuyCarBtn.dataset.heroId, 10);
			const carId = confirmBuyCarBtn.dataset.carId;
			handleBuyCar(heroId, carId);
			const modal = getEl('car-purchase-modal');
			if (modal) modal.close();
			renderContent();
			return;
		}
		
		const buyCarBtn = e.target.closest('[data-buy-car-id]');
		if (buyCarBtn) {
			initiateCarPurchase(buyCarBtn.dataset.buyCarId);
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
		
		const battleLogToggle = e.target.closest('[data-toggle-battle-log]');
		if (battleLogToggle) {
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
	
	setInterval(gameLoop, 1000);
}

document.addEventListener('DOMContentLoaded', init);
