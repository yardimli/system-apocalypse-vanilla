// Initialize 100 buildings with their respective states, HP, and population
const initialBuildings =[];
for (let i = 1; i <= 100; i++) {
	if (i <= 3) {
		initialBuildings.push({ id: i, state: 'functional', hp: 10, maxHp: 10, shieldHp: 0, maxShieldHp: 70, population: 10 });
	} else if (i <= 15) {
		initialBuildings.push({ id: i, state: 'damaged', hp: 5, maxHp: 10, shieldHp: 0, maxShieldHp: 70, population: 5 });
	} else {
		initialBuildings.push({ id: i, state: 'ruined', hp: 0, maxHp: 10, shieldHp: 0, maxShieldHp: 70, population: 0 });
	}
}

export const gameState = {
	time: 0,
	threatLevel: 10,
	// Replaced flat city stats with detailed buildings array
	city: {
		buildings: initialBuildings,
		cars: 0 // Cars equipped with mana batteries
	},
	// Added shared inventory for all heroes
	inventory: {
		'STR001': 2,
		'VAN001': 2
	},
	activeMonsters: [],
	heroes:[
		{
			id: 1,
			name: 'Ava',
			class: 'Aegis',
			level: 1,
			xp: {current: 0, max: 100},
			hp: {current: 150, max: 150},
			mp: {current: 200, max: 200},
			manaRegen: 1,
			skills:['AEG001', 'AEG002', 'AEG003', 'AEG004'],
			autoCast: {}
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
			skills: ['STR001']
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
			skills: ['VAN001']
		}
	],
	log: ['[SYSTEM]: The Awakening has begun. Defend the city.']
};

export const gameData = {
	items: [],
	skills: [],
	recipes: [],
	monsters:[]
};
