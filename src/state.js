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
	nextMonsterId: 1,
	city: {
		buildings: initialBuildings,
		cars: initialCars
	},
	activeMonsters:[],
	heroes:[
		{
			id: 1,
			name: 'Ava',
			class: 'Aegis',
			level: 1,
			xp: { current: 0, max: 100 },
			hp: { current: 150, max: 150 },
			mp: { current: 200, max: 200 },
			hpRegen: 0.5,
			mpRegen: 2.0,
			hpMaxPerLevel: 10,
			mpMaxPerLevel: 50,
			hpRegenPerLevel: 0.1,
			mpRegenPerLevel: 1.0,
			equipment: { mainHand: null, offHand: null, body: 'ARM001' },
			tokens: 100,
			skills:[
				{ id: 'AEG001', xp: 0 },
				{ id: 'AEG002', xp: 0 },
				{ id: 'AEG003', xp: 0 },
				{ id: 'AEG004', xp: 0 }
			],
			autoCastSkillId: null,
			// MODIFIED: Removed autoUse property. This is now always enabled.
			inventory: {
				'ARM001': 1,
				'ITM003': 2,
				'ITM006': 3,
				'ITM016': 4,
				'ITM017': 2
			}
		},
		{
			id: 2,
			name: 'Jax',
			class: 'Striker',
			level: 1,
			xp: { current: 0, max: 100 },
			hp: { current: 100, max: 100 },
			mp: { current: 100, max: 100 },
			hpRegen: 1.0,
			mpRegen: 1.0,
			hpMaxPerLevel: 15,
			mpMaxPerLevel: 10,
			hpRegenPerLevel: 0.2,
			mpRegenPerLevel: 0.5,
			equipment: { mainHand: 'WAND001', offHand: null, body: 'ARM001' },
			carId: null,
			targetMonsterId: null,
			tokens: 100,
			skills: [{ id: 'STR001', xp: 0 }],
			// MODIFIED: Removed autoUse property. This is now always enabled.
			inventory: {
				'ARM001': 1,
				'WAND001': 1,
				'ITM016': 4,
				'ITM017': 2
			}
		},
		{
			id: 3,
			name: 'Roc',
			class: 'Vanguard',
			level: 1,
			xp: { current: 0, max: 250 },
			hp: { current: 250, max: 250 },
			mp: { current: 50, max: 50 },
			hpRegen: 2.0,
			mpRegen: 0.5,
			hpMaxPerLevel: 30,
			mpMaxPerLevel: 5,
			hpRegenPerLevel: 0.5,
			mpRegenPerLevel: 0.2,
			equipment: { mainHand: 'SWD001', offHand: 'SHD001', body: 'ARM001' },
			carId: null,
			targetMonsterId: null,
			tokens: 100,
			skills: [{ id: 'VAN001', xp: 0 }, { id: 'VAN002', xp: 0 }],
			// MODIFIED: Removed autoUse property. This is now always enabled.
			inventory: {
				'ARM001': 1,
				'SWD001': 1,
				'SHD001': 1,
				'ITM016': 4,
				'ITM017': 2
			}
		}
	],
	log:['[SYSTEM]: The Awakening has begun. Defend the city.']
};

export const gameData = {
	items: [],
	skills: [],
	monsters:[],
	system_shop: []
};
