import { gameState } from './state.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Renders the list of active monsters into the main content area.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderMonsters(contentArea) {
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
		grid.innerHTML = '<p class="text-gray-500 italic col-span-full">No active monsters.</p>';
		return;
	}
	
	// Generate a card for each active monster individually
	grid.innerHTML = gameState.activeMonsters.map(monster => {
		let targetText = 'Roaming';
		// Determine the monster's current target for display
		if (monster.assigned) {
			const hero = gameState.heroes.find(h => h.targetMonster && h.targetMonster.id === monster.id);
			targetText = hero ? `Fighting ${hero.name}` : 'Engaged';
		} else if (monster.targetBuilding) {
			targetText = `Attacking Bldg #${monster.targetBuilding}`;
		}
		
		return `
            <div class="card bg-base-200 shadow-md p-4">
                <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg">Lv.${monster.level} ${monster.name}</h3>
                    <div class="badge badge-error">${targetText}</div>
                </div>
                <div class="mt-2">
                    <progress class="progress progress-error w-full" value="${monster.currentHp}" max="${monster.maxHp}"></progress>
                    <p class="text-xs text-right mt-1">${Math.floor(monster.currentHp)} / ${monster.maxHp} HP</p>
                </div>
            </div>
        `;
	}).join('');
}
