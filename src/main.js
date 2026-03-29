import { gameState, gameData } from './state.js';
import { handleAegisAction } from './aegis.js';
import { processStriker } from './striker.js';
import { processVanguard } from './vanguard.js';
import { addToLog } from './utils.js';

const TABS = ['Heroes', 'City', 'Log'];
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

	// Updated time format: 1 day = 10 seconds
	const formatTime = (t) => {
		const totalDays = Math.floor(t / 10);
		const years = Math.floor(totalDays / 360) + 1;
		const months = Math.floor((totalDays % 360) / 30) + 1;
		const days = (totalDays % 30) + 1;
		return `Y${years}, M${months}, D${days}`;
	};
	timeEl.textContent = formatTime(gameState.time);

	const bldgText = `F:${gameState.city.functional} | S:${gameState.city.shielded} | B:${gameState.city.damaged + gameState.city.ruined}`;
	headerContainer.querySelector('[data-stat="buildings"]').textContent = bldgText;
	headerContainer.querySelector('[data-stat="cars"]').textContent = gameState.city.cars;
	headerContainer.querySelector('[data-stat="monsters"]').textContent = gameState.activeMonsters.length;
}

function renderTabs() {
	tabsContainer.innerHTML = TABS.map(tab => `
        <a role="tab" class="tab ${tab === activeTab ? 'tab-active' : ''}" data-tab="${tab}">${tab}</a>
    `).join('');
}

function renderContent() {
	switch (activeTab) {
		case 'Heroes':
			if (!getEl('heroes-grid')) {
				contentArea.innerHTML = `<div id="heroes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>`;
			}
			renderHeroes();
			break;
		case 'City':
			renderCity();
			break;
		case 'Log':
			renderLog();
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

			// Removed the click event listener for the details toggle button

			grid.appendChild(clone);
			card = getEl(`hero-card-${hero.id}`);
		}

		card.querySelector('[data-name]').textContent = `${hero.name} | Lv. ${hero.level}`;
		card.querySelector('[data-class]').textContent = hero.class;
		card.querySelector('[data-class]').className = `badge ${hero.class === 'Aegis' ? 'badge-info' : hero.class === 'Striker' ? 'badge-error' : 'badge-success'}`;

		card.querySelector('[data-xp-label]').textContent = `XP: ${hero.xp.current}/${hero.xp.max}`;
		card.querySelector('[data-xp-bar]').value = hero.xp.current;
		card.querySelector('[data-xp-bar]').max = hero.xp.max;

		card.querySelector('[data-hp-label]').textContent = `HP: ${Math.floor(hero.hp.current)}/${hero.hp.max}`;
		card.querySelector('[data-hp-bar]').value = hero.hp.current;
		card.querySelector('[data-hp-bar]').max = hero.hp.max;

		card.querySelector('[data-mp-label]').textContent = `MP: ${Math.floor(hero.mp.current)}/${hero.mp.max}`;
		card.querySelector('[data-mp-bar]').value = hero.mp.current;
		card.querySelector('[data-mp-bar]').max = hero.mp.max;

		const dynamicArea = card.querySelector('[data-dynamic-area]');
		if (hero.class === 'Aegis') {
			const skills = hero.skills.map(id => gameData.skills.find(s => s.id === id)).filter(s => s && s.type === 'Manual');
			// Added auto-cast checkboxes next to Aegis skills
			dynamicArea.innerHTML = skills.map(skill => `
        <div class="flex items-center justify-between m-1 bg-base-100 p-1 rounded">
          <button class="btn btn-xs btn-primary" data-skill-id="${skill.id}" data-hero-id="${hero.id}" ${hero.mp.current < skill.mpCost ? 'disabled' : ''}>${skill.name} (${skill.mpCost} MP)</button>
          <label class="cursor-pointer label flex gap-2 p-0">
            <span class="label-text text-xs">Auto</span>
            <input type="checkbox" class="checkbox checkbox-xs" data-autocast-id="${skill.id}" data-hero-id="${hero.id}" ${hero.autoCast && hero.autoCast[skill.id] ? 'checked' : ''} />
          </label>
        </div>
      `).join('');
		} else {
			if (hero.hp.current <= 0) {
				dynamicArea.innerHTML = `<p class="text-error font-bold text-center">INCAPACITATED</p><p class="text-xs text-center">Awaiting Aegis Healing...</p>`;
			} else if (!hero.hasCar) {
				dynamicArea.innerHTML = `<p class="text-warning text-center text-sm">Waiting for Mana Battery Car...</p>`;
			} else if (hero.targetMonster) {
				dynamicArea.innerHTML = `
                    <p class="text-sm font-bold text-error mb-1">Fighting: ${hero.targetMonster.name}</p>
                    <progress class="progress progress-error w-full" value="${hero.targetMonster.currentHp}" max="${hero.targetMonster.maxHp}"></progress>
                    <p class="text-xs text-right mt-1">${Math.floor(hero.targetMonster.currentHp)}/${hero.targetMonster.maxHp} HP</p>
                `;
			} else {
				dynamicArea.innerHTML = `<p class="text-success text-center text-sm">Patrolling in Car. No targets.</p>`;
			}
		}

		// Always render details to keep inventory and crafting fresh
		renderHeroDetails(hero.id, card.querySelector('[data-details-content]'));
	});
}

