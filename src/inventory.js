// NEW FILE: src/inventory.js

import { gameState } from './state.js';

/**
 * Removes one instance of an item from a hero's inventory or crafting slots.
 * @param {object} hero - The hero object.
 * @param {string} itemId - The ID of the item to remove.
 * @param {string} source - The source area ('inventory' or 'crafting').
 * @param {number} itemIndex - The index of the item if from 'crafting'.
 */
function removeItemFromSource(hero, itemId, source, itemIndex) {
	if (source === 'inventory') {
		if (hero.inventory[itemId] > 0) {
			hero.inventory[itemId]--;
			if (hero.inventory[itemId] === 0) {
				delete hero.inventory[itemId];
			}
		}
	} else if (source === 'crafting') {
		// Ensure the item at the index is the one we think it is before removing
		if (hero.craftingSlots[itemIndex] === itemId) {
			hero.craftingSlots.splice(itemIndex, 1);
		}
	}
}

/**
 * Adds one instance of an item to a hero's inventory or crafting slots.
 * @param {object} hero - The hero object.
 * @param {string} itemId - The ID of the item to add.
 * @param {string} targetZone - The destination area ('inventory' or 'crafting').
 */
function addItemToTarget(hero, itemId, targetZone) {
	if (targetZone === 'inventory') {
		hero.inventory[itemId] = (hero.inventory[itemId] || 0) + 1;
	} else if (targetZone === 'crafting') {
		hero.craftingSlots.push(itemId);
	}
}

/**
 * Handles the logic for dropping an item into an inventory or crafting slot.
 * @param {DragEvent} event - The drop event.
 */
export function handleItemDrop(event) {
	const dropZone = event.target.closest('[data-drop-zone]');
	if (!dropZone) return;
	
	// Extract data from the drag event
	const source = event.dataTransfer.getData('source');
	const itemId = event.dataTransfer.getData('itemId');
	const sourceHeroId = parseInt(event.dataTransfer.getData('heroId'), 10);
	const itemIndex = parseInt(event.dataTransfer.getData('itemIndex'), 10);
	
	if (!source || !itemId || !sourceHeroId) return;
	
	// Determine target
	const targetZone = dropZone.dataset.dropZone;
	const targetHeroId = parseInt(dropZone.dataset.heroId, 10);
	
	// Find the heroes involved
	const sourceHero = gameState.heroes.find(h => h.id === sourceHeroId);
	const targetHero = gameState.heroes.find(h => h.id === targetHeroId);
	
	if (!sourceHero || !targetHero) return;
	
	// Gameplay Rule: Prevent moving the last copy of an equipped armor from inventory.
	// The player must unequip it first (a feature to be added later, for now this prevents it).
	// They can still move it if they have more than one copy.
	if (source === 'inventory' && sourceHero.armorId === itemId && sourceHero.inventory[itemId] === 1) {
		console.warn(`Cannot move the only copy of equipped armor: ${itemId}`);
		return; // Abort the drop
	}
	
	// Perform the state change
	removeItemFromSource(sourceHero, itemId, source, itemIndex);
	addItemToTarget(targetHero, itemId, targetZone);
}
