import { gameState, gameData } from './state.js';
import { updateTextIfChanged, updateProgressIfChanged, updateHtmlIfChanged } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

// DOM element references
const headerContainer = getEl('game-header');
const tabsContainer = getEl('tabs-container');

/**
 * Formats a game time tick into a Day/Tick string for display in logs.
 * @param {number} time - The game time in ticks.
 * @returns {string} The formatted time string, e.g., "[Day 1, Tick 1]".
 */
function formatLogTime (time) {
	const day = Math.floor(time / 10) + 1;
	const tick = (time % 10) + 1;
	return `[Day ${day}, Tick ${tick}]`;
}

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
	
	updateTextIfChanged(headerContainer.querySelector('[data-stat="population"]'), totalPop);
	
	const speed = gameState.gameSettings.speedMultiplier;
	const speedControls = headerContainer.querySelector('#speed-controls');
	if (speedControls) {
		const stateKey = String(speed);
		if (speedControls.getAttribute('data-prev-state') !== stateKey) {
			speedControls.querySelectorAll('button').forEach(btn => {
				if (parseFloat(btn.dataset.speed) === speed) {
					btn.classList.add('btn-primary');
				} else {
					btn.classList.remove('btn-primary');
				}
			});
			speedControls.setAttribute('data-prev-state', stateKey);
		}
	}
	
	renderShopDropdown();
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
	
	// Use the time of the latest log entry as the state key.
	const stateStr = gameState.log.length > 0 ? String(gameState.log[0].time) : '';
	if (container.getAttribute('data-prev-state') === stateStr) return;
	
	container.innerHTML = gameState.log.map(entry => {
		const timeStr = formatLogTime(entry.time);
		let prefix = '';
		let message = entry.message;
		
		if (entry.heroId) {
			const hero = gameState.heroes.find(h => h.id === entry.heroId);
			prefix = hero ? `<strong class="text-primary">${hero.name}:</strong> ` : '';
		} else if (message.startsWith('[SYSTEM]')) {
			// Special formatting for system-wide messages.
			prefix = '<strong class="text-accent">SYSTEM:</strong> ';
			message = message.replace('[SYSTEM]: ', '');
		}
		
		return `<p>${timeStr} ${prefix}${message}</p>`;
	}).join('');
	
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
 * Renders the dropdown menu for accessing each hero's shop.
 */
export function renderShopDropdown () {
	const list = getEl('header-shop-dropdown-list');
	if (!list) return;
	
	const stateKey = gameState.heroes.map(h => h.id + h.name).join(',');
	if (list.getAttribute('data-prev-state') === stateKey) return;
	
	list.innerHTML = gameState.heroes.map(hero => `
		<li><a data-open-shop-for-hero="${hero.id}">${hero.name}'s Shop</a></li>
	`).join('');
	
	list.setAttribute('data-prev-state', stateKey);
}

/**
 * Renders the shared combat panel for the party using granular updates.
 * This prevents the entire panel from re-rendering, allowing CSS transitions to work.
 */
