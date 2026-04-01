import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

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

/**
 * Unequips the current armor from a hero.
 * @param {number} heroId - The ID of the hero.
 */
export function handleUnequipArmor(heroId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	if (!hero || !hero.armorId) return;
	
	const armor = gameData.armor.find(a => a.id === hero.armorId);
	if (armor) {
		hero.armorId = null;
		addToLog(`${hero.name} unequipped ${armor.name}.`);
	}
}

/**
 * Equips a piece of armor to a hero from their inventory.
 * @param {number} heroId - The ID of the hero.
 * @param {string} armorId - The ID of the armor to equip.
 */
export function handleEquipArmor(heroId, armorId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	// Prevent equipping if it's already equipped or the hero doesn't have it
	if (!hero || !armorId || hero.armorId === armorId || !hero.inventory[armorId]) return;
	
	const armorToEquip = gameData.armor.find(a => a.id === armorId);
	if (!armorToEquip) return; // Ensure it's a valid armor item
	
	const oldArmorId = hero.armorId;
	hero.armorId = armorId;
	
	const oldArmor = oldArmorId ? gameData.armor.find(a => a.id === oldArmorId) : null;
	
	if (oldArmor) {
		addToLog(`${hero.name} swapped ${oldArmor.name} for ${armorToEquip.name}.`);
	} else {
		addToLog(`${hero.name} equipped ${armorToEquip.name}.`);
	}
}

/**
 * NEW: Uses a consumable item from a hero's inventory.
 * @param {number} heroId - The ID of the hero using the item.
 * @param {string} itemId - The ID of the item to use.
 * @returns {boolean} True if the item was used successfully, false otherwise.
 */
export function handleUseConsumable(heroId, itemId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const itemData = gameData.items.find(i => i.id === itemId);
	
	// Validate that the hero and item exist, the hero has the item, and it's a consumable
	if (!hero || !itemData || !hero.inventory[itemId] || itemData.type !== 'Consumable' || !itemData.effect) {
		return false;
	}
	
	const { type, value } = itemData.effect;
	let used = false;
	
	if (type === 'heal_hp' && hero.hp.current < hero.hp.max) {
		const oldHp = hero.hp.current;
		hero.hp.current = Math.min(hero.hp.max, hero.hp.current + value);
		const healedAmount = Math.floor(hero.hp.current - oldHp);
		addToLog(`${hero.name} used ${itemData.name} and restored ${healedAmount} HP.`);
		used = true;
	} else if (type === 'heal_mp' && hero.mp.current < hero.mp.max) {
		const oldMp = hero.mp.current;
		hero.mp.current = Math.min(hero.mp.max, hero.mp.current + value);
		const restoredAmount = Math.floor(hero.mp.current - oldMp);
		addToLog(`${hero.name} used ${itemData.name} and restored ${restoredAmount} MP.`);
		used = true;
	}
	
	// If the item was successfully used, consume it
	if (used) {
		hero.inventory[itemId]--;
		if (hero.inventory[itemId] === 0) {
			delete hero.inventory[itemId];
		}
	}
	
	return used;
}
