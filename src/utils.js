import { gameState, gameData } from './state.js';

export function addToLog(message) {
	const timeStr = `[D${Math.floor(gameState.time / 86400) + 1}, ${new Date(gameState.time * 1000).toISOString().substr(11, 8)}]`;
	gameState.log.unshift(`${timeStr} ${message}`);
	if (gameState.log.length > 100) gameState.log.pop();
}

/**
 * NEW: Parses a string range "min-max" into a random integer between min and max (inclusive).
 * If the input is not a valid range string, it attempts to parse it as a single integer.
 * @param {string|number} rangeStr The string to parse (e.g., "5-10").
 * @returns {number} A random integer within the range, or the parsed number, or 0.
 */
export function parseRange(rangeStr) {
	if (typeof rangeStr !== 'string' || !rangeStr.includes('-')) {
		const val = parseInt(rangeStr, 10);
		return isNaN(val) ? 0 : val;
	}
	const [min, max] = rangeStr.split('-').map(n => parseInt(n.trim(), 10));
	if (isNaN(min) || isNaN(max)) return 0;
	// Return a random integer between min and max (inclusive)
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getSkillEffect(hero, effectType) {
	return hero.skills
		.map(skill => gameData.skills.find(s => s.id === skill.id))
		.filter(s => s && s.effect === effectType)
		// MODIFIED: Use the new parseRange function to calculate a random value from the skill's range.
		.reduce((sum, s) => sum + parseRange(s.value), 0);
}
