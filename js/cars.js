import { gameState, gameData } from './state.js';
import { addToLog, tokenAmountHtml } from './utils.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Opens and populates the car purchase modal instead of using a prompt.
 * @param {string} carId - The ID of the car to be purchased.
 */
export function initiateCarPurchase(carId) {
	const carData = gameData.cars.find(c => c.id === carId);
	const car = gameState.city.cars.find(c => c.id === carId);
	const modal = getEl('car-purchase-modal');
	const header = getEl('car-purchase-modal-header');
	const heroList = getEl('car-purchase-heroes-list');
	
	if (!carData || !car || !modal || !header || !heroList) {
		addToLog('Error: Could not open car purchase dialog.');
		console.error('Missing car data or modal elements.');
		return;
	}
	
	// Populate the modal header with car name and price
	header.innerHTML = `
		<h3 class="font-bold text-lg">Buy ${carData.name}?</h3>
		<span class="badge badge-warning">${tokenAmountHtml(carData.price)}</span>
	`;
	
	// Generate a button for each hero, indicating if they can afford the car.
	heroList.innerHTML = gameState.heroes.map(hero => {
		const canAfford = hero.tokens >= carData.price;
		const alreadyOwnsThisCar = hero.carId === carId;
		const isDisabled = !canAfford || alreadyOwnsThisCar || !!car.ownerId;
		let disabledText = '';
		if (alreadyOwnsThisCar) {
			disabledText = ' (Current Car)';
		} else if (car.ownerId) {
			disabledText = ' (Already Sold)';
		} else if (!canAfford) {
			disabledText = ' (Insuff. Tokens)';
		} else if (hero.carId) {
			disabledText = ' (Replaces Current Car)';
		}
		
		return `
			<button class="btn ${canAfford && !alreadyOwnsThisCar && !car.ownerId ? 'btn-primary' : ''}"
					data-confirm-buy-car="true"
					data-hero-id="${hero.id}"
					data-car-id="${carId}"
					${isDisabled ? 'disabled' : ''}>
				${hero.name} <span class="badge badge-ghost">${tokenAmountHtml(hero.tokens)}</span>${disabledText}
			</button>
		`;
	}).join('');
	
	modal.showModal();
}

export function handleBuyCar(heroId, carId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const newCar = gameState.city.cars.find(c => c.id === carId);
	const newCarData = gameData.cars.find(c => c.id === carId);
	
	if (!hero || !newCar || !newCarData) {
		addToLog('Car purchase failed: hero or car not found.');
		return false;
	}
	
	if (newCar.ownerId && newCar.ownerId !== heroId) {
		addToLog(`${newCar.name} has already been purchased by another hero.`, hero.id);
		return false;
	}
	
	if (hero.carId === carId) {
		addToLog(`${newCar.name} is already this hero's current car.`, hero.id);
		return false;
	}
	
	if (hero.tokens < newCarData.price) {
		addToLog(`does not have enough tokens to buy ${newCarData.name}.`, hero.id);
		return false;
	}
	
	const oldCar = hero.carId ? gameState.city.cars.find(c => c.id === hero.carId) : null;
	const carriedUpgrades = oldCar ? [...oldCar.upgrades] : [];
	
	hero.tokens -= newCarData.price;
	
	if (oldCar) {
		const oldCarData = gameData.cars.find(c => c.id === oldCar.id);
		oldCar.ownerId = null;
		oldCar.upgrades = [...(oldCarData?.upgrades || [])];
	}
	
	newCar.ownerId = hero.id;
	newCar.upgrades = [...new Set([...(newCar.upgrades || []), ...carriedUpgrades])];
	hero.carId = newCar.id;
	
	addToLog(`bought ${newCar.name} for ${newCarData.price} tokens${oldCar ? ` and moved upgrades from ${oldCar.name}.` : '.'}`, hero.id);
	return true;
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
                <div id="cars-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
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
		
		let imageUrl = '';
		if (carData.card_images && Array.isArray(carData.card_images)) {
			const normalImage = carData.card_images.find(img => img.state === 'normal');
			if (normalImage) {
				let folderPath = normalImage.image_folder;
				imageUrl = `${folderPath}/thumbnails/${normalImage.image_file_name}`;
			}
		}
		
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
                <div class="card bg-base-200 shadow-md p-4 flex flex-row gap-4 items-start border border-primary">
					<img src="${imageUrl}" alt="${car.name}" class="w-[175px] aspect-[3/4] bg-base-300 rounded flex-shrink-0 object-contain" />
					<div class="flex flex-col flex-grow min-w-0">
						<h3 class="font-bold text-lg truncate text-primary" title="${car.name}">${car.name} (#${car.id})</h3>
						<div class="text-sm w-full mt-2">
							<strong>Owner:</strong> ${ownerName}<br>
							<div class="mt-2">
								<strong>Upgrades:</strong>
								<div class="flex flex-wrap gap-1 mt-1">${upgradesHtml || '<span class="text-gray-500 italic">None</span>'}</div>
							</div>
						</div>
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
				<div class="card bg-base-300 shadow-md p-4 flex flex-row gap-4 items-start border border-base-300">
					<img src="${imageUrl}" alt="${carData.name}" class="w-[175px] aspect-[3/4] bg-base-300 rounded flex-shrink-0 object-contain" />
					<div class="flex flex-col flex-grow min-w-0 h-full">
						<div class="flex justify-between items-center">
							<h3 class="font-bold text-lg truncate" title="${carData.name}">${carData.name}</h3>
							<span class="badge badge-warning flex-shrink-0">${tokenAmountHtml(carData.price)}</span>
						</div>
						<p class="text-xs italic text-gray-400 mt-2 flex-grow">${carData.description}</p>
						
						<div class="text-sm w-full mt-2">
							<strong>Pre-installed Upgrades:</strong>
							<div class="flex flex-wrap gap-1 mt-1">${upgradesHtml || '<span class="text-gray-500 italic">None</span>'}</div>
						</div>

						<div class="w-full mt-3">
							<button class="btn btn-sm btn-accent w-full" data-buy-car-id="${car.id}">Buy Car</button>
						</div>
					</div>
                </div>
			`;
		}
	}).join('');
	
	grid.setAttribute('data-prev-state', stateKey);
}
