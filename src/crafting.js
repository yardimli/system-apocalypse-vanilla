import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';
import { autoEquipBestArmor } from './heroes.js';

/**
 * Attempts to automatically craft an item for a hero, consuming ingredients from their inventory.
 * Handles special cases like upgrading equipped armor.
 * @param {number} heroId - The ID of the hero attempting to craft.
 * @param {string} recipeResultId - The resultId of the recipe to craft.
 */
export function handleAutoCraft(heroId, recipeResultId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	const recipe = gameData.recipes.find(r => r.resultId === recipeResultId);
	
	if (!hero || !recipe) {
		addToLog('Auto-craft failed: Hero or recipe not found.');
		return;
	}
	
	// 1. Verify the hero has enough ingredients.
	const ingredientsCount = {};
	recipe.ingredients.forEach(id => {
		ingredientsCount[id] = (ingredientsCount[id] || 0) + 1;
	});
	
	for (const [itemId, requiredQty] of Object.entries(ingredientsCount)) {
		if ((hero.inventory[itemId] || 0) < requiredQty) {
			addToLog(`Auto-craft failed for ${hero.name}: Missing ingredients for ${recipe.description}.`);
			return; // Not enough ingredients
		}
	}
	
	// 2. Handle un-equipping armor if it's an ingredient.
	if (hero.armorId && recipe.ingredients.includes(hero.armorId)) {
		// The equipped armor will be consumed, so we just need to clear the slot.
		hero.armorId = null;
	}
	
	// 3. Consume ingredients from inventory.
	for (const [itemId, requiredQty] of Object.entries(ingredientsCount)) {
		hero.inventory[itemId] -= requiredQty;
		if (hero.inventory[itemId] === 0) {
			delete hero.inventory[itemId];
		}
	}
	
	// 4. Grant the resulting item.
	const { resultId } = recipe;
	const resultEntity = gameData.items.find(i => i.id === resultId) || gameData.armor.find(a => a.id === resultId);
	
	if (resultEntity) {
		hero.inventory[resultId] = (hero.inventory[resultId] || 0) + 1;
		addToLog(`${hero.name} auto-crafted ${resultEntity.name}!`);
	} else {
		addToLog(`Auto-craft failed for ${hero.name}: Could not find result entity ${resultId}.`);
		return; // Stop if the result item doesn't exist.
	}
	
	autoEquipBestArmor(hero);
}
