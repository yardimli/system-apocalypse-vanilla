import { gameState, gameData } from './state.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

// DOM element references
const headerContainer = getEl('game-header');
const tabsContainer = getEl('tabs-container');

/**
 * Renders the main game header with current stats.
 */
export function renderHeader () {
	let timeEl = headerContainer.querySelector('[data-stat="time"]');
	let ticksEl = headerContainer.querySelector('[data-stat="ticks"]');
	
	if (!timeEl) {
		const template = getEl('header-template').content.cloneNode(true);
		headerContainer.innerHTML = '';
		headerContainer.appendChild(template);
		timeEl = headerContainer.querySelector('[data-stat="time"]');
		ticksEl = headerContainer.querySelector('[data-stat="ticks"]');
	}
	
	const formatTime = (t) => {
		const totalDays = Math.floor(t / 10);
		const years = Math.floor(totalDays / 360) + 1;
		const months = Math.floor((totalDays % 360) / 30) + 1;
		const days = (totalDays % 30) + 1;
		return `Y${years}, M${months}, D${days}`;
	};
	timeEl.textContent = formatTime(gameState.time);
	ticksEl.textContent = gameState.time;
	
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

/**
 * Renders the navigation tabs.
 * @param {string} activeTab - The currently active tab.
 * @param {Array<string>} TABS - An array of all available tab names.
 */
export function renderTabs (activeTab, TABS) {
	tabsContainer.innerHTML = TABS.map(tab => `
        <a role="tab" class="tab ${tab === activeTab ? 'tab-active' : ''}" data-tab="${tab}">${tab}</a>
    `).join('');
}

/**
 * Renders the grid of city buildings.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderBuildings (contentArea) {
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

/**
 * Renders the grid of mana battery cars.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderCars (contentArea) {
	if (!getEl('cars-grid')) {
		contentArea.innerHTML = `<div id="cars-grid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4"></div>`;
	}
	const grid = getEl('cars-grid');
	
	// Generate a state string to check if an update is actually needed
	const stateStr = JSON.stringify(gameState.city.cars.map(car => [car.id, car.battery, car.driverId]));
	if (grid.getAttribute('data-prev-state') === stateStr) return;
	
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
	
	// Save the current state to prevent unnecessary updates
	grid.setAttribute('data-prev-state', stateStr);
}

/**
 * Renders the main city status overview.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderCity (contentArea) {
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

/**
 * Renders the game log.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderLog (contentArea) {
	if (!getEl('log-container')) {
		contentArea.innerHTML = `
        <div class="card bg-base-200 shadow-xl p-6">
            <h2 class="text-2xl font-bold mb-4">Game Log</h2>
            <div id="log-container" class="bg-base-100 rounded-box p-4 h-96 overflow-y-scroll flex flex-col-reverse font-mono text-sm">
            </div>
        </div>`;
	}
	const container = getEl('log-container');
	if (!container) return;
	
	// Use the first log entry as the state key since logs are unshifted
	const stateStr = gameState.log.length > 0 ? gameState.log[0] : '';
	if (container.getAttribute('data-prev-state') === stateStr) return;
	
	container.innerHTML = gameState.log.map(entry => `<p>${entry}</p>`).join('');
	
	// Save the current state to prevent unnecessary updates
	container.setAttribute('data-prev-state', stateStr);
}

/**
 * Renders the overview of all items in the game.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderItemsOverview (contentArea) {
	let grid = getEl('items-overview-grid');
	if (!grid) {
		contentArea.innerHTML = `
			<div class="flex flex-col gap-4">
				<h2 class="text-2xl font-bold">Items Overview</h2>
				<div id="items-overview-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"></div>
			</div>
		`;
		grid = getEl('items-overview-grid');
	}
	
	grid.innerHTML = gameData.items.map(item => {
		const details = [];
		if (item.type) details.push(`<strong>Type:</strong> ${item.type}`);
		if (item.level) details.push(`<strong>Level:</strong> ${item.level}`);
		if (item.sellPrice) details.push(`<strong>Sell Price:</strong> ${item.sellPrice} Tokens`);
		
		if (item.effect) {
			const { type, value } = item.effect;
			const effectText = type === 'heal_hp' ? `Restores ${value} HP` : `Restores ${value} MP`;
			details.push(`<strong>Effect:</strong> ${effectText}`);
		}
		if (item.damageMitigation) details.push(`<strong>Mitigation:</strong> ${item.damageMitigation}`);
		if (item.damage) details.push(`<strong>Damage:</strong> ${item.damage}`);
		if (item.spellPower) details.push(`<strong>Spell Power:</strong> x${item.spellPower}`);
		if (item.equipSlot) details.push(`<strong>Slot:</strong> ${item.equipSlot}`);
		if (item.class) details.push(`<strong>Class:</strong> ${item.class}`);
		
		// Description is handled separately for formatting
		const descriptionHtml = item.description ? `<p class="text-xs italic text-gray-400 mt-2">${item.description}</p>` : '';
		
		return `
			<div class="card bg-base-200 shadow-md p-4 flex flex-col items-center">
				<h3 class="font-bold text-lg text-center">${item.name} (${item.id})</h3>
				<img src="${item.image}" alt="${item.name}" class="w-[200px] h-[200px] object-contain my-4 bg-base-300 rounded" />
				<div class="text-sm w-full">
					${details.join('<br>')}
					${descriptionHtml}
				</div>
			</div>
		`;
	}).join('');
}
