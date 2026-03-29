export const gameState = {
	time: 0,
	threatLevel: 10,
	population: {current: 30, max: 30},
	city: {
		totalBuildings: 100,
		functional: 3,
		damaged: 12,
		ruined: 85,
		shielded: 0,
		cars: 0 // Cars equipped with mana batteries
	},
	activeMonsters: [],
	heroes: [
		{
			id: 1,
			name: 'Ava',
			class: 'Aegis',
			level: 1,
			xp: {current: 0, max: 100},
			hp: {current: 150, max: 150},
			mp: {current: 200, max: 200},
			manaRegen: 1, // Added base mana regen
			skills: ['AEG001', 'AEG002', 'AEG003', 'AEG004'],
			inventory: {},
			autoCast: {} // Added auto-cast tracking
		},
		{
			id: 2,
			name: 'Jax',
			class: 'Striker',
			level: 1,
			xp: {current: 0, max: 100},
			hp: {current: 100, max: 100},
			mp: {current: 100, max: 100},
			manaRegen: 1,
			hasCar: false,
			targetMonster: null,
			skills: ['STR001'],
			inventory: {'STR001': 2}
		},
		{
			id: 3,
			name: 'Roc',
			class: 'Vanguard',
			level: 1,
			xp: {current: 0, max: 100},
			hp: {current: 250, max: 250},
			mp: {current: 50, max: 50},
			manaRegen: 1,
			hasCar: false,
			targetMonster: null,
			skills: ['VAN001'],
			inventory: {'VAN001': 2}
		}
	],
	log: ['[SYSTEM]: The Awakening has begun. Defend the city.']
};

export const gameData = {
	items: [],
	skills: [],
	recipes: [],
	monsters: []
};
