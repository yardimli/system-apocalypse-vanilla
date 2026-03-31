import { gameState, gameData } from './state.js';
import { handleAegisAction } from './aegis.js';
import { processStriker } from './striker.js';
import { processVanguard } from './vanguard.js';
import { addToLog } from './utils.js';
import { renderSandbox, applySandboxChanges } from './sandbox.js';
import { findValidRecipe, handleCraftAttempt } from './crafting.js';

const TABS =['Heroes', 'Buildings', 'Cars', 'City', 'Log', 'Sandbox'];
let activeTab = 'Heroes';

// --- DOM ELEMENTS ---
const getEl = (id) => document.getElementById(id);
const headerContainer = getEl('game-header');
const tabsContainer = getEl('tabs-container');
const contentArea = getEl('content-area');

// --- RENDERING FUNCTIONS ---
function renderHeader() {
	let timeEl = headerContainer.querySelector('[data-stat="time"]');
	
	if (!timeEl) {
		const template = getEl('header-template').content.cloneNode(true);
		headerContainer.innerHTML = '';
		headerContainer.appendChild(template);
		timeEl = headerContainer.querySelector('[data-stat="time"]');
	}
	
	const formatTime = (t) => {
		const totalDays = Math.floor(t / 10);
		const years = Math.floor(totalDays / 360) + 1;
		const months = Math.floor((totalDays % 360) / 30) + 1;
		const days = (totalDays % 30) + 1;
		return `Y${years}, M${months}, D${days}`;
	};
	timeEl.textContent = formatTime(gameState.time);
	
	const totalPop = gameState.city.buildings.reduce((sum, b) => sum + b.population, 0);
	const functional = gameState.city.buildings.filter(b => b.state === 'functional').length;
	const shielded = gameState.city.buildings.filter(b => b.shieldHp > 0).length;
	const broken = gameState.city.buildings.filter(b => b.state !== 'functional').length;
	
	const attackingBldg = gameState.activeMonsters.filter(m => !m.assigned && m.targetBuilding).length;
	const attackingHero = gameState.activeMonsters.filter(m => m.assigned).length;
	const roaming = gameState.activeMonsters.filter(m => !m.assigned && !m.targetBuilding).length;
	
	const activeCars = gameState.city.cars.filter(c => c.battery > 0).length;
	
	const bldgText = `F:${functional} | S:${shielded} | B:${broken}`;
	headerContainer.querySelector('[data-stat="population"]').textContent = totalPop;
	headerContainer.querySelector('[data-stat="buildings"]').textContent = bldgText;
	headerContainer.querySelector('[data-stat="cars"]').textContent = `${activeCars}/40`;
	headerContainer.querySelector('[data-stat="monsters"]').textContent = `${attackingBldg} / ${attackingHero}`;
	headerContainer.querySelector('[data-stat="roaming"]').textContent = roaming;
}

function renderTabs() {
	tabsContainer.innerHTML = TABS.map(tab => `
        <a role="tab" class="tab ${tab === activeTab ? 'tab-active' : ''}" data-tab="${tab}">${tab}</a>
    `).join('');
}

function renderContent() {
	switch (activeTab) {
		case 'Heroes':
			if (!getEl('heroes-tab-content')) {
				contentArea.innerHTML = `
                    <div id="heroes-tab-content" class="flex flex-col gap-4">
                        <div id="heroes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                        <div class="divider">Shared Inventory (Drag items to a hero's crafting area)</div>
                        <div id="shared-inventory" class="flex flex-wrap gap-2 bg-base-200 p-4 rounded-box shadow-inner min-h-[80px]"></div>
                    </div>
                `;
			}
			renderHeroes();
			break;
		case 'Buildings':
			renderBuildings();
			break;
		case 'Cars':
			renderCars();
			break;
		case 'City':
			renderCity();
			break;
		case 'Log':
			renderLog();
			break;
		case 'Sandbox':
			renderSandbox(contentArea);
			break;
	}
}

