import { gameState, gameData } from './state.js';

/**
 * Adds a message to the global log and, optionally, to a specific hero's log.
 * @param {string} message - The log message.
 * @param {number|null} heroId - The ID of the hero to add the log to.
 */
export function addToLog (message, heroId = null) {
	const day = Math.floor(gameState.time / 10) + 1;
	const tick = (gameState.time % 10) + 1;
	const timeStr = `[Day ${day}, Tick ${tick}]`;
	const fullMessage = `${timeStr} ${message}`; // Create full message once
	
	// Add to global log
	gameState.log.unshift(fullMessage);
	if (gameState.log.length > 2000) {
		gameState.log.pop();
	}
	
	// Add to hero-specific log if heroId is provided
	if (heroId) {
		const hero = gameState.heroes.find(h => h.id === heroId);
		if (hero) {
			hero.log.unshift(fullMessage); // Add the same full message for consistency
			if (hero.log.length > 300) { // Keep hero logs shorter
				hero.log.pop();
			}
		}
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
		.reduce((sum, s) => sum + parseRange(s.value), 0);
}

// --- New/Moved Helper Functions ---

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
