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
	// Recipes can now create items or armor.
	const resultEntity = gameData.items.find(i => i.id === resultId) || gameData.armor.find(a => a.id === resultId);
	
	if (resultEntity) {
		hero.inventory[resultId] = (hero.inventory[resultId] || 0) + 1;
		addToLog(`${hero.name} crafted ${resultEntity.name}!`);
	} else {
		// This case should ideally not happen if data is correct
		addToLog(`Crafting failed for ${hero.name}. Could not find result entity ${resultId}.`);
	}
}

/**
 * NEW: Attempts to automatically craft an item for a hero, consuming ingredients from their inventory.
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
	let wasEquippedArmor = false;
	if (hero.armorId && recipe.ingredients.includes(hero.armorId)) {
		wasEquippedArmor = true;
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
	
	// 5. Re-equip the newly crafted armor if it was an upgrade.
	const isResultArmor = gameData.armor.some(a => a.id === resultId);
	if (wasEquippedArmor && isResultArmor) {
		hero.armorId = resultId;
		addToLog(`${hero.name} automatically equipped the new ${resultEntity.name}.`);
	}
}