function renderHeroes() {
	const grid = getEl('heroes-grid');
	if (!grid) return;
	const template = getEl('hero-card-template');
	
	gameState.heroes.forEach(hero => {
		let card = getEl(`hero-card-${hero.id}`);
		
		if (!card) {
			const clone = template.content.cloneNode(true);
			card = clone.querySelector('.card');
			card.id = `hero-card-${hero.id}`;
			grid.appendChild(clone);
			card = getEl(`hero-card-${hero.id}`);
		}
		
		card.querySelector('[data-name]').textContent = `${hero.name} | Lv. ${hero.level}`;
		card.querySelector('[data-class]').textContent = hero.class;
		card.querySelector('[data-class]').className = `badge ${hero.class === 'Aegis' ? 'badge-info' : hero.class === 'Striker' ? 'badge-error' : 'badge-success'}`;
		
		const armor = gameData.armor.find(a => a.id === hero.armorId);
		const armorText = armor ? `${armor.name} (Mitigation: ${armor.damageMitigation})` : 'No Armor';
		card.querySelector('[data-armor]').textContent = armorText;
		
		card.querySelector('[data-xp-label]').textContent = `XP: ${hero.xp.current}/${hero.xp.max}`;
		card.querySelector('[data-xp-bar]').value = hero.xp.current;
		card.querySelector('[data-xp-bar]').max = hero.xp.max;
		
		const formatRegen = (val) => Number(val.toFixed(2));
		card.querySelector('[data-hp-label]').textContent = `HP: ${Math.floor(hero.hp.current)}/${hero.hp.max} (+${formatRegen(hero.hpRegen)}/s)`;
		card.querySelector('[data-hp-bar]').value = hero.hp.current;
		card.querySelector('[data-hp-bar]').max = hero.hp.max;
		
		card.querySelector('[data-mp-label]').textContent = `MP: ${Math.floor(hero.mp.current)}/${hero.mp.max} (+${formatRegen(hero.mpRegen)}/s)`;
		card.querySelector('[data-mp-bar]').value = hero.mp.current;
		card.querySelector('[data-mp-bar]').max = hero.mp.max;
		
		const dynamicArea = card.querySelector('[data-dynamic-area]');
		
		if (hero.class === 'Aegis') {
			// MODIFIED: Adapt to new hero.skills structure [{id, xp}]
			const allSkillData = hero.skills.map(s => gameData.skills.find(gs => gs.id === s.id));
			const allManualSkills = allSkillData.filter(s => s && s.type === 'Manual');
			
			const autoSkills = hero.autoCast.map(id => allManualSkills.find(s => s.id === id)).filter(Boolean);
			const manualSkills = allManualSkills.filter(s => !hero.autoCast.includes(s.id));
			
			dynamicArea.innerHTML = `
                <div class="flex gap-2 w-full">
                    <div class="flex-1 bg-base-100 p-2 rounded border border-base-300 min-h-[100px]" data-drop-zone="manual" data-hero-id="${hero.id}">
                        <h4 class="text-xs font-bold mb-2 text-center text-gray-400">Manual Skills</h4>
                        <div class="flex flex-col gap-1">
                            ${manualSkills.map(skill => `
                                <div draggable="true" data-drag-skill="${skill.id}" class="badge badge-outline cursor-move w-full justify-between p-3">
                                    <span>${skill.name}</span>
                                    <button class="btn btn-xs btn-ghost" data-skill-id="${skill.id}" data-hero-id="${hero.id}" ${hero.mp.current < skill.mpCost ? 'disabled' : ''}>Cast</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="flex-1 bg-base-100 p-2 rounded border border-primary min-h-[100px]" data-drop-zone="auto" data-hero-id="${hero.id}">
                        <h4 class="text-xs font-bold mb-2 text-center text-primary">Auto Priority</h4>
                        <div class="flex flex-col gap-1">
                            ${autoSkills.map(skill => `
                                <div draggable="true" data-drag-skill="${skill.id}" class="badge badge-primary cursor-move w-full p-3">${skill.name}</div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <p class="text-[10px] text-center mt-1 text-gray-500">Drag skills between boxes to set auto-cast priority.</p>
            `;
		} else {
			if (hero.hp.current <= 0) {
				dynamicArea.innerHTML = `<p class="text-error font-bold text-center">INCAPACITATED</p><p class="text-xs text-center">Awaiting Aegis Healing...</p>`;
			} else if (!hero.carId) {
				dynamicArea.innerHTML = `<p class="text-warning text-center text-sm">Waiting for Mana Battery Car...</p>`;
			} else if (hero.targetMonster) {
				dynamicArea.innerHTML = `
                    <p class="text-sm font-bold text-error mb-1">Fighting: Lv.${hero.targetMonster.level} ${hero.targetMonster.name}</p>
                    <progress class="progress progress-error w-full" value="${hero.targetMonster.currentHp}" max="${hero.targetMonster.maxHp}"></progress>
                    <p class="text-xs text-right mt-1">${Math.floor(hero.targetMonster.currentHp)}/${hero.targetMonster.maxHp} HP</p>
                `;
			} else {
				dynamicArea.innerHTML = `<p class="text-success text-center text-sm">Patrolling in Car #${hero.carId}. No targets.</p>`;
			}
		}
		
		const craftingContainer = card.querySelector('[data-crafting-container]');
		if (craftingContainer) {
			const craftDropZone = craftingContainer.querySelector('[data-drop-zone="crafting"]');
			craftDropZone.dataset.heroId = hero.id;
			const craftButton = craftingContainer.querySelector('[data-craft-button]');
			craftButton.dataset.heroId = hero.id;
			
			if (hero.craftingSlots.length > 0) {
				craftDropZone.innerHTML = hero.craftingSlots.map((itemId, index) => {
					const item = gameData.items.find(i => i.id === itemId);
					if (!item) return '';
					return `<div draggable="true" data-drag-craft-item-id="${itemId}" data-hero-id="${hero.id}" data-item-index="${index}" class="badge badge-accent cursor-move p-3">${item.name}</div>`;
				}).join('');
			} else {
				craftDropZone.innerHTML = `<span class="text-xs text-gray-500 italic">Drag ingredients here...</span>`;
			}
			
			const validRecipe = findValidRecipe(hero);
			if (validRecipe) {
				craftButton.disabled = false;
				// MODIFIED: Recipes now only create items.
				const resultEntity = gameData.items.find(i => i.id === validRecipe.resultId);
				
				if (resultEntity) {
					craftButton.textContent = `Craft: ${resultEntity.name}`;
				} else {
					craftButton.textContent = 'Craft: Unknown'; // Fallback for safety
				}
			} else {
				craftButton.disabled = true;
				craftButton.textContent = 'Craft';
			}
		}
		
		// NEW: Render the hero's skills and their XP progress
		const skillsListContainer = card.querySelector('[data-skills-list]');
		if (skillsListContainer) {
			skillsListContainer.innerHTML = hero.skills.map(heroSkill => {
				const skillData = gameData.skills.find(s => s.id === heroSkill.id);
				if (!skillData) return '';
				
				return `
					<div class="text-xs">
						<div class="flex justify-between items-center">
							<span>${skillData.name}</span>
							<span class="text-gray-400">${heroSkill.xp} / ${skillData.xpMax}</span>
						</div>
						<progress class="progress progress-secondary w-full" value="${heroSkill.xp}" max="${skillData.xpMax}"></progress>
					</div>
				`;
			}).join('');
		}
	});
	
	const invContainer = getEl('shared-inventory');
	if (invContainer) {
		invContainer.dataset.dropZone = 'inventory';
		let inventoryHtml = '';
		const inventoryItems = Object.entries(gameState.inventory);
		
		if (inventoryItems.length > 0) {
			inventoryItems.forEach(([id, qty]) => {
				// MODIFIED: Inventory now only contains items.
				const entity = gameData.items.find(i => i.id === id);
				if (entity) {
					for (let i = 0; i < qty; i++) {
						inventoryHtml += `<div draggable="true" data-drag-item-id="${id}" class="badge badge-outline badge-lg p-3 cursor-move">${entity.name}</div>`;
					}
				}
			});
			invContainer.innerHTML = inventoryHtml;
		} else {
			invContainer.innerHTML = '<p class="text-sm text-gray-500 w-full text-center mt-4">Inventory is empty.</p>';
		}
	}
}

function renderBuildings() {
	let grid = getEl('buildings-grid');
	if (!grid) {
		contentArea.innerHTML = `<div id="buildings-grid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"></div>`;
		grid = getEl('buildings-grid');
		
		gameState.city.buildings.forEach(b => {
			const el = document.createElement('div');
			el.id = `bldg-${b.id}`;
			el.className = 'card bg-base-200 shadow-sm p-3 text-xs border border-base-300';
			el.innerHTML = `
                <div class="font-bold text-sm mb-1">Bldg #${b.id}</div>
                <div data-state class="font-semibold"></div>
                <div data-hp></div>
                <div data-shield class="text-info"></div>
                <div data-pop class="text-success mt-1"></div>
            `;
			grid.appendChild(el);
		});
	}
	
	gameState.city.buildings.forEach(b => {
		const el = getEl(`bldg-${b.id}`);
		if (!el) return;
		
		const stateEl = el.querySelector('[data-state]');
		stateEl.textContent = `State: ${b.state}`;
		stateEl.className = `font-semibold ${b.state === 'functional' ? 'text-success' : b.state === 'damaged' ? 'text-warning' : 'text-error'}`;
		
		el.querySelector('[data-hp]').textContent = `HP: ${b.hp}/${b.maxHp}`;
		el.querySelector('[data-shield]').textContent = `Shield: ${b.shieldHp}/${b.maxShieldHp}`;
		el.querySelector('[data-pop]').textContent = `Pop: ${b.population}/10`;
	});
}

function renderCars() {
	if (!getEl('cars-grid')) {
		contentArea.innerHTML = `<div id="cars-grid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4"></div>`;
	}
	const grid = getEl('cars-grid');
	grid.innerHTML = gameState.city.cars.map(car => {
		const driver = car.driverId ? gameState.heroes.find(h => h.id === car.driverId) : null;
		const driverText = driver ? `${driver.name} (${driver.class})` : 'None';
		return `
            <div class="card bg-base-200 shadow-sm p-3 text-xs border ${car.battery > 0 ? 'border-success' : 'border-error'}">
                <div class="font-bold mb-1">Car #${car.id}</div>
                <div>Battery: ${car.battery}/10</div>
                <div class="truncate text-gray-400 mt-1">Driver: ${driverText}</div>
            </div>
        `;
	}).join('');
}

function renderCity() {
	if (!getEl('city-status-container')) {
		contentArea.innerHTML = `
        <div id="city-status-container" class="card bg-base-200 shadow-xl p-6">
            <h2 class="text-2xl font-bold mb-4">City Status</h2>
            <div class="stats stats-vertical lg:stats-horizontal shadow mb-4">
                <div class="stat"><div class="stat-title">Functional</div><div class="stat-value text-success" id="city-func-stat"></div></div>
                <div class="stat"><div class="stat-title">Shielded</div><div class="stat-value text-info" id="city-shield-stat"></div></div>
                <div class="stat"><div class="stat-title">Broken</div><div class="stat-value text-error" id="city-broken-stat"></div></div>
                <div class="stat"><div class="stat-title">Active Cars</div><div class="stat-value text-warning" id="city-cars-stat"></div></div>
            </div>
        </div>`;
	}
	
	const functional = gameState.city.buildings.filter(b => b.state === 'functional').length;
	const shielded = gameState.city.buildings.filter(b => b.shieldHp > 0).length;
	const broken = gameState.city.buildings.filter(b => b.state !== 'functional').length;
	const activeCars = gameState.city.cars.filter(c => c.battery > 0).length;
	
	getEl('city-func-stat').textContent = functional;
	getEl('city-shield-stat').textContent = shielded;
	getEl('city-broken-stat').textContent = broken;
	getEl('city-cars-stat').textContent = `${activeCars}/40`;
}

function renderLog() {
	if (!getEl('log-container')) {
		contentArea.innerHTML = `
        <div class="card bg-base-200 shadow-xl p-6">
            <h2 class="text-2xl font-bold mb-4">Game Log</h2>
            <div id="log-container" class="bg-base-100 rounded-box p-4 h-96 overflow-y-scroll flex flex-col-reverse font-mono text-sm">
            </div>
        </div>`;
	}
	getEl('log-container').innerHTML = gameState.log.map(entry => `<p>${entry}</p>`).join('');
}

// --- GAME LOOP ---
function gameLoop() {
	gameState.time++;
	
	// 1. Spawn Monsters
	const week = Math.floor(gameState.time / 70) + 1;
	gameState.threatLevel = 10 + Math.floor(gameState.time / 60);
	
	if (Math.random() < (gameState.threatLevel / 100)) {
		const availableMonsters = gameData.monsters.filter(m => m.level <= week);
		const randomMonster = availableMonsters.length > 0 ? availableMonsters[Math.floor(Math.random() * availableMonsters.length)] : gameData.monsters[0];
		
		gameState.activeMonsters.push({
			id: Math.random().toString(36).substr(2, 9),
			name: randomMonster.name,
			level: randomMonster.level,
			maxHp: randomMonster.hp,
			currentHp: randomMonster.hp,
			damage: randomMonster.damage,
			xp: randomMonster.xp,
			assigned: false,
			targetBuilding: null
		});
		addToLog(`A Lv.${randomMonster.level} ${randomMonster.name} has appeared!`);
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
	if (activeTab === 'Heroes') renderHeroes();
	if (activeTab === 'Buildings') renderBuildings();
	if (activeTab === 'Cars') renderCars();
	if (activeTab === 'City') renderCity();
	if (activeTab === 'Log') renderLog();
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
	renderTabs();
	renderContent();
	
	tabsContainer.addEventListener('click', (e) => {
		if (e.target.matches('[data-tab]')) {
			activeTab = e.target.dataset.tab;
			renderTabs();
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
		
		const source = e.dataTransfer.getData('source');
		const itemId = e.dataTransfer.getData('itemId');
		if (!source || !itemId) return;
		
		if (dropZone.dataset.dropZone === 'crafting') {
			const targetHeroId = parseInt(dropZone.dataset.heroId);
			const hero = gameState.heroes.find(h => h.id === targetHeroId);
			if (!hero) return;
			
			if (source === 'inventory') {
				const isItem = gameData.items.some(i => i.id === itemId);
				if (!isItem) return;
				
				if (gameState.inventory[itemId] > 0) {
					gameState.inventory[itemId]--;
					if (gameState.inventory[itemId] === 0) delete gameState.inventory[itemId];
					hero.craftingSlots.push(itemId);
				}
			} else if (source === 'crafting') {
				const sourceHeroId = parseInt(e.dataTransfer.getData('heroId'));
				const itemIndex = parseInt(e.dataTransfer.getData('itemIndex'));
				const sourceHero = gameState.heroes.find(h => h.id === sourceHeroId);
				if (sourceHero) {
					sourceHero.craftingSlots.splice(itemIndex, 1);
					hero.craftingSlots.push(itemId);
				}
			}
			renderContent();
		}
		
		if (dropZone.dataset.dropZone === 'inventory') {
			if (source === 'crafting') {
				const sourceHeroId = parseInt(e.dataTransfer.getData('heroId'));
				const itemIndex = parseInt(e.dataTransfer.getData('itemIndex'));
				const hero = gameState.heroes.find(h => h.id === sourceHeroId);
				if (hero) {
					hero.craftingSlots.splice(itemIndex, 1);
					gameState.inventory[itemId] = (gameState.inventory[itemId] || 0) + 1;
				}
			}
			renderContent();
		}
	});
	
	setInterval(gameLoop, 1000);
}

document.addEventListener('DOMContentLoaded', init);
