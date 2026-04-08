import { gameState, gameData } from './state.js';
import { addToLog, updateTextIfChanged, updateHtmlIfChanged } from './utils.js';

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
	
	if (hero.carId) {
		hero.carId = null;
	}
	
	// Escape from combat
	if (hero.targetMonsterId) {
		const monster = gameState.activeMonsters.find(m => m.id === hero.targetMonsterId);
		if (monster) {
			// Remove hero from monster's assignment and agro list
			monster.assignedTo = monster.assignedTo.filter(id => id !== hero.id);
			delete monster.agro[hero.id];
			addToLog(`escaped from ${monster.name} into ${building.name}.`, hero.id);
		}
		hero.targetMonsterId = null;
	}
	
	hero.location = building.id;
	if (!building.heroesInside.includes(heroId)) {
		building.heroesInside.push(heroId);
	}
	addToLog(`entered ${building.name}.`, hero.id);
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
		addToLog(`exited ${building.name}.`, hero.id);
	}
	
	hero.location = 'field';
	
	// Automatically re-enter the hero's owned car upon exiting a building.
	const ownedCar = gameState.city.cars.find(c => c.ownerId === hero.id);
	if (ownedCar) {
		hero.carId = ownedCar.id;
		addToLog(`got back in their car, ${ownedCar.name}.`, hero.id);
	}
}

/**
 * Handles the purchase of a building by the player party.
 * @param {number} buildingId - The ID of the building to purchase.
 */
export function handleBuyBuilding(buildingId) {
	const building = gameState.city.buildings.find(b => b.id === buildingId);
	if (!building || building.owner === 'player') return;
	
	const price = calculateNextBuildingPrice();
	if (gameState.city.tokens < price) {
		addToLog(`The city doesn't have enough tokens to buy Building #${buildingId}. (Need ${price})`);
		return;
	}
	
	const buildingName = prompt(`You are purchasing Building #${buildingId} for ${price} tokens.\nPlease enter a name for your new safezone:`, `Safezone ${gameState.city.buildings.filter(b => b.owner === 'player').length + 1}`);
	if (!buildingName) {
		addToLog('Building purchase cancelled.');
		return;
	}
	
	gameState.city.tokens -= price;
	
	building.owner = 'player';
	building.name = buildingName;
	building.state = 'functional';
	building.maxHp = 1000;
	building.hp = 1000;
	// MODIFIED: Buildings are now purchased without shields. Shields must be added via upgrades.
	building.maxShieldHp = 0;
	building.shieldHp = 0;
	building.isSafezone = true;
	
	addToLog(`City purchased ${building.name} for ${price} tokens!`);
}

/**
 * Renders the grid of city buildings using a granular update strategy.
 * @param {HTMLElement} contentArea - The main content DOM element.
 */
