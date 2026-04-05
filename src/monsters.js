import { gameState } from './state.js';
// MODIFIED: Import helper functions for granular updates.
import { updateTextIfChanged, updateHtmlIfChanged, updateProgressIfChanged } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * MODIFIED: Renders the list of active monsters using a granular update strategy.
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
	
	const activeMonsterIds = new Set(gameState.activeMonsters.map(m => m.id));
	
	// If no monsters, clear the grid and set a message.
	if (gameState.activeMonsters.length === 0) {
		if (grid.getAttribute('data-prev-state') !== 'empty') {
			grid.innerHTML = '<p class="text-gray-500 italic col-span-full">No active monsters.</p>';
			grid.setAttribute('data-prev-state', 'empty');
		}
		return;
	}
	
	// Set a non-empty state to clear the "No active monsters" message if it exists.
	if (grid.getAttribute('data-prev-state') === 'empty') {
		grid.innerHTML = '';
		grid.setAttribute('data-prev-state', 'active');
	}
	
	// Update or create cards for each active monster.
	gameState.activeMonsters.forEach(monster => {
		let card = getEl(`monster-card-${monster.id}`);
		
		// If card doesn't exist, create it from a template string.
		if (!card) {
			const cardHtml = `
                <div class="card bg-base-200 shadow-md p-4" id="monster-card-${monster.id}">
                    <div class="flex justify-between items-center">
                        <h3 class="font-bold text-lg" data-name></h3>
                        <div class="badge badge-error" data-target></div>
                    </div>
                    <div class="mt-2">
                        <progress class="progress progress-error w-full" value="0" max="100" data-hp-bar></progress>
                        <p class="text-xs text-right mt-1" data-hp-label></p>
                    </div>
                    <div class="mt-2 border-t border-base-300 pt-2">
                        <h4 class="font-semibold text-sm mb-1">Threat List</h4>
                        <div data-agro-list></div>
                    </div>
                    <div class="text-xs text-gray-400 mt-2" data-age></div>
                </div>
            `;
			grid.insertAdjacentHTML('beforeend', cardHtml);
			card = getEl(`monster-card-${monster.id}`);
		}
		
		// Update card content using helper functions.
		updateTextIfChanged(card.querySelector('[data-name]'), `Lv.${monster.level} ${monster.name} (#${monster.id})`);
		
		let targetText = 'Roaming';
		if (monster.assignedTo.length > 0) {
			const heroNames = monster.assignedTo.map(heroId => gameState.heroes.find(h => h.id === heroId)?.name || 'Unknown').join(', ');
			targetText = `Fighting ${heroNames}`;
		} else if (monster.targetBuilding) {
			targetText = `Attacking Bldg #${monster.targetBuilding}`;
		}
		updateTextIfChanged(card.querySelector('[data-target]'), targetText);
		
		updateProgressIfChanged(card.querySelector('[data-hp-bar]'), monster.currentHp, monster.maxHp);
		updateTextIfChanged(card.querySelector('[data-hp-label]'), `${Math.floor(monster.currentHp)} / ${monster.maxHp} HP`);
		
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
		updateHtmlIfChanged(card.querySelector('[data-agro-list]'), agroHtml, JSON.stringify(monster.agro));
		
		const ageInDays = Math.floor((gameState.time - monster.spawnTime) / 10);
		updateTextIfChanged(card.querySelector('[data-age]'), `Age: ${ageInDays} day(s)`);
	});
	
	// NEW: Remove cards for defeated/despawned monsters.
	grid.querySelectorAll('.card').forEach(card => {
		const cardId = parseInt(card.id.replace('monster-card-', ''), 10);
		if (!activeMonsterIds.has(cardId)) {
			card.remove();
		}
	});
}
