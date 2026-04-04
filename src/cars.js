import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * MODIFIED: Opens and populates the car purchase modal instead of using a prompt.
 * @param {string} carId - The ID of the car to be purchased.
 */
export function initiateCarPurchase(carId) {
	const carData = gameData.cars.find(c => c.id === carId);
	const modal = getEl('car-purchase-modal');
	const header = getEl('car-purchase-modal-header');
	const heroList = getEl('car-purchase-heroes-list');

	if (!carData || !modal || !header || !heroList) {
		addToLog('Error: Could not open car purchase dialog.');
		console.error('Missing car data or modal elements.');
		return;
	}

	// Populate the modal header with car name and price
	header.innerHTML = `
		<h3 class="font-bold text-lg">Buy ${carData.name}?</h3>
		<span class="badge badge-warning">${carData.price} Tokens</span>
	`;

	// NEW: Check which heroes already own a car.
	const heroesWithCars = gameState.city.cars.filter(c => c.ownerId !== null).map(c => c.ownerId);

	// Generate a button for each hero, indicating if they can afford the car or already own one.
	heroList.innerHTML = gameState.heroes.map(hero => {
		const canAfford = hero.tokens >= carData.price;
		const ownsCar = heroesWithCars.includes(hero.id);
		const isDisabled = !canAfford || ownsCar;
		let disabledText = '';
		if (ownsCar) {
			disabledText = ' (Owns a Car)';
		} else if (!canAfford) {
			disabledText = ' (Insuff. Tokens)';
		}

		return `
			<button class="btn ${canAfford && !ownsCar ? 'btn-primary' : ''}" 
					data-confirm-buy-car="true" 
					data-hero-id="${hero.id}" 
					data-car-id="${carId}" 
					${isDisabled ? 'disabled' : ''}>
				${hero.name} <span class="badge badge-ghost">${hero.tokens} T</span>${disabledText}
			</button>
		`;
	}).join('');

	modal.showModal();
}


/**
 * Renders the grid of all cars, showing owned and unowned states.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderCars(contentArea) {
	let container = getEl('cars-container');
	if (!container) {
		contentArea.innerHTML = `
            <div id="cars-container" class="flex flex-col gap-4">
                <div id="cars-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"></div>
            </div>
        `;
		container = getEl('cars-container');
	}

	// Generate a state key to check if an update is needed
	const stateKey = JSON.stringify(gameState.city.cars) + JSON.stringify(gameState.heroes.map(h => [h.id, h.carId, h.tokens]));
	const grid = getEl('cars-grid');
	if (grid.getAttribute('data-prev-state') === stateKey) return;

	// Render all cars
	grid.innerHTML = gameState.city.cars.map(car => {
		const carData = gameData.cars.find(c => c.id === car.id);
		if (!carData) return ''; // Skip if car data isn't loaded yet

		// Card for player-owned car
		if (car.ownerId) {
			const owner = gameState.heroes.find(h => h.id === car.ownerId);
			const ownerName = owner ? owner.name : 'Unknown';

			const upgradesHtml = car.upgrades
				.map(upgId => gameData.car_upgrades.find(u => u.id === upgId))
				.filter(Boolean)
				.map(upg => `<div class="tooltip" data-tip="${upg.description}"><span class="badge badge-secondary">${upg.name}</span></div>`)
				.join(' ');

			return `
                <div class="card bg-base-200 shadow-sm p-3 text-xs border border-primary">
                    <div class="font-bold text-sm mb-1 text-primary">${car.name} (#${car.id})</div>
                    
                    <div class="mt-2">
                        <p class="font-semibold">Owner:</p>
                        <p class="text-gray-400 truncate min-h-4">${ownerName}</p>
                    </div>
                    
                    <div class="mt-2">
                        <p class="font-semibold">Upgrades:</p>
                        <div class="flex flex-wrap gap-1 mt-1 min-h-4">${upgradesHtml || '<span class="text-gray-500 italic">None</span>'}</div>
                    </div>
                </div>
            `;
			// Card for unowned car
		} else {
			const upgradesHtml = carData.upgrades
				.map(upgId => gameData.car_upgrades.find(u => u.id === upgId))
				.filter(Boolean)
				.map(upg => `<div class="tooltip" data-tip="${upg.description}"><span class="badge badge-secondary">${upg.name}</span></div>`)
				.join(' ');

			return `
				<div class="card bg-base-300 shadow-sm p-3 text-xs border border-base-300 flex flex-col">
                    <div class="flex justify-between items-center">
						<div class="font-bold text-sm mb-1">${carData.name}</div>
						<span class="badge badge-warning">${carData.price} T</span>
					</div>
					<p class="text-gray-400 italic text-[10px] flex-grow min-h-8">${carData.description}</p>
                    
                    <div class="mt-2">
                        <p class="font-semibold">Pre-installed Upgrades:</p>
                        <div class="flex flex-wrap gap-1 mt-1 min-h-4">${upgradesHtml || '<span class="text-gray-500 italic">None</span>'}</div>
                    </div>

                    <div class="w-full mt-2">
						<button class="btn btn-sm btn-accent w-full" data-buy-car-id="${car.id}">Buy Car</button>
                    </div>
                </div>
			`;
		}
	}).join('');

	grid.setAttribute('data-prev-state', stateKey);
}