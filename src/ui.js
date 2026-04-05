import { gameState, gameData } from './state.js';
import { updateTextIfChanged } from './utils.js';

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
	const shielded = gameState.city.buildings.filter(b => b.owner === 'player' && b.shieldHp > 0).length;
	const broken = gameState.city.buildings.filter(b => b.state !== 'functional').length;
	
	const attackingBldg = gameState.activeMonsters.filter(m => !m.assigned && m.targetBuilding).length;
	const attackingHero = gameState.activeMonsters.filter(m => m.assigned).length;
	const roaming = gameState.activeMonsters.filter(m => !m.assigned && !m.targetBuilding).length;
	
	// MODIFIED: Car count is now based on player-owned cars.
	const activeCars = gameState.city.cars.filter(c => c.owner === 'player').length;
	
	const bldgText = `F:${functional} | S:${shielded} | B:${broken}`;
	headerContainer.querySelector('[data-stat="population"]').textContent = totalPop;
	headerContainer.querySelector('[data-stat="buildings"]').textContent = bldgText;
	headerContainer.querySelector('[data-stat="cars"]').textContent = `${activeCars}/${gameState.city.cars.length}`;
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

// MODIFIED: renderCars has been moved to the new src/cars.js file.

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
                <div class="stat"><div class="stat-title">Player Cars</div><div class="stat-value text-warning" id="city-cars-stat"></div></div>
            </div>
        </div>`;
	}
	
	const functional = gameState.city.buildings.filter(b => b.state === 'functional').length;
	const shielded = gameState.city.buildings.filter(b => b.owner === 'player' && b.shieldHp > 0).length;
	const broken = gameState.city.buildings.filter(b => b.state !== 'functional').length;
	// MODIFIED: Car count is now based on player-owned cars.
	const activeCars = gameState.city.cars.filter(c => c.owner === 'player').length;
	
	getEl('city-func-stat').textContent = functional;
	getEl('city-shield-stat').textContent = shielded;
	getEl('city-broken-stat').textContent = broken;
	getEl('city-cars-stat').textContent = `${activeCars}/${gameState.city.cars.length}`;
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
            <div id="log-container" class="bg-base-100 rounded-box p-4 h-96 overflow-y-scroll flex flex-col font-mono text-sm">
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
	
	// Since gameData.items is static, only render the content once.
	if (grid.hasChildNodes()) {
		return;
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
				<img src="${item.image}" alt="${item.name}" class="w-[100px] h-[100px] object-contain my-4 bg-base-300 rounded" />
				<div class="text-sm w-full">
					${details.join('<br>')}
					${descriptionHtml}
				</div>
			</div>
		`;
	}).join('');
}

/**
 * NEW: Renders the dropdown menu for accessing each hero's shop.
 */
export function renderShopDropdown () {
	const list = getEl('shop-dropdown-list');
	if (!list) return;
	
	const stateKey = gameState.heroes.map(h => h.id + h.name).join(',');
	if (list.getAttribute('data-prev-state') === stateKey) return;
	
	list.innerHTML = gameState.heroes.map(hero => `
		<li><a data-open-shop-for-hero="${hero.id}">${hero.name}'s Shop</a></li>
	`).join('');
	
	list.setAttribute('data-prev-state', stateKey);
}

/**
 * NEW: Renders the shared combat panel for the party.
 */
export function renderPartyCombat () {
	const container = getEl('party-combat-area');
	if (!container) return;
	
	// Find the first monster being targeted by any hero.
	// This simplifies the UI to one monster at a time.
	const primaryTargetMonster = gameState.activeMonsters.find(m =>
		gameState.heroes.some(h => h.targetMonsterId === m.id)
	);
	
	const stateKey = primaryTargetMonster
		? `${primaryTargetMonster.id}-${primaryTargetMonster.currentHp}-${JSON.stringify(primaryTargetMonster.agro)}`
		: 'no-combat';
	
	if (container.getAttribute('data-prev-state') === stateKey) return;
	
	if (primaryTargetMonster) {
		const monster = primaryTargetMonster;
		const agroEntries = Object.entries(monster.agro)
			.map(([heroId, value]) => ({ heroId: parseInt(heroId, 10), value }))
			.sort((a, b) => b.value - a.value);
		
		let agroHtml = '<div class="text-xs text-gray-500 italic">No threat</div>';
		if (agroEntries.length > 0) {
			agroHtml = agroEntries.map((entry, index) => {
				const threatHero = gameState.heroes.find(h => h.id === entry.heroId);
				if (!threatHero) return '';
				const isTarget = index === 0;
				return `
					<div class="badge ${isTarget ? 'badge-error' : 'badge-neutral'} gap-1">
						${threatHero.name}
						<div class="badge badge-sm badge-circle ${isTarget ? 'badge-ghost' : 'badge-secondary'}">${Math.floor(entry.value)}</div>
					</div>
				`;
			}).join(' ');
		}
		
		container.innerHTML = `
			<div class="card bg-base-200 shadow-md p-4">
				<div class="flex justify-between items-center mb-2">
					<h3 class="font-bold text-lg text-error">Party is Fighting: Lv.${monster.level} ${monster.name} (#${monster.id})</h3>
				</div>
				<progress class="progress progress-error w-full" value="${monster.currentHp}" max="${monster.maxHp}"></progress>
				<p class="text-xs text-right mt-1">${Math.floor(monster.currentHp)}/${monster.maxHp} HP</p>
				<div class="mt-2 border-t border-base-100 pt-1">
					<h4 class="font-semibold text-xs mb-1 text-center">Threat List</h4>
					<div class="flex flex-wrap gap-1 justify-center">${agroHtml}</div>
				</div>
			</div>
		`;
	} else {
		container.innerHTML = '';
	}
	
	container.setAttribute('data-prev-state', stateKey);
}
