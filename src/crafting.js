import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

/**
 * Checks if a hero's current crafting slots and assets match a valid recipe.
 * The items in the hero's crafting slot must exactly match the item requirements of a recipe.
 * The hero must also possess any required skills or armor.
 * @param {object} hero - The hero object from gameState.
 * @returns {object|null} The matched recipe object or null.
 */
export function findValidRecipe(hero) {
	// Sort for consistent comparison
	const slottedItems = [...hero.craftingSlots].sort();
	
	for (const recipe of gameData.recipes) {
		const recipeItems = recipe.ingredients.filter(id => id.startsWith('ITM')).sort();
		
		// Check 1: Slotted inventory items must exactly match the recipe's item ingredients.
		if (slottedItems.length !== recipeItems.length || !slottedItems.every((val, index) => val === recipeItems[index])) {
			continue;
		}
		
		// Check 2: Hero must have the required non-item assets (skills, armor).
		const recipeAssets = recipe.ingredients.filter(id => !id.startsWith('ITM'));
		const hasAllAssets = recipeAssets.every(assetId => {
			return hero.skills.includes(assetId) || hero.armorId === assetId;
		});
		
		if (hasAllAssets) {
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
	
	// Consume ingredients from global inventory
	const itemsToConsume = recipe.ingredients.filter(id => id.startsWith('ITM'));
	itemsToConsume.forEach(itemId => {
		if (gameState.inventory[itemId]) {
			gameState.inventory[itemId]--;
			if (gameState.inventory[itemId] === 0) {
				delete gameState.inventory[itemId];
			}
		}
	});
	
	// Clear the hero's crafting slots
	hero.craftingSlots =[];
	
	// Grant the result of the craft
	const { resultId } = recipe;
	const resultSkill = gameData.skills.find(s => s.id === resultId);
	const resultArmor = gameData.armor.find(a => a.id === resultId);
	const resultItem = gameData.items.find(i => i.id === resultId);
	
	if (resultSkill) {
		if (resultSkill.replaces) {
			const index = hero.skills.indexOf(resultSkill.replaces);
			if (index !== -1) hero.skills.splice(index, 1);
		}
		if (!hero.skills.includes(resultId)) hero.skills.push(resultId);
		addToLog(`${hero.name} crafted ${resultSkill.name}!`);
	} else if (resultArmor) {
		hero.armorId = resultId;
		addToLog(`${hero.name} crafted and equipped ${resultArmor.name}!`);
	} else if (resultItem) {
		gameState.inventory[resultId] = (gameState.inventory[resultId] || 0) + 1;
		addToLog(`${hero.name} crafted ${resultItem.name}!`);
	}
}
