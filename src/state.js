// Initialize 100 buildings with their respective states, HP, and population
const initialBuildings =[];
for (let i = 1; i <= 20; i++) {
	const newBuilding = {
		id: i,
		state: 'ruined',
		hp: 0,
		maxHp: 100,
		population: 0,
		owner: null,
		name: null,
		isSafezone: false,
		upgrades: [],
		heroesInside: []
	};
	
	if (i <= 3) {
		newBuilding.state = 'functional';
		newBuilding.hp = 100;
		newBuilding.population = 10;
	} else if (i <= 15) {
		newBuilding.state = 'damaged';
		newBuilding.hp = 50;
		newBuilding.population = 4;
	}
	initialBuildings.push(newBuilding);
}

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
		// MODIFIED: Replaced time/progress-based tracking with distance.
		missionDistance: 0,
		previousMissionDistance: 0,
		missionTargetDistance: 0,
		survivorsAwaitingRescue: 0,
		pausedMission: null,
		targetMonsterId: null
	},
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
			equipment: { mainHand: 'WAND001', offHand: null, body: 'ARM001' },
			carId: null,
			survivorsCarried: 0,
			targetMonsterId: null,
			location: 'field',
			tokens: 100,
			skills:[
				{ id: 'AEG004' }
			],
			autoCastSkillId: null,
			skillTargets: { 'AEG004': 1 },
			skillCooldowns: {},
			skillFlash: null,
			casting: null,
			inventory: {
				'ARM001': 1,
				'WAND001': 1,
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
			survivorsCarried: 0,
			targetMonsterId: null,
			location: 'field',
			tokens: 100,
			skills: [{ id: 'STR001' }],
			autoCastSkillId: 'STR001',
			skillTargets: {},
			skillCooldowns: {},
			skillFlash: null,
			casting: null,
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
			rage: { current: 0, max: 100 },
			hpRegen: 2.0,
			hpMaxPerLevel: 30,
			hpRegenPerLevel: 0.5,
			equipment: { mainHand: 'SWD001', offHand: 'SHD001', body: 'ARM001' },
			carId: null,
			survivorsCarried: 0,
			targetMonsterId: null,
			location: 'field',
			tokens: 100,
			skills: [{ id: 'VAN001' }, { id: 'VAN003' }],
			autoCastSkillId: 'VAN003',
			skillTargets: {},
			skillCooldowns: {},
			skillFlash: null,
			casting: null,
			inventory: {
				'ARM001': 1,
				'SWD001': 1,
				'SHD001': 1,
				'ITM016': 4,
				'ITM017': 2
			}
		}
	],
	log: [
		{ time: 0, message: 'The Awakening has begun. Defend the city.', heroId: null }
	]
};

export const gameData = {
	items: [],
	skills: [],
	monsters:[],
	system_shop: [],
	building_upgrades: [],
	car_upgrades: [],
	cars: []
};
