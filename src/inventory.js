import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

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
