import { gameState, gameData } from './state.js';
import { updateTextIfChanged, updateHtmlIfChanged, updateProgressIfChanged, addToLog, parseRange } from './utils.js';
import { handleExitBuilding } from './buildings.js';

// Helper function to get an element by its ID.
const getEl = (id) => document.getElementById(id);

/**
 * Renders the list of active monsters using a granular update strategy.
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
                    <!-- Distance from city -->
                    <div class="text-sm text-warning mt-1" data-distance></div>
                    <div class="mt-2">
                        <progress class="progress progress-error w-full" value="0" max="100" data-hp-bar></progress>
                        <p class="text-xs text-right mt-1" data-hp-label></p>
                    </div>
                    <div class="mt-2 border-t border-base-300 pt-2">
                        <h4 class="font-semibold text-sm mb-1">Threat List</h4>
                        <div data-agro-list></div>
                    </div>
                    <!-- Action button area -->
                    <div class="card-actions justify-end mt-2" data-actions></div>
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
		
		// Update distance text
		let distanceText = `At City Gates`;
		if (monster.distanceFromCity > 0) {
			distanceText = `${Math.floor(monster.distanceFromCity)}m from city`;
		}
		updateTextIfChanged(card.querySelector('[data-distance]'), distanceText);
		
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
		
		// Update action buttons
		const actionsContainer = card.querySelector('[data-actions]');
		const canPartyAttack = gameState.party.missionState === 'idle';
		let actionsHtml = '';
		if (monster.assignedTo.length === 0) {
			actionsHtml = `<button class="btn btn-sm btn-error" data-attack-monster-id="${monster.id}" ${!canPartyAttack ? 'disabled' : ''}>Attack</button>`;
		}
		// Use a state key to prevent re-rendering the button constantly
		const actionsStateKey = `${monster.assignedTo.length}-${canPartyAttack}`;
		updateHtmlIfChanged(actionsContainer, actionsHtml, actionsStateKey);
	});
	
	// Remove cards for defeated/despawned monsters.
	grid.querySelectorAll('.card').forEach(card => {
		const cardId = parseInt(card.id.replace('monster-card-', ''), 10);
		if (!activeMonsterIds.has(cardId)) {
			card.remove();
		}
	});
}

/**
 * Processes all active monster actions for a game tick, including movement and attacks.
 * This logic was moved from main.js for better organization.
 */
