import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

/**
 * Uses a consumable item from a hero's inventory.
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
