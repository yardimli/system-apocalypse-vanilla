// src/utils.js
import { gameState, gameData } from './state.js';

export function addToLog(message) {
	const timeStr = `[D${Math.floor(gameState.time / 86400) + 1}, ${new Date(gameState.time * 1000).toISOString().substr(11, 8)}]`;
	gameState.log.unshift(`${timeStr} ${message}`);
	if (gameState.log.length > 100) gameState.log.pop();
}

export function getSkillEffect(hero, effectType) {
	return hero.skills
		.map(id => gameData.skills.find(s => s.id === id))
		.filter(s => s && s.effect === effectType)
		.reduce((sum, s) => sum + s.value, 0);
}
