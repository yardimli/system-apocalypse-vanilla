import { gameState, gameData } from './state.js';
import { addToLog, updateTextIfChanged, updateHtmlIfChanged } from './utils.js';
import { requestTextInput } from './dialogs.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

function getUpgradeImageUrl (upgrade) {
	if (upgrade?.card_images && Array.isArray(upgrade.card_images)) {
		const normalImage = upgrade.card_images.find(img => img.state === 'normal') || upgrade.card_images[0];
		if (normalImage) return `${normalImage.image_folder}/thumbnails/${normalImage.image_file_name}`;
	}
	return '';
}

export function getBuildingDefenseStats (building) {
	const stats = {
		passiveDamage: 0,
		activeDefenses: [],
		damageReduction: building.damageReduction || 0,
		repairPerTick: building.repairPerTick || 0
	};
	
	(building.upgrades || []).forEach(upgradeId => {
		const upgrade = gameData.building_upgrades.find(u => u.id === upgradeId);
		const effect = upgrade?.effect;
		if (!effect) return;
		
		if (effect.type === 'passive_defense') {
			stats.passiveDamage += effect.damage || 0;
		} else if (effect.type === 'active_defense') {
			stats.activeDefenses.push({
				id: upgrade.id,
				name: upgrade.name,
				damage: effect.damage || 0,
				cooldown: effect.cooldown || 15
			});
		} else if (effect.type === 'damage_reduction') {
			stats.damageReduction += effect.value || 0;
		}
	});
	
	return stats;
}

function getMonsterImageUrl (monster) {
	if (monster?.card_images && Array.isArray(monster.card_images)) {
		const normalImage = monster.card_images.find(img => img.state === 'normal') || monster.card_images[0];
		if (normalImage) return `${normalImage.image_folder}/thumbnails/${normalImage.image_file_name}`;
	}
	return '';
}