export function renderPartyCombat () {
	const container = getEl('party-combat-area');
	if (!container) return;
	
	// Find the first monster being targeted by any hero.
	const primaryTargetMonster = gameState.activeMonsters.find(m =>
		gameState.heroes.some(h => h.targetMonsterId === m.id)
	);
	
	// If no monster is being fought, ensure the container is empty and then exit.
	if (!primaryTargetMonster) {
		if (container.getAttribute('data-prev-state') !== 'no-combat') {
			container.innerHTML = '';
			container.setAttribute('data-prev-state', 'no-combat');
		}
		return;
	}
	
	// If a monster is being fought, ensure the panel's static HTML structure exists.
	let panel = container.querySelector('[data-combat-panel]');
	if (!panel) {
		container.innerHTML = `
			<div class="card bg-base-200 shadow-md p-4" data-combat-panel>
				<div class="flex justify-between items-center mb-2">
					<h3 class="font-bold text-lg text-error" data-monster-name></h3>
				</div>
				<progress class="progress progress-error w-full" value="0" max="100" data-monster-hp-bar></progress>
				<p class="text-xs text-right mt-1" data-monster-hp-label></p>
				<div class="mt-2 border-t border-base-100 pt-1">
					<h4 class="font-semibold text-xs mb-1 text-center">Threat List</h4>
					<div class="flex flex-wrap gap-1 justify-center" data-monster-agro-list></div>
				</div>
			</div>
		`;
		panel = container.querySelector('[data-combat-panel]');
		container.setAttribute('data-prev-state', 'in-combat');
	}
	
	const monster = primaryTargetMonster;
	
	// Granularly update the panel's content.
	updateTextIfChanged(panel.querySelector('[data-monster-name]'), `Fighting: Lv.${monster.level} ${monster.name}`);
	updateProgressIfChanged(panel.querySelector('[data-monster-hp-bar]'), monster.currentHp, monster.maxHp);
	updateTextIfChanged(panel.querySelector('[data-monster-hp-label]'), `${Math.floor(monster.currentHp)}/${monster.maxHp} HP`);
	
	// Build and update the threat (agro) list.
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
	
	const agroStateKey = JSON.stringify(monster.agro);
	updateHtmlIfChanged(panel.querySelector('[data-monster-agro-list]'), agroHtml, agroStateKey);
}


/**
 * Renders the consolidated party log from the new universal log structure.
 */
export function renderPartyLog () {
	const container = getEl('party-log-area');
	if (!container) return;
	
	// Check if the static structure is present, if not, create it.
	if (!getEl('party-log-list')) {
		container.innerHTML = `
			<div class="card bg-base-200 shadow-md p-4 flex flex-col gap-2 h-full">
				<div class="flex justify-between items-center gap-4">
					<h3 class="font-bold text-lg">Party Log</h3>
					<div class="form-control">
						<label class="label cursor-pointer py-0 px-1 gap-2">
							<span class="label-text text-xs">Extra Logs</span>
							<input type="checkbox" class="toggle toggle-xs" data-toggle-extra-log />
						</label>
					</div>
				</div>
				<div class="flex flex-col gap-1 bg-base-100 rounded p-2 flex-grow overflow-y-auto text-xs font-mono" id="party-log-list">
					<!-- Log entries will be rendered here -->
				</div>
			</div>
		`;
	}
	
	const logListEl = getEl('party-log-list');
	const extraLogToggle = container.querySelector('[data-toggle-extra-log]');
	const showExtraLogs = extraLogToggle ? extraLogToggle.checked : false;
	
	// Generate a state key to prevent unnecessary re-renders.
	const stateKey = (gameState.log[0]?.time || 0) + '-' + showExtraLogs;
	if (logListEl.getAttribute('data-prev-state') === stateKey) return;
	
	// 1. Filter logs to only include hero-specific ones, and apply extra log toggle.
	const filteredLogs = gameState.log.filter(entry => {
		if (showExtraLogs) return true;
		
		// Filter out detailed extra damage logs if the toggle is off.
		const isBattleDamageLog = /attacked.*, dealing|deals \d+ damage/.test(entry.message);
		const isEnterExitLog = /entered|exited|got back in their car/.test(entry.message);
		return !isBattleDamageLog && !isEnterExitLog;
	});
	
	let lastDay = 0;
	// 2. Generate HTML from the filtered logs.
	const logHtml = filteredLogs.map(entry => {
		let timeStr = '';
		if (lastDay !== Math.floor(entry.time / 10)) {
			lastDay = Math.floor(entry.time / 10);
			timeStr = `<p>Day ${lastDay + 1}</p>`; // +1 to convert from 0-indexed to 1-indexed days
		}
		const hero = gameState.heroes.find(h => h.id === entry.heroId);
		const heroName = hero ? hero.name + ':' : '';
		return `${timeStr}<p><strong class="text-primary">${heroName}</strong> ${entry.message}</p>`;
	}).join('');
	
	logListEl.innerHTML = logHtml || '<p class="text-gray-500 italic">No hero logs to display.</p>';
	logListEl.setAttribute('data-prev-state', stateKey);
}
