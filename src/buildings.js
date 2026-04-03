import { gameState, gameData } from './state.js';
import { addToLog, updateTextIfChanged } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Calculates the price for the next building purchase.
 * Price starts at 300 and increases by 30% for each subsequent building.
 * @returns {number} The calculated price.
 */
export function calculateNextBuildingPrice() {
	const ownedCount = gameState.city.buildings.filter(b => b.owner === 'player').length;
	let price = 300;
	for (let i = 0; i < ownedCount; i++) {
		price *= 1.3;
	}
	return Math.ceil(price);
}

/**
 * Handles a hero entering a player-owned building.
 * @param {number} heroId - The ID of the hero.
 * @param {number} buildingId - The ID of the building.
 */
export function handleEnterBuilding(heroId, buildingId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const building = gameState.city.buildings.find(b => b.id === buildingId);
	
	if (!hero || !building || building.owner !== 'player') return;
	
	// Remove from car if they are in one
	if (hero.carId) {
		const car = gameState.city.cars.find(c => c.id === hero.carId);
		if (car) car.driverId = null;
		hero.carId = null;
	}
	
	// Escape from combat
	if (hero.targetMonsterId) {
		const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
		if (monster) {
			// Remove hero from monster's assignment and agro list
			monster.assignedTo = monster.assignedTo.filter(id => id !== hero.id);
			delete monster.agro[hero.id];
			addToLog(`${hero.name} escaped from ${monster.name} (#${monster.id}) into ${building.name}.`, hero.id);
		}
		hero.targetMonsterId = null;
	}
	
	hero.location = building.id;
	if (!building.heroesInside.includes(heroId)) {
		building.heroesInside.push(heroId);
	}
	addToLog(`${hero.name} entered ${building.name}.`, hero.id);
}

/**
 * Handles a hero exiting a building.
 * @param {number} heroId - The ID of the hero.
 */
export function handleExitBuilding(heroId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	if (!hero || hero.location === 'field') return;
	
	const building = gameState.city.buildings.find(b => b.id === hero.location);
	if (building) {
		building.heroesInside = building.heroesInside.filter(id => id !== heroId);
		addToLog(`${hero.name} exited ${building.name}.`, hero.id);
	}
	
	hero.location = 'field';
}

/**
 * Handles the purchase of a building by the player party.
 * @param {number} buildingId - The ID of the building to purchase.
 */
export function handleBuyBuilding(buildingId) {
	const building = gameState.city.buildings.find(b => b.id === buildingId);
	if (!building || building.owner === 'player') return;
	
	const price = calculateNextBuildingPrice();
	const totalTokens = gameState.heroes.reduce((sum, h) => sum + h.tokens, 0);
	
	if (totalTokens < price) {
		addToLog(`The party doesn't have enough tokens to buy Building #${buildingId}. (Need ${price})`);
		return;
	}
	
	const buildingName = prompt(`You are purchasing Building #${buildingId} for ${price} tokens.\nPlease enter a name for your new safezone:`, `Safezone ${gameState.city.buildings.filter(b => b.owner === 'player').length + 1}`);
	if (!buildingName) {
		addToLog('Building purchase cancelled.');
		return;
	}
	
	// Deduct tokens as evenly as possible
	let remainingCost = price;
	const payers = gameState.heroes.slice().sort((a, b) => b.tokens - a.tokens);
	const contributions = {};
	
	// First pass: each hero pays up to their fair share
	let tempCost = remainingCost;
	for (const hero of payers) {
		const heroCount = payers.filter(p => p.tokens > (contributions[p.id] || 0)).length;
		if (heroCount === 0) break;
		const share = Math.ceil(tempCost / heroCount);
		const payment = Math.min(hero.tokens, share);
		if (payment > 0) {
			contributions[hero.id] = (contributions[hero.id] || 0) + payment;
			remainingCost -= payment;
		}
	}
	// Second pass: if cost remains, take from the richest heroes
	if (remainingCost > 0) {
		for (const hero of payers) {
			const canPay = hero.tokens - (contributions[hero.id] || 0);
			const payment = Math.min(canPay, remainingCost);
			if (payment > 0) {
				contributions[hero.id] += payment;
				remainingCost -= payment;
			}
		}
	}
	
	// Apply deductions and log
	let contributionLog = [];
	for (const heroId in contributions) {
		const hero = gameState.heroes.find(h => h.id === parseInt(heroId));
		hero.tokens -= contributions[heroId];
		contributionLog.push(`${hero.name}: ${contributions[heroId]}`);
	}
	
	// MODIFIED: Update building state with new HP and Shield values
	building.owner = 'player';
	building.name = buildingName;
	building.state = 'functional';
	building.maxHp = 1000;
	building.hp = 1000;
	building.maxShieldHp = 1000;
	building.shieldHp = 1000;
	building.isSafezone = true;
	
	addToLog(`Party purchased ${building.name} for ${price} tokens! (${contributionLog.join(', ')})`);
}

