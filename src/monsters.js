import { gameState } from './state.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Renders the list of active monsters into the main content area.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderMonsters (contentArea) {
	let container = getEl('monsters-list-container');
	if (!container) {
		contentArea.innerHTML = `
            <div id="monsters-list-container" class="flex flex-col gap-4">
                <h2 class="text-2xl font-bold">Active Monsters</h2>
                <div id="monsters-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
            </div>
        `;
		container = getEl('monsters-list-container');
	}
	
	const grid = getEl('monsters-grid');
	if (!grid) return;
	
	if (gameState.activeMonsters.length === 0) {
		// Modified to use data attribute to avoid flickering
		if (grid.getAttribute('data-prev-state') !== 'empty') {
			grid.innerHTML = '<p class="text-gray-500 italic col-span-full">No active monsters.</p>';
			grid.setAttribute('data-prev-state', 'empty');
		}
		return;
	}
	
	// Generate a state string to check if an update is actually needed
	const stateStr = JSON.stringify(gameState.activeMonsters.map(m => [m.id, m.currentHp, m.targetBuilding, m.assignedTo, m.agro]));
	if (grid.getAttribute('data-prev-state') === stateStr) return;
	
	// Generate a card for each active monster individually
	grid.innerHTML = gameState.activeMonsters.map(monster => {
		let targetText = 'Roaming';
		// Determine the monster's current target for display
		if (monster.assignedTo.length > 0) { // Check assignedTo array
			const heroNames = monster.assignedTo.map(heroId => {
				const hero = gameState.heroes.find(h => h.id === heroId);
				return hero ? hero.name : 'Unknown';
			}).join(', ');
			targetText = `Fighting ${heroNames}`;
		} else if (monster.targetBuilding) {
			targetText = `Attacking Bldg #${monster.targetBuilding}`;
		}
		
		// NEW: Generate the agro list display
		const agroEntries = Object.entries(monster.agro)
			.map(([heroId, value]) => ({ heroId: parseInt(heroId, 10), value }))
			.sort((a, b) => b.value - a.value);
		
		let agroHtml = '<div class="text-xs text-gray-500 italic">No threat</div>';
		if (agroEntries.length > 0) {
			agroHtml = agroEntries.slice(0, 3).map((entry, index) => {
				const hero = gameState.heroes.find(h => h.id === entry.heroId);
				if (!hero) return '';
				const isTarget = index === 0;
				return `<div class="text-xs ${isTarget ? 'text-error font-bold' : ''}">${hero.name}: ${Math.floor(entry.value)}</div>`;
			}).join('');
		}
		
		// Calculate monster's age in days from its spawn time.
		const ageInDays = Math.floor((gameState.time - monster.spawnTime) / 10);
		
		return `
            <div class="card bg-base-200 shadow-md p-4">
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg">Lv.${monster.level} ${monster.name} (#${monster.id})</h3>
                    <div class="badge badge-error">${targetText}</div>
                </div>
                <div class="mt-2">
                    <progress class="progress progress-error w-full" value="${monster.currentHp}" max="${monster.maxHp}"></progress>
                    <p class="text-xs text-right mt-1">${Math.floor(monster.currentHp)} / ${monster.maxHp} HP</p>
                </div>
                <!-- NEW: Agro list display -->
                <div class="mt-2 border-t border-base-300 pt-2">
                    <h4 class="font-semibold text-sm mb-1">Threat List</h4>
                    ${agroHtml}
                </div>
                <div class="text-xs text-gray-400 mt-2">Age: ${ageInDays} day(s)</div>
            </div>
        `;
	}).join('');
	
	// Save the current state to prevent unnecessary updates
	grid.setAttribute('data-prev-state', stateStr);
}
