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

// Initialize 40 cars
const initialCars =[];
for (let i = 1; i <= 40; i++) {
	initialCars.push({ id: i, battery: 0, driverId: null });
}

export const gameState = {
	time: 0,
	threatLevel: 10,
	city: {
		buildings: initialBuildings,
		cars: initialCars
	},
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
			xp: { current: 0, max: 100 },
			hp: { current: 150, max: 150 },
			mp: { current: 200, max: 200 },
			hpRegen: 0.5, // NEW: Base HP regen
			mpRegen: 2.0, // MODIFIED: Renamed from manaRegen and set base value
			hpMaxPerLevel: 10, // NEW: Max HP increase per level
			mpMaxPerLevel: 50, // NEW: Max MP increase per level
			hpRegenPerLevel: 0.1, // NEW: HP regen increase per level
			mpRegenPerLevel: 1.0, // NEW: MP regen increase per level
			skills:['AEG001', 'AEG002', 'AEG003', 'AEG004'],
			autoCast:[]
		},
		{
			id: 2,
			name: 'Jax',
			class: 'Striker',
			level: 1,
			xp: { current: 0, max: 100 },
			hp: { current: 100, max: 100 },
			mp: { current: 100, max: 100 },
			hpRegen: 1.0, // NEW: Base HP regen
			mpRegen: 1.0, // MODIFIED: Renamed from manaRegen
			hpMaxPerLevel: 15, // NEW: Max HP increase per level
			mpMaxPerLevel: 10, // NEW: Max MP increase per level
			hpRegenPerLevel: 0.2, // NEW: HP regen increase per level
			mpRegenPerLevel: 0.5, // NEW: MP regen increase per level
			carId: null,
			targetMonster: null,
			skills: ['STR001']
		},
		{
			id: 3,
			name: 'Roc',
			class: 'Vanguard',
			level: 1,
			xp: { current: 0, max: 100 },
			hp: { current: 250, max: 250 },
			mp: { current: 50, max: 50 },
			hpRegen: 2.0, // NEW: Base HP regen
			mpRegen: 0.5, // MODIFIED: Renamed from manaRegen
			hpMaxPerLevel: 30, // NEW: Max HP increase per level
			mpMaxPerLevel: 5, // NEW: Max MP increase per level
			hpRegenPerLevel: 0.5, // NEW: HP regen increase per level
			mpRegenPerLevel: 0.2, // NEW: MP regen increase per level
			carId: null,
			targetMonster: null,
			skills: ['VAN001']
		}
	],
	log: ['[SYSTEM]: The Awakening has begun. Defend the city.']
};

export const gameData = {
	items: [],
	skills: [],
	recipes:[],
	monsters:[]
};