/**
 * Renders the grid of city buildings.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderBuildings(contentArea) {
	let grid = getEl('buildings-grid');
	if (!grid) {
		contentArea.innerHTML = `<div id="buildings-grid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"></div>`;
		grid = getEl('buildings-grid');
	}
	
	// Generate a state key to check if an update is needed
	const stateKey = JSON.stringify(gameState.city.buildings) + JSON.stringify(gameState.heroes.map(h => [h.id, h.location, h.tokens]));
	if (grid.getAttribute('data-prev-state') === stateKey) return;
	
	const totalTokens = gameState.heroes.reduce((sum, h) => sum + h.tokens, 0);
	const nextPrice = calculateNextBuildingPrice();
	
	grid.innerHTML = gameState.city.buildings.map(b => {
		if (b.owner === 'player') {
			// Player-owned building card
			const heroesInside = b.heroesInside.map(id => gameState.heroes.find(h => h.id === id)?.name).join(', ') || 'None';
			const heroesOutside = gameState.heroes.filter(h => h.location === 'field');
			
			return `
                <div class="card bg-base-200 shadow-sm p-3 text-xs border border-primary">
                    <div class="font-bold text-sm mb-1 text-primary">${b.name} (#${b.id})</div>
                    <div data-state class="font-semibold text-success">State: ${b.state}</div>
                    <div data-hp>HP: ${b.hp}/${b.maxHp}</div>
                    <div data-shield class="text-info">Shield: ${b.shieldHp || 0}/${b.maxShieldHp || 0}</div>
                    <div class="mt-2">
                        <p class="font-semibold">Heroes Inside:</p>
                        <p class="text-gray-400 truncate">${heroesInside}</p>
                    </div>
                    <div class="btn-group btn-group-vertical w-full mt-2">
                        <button class="btn btn-sm btn-secondary" data-open-upgrade-modal="${b.id}">Upgrade</button>
                        ${heroesOutside.map(h => `<button class="btn btn-sm btn-ghost" data-enter-building-hero="${h.id}" data-enter-building-bldg="${b.id}">Enter: ${h.name}</button>`).join('')}
                        ${b.heroesInside.map(id => `<button class="btn btn-sm btn-ghost" data-exit-building-hero="${id}">Exit: ${gameState.heroes.find(h => h.id === id)?.name}</button>`).join('')}
                    </div>
                </div>
            `;
		} else {
			// Unowned building card
			const canAfford = totalTokens >= nextPrice;
			return `
                <div class="card bg-base-200 shadow-sm p-3 text-xs border border-base-300">
                    <div class="font-bold text-sm mb-1">Bldg #${b.id}</div>
                    <div data-state class="font-semibold ${b.state === 'functional' ? 'text-success' : b.state === 'damaged' ? 'text-warning' : 'text-error'}">State: ${b.state}</div>
                    <div data-hp>HP: ${b.hp}/${b.maxHp}</div>
                    <div data-pop class="text-success mt-1">Pop: ${b.population}/10</div>
                    <button class="btn btn-sm btn-accent w-full mt-2" data-buy-building-id="${b.id}" ${!canAfford ? 'disabled' : ''}>
                        Buy (${nextPrice} T)
                    </button>
                </div>
            `;
		}
	}).join('');
	
	grid.setAttribute('data-prev-state', stateKey);
}
