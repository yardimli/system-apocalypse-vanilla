const initialCars = [];

export const gameState = {
	time: 0,
	lastTickTime: 0,
	gameSettings: {
		speedMultiplier: 1
	},
	threatLevel: 10,
	nextMonsterId: 1,
	party: {
		missionState: 'idle',
		missionDistance: 0,
		previousMissionDistance: 0,
		missionTargetDistance: 0,
		survivorsAwaitingRescue: 0,
		pausedMission: null,
		targetMonsterId: null
	},
	city: {
		tokens: 1000,
		tokensPerPopulationPerTick: 0.1,
		firstShieldInstalled: false,
		buildings: [],
		cars: initialCars
	},
	activeMonsters:[],
	heroes: [], // Heroes are now loaded dynamically from heroes.json
	log: [
		{ time: 0, message: 'The Awakening has begun. Defend the city.', heroId: null }
	]
};

export const gameData = {
	items: [],
	magic_skills: [],
	martial_skills: [],
	skills: [],
	cards: [],
	monsters:[],
	building_upgrades: [],
	car_upgrades: [],
	cars: [],
	buildings: [],
	heroes: [] // Added heroes array to gameData
};