export function processMonsterActions () {
	gameState.activeMonsters.forEach(monster => {
		// Logic for monsters not engaged with heroes
		if (monster.assignedTo.length === 0) {
			// 1. Unassigned Monster Movement
			if (monster.distanceFromCity > 0) {
				monster.distanceFromCity -= monster.speed;
				if (monster.distanceFromCity <= 0) {
					monster.distanceFromCity = 0;
					addToLog(`${monster.name} (#${monster.id}) has reached the city!`);
				}
			}
			// 2. Unassigned Monsters Attack City
			else { // monster.distanceFromCity is <= 0
				if (!monster.targetBuilding) {
					const validTargets = gameState.city.buildings.filter(b => b.state !== 'ruined');
					if (validTargets.length > 0) {
						monster.targetBuilding = validTargets[Math.floor(Math.random() * validTargets.length)].id;
					}
				}
				
				if (monster.targetBuilding) {
					const bldg = gameState.city.buildings.find(b => b.id === monster.targetBuilding);
					if (bldg && bldg.state !== 'ruined') {
						const monsterDamage = parseRange(monster.damage);
						if (bldg.shieldHp > 0) {
							const damageToShield = Math.min(bldg.shieldHp, monsterDamage);
							bldg.shieldHp -= damageToShield;
							if (bldg.owner === 'player' && bldg.shieldHp < 1) bldg.shieldHp = 1;
							addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) dealt ${damageToShield} damage to the shield on ${bldg.name || `Building #${bldg.id}`}.`);
							if (bldg.shieldHp === 0 || (bldg.owner === 'player' && bldg.shieldHp === 1)) {
								addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) effectively destroyed the shield on ${bldg.name || `Building #${bldg.id}`}!`);
							}
						} else {
							const damageToHp = Math.min(bldg.hp, monsterDamage);
							bldg.hp -= damageToHp;
							if (bldg.owner === 'player' && bldg.hp < 1) bldg.hp = 1;
							addToLog(`Lv.${monster.level} ${monster.name} (#${monster.id}) dealt ${damageToHp} damage to ${bldg.name || `Building #${bldg.id}`}.`);
							if (bldg.hp <= 0 && bldg.owner !== 'player') {
								bldg.hp = 0;
								bldg.state = 'ruined';
								bldg.population = 0;
								monster.targetBuilding = null;
								addToLog(`${bldg.name || `Building #${bldg.id}`} was ruined by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
							} else if (bldg.hp <= 5 && bldg.state === 'functional') {
								bldg.state = 'damaged';
								addToLog(`${bldg.name || `Building #${bldg.id}`} was damaged by Lv.${monster.level} ${monster.name} (#${monster.id})!`);
							}
						}
					} else {
						monster.targetBuilding = null;
					}
				}
			}
		}
		// 3. Monsters Attack Heroes based on Agro
		else { // monster.assignedTo.length > 0
			let targetHeroId = null;
			let maxAgro = -1;
			
			for (const heroId in monster.agro) {
				const hero = gameState.heroes.find(h => h.id === parseInt(heroId, 10));
				if (hero && hero.hp.current > 0 && monster.assignedTo.includes(hero.id)) {
					if (monster.agro[heroId] > maxAgro) {
						maxAgro = monster.agro[heroId];
						targetHeroId = parseInt(heroId, 10);
					}
				}
			}
			
			if (targetHeroId) {
				const targetHero = gameState.heroes.find(h => h.id === targetHeroId);
				const armor = gameData.items.find(a => a.id === targetHero.equipment.body);
				const shield = gameData.items.find(s => s.id === targetHero.equipment.offHand);
				const armorMitigation = armor ? parseRange(armor.damageMitigation) : 0;
				const shieldMitigation = shield ? parseRange(shield.damageMitigation) : 0;
				const totalMitigation = armorMitigation + shieldMitigation;
				
				const monsterDamage = parseRange(monster.damage);
				let damageTaken = Math.max(1, monsterDamage - totalMitigation);
				
				const car = targetHero.carId ? gameState.city.cars.find(c => c.id === targetHero.carId) : null;
				if (car) {
					const mitigationBonus = car.upgrades
						.map(upgId => gameData.car_upgrades.find(u => u.id === upgId))
						.filter(upg => upg && upg.effect.type === 'increase_occupant_mitigation_bonus')
						.reduce((sum, upg) => sum + upg.effect.value, 0);
					
					if (mitigationBonus > 0) {
						const mitigatedAmount = Math.floor(damageTaken * mitigationBonus);
						damageTaken -= mitigatedAmount;
						addToLog(`${targetHero.name}'s car mitigated ${mitigatedAmount} damage!`, targetHero.id);
					}
				}
				damageTaken = Math.max(1, damageTaken);
				
				targetHero.hp.current -= damageTaken;
				addToLog(`${monster.name} (#${monster.id}) attacked ${targetHero.name}, dealing ${damageTaken} damage!`, targetHero.id);
				
				if (targetHero.hp.current <= 0) {
					targetHero.hp.current = 0;
					handleExitBuilding(targetHero.id);
					if (targetHero.carId) {
						targetHero.carId = null;
					}
					if (targetHero.survivorsCarried > 0) {
						addToLog(`The ${targetHero.survivorsCarried} survivors with ${targetHero.name} were killed when they were incapacitated!`, targetHero.id);
						targetHero.survivorsCarried = 0;
					}
					targetHero.targetMonsterId = null;
					addToLog(`${targetHero.name} was incapacitated by ${monster.name} (#${monster.id})!`, targetHero.id);
					
					// Check if the monster should become unassigned.
					const remainingAttackers = monster.assignedTo
						.map(id => gameState.heroes.find(h => h.id === id))
						.filter(h => h && h.hp.current > 0);
					
					if (remainingAttackers.length === 0) {
						monster.assignedTo = [];
						addToLog(`${monster.name} (#${monster.id}) is no longer being fought and will advance on the city.`, null);
					}
				}
			}
		}
	});
}