// Renders hero details inline inside the hero card
function renderHeroDetails(heroId, container) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	if (!hero) return;

	const ownedSkills = hero.skills.map(id => gameData.skills.find(s => s.id === id)).filter(Boolean);

	// Combine skills and items for inventory display
	const inventoryItems = Object.entries(hero.inventory).map(([id, qty]) => {
		const entity = gameData.skills.find(s => s.id === id) || gameData.items.find(i => i.id === id);
		return entity ? { ...entity, qty } : null;
	}).filter(Boolean);

	container.innerHTML = `
        <div class="grid grid-cols-1 gap-4 text-sm mt-2">
            <div class="bg-base-100 p-2 rounded">
                <h4 class="font-bold mb-1 text-primary">Learned Skills</h4>
                ${ownedSkills.length > 0 ? ownedSkills.map(s => `<p>&bull; <strong>${s.name}</strong>: ${s.description}</p>`).join('') : '<p>No skills learned.</p>'}
            </div>
            <div class="bg-base-100 p-2 rounded">
                <h4 class="font-bold mb-1 text-secondary">Inventory</h4>
                <div class="flex flex-col gap-1">
                    ${inventoryItems.length > 0 ? inventoryItems.map(s => `<p>&bull; ${s.name} x${s.qty}</p>`).join('') : '<p>Inventory is empty.</p>'}
                </div>
            </div>
        </div>
        <div class="divider my-2">Crafting</div>
        <div class="flex flex-col gap-2 text-sm">
            ${gameData.recipes.map(recipe => {
		const canCraft = recipe.ingredients.every(ingId => (hero.inventory[ingId] || 0) >= recipe.ingredients.filter(i => i === ingId).length);
		const resultSkill = gameData.skills.find(s => s.id === recipe.resultId);

		if (resultSkill && resultSkill.class !== hero.class) return '';

		return `<div class="flex items-center justify-between p-2 bg-base-100 rounded">
                            <span class="text-xs">${recipe.description}</span>
                            <button class="btn btn-xs btn-secondary" data-craft-id="${recipe.resultId}" data-hero-id="${hero.id}" ${!canCraft ? 'disabled' : ''}>Craft</button>
                        </div>`;
	}).join('')}
        </div>
    `;
}

