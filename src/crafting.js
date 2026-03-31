import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

/**
 * Checks if a hero's current crafting slots match a valid recipe.
 * Recipes are now item-only.
 * @param {object} hero - The hero object from gameState.
 * @returns {object|null} The matched recipe object or null.
 */
export function findValidRecipe(hero) {
	// Sort for consistent comparison
	const slottedItems = [...hero.craftingSlots].sort();
	
	// MODIFIED: Logic simplified for item-only recipes.
	for (const recipe of gameData.recipes) {
		const recipeItems = [...recipe.ingredients].sort();
		
		// Check: Slotted inventory items must exactly match the recipe's item ingredients.
		if (slottedItems.length > 0 && slottedItems.length === recipeItems.length && slottedItems.every((val, index) => val === recipeItems[index])) {
			return recipe; // Found a valid recipe
		}
	}
	
	return null; // No matching recipe found
}

/**
 * Attempts to craft an item for a hero based on the valid recipe found for their crafting slots.
 * @param {string|number} heroId - The ID of the hero attempting to craft.
 */
export function handleCraftAttempt(heroId) {
	const hero = gameState.heroes.find(h => h.id === heroId);
	if (!hero) return;
	
	const recipe = findValidRecipe(hero);
	if (!recipe) {
		addToLog(`Crafting failed for ${hero.name}. No valid recipe found.`);
		return;
	}
	
	// This function does not consume items from crafting slots, as they are already
	// considered "consumed" from the main inventory when dragged. This just grants the result.
	
	// Clear the hero's crafting slots
	hero.craftingSlots = [];
	
	// Grant the result of the craft
	const { resultId } = recipe;
	// MODIFIED: Simplified to only handle crafting items.
	const resultItem = gameData.items.find(i => i.id === resultId);
	
	if (resultItem) {
		gameState.inventory[resultId] = (gameState.inventory[resultId] || 0) + 1;
		addToLog(`${hero.name} crafted ${resultItem.name}!`);
	} else {
		// This case should ideally not happen if data is correct
		addToLog(`Crafting failed for ${hero.name}. Could not find result item ${resultId}.`);
	}
}
