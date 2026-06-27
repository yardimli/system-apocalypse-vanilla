import { gameState } from './state.js';

const STORAGE_KEY = 'system-apocalypse-vanilla:save:v1';
const RESET_KEY = 'system-apocalypse-vanilla:reset-pending';
let savingDisabled = false;

export function saveGame () {
	if (savingDisabled) return false;
	
	try {
		const saveData = {
			version: 1,
			savedAt: Date.now(),
			state: gameState
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
		return true;
	} catch (error) {
		console.warn('Failed to save game progress:', error);
		return false;
	}
}

export function loadGame () {
	try {
		if (localStorage.getItem(RESET_KEY)) {
			localStorage.removeItem(STORAGE_KEY);
			localStorage.removeItem(RESET_KEY);
			return false;
		}
		
		const rawSave = localStorage.getItem(STORAGE_KEY);
		if (!rawSave) return false;
		
		const saveData = JSON.parse(rawSave);
		if (!saveData || saveData.version !== 1 || !saveData.state) return false;
		
		Object.assign(gameState, saveData.state);
		return true;
	} catch (error) {
		console.warn('Failed to load saved game progress:', error);
		return false;
	}
}

export function clearSavedGame () {
	localStorage.removeItem(STORAGE_KEY);
}

export function beginNewGameReset () {
	savingDisabled = true;
	localStorage.setItem(RESET_KEY, '1');
	localStorage.removeItem(STORAGE_KEY);
}
