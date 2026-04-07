import { gameState, gameData } from './state.js';

/**
 * @param {string} message - The log message.
 * @param {number|null} heroId - The ID of the hero this log pertains to, or null for a general log.
 */
export function addToLog (message, heroId = null) {
	const logEntry = {
		time: gameState.time,
		message,
		heroId
	};
	
	// Add the new entry to the beginning of the global log array.
	gameState.log.unshift(logEntry);
	
	// Trim the log to prevent it from growing indefinitely.
	if (gameState.log.length > 2000) {
		gameState.log.pop();
	}
}

/**
 * Parses a string range "min-max" into a random integer between min and max (inclusive).
 * If the input is not a valid range string, it attempts to parse it as a single integer.
 * @param {string|number} rangeStr The string to parse (e.g., "5-10").
 * @returns {number} A random integer within the range, or the parsed number, or 0.
 */
export function parseRange (rangeStr) {
	if (typeof rangeStr !== 'string' || !rangeStr.includes('-')) {
		const val = parseInt(rangeStr, 10);
		return isNaN(val) ? 0 : val;
	}
	const [min, max] = rangeStr.split('-').map(n => parseInt(n.trim(), 10));
	if (isNaN(min) || isNaN(max)) return 0;
	// Return a random integer between min and max (inclusive)
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getSkillEffect (hero, effectType) {
	return hero.skills
		.map(skill => gameData.skills.find(s => s.id === skill.id))
		.filter(s => s && s.effect === effectType)
		.reduce((sum, s) => sum + parseRange(s.agroValue), 0);
}

/**
 * Updates an element's text content only if it has changed.
 * @param {HTMLElement} el The DOM element.
 * @param {string} newText The new text content.
 */
export function updateTextIfChanged (el, newText) {
	if (el && el.textContent !== newText) {
		el.textContent = newText;
	}
}

/**
 * Updates an element's innerHTML only if a representative state key has changed.
 * @param {HTMLElement} el The DOM element.
 * @param {string} newHtml The new HTML content.
 * @param {string} stateKey A string representing the current state of the data.
 */
export function updateHtmlIfChanged (el, newHtml, stateKey) {
	if (el && el.getAttribute('data-prev-state') !== stateKey) {
		el.innerHTML = newHtml;
		el.setAttribute('data-prev-state', stateKey);
	}
}

/**
 * Updates a progress bar's value and max attributes only if they have changed.
 * @param {HTMLElement} el The progress bar element.
 * @param {number} value The new value.
 * @param {number} max The new max value.
 */
export function updateProgressIfChanged (el, value, max) {
	if (!el) return;
	const currentVal = el.getAttribute('value');
	const currentMax = el.getAttribute('max');
	const newValStr = String(value);
	const newMaxStr = String(max);
	
	if (currentVal !== newValStr || currentMax !== newMaxStr) {
		el.value = value;
		el.max = max;
	}
}