function handleCrafting(heroId, resultId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const recipe = gameData.recipes.find(r => r.resultId === resultId);
	if (!hero || !recipe) return;

	const hasIngredients = recipe.ingredients.every(ingId => (hero.inventory[ingId] || 0) >= recipe.ingredients.filter(i => i === ingId).length);

	if (hasIngredients) {
		recipe.ingredients.forEach(ingId => {
			hero.inventory[ingId]--;
			if (hero.inventory[ingId] === 0) delete hero.inventory[ingId];
		});

		const resultSkill = gameData.skills.find(s => s.id === resultId);

		// Replace lower version of the skill if applicable
		if (resultSkill.replaces) {
			const index = hero.skills.indexOf(resultSkill.replaces);
			if (index !== -1) {
				hero.skills.splice(index, 1);
			}
		}

		if (!hero.skills.includes(resultId)) {
			hero.skills.push(resultId);
		}

		addToLog(`${hero.name} crafted ${resultSkill.name}!`);
		renderContent();
	}
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
                <div class="stat"><div class="stat-title">Mana Cars</div><div class="stat-value text-warning" id="city-cars-stat"></div></div>
            </div>
        </div>`;
	}
	getEl('city-func-stat').textContent = gameState.city.functional;
	getEl('city-shield-stat').textContent = gameState.city.shielded;
	getEl('city-broken-stat').textContent = gameState.city.damaged + gameState.city.ruined;
	getEl('city-cars-stat').textContent = gameState.city.cars;
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
	gameState.threatLevel = 10 + Math.floor(gameState.time / 60);
	if (Math.random() < (gameState.threatLevel / 100)) {
		const randomMonster = gameData.monsters[Math.floor(Math.random() * gameData.monsters.length)];
		const scale = 1 + (gameState.time / 300);
		gameState.activeMonsters.push({
			id: Math.random().toString(36).substr(2, 9),
			name: randomMonster.name,
			maxHp: Math.floor(randomMonster.hp * scale),
			currentHp: Math.floor(randomMonster.hp * scale),
			damage: Math.floor(randomMonster.damage * scale),
			xp: Math.floor(randomMonster.xp * scale),
			assigned: false,
			attackCooldown: 3
		});
		addToLog(`A ${randomMonster.name} has appeared!`);
	}

	// 2. Process Heroes
	gameState.heroes.forEach(hero => {
		if (hero.hp.current > 0) {
			hero.hp.current = Math.min(hero.hp.max, hero.hp.current + 0.5);
		}
		// Apply dynamic mana regen based on level
		hero.mp.current = Math.min(hero.mp.max, hero.mp.current + (hero.manaRegen || 1));

		// Process Auto-Casts for Aegis
		if (hero.class === 'Aegis' && hero.autoCast) {
			Object.keys(hero.autoCast).forEach(skillId => {
				if (hero.autoCast[skillId]) {
					const skill = gameData.skills.find(s => s.id === skillId);
					if (skill && hero.mp.current >= skill.mpCost) {
						let shouldCast = false;
						if (skill.actionType === 'repair' && (gameState.city.damaged > 0 || gameState.city.ruined > 0)) shouldCast = true;
						if (skill.actionType === 'shield' && gameState.city.functional > gameState.city.shielded) shouldCast = true;
						if (skill.actionType === 'battery' && gameState.city.cars < 3) shouldCast = true; // Keep a small buffer of cars
						if (skill.actionType === 'heal') {
							const injured = gameState.heroes.find(h => h.hp.current < h.hp.max);
							if (injured) shouldCast = true;
						}
						if (shouldCast) {
							handleAegisAction(hero.id, skill.id);
						}
					}
				}
			});
		}

		if (hero.class === 'Striker') processStriker(hero);
		if (hero.class === 'Vanguard') processVanguard(hero);
	});

	// 3. Unassigned Monsters Attack City
	gameState.activeMonsters.forEach(monster => {
		if (!monster.assigned) {
			monster.attackCooldown--;
			if (monster.attackCooldown <= 0) {
				monster.attackCooldown = 3;
				if (gameState.city.shielded > 0) {
					gameState.city.shielded--;
					addToLog(`${monster.name} attacked the city! A shield was destroyed.`);
				} else if (gameState.city.functional > 0) {
					gameState.city.functional--;
					gameState.city.damaged++;
					addToLog(`${monster.name} attacked the city! A building was damaged.`);
				} else if (gameState.city.damaged > 0) {
					gameState.city.damaged--;
					gameState.city.ruined++;
					addToLog(`${monster.name} attacked the city! A damaged building was ruined.`);
				}
			}
		}
	});

	gameState.activeMonsters = gameState.activeMonsters.filter(m => m.currentHp > 0);

	renderHeader();
	if (activeTab === 'Heroes') renderHeroes();
	if (activeTab === 'City') renderCity();
	if (activeTab === 'Log') renderLog();
}

// --- INITIALIZATION ---
async function init() {
	try {
		const [items, skills, recipes, monsters] = await Promise.all([
			fetch('./data/items.json').then(res => res.json()),
			fetch('./data/skills.json').then(res => res.json()),
			fetch('./data/recipes.json').then(res => res.json()),
			fetch('./data/monsters.json').then(res => res.json())
		]);
		gameData.items = items;
		gameData.skills = skills;
		gameData.recipes = recipes;
		gameData.monsters = monsters;
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
		if (e.target.matches('[data-craft-id]')) {
			const { heroId, craftId } = e.target.dataset;
			handleCrafting(parseInt(heroId), craftId);
		}
	});

	// Handle auto-cast checkbox toggles
	document.body.addEventListener('change', (e) => {
		if (e.target.matches('[data-autocast-id]')) {
			const { heroId, autocastId } = e.target.dataset;
			const hero = gameState.heroes.find(h => h.id === parseInt(heroId));
			if (hero) {
				hero.autoCast = hero.autoCast || {};
				hero.autoCast[autocastId] = e.target.checked;
			}
		}
	});

	setInterval(gameLoop, 1000);
}

document.addEventListener('DOMContentLoaded', init);