export function makeMonsterFleeBuilding (monster, building, reason = 'defenses') {
	monster.targetBuilding = null;
	monster.buildingAttack = null;
	monster.distanceFromCity = Math.max(monster.distanceFromCity || 0, 500);
	addToLog(`${monster.name} (#${monster.id}) retreated from ${building.name || `Building #${building.id}`} after taking heavy ${reason} damage!`);
}

export function damageMonsterFromBuilding (monster, building, damage, sourceName) {
	if (!monster || !building || damage <= 0) return;
	
	monster.currentHp = Math.max(0, monster.currentHp - damage);
	addToLog(`${building.name || `Building #${building.id}`} hit ${monster.name} (#${monster.id}) with ${sourceName} for ${damage} damage.`);
	
	if (monster.currentHp > 0 && monster.currentHp <= monster.maxHp * 0.3) {
		makeMonsterFleeBuilding(monster, building, sourceName);
	}
}

export function handleFireBuildingDefense (buildingId, defenseId) {
	const building = gameState.city.buildings.find(b => b.id === buildingId);
	if (!building) return;
	
	const monster = gameState.activeMonsters.find(m => m.buildingAttack?.buildingId === building.id || m.targetBuilding === building.id);
	if (!monster) {
		addToLog(`${building.name} has no attacking monster to fire at.`);
		return;
	}
	
	const defense = getBuildingDefenseStats(building).activeDefenses.find(d => d.id === defenseId);
	if (!defense) return;
	
	if (!building.activeDefenseCooldowns) building.activeDefenseCooldowns = {};
	const readyAt = building.activeDefenseCooldowns[defense.id] || 0;
	if (gameState.time < readyAt) return;
	
	building.activeDefenseCooldowns[defense.id] = gameState.time + defense.cooldown;
	damageMonsterFromBuilding(monster, building, defense.damage, defense.name);
}

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
export async function handleBuyBuilding(buildingId) {
	const building = gameState.city.buildings.find(b => b.id === buildingId);
	if (!building || building.owner === 'player') return;
	
	const price = calculateNextBuildingPrice();
	if (gameState.city.tokens < price) {
		addToLog(`The city doesn't have enough tokens to buy Building #${buildingId}. (Need ${price})`);
		return;
	}
	
	const buildingName = await requestTextInput({
		title: 'Name Safezone',
		message: `You are purchasing Building #${buildingId} for ${price} tokens. Enter a name for your new safezone.`,
		defaultValue: `Safezone ${gameState.city.buildings.filter(b => b.owner === 'player').length + 1}`,
		confirmText: 'Buy Building'
	});
	const trimmedName = buildingName?.trim();
	if (!trimmedName) {
		addToLog('Building purchase cancelled.');
		return;
	}
	
	gameState.city.tokens -= price;
	
	building.owner = 'player';
	building.name = trimmedName;
	building.state = 'functional';
	building.maxHp = 1000;
	building.hp = 1000;
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
		contentArea.innerHTML = `<div id="buildings-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>`;
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
                    <div class="card bg-base-200 shadow-md p-4 flex flex-row gap-4 items-start border border-primary h-full">
						<img data-building-image src="" alt="Building Image" class="w-[175px] aspect-[3/4] bg-base-300 rounded flex-shrink-0 object-contain" />
                        <div class="flex flex-col flex-grow min-w-0 h-full">
							<div class="flex justify-between items-start">
								<h3 data-name class="font-bold text-lg truncate text-primary" title="Building Name"></h3>
								<button class="btn btn-xs btn-ghost" data-rename-building-id="${b.id}">Rename</button>
							</div>
							<div class="text-sm w-full mt-2 flex-grow">
								<div data-state class="font-semibold"></div>
								<div data-hp></div>
								<div data-shield class="text-info"></div>
								<div data-pop class="text-success mt-1"></div>
								<div data-defense-summary class="text-warning mt-1"></div>
								<div data-upgrade-icons class="flex flex-wrap gap-1 mt-2"></div>
								<div data-attacker class="mt-2"></div>
								<div class="mt-2">
									<p class="font-semibold">Heroes Inside:</p>
									<p data-heroes-inside class="text-gray-400 truncate"></p>
								</div>
							</div>
							<div data-btn-container class="btn-group btn-group-vertical w-full mt-3"></div>
						</div>
                    </div>
                `;
			} else {
				card.innerHTML = `
                    <div class="card bg-base-300 shadow-md p-4 flex flex-row gap-4 items-start border border-base-300 h-full">
						<img data-building-image src="" alt="Building Image" class="w-[175px] aspect-[3/4] bg-base-300 rounded flex-shrink-0 object-contain" />
                        <div class="flex flex-col flex-grow min-w-0 h-full">
							<h3 data-name class="font-bold text-lg truncate" title="Building Name"></h3>
							<div class="text-sm w-full mt-2 flex-grow">
								<div data-state class="font-semibold"></div>
								<div data-hp></div>
								<div data-pop class="text-success mt-1"></div>
							</div>
							<div class="w-full mt-3">
								<button class="btn btn-sm btn-accent w-full" data-buy-building-id="${b.id}"></button>
							</div>
						</div>
                    </div>
                `;
			}
		}
		
		// Granularly update the card's content
		const cardContent = card.firstElementChild;
		
		const imgEl = cardContent.querySelector('[data-building-image]');
		if (imgEl) {
			let targetState = 'normal';
			if (b.state === 'ruined') targetState = 'ruined';
			else if (b.state === 'damaged') targetState = 'damaged';
			else if (b.state === 'functional' && b.shieldHp > 0 && b.owner === 'player') targetState = 'shielded';
			
			let imageUrl = '';
			if (b.card_images && Array.isArray(b.card_images)) {
				const imgData = b.card_images.find(img => img.state === targetState) || b.card_images.find(img => img.state === 'normal');
				if (imgData) {
					let folderPath = imgData.image_folder;
					imageUrl = `${folderPath}/thumbnails/${imgData.image_file_name}`;
				}
			} else {
				// Fallback to old logic if card_images is missing
				let stateChar = 'n';
				if (targetState === 'damaged') stateChar = 'd';
				if (targetState === 'ruined') stateChar = 'r';
				if (targetState === 'shielded') stateChar = 's';
				imageUrl = `public/images/buildings/${b.type}-${stateChar}.png`;
			}
			
			if (imageUrl !== '' && imgEl.src !== new URL(imageUrl, document.baseURI).href) {
				imgEl.src = imageUrl;
				imgEl.alt = `${b.name} - ${targetState}`;
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
			
			const defenseStats = getBuildingDefenseStats(b);
			const defenseSummary = [
				defenseStats.damageReduction ? `Mitigation: ${defenseStats.damageReduction}` : null,
				defenseStats.passiveDamage ? `Passive: ${defenseStats.passiveDamage} dmg/attack` : null,
				defenseStats.activeDefenses.length ? `Active: ${defenseStats.activeDefenses.length}` : null,
				defenseStats.repairPerTick ? `Repair: +${defenseStats.repairPerTick}/tick` : null
			].filter(Boolean).join(' | ') || 'Defenses: none';
			updateTextIfChanged(cardContent.querySelector('[data-defense-summary]'), defenseSummary);
			
			const upgradeIconHtml = (b.upgrades || []).map(upgradeId => {
				const upgrade = gameData.building_upgrades.find(u => u.id === upgradeId);
				if (!upgrade) return '';
				const imageUrl = getUpgradeImageUrl(upgrade);
				return `
					<div class="tooltip" data-tip="${upgrade.name}: ${upgrade.description || ''}">
						<img src="${imageUrl}" alt="${upgrade.name}" class="w-[40px] aspect-[3/4] bg-base-300 rounded object-contain border border-base-300" />
					</div>
				`;
			}).join('') || '<span class="text-xs italic text-gray-500">No upgrades installed</span>';
			updateHtmlIfChanged(cardContent.querySelector('[data-upgrade-icons]'), upgradeIconHtml, (b.upgrades || []).join(','));
			
			const attacker = gameState.activeMonsters.find(m => m.buildingAttack?.buildingId === b.id);
			const attackerImage = getMonsterImageUrl(attacker);
			const attackHtml = attacker ? `
				<div class="bg-base-300 rounded p-2 flex gap-2 items-start border border-error">
					<img src="${attackerImage}" alt="${attacker.name}" class="w-[60px] aspect-[3/4] bg-base-200 rounded object-contain flex-shrink-0" />
					<div class="min-w-0 flex-grow">
						<div class="font-semibold text-error truncate">Attacked by Lv.${attacker.level} ${attacker.name}</div>
						<div class="text-xs">Monster HP: ${Math.ceil(attacker.currentHp)}/${attacker.maxHp}</div>
						<div class="text-xs">Siege: ${Math.max(0, attacker.buildingAttack.endsAt - gameState.time)}s left</div>
						<div class="text-xs">Next hit: ${Math.max(0, attacker.buildingAttack.nextAttackTime - gameState.time)}s</div>
					</div>
				</div>
			` : '';
			const attackerStateKey = attacker ? `${attacker.id}-${Math.ceil(attacker.currentHp)}-${attacker.buildingAttack.endsAt - gameState.time}-${attacker.buildingAttack.nextAttackTime - gameState.time}` : 'none';
			updateHtmlIfChanged(cardContent.querySelector('[data-attacker]'), attackHtml, attackerStateKey);
			
			const heroesInside = b.heroesInside.map(id => gameState.heroes.find(h => h.id === id)?.name).join(', ') || 'None';
			updateTextIfChanged(cardContent.querySelector('[data-heroes-inside]'), heroesInside);
			
			const btnContainer = cardContent.querySelector('[data-btn-container]');
			const heroesInsideIds = b.heroesInside.join(',');
			const heroesOutsideIds = heroesOutside.map(h => h.id).join(',');
			const activeDefenseState = defenseStats.activeDefenses.map(defense => `${defense.id}:${Math.max(0, (b.activeDefenseCooldowns?.[defense.id] || 0) - gameState.time)}`).join(',');
			const btnStateKey = `${heroesInsideIds}-${heroesOutsideIds}-${attacker?.id || 'none'}-${activeDefenseState}`;
			
			const newButtonsHtml = `
                <button class="btn btn-sm btn-secondary" data-open-shop-for-building="${b.id}">Upgrade</button>
                ${attacker ? defenseStats.activeDefenses.map(defense => {
					const remaining = Math.max(0, (b.activeDefenseCooldowns?.[defense.id] || 0) - gameState.time);
					return `<button class="btn btn-sm btn-error" data-fire-building-defense="${defense.id}" data-building-id="${b.id}" ${remaining > 0 ? 'disabled' : ''}>Fire ${defense.name}${remaining > 0 ? ` (${remaining}s)` : ''}</button>`;
				}).join('') : ''}
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
	
	// Enforce the DOM order of cards to match the gameState array order.
	// This prevents the grid from re-sorting on its own.
	gameState.city.buildings.forEach((b, index) => {
		const cardNode = getEl(`building-card-${b.id}`);
		if (grid.children[index] !== cardNode) {
			grid.insertBefore(cardNode, grid.children[index]);
		}
	});
	
	// Remove cards for non-existent buildings
	for (const card of grid.children) {
		const cardIdNum = parseInt(card.id.replace('building-card-', ''), 10);
		if (!activeBuildingIds.has(cardIdNum)) {
			card.remove();
		}
	}
}
