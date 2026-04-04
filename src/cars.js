import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Calculates the price for the next car purchase.
 * Price starts at 1000 and increases by 50% for each subsequent car.
 * @returns {number} The calculated price.
 */
export function calculateNextCarPrice() {
	const ownedCount = gameState.city.cars.filter(c => c.owner === 'player').length;
	let price = 1000;
	for (let i = 0; i < ownedCount; i++) {
		price *= 1.5;
	}
	return Math.ceil(price);
}

/**
 * Handles a hero entering a player-owned car.
 * @param {number} heroId - The ID of the hero.
 * @param {number} carId - The ID of the car.
 */
export function handleEnterCar(heroId, carId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const car = gameState.city.cars.find(c => c.id === carId);
	
	if (!hero || !car || car.owner !== 'player' || hero.location !== 'field') return;
	
	if (car.occupants.length >= car.maxOccupants) {
		addToLog(`${car.name || `Car #${car.id}`} is full.`, hero.id);
		return;
	}
	
	// A hero can only be in one car at a time.
	if (hero.carId) {
		handleExitCar(hero.id);
	}
	
	hero.carId = car.id;
	if (!car.occupants.includes(heroId)) {
		car.occupants.push(heroId);
	}
	addToLog(`${hero.name} entered ${car.name || `Car #${car.id}`}.`, hero.id);
}

/**
 * Handles a hero exiting a car.
 * @param {number} heroId - The ID of the hero.
 */
export function handleExitCar(heroId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	if (!hero || !hero.carId) return;
	
	const car = gameState.city.cars.find(c => c.id === hero.carId);
	if (car) {
		car.occupants = car.occupants.filter(id => id !== heroId);
		addToLog(`${hero.name} exited ${car.name || `Car #${car.id}`}.`, hero.id);
	}
	
	hero.carId = null;
}

/**
 * Handles the purchase of a car by the player party.
 */
export function handleBuyCar() {
	const carToBuy = gameState.city.cars.find(c => c.owner === null);
	if (!carToBuy) {
		addToLog('There are no more cars available to purchase.');
		return;
	}
	
	const price = calculateNextCarPrice();
	const totalTokens = gameState.heroes.reduce((sum, h) => sum + h.tokens, 0);
	
	if (totalTokens < price) {
		addToLog(`The party doesn't have enough tokens to buy a new car. (Need ${price})`);
		return;
	}
	
	const ownedCount = gameState.city.cars.filter(b => b.owner === 'player').length;
	const carName = prompt(`You are purchasing Car #${carToBuy.id} for ${price} tokens.\nPlease enter a name for your new vehicle:`, `Vehicle ${ownedCount + 1}`);
	if (!carName) {
		addToLog('Car purchase cancelled.');
		return;
	}
	
	// Deduct tokens as evenly as possible from the party.
	let remainingCost = price;
	const payers = gameState.heroes.slice().sort((a, b) => b.tokens - a.tokens);
	for (const hero of payers) {
		const payment = Math.min(hero.tokens, remainingCost);
		hero.tokens -= payment;
		remainingCost -= payment;
		if (remainingCost <= 0) break;
	}
	
	// Update car state
	carToBuy.owner = 'player';
	carToBuy.name = carName;
	
	addToLog(`Party purchased ${carToBuy.name} for ${price} tokens!`);
}

/**
 * Renders the grid of player-owned cars and purchase options.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderCars(contentArea) {
	let container = getEl('cars-container');
	if (!container) {
		contentArea.innerHTML = `
            <div id="cars-container" class="flex flex-col gap-4">
                <div id="cars-actions" class="card bg-base-200 shadow-md p-4 flex flex-row justify-center items-center"></div>
                <div id="cars-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
            </div>
        `;
		container = getEl('cars-container');
	}
	
	// Generate a state key to check if an update is needed
	const stateKey = JSON.stringify(gameState.city.cars) + JSON.stringify(gameState.heroes.map(h => [h.id, h.carId, h.tokens]));
	const grid = getEl('cars-grid');
	if (grid.getAttribute('data-prev-state') === stateKey) return;
	
	// Render purchase button
	const actionsContainer = getEl('cars-actions');
	const totalTokens = gameState.heroes.reduce((sum, h) => sum + h.tokens, 0);
	const nextPrice = calculateNextCarPrice();
	const canAfford = totalTokens >= nextPrice;
	const unownedCar = gameState.city.cars.some(c => c.owner === null);
	
	actionsContainer.innerHTML = `
        <button class="btn btn-accent" data-buy-car ${!canAfford || !unownedCar ? 'disabled' : ''}>
            ${unownedCar ? `Buy New Car (${nextPrice} T)` : 'All Cars Purchased'}
        </button>
    `;
	
	// Render owned cars
	const ownedCars = gameState.city.cars.filter(c => c.owner === 'player');
	if (ownedCars.length === 0) {
		grid.innerHTML = '<p class="text-gray-500 italic col-span-full text-center">No cars owned. Purchase one above.</p>';
	} else {
		grid.innerHTML = ownedCars.map(car => {
			const occupants = car.occupants.map(id => gameState.heroes.find(h => h.id === id)?.name).join(', ') || 'None';
			const heroesOutside = gameState.heroes.filter(h => h.location === 'field' && !h.carId);
			const canEnter = car.occupants.length < car.maxOccupants;
			
			const upgradesHtml = car.upgrades
				.map(upgId => gameData.car_upgrades.find(u => u.id === upgId))
				.filter(Boolean)
				.map(upg => `<div class="tooltip" data-tip="${upg.description}"><span class="badge badge-secondary">${upg.name}</span></div>`)
				.join(' ');
			
			return `
                <div class="card bg-base-200 shadow-sm p-3 text-xs border border-primary">
                    <div class="font-bold text-sm mb-1 text-primary">${car.name} (#${car.id})</div>
                    <div class="text-xs">Capacity: ${car.occupants.length}/${car.maxOccupants}</div>
                    
                    <div class="mt-2">
                        <p class="font-semibold">Occupants:</p>
                        <p class="text-gray-400 truncate min-h-4">${occupants}</p>
                    </div>
                    
                    <div class="mt-2">
                        <p class="font-semibold">Upgrades:</p>
                        <div class="flex flex-wrap gap-1 mt-1 min-h-4">${upgradesHtml || '<span class="text-gray-500 italic">None</span>'}</div>
                    </div>

                    <div class="btn-group btn-group-vertical w-full mt-2">
                        ${canEnter ? heroesOutside.map(h => `<button class="btn btn-sm btn-ghost" data-enter-car-hero="${h.id}" data-enter-car="${car.id}">Enter: ${h.name}</button>`).join('') : '<button class="btn btn-sm btn-disabled">Car Full</button>'}
                        ${car.occupants.map(id => `<button class="btn btn-sm btn-ghost" data-exit-car-hero="${id}">Exit: ${gameState.heroes.find(h => h.id === id)?.name}</button>`).join('')}
                    </div>
                </div>
            `;
		}).join('');
	}
	
	grid.setAttribute('data-prev-state', stateKey);
}