export function renderBuildings(contentArea) {
	let grid = getEl('buildings-grid');
	if (!grid) {
		contentArea.innerHTML = `<div id="buildings-grid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"></div>`;
		grid = getEl('buildings-grid');
	}
	
	const activeBuildingIds = new Set(gameState.city.buildings.map(b => b.id));
	
	// Pre-calculate values needed for multiple cards
	const nextPrice = calculateNextBuildingPrice();
	const heroesOutside = gameState.heroes.filter(h => h.location === 'field');
	
	// Update or create cards for each building
	gameState.city.buildings.forEach(b => {
		const cardId = `building-card-${b.id}`;
		let card = getEl(cardId);
		const isPlayerOwned = b.owner === 'player';
		
		// If card doesn't exist, or its type has changed (owned vs unowned), create it.
		const cardType = isPlayerOwned ? 'player' : 'unowned';
		if (!card || card.dataset.cardType !== cardType) {
			if (card) card.remove(); // Remove old card if type changed
			const cardWrapper = document.createElement('div');
			cardWrapper.id = cardId;
			cardWrapper.dataset.cardType = cardType;
			grid.appendChild(cardWrapper);
			card = cardWrapper;
			
			if (isPlayerOwned) {
				card.innerHTML = `
                    <div class="card bg-base-200 shadow-sm p-3 text-xs border border-primary h-full flex flex-col">
						<div class="flex justify-between items-start">
							<div data-name class="font-bold text-sm mb-1 text-primary"></div>
							<button class="btn btn-xs btn-ghost" data-rename-building-id="${b.id}">Rename</button>
						</div>
						<img data-building-image src="" alt="Building Image" class="w-[50px] h-[50px] object-contain bg-base-100 rounded" />
                        <div data-state class="font-semibold"></div>
                        <div data-hp></div>
                        <div data-shield class="text-info"></div>
                        <div data-pop class="text-success mt-1"></div>
                        <div class="mt-2">
                            <p class="font-semibold">Heroes Inside:</p>
                            <p data-heroes-inside class="text-gray-400 truncate"></p>
                        </div>
                        <div data-btn-container class="btn-group btn-group-vertical w-full mt-auto pt-2"></div>
                    </div>
                `;
			} else {
				card.innerHTML = `
                    <div class="card bg-base-200 shadow-sm p-3 text-xs border border-base-300 h-full flex flex-col">
                        <div data-name class="font-bold text-sm mb-1"></div>
						<img data-building-image src="" alt="Building Image" class="w-[50px] h-[50px] object-contain bg-base-100 rounded" />
                        <div data-state class="font-semibold"></div>
                        <div data-hp></div>
                        <div data-pop class="text-success mt-1"></div>
                        <div class="mt-auto pt-2">
                            <button class="btn btn-sm btn-accent w-full" data-buy-building-id="${b.id}"></button>
                        </div>
                    </div>
                `;
			}
		}
		
		// Granularly update the card's content
		const cardContent = card.firstElementChild;
		
		const imgEl = cardContent.querySelector('[data-building-image]');
		if (imgEl) {
			let stateChar = 'n'; // normal
			if (b.state === 'damaged') stateChar = 'd';
			if (b.state === 'ruined') stateChar = 'r';
			if (b.state === 'functional' && b.shieldHp > 0 && b.owner === 'player') stateChar = 's';
			// Assuming images are in public/images/buildings/
			const imageUrl = `/images/buildings/${b.type}-${stateChar}.png`;
			if (imgEl.src !== window.location.origin + imageUrl) {
				imgEl.src = imageUrl;
				imgEl.alt = `${b.name} - ${b.state}`;
			}
		}
		
		if (isPlayerOwned) {
			updateTextIfChanged(cardContent.querySelector('[data-name]'), `${b.name} (#${b.id})`);
			
			const stateEl = cardContent.querySelector('[data-state]');
			updateTextIfChanged(stateEl, `State: ${b.state}`);
			stateEl.className = `font-semibold ${b.state === 'functional' ? 'text-success' : 'text-error'}`;
			
			updateTextIfChanged(cardContent.querySelector('[data-hp]'), `HP: ${b.hp}/${b.maxHp}`);
			updateTextIfChanged(cardContent.querySelector('[data-shield]'), `Shield: ${b.shieldHp || 0}/${b.maxShieldHp || 0}`);
			updateTextIfChanged(cardContent.querySelector('[data-pop]'), `Pop: ${b.population}/${b.maxPopulation}`);
			
			const heroesInside = b.heroesInside.map(id => gameState.heroes.find(h => h.id === id)?.name).join(', ') || 'None';
			updateTextIfChanged(cardContent.querySelector('[data-heroes-inside]'), heroesInside);
			
			const btnContainer = cardContent.querySelector('[data-btn-container]');
			const heroesInsideIds = b.heroesInside.join(',');
			const heroesOutsideIds = heroesOutside.map(h => h.id).join(',');
			const btnStateKey = `${heroesInsideIds}-${heroesOutsideIds}`;
			
			const newButtonsHtml = `
                <button class="btn btn-sm btn-secondary" data-open-shop-for-building="${b.id}">Upgrade</button>
                ${heroesOutside.map(h => `<button class="btn btn-sm btn-ghost" data-enter-building-hero="${h.id}" data-enter-building-bldg="${b.id}">Enter: ${h.name}</button>`).join('')}
                ${b.heroesInside.map(id => `<button class="btn btn-sm btn-ghost" data-exit-building-hero="${id}">Exit: ${gameState.heroes.find(h => h.id === id)?.name}</button>`).join('')}
            `;
			updateHtmlIfChanged(btnContainer, newButtonsHtml, btnStateKey);
		} else {
			updateTextIfChanged(cardContent.querySelector('[data-name]'), `${b.name} (#${b.id})`);
			
			const stateEl = cardContent.querySelector('[data-state]');
			updateTextIfChanged(stateEl, `State: ${b.state}`);
			stateEl.className = `font-semibold ${b.state === 'functional' ? 'text-success' : b.state === 'damaged' ? 'text-warning' : 'text-error'}`;
			
			updateTextIfChanged(cardContent.querySelector('[data-hp]'), `HP: ${b.hp}/${b.maxHp}`);
			updateTextIfChanged(cardContent.querySelector('[data-pop]'), `Pop: ${b.population}/${b.maxPopulation}`);
			
			const buyBtn = cardContent.querySelector('[data-buy-building-id]');
			const canAfford = gameState.city.tokens >= nextPrice;
			updateTextIfChanged(buyBtn, `Buy (${nextPrice} T)`);
			if (buyBtn.disabled !== !canAfford) {
				buyBtn.disabled = !canAfford;
			}
		}
	});
	
	// NEW: Enforce the DOM order of cards to match the gameState array order.
	// This prevents the grid from re-sorting on its own.
	gameState.city.buildings.forEach((b, index) => {
		const cardNode = getEl(`building-card-${b.id}`);
		if (grid.children[index] !== cardNode) {
			grid.insertBefore(cardNode, grid.children[index]);
		}
	});
	// END NEW
	
	// Remove cards for non-existent buildings
	for (const card of grid.children) {
		const cardIdNum = parseInt(card.id.replace('building-card-', ''), 10);
		if (!activeBuildingIds.has(cardIdNum)) {
			card.remove();
		}
	}
}
