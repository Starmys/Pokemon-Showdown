/* eslint max-len: ["error", 240] */

import {FS} from '../lib/fs';
import {Dex, toID} from '../sim/dex';
import {PRNG, PRNGSeed} from '../sim/prng';

export interface TeamData {
	typeCount: {[k: string]: number};
	typeComboCount: {[k: string]: number};
	baseFormes: {[k: string]: number};
	megaCount: number;
	zCount?: number;
	has: {[k: string]: number};
	forceResult: boolean;
	weaknesses: {[k: string]: number};
	resistances: {[k: string]: number};
	weather?: string;
	eeveeLimCount?: number;
}

export class RandomTeams {
	dex: ModdedDex;
	gen: number;
	factoryTier: string;
	format: Format;
	prng: PRNG;

	constructor(format: Format | string, prng: PRNG | PRNGSeed | null) {
		format = Dex.getFormat(format);
		this.dex = Dex.forFormat(format);
		this.gen = this.dex.gen;

		this.factoryTier = '';
		this.format = format;
		this.prng = prng && !Array.isArray(prng) ? prng : new PRNG(prng);
	}

	setSeed(prng?: PRNG | PRNGSeed) {
		this.prng = prng && !Array.isArray(prng) ? prng : new PRNG(prng);
	}

	getTeam(options?: PlayerOptions | null): PokemonSet[] {
		const generatorName = typeof this.format.team === 'string' && this.format.team.startsWith('random') ? this.format.team + 'Team' : '';
		// @ts-ignore
		return this[generatorName || 'randomTeam'](options);
	}

	randomChance(numerator: number, denominator: number) {
		return this.prng.randomChance(numerator, denominator);
	}

	sample<T>(items: readonly T[]): T {
		return this.prng.sample(items);
	}

	random(m?: number, n?: number) {
		return this.prng.next(m, n);
	}

	/**
	 * Remove an element from an unsorted array significantly faster
	 * than .splice
	 */
	fastPop(list: any[], index: number) {
		// If an array doesn't need to be in order, replacing the
		// element at the given index with the removed element
		// is much, much faster than using list.splice(index, 1).
		const length = list.length;
		const element = list[index];
		list[index] = list[length - 1];
		list.pop();
		return element;
	}

	/**
	 * Remove a random element from an unsorted array and return it.
	 * Uses the battle's RNG if in a battle.
	 */
	sampleNoReplace(list: any[]) {
		const length = list.length;
		const index = this.random(length);
		return this.fastPop(list, index);
	}

	// checkAbilities(selectedAbilities, defaultAbilities) {
	// 	if (!selectedAbilities.length) return true;
	// 	const selectedAbility = selectedAbilities.pop();
	// 	const isValid = false;
	// 	for (const i = 0; i < defaultAbilities.length; i++) {
	// 		const defaultAbility = defaultAbilities[i];
	// 		if (!defaultAbility) break;
	// 		if (defaultAbility.includes(selectedAbility)) {
	// 			defaultAbilities.splice(i, 1);
	// 			isValid = this.checkAbilities(selectedAbilities, defaultAbilities);
	// 			if (isValid) break;
	// 			defaultAbilities.splice(i, 0, defaultAbility);
	// 		}
	// 	}
	// 	if (!isValid) selectedAbilities.push(selectedAbility);
	// 	return isValid;
	// }
	// hasMegaEvo(species) {
	// 	if (!species.otherFormes) return false;
	// 	const firstForme = this.dex.getSpecies(species.otherFormes[0]);
	// 	return !!firstForme.isMega;
	// }
	randomCCTeam(): RandomTeamsTypes.RandomSet[] {
		const dex = this.dex;
		const team = [];

		const natures = Object.keys(this.dex.data.Natures);
		const items = Object.keys(this.dex.data.Items);

		const random6 = this.random6Pokemon();

		for (let i = 0; i < 6; i++) {
			let forme = random6[i];
			let species = dex.getSpecies(forme);
			if (species.isNonstandard) species = dex.getSpecies(species.baseSpecies);

			// Random legal item
			let item = '';
			if (this.gen >= 2) {
				do {
					item = this.sample(items);
				} while (this.dex.getItem(item).gen > this.gen || this.dex.data.Items[item].isNonstandard);
			}

			// Make sure forme is legal
			if (species.battleOnly) {
				if (typeof species.battleOnly === 'string') {
					species = dex.getSpecies(species.battleOnly);
				} else {
					species = dex.getSpecies(this.sample(species.battleOnly));
				}
				forme = species.name;
			} else if (species.requiredItems && !species.requiredItems.some(req => toID(req) === item)) {
				if (!species.changesFrom) throw new Error(`${species.name} needs a changesFrom value`);
				species = dex.getSpecies(species.changesFrom);
				forme = species.name;
			}

			// Make sure that a base forme does not hold any forme-modifier items.
			let itemData = this.dex.getItem(item);
			if (itemData.forcedForme && forme === this.dex.getSpecies(itemData.forcedForme).baseSpecies) {
				do {
					item = this.sample(items);
					itemData = this.dex.getItem(item);
				} while (itemData.gen > this.gen || itemData.isNonstandard || itemData.forcedForme && forme === this.dex.getSpecies(itemData.forcedForme).baseSpecies);
			}

			// Random legal ability
			const abilities = Object.values(species.abilities).filter(a => this.dex.getAbility(a).gen <= this.gen);
			const ability: string = this.gen <= 2 ? 'None' : this.sample(abilities);

			// Four random unique moves from the movepool
			let moves;
			let pool = ['struggle'];
			if (forme === 'Smeargle') {
				pool = Object.keys(this.dex.data.Moves).filter(moveid => {
					const move = this.dex.data.Moves[moveid];
					return !(move.isNonstandard || move.isZ || move.isMax || move.realMove);
				});
			} else {
				let learnset = this.dex.data.Learnsets[species.id] && this.dex.data.Learnsets[species.id].learnset && !['pumpkaboosuper', 'zygarde10'].includes(species.id) ?
					this.dex.data.Learnsets[species.id].learnset :
					this.dex.data.Learnsets[this.dex.getSpecies(species.baseSpecies).id].learnset;
				if (learnset) {
					pool = Object.keys(learnset).filter(
						moveid => learnset![moveid].find(learned => learned.startsWith(String(this.gen)))
					);
				}
				if (species.changesFrom) {
					learnset = this.dex.data.Learnsets[toID(species.changesFrom)].learnset;
					const basePool = Object.keys(learnset!).filter(
						moveid => learnset![moveid].find(learned => learned.startsWith(String(this.gen)))
					);
					pool = [...new Set(pool.concat(basePool))];
				}
			}
			if (pool.length <= 4) {
				moves = pool;
			} else {
				moves = [this.sampleNoReplace(pool), this.sampleNoReplace(pool), this.sampleNoReplace(pool), this.sampleNoReplace(pool)];
			}

			// Random EVs
			const evs: StatsTable = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
			const s: StatName[] = ["hp", "atk", "def", "spa", "spd", "spe"];
			let evpool = 510;
			do {
				const x = this.sample(s);
				const y = this.random(Math.min(256 - evs[x], evpool + 1));
				evs[x] += y;
				evpool -= y;
			} while (evpool > 0);

			// Random IVs
			const ivs = {hp: this.random(32), atk: this.random(32), def: this.random(32), spa: this.random(32), spd: this.random(32), spe: this.random(32)};

			// Random nature
			const nature = this.sample(natures);

			// Level balance--calculate directly from stats rather than using some silly lookup table
			const mbstmin = 1307; // Sunkern has the lowest modified base stat total, and that total is 807

			let stats = species.baseStats;
			// If Wishiwashi, use the school-forme's much higher stats
			if (species.baseSpecies === 'Wishiwashi') stats = Dex.getSpecies('wishiwashischool').baseStats;

			// Modified base stat total assumes 31 IVs, 85 EVs in every stat
			let mbst = (stats["hp"] * 2 + 31 + 21 + 100) + 10;
			mbst += (stats["atk"] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats["def"] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats["spa"] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats["spd"] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats["spe"] * 2 + 31 + 21 + 100) + 5;

			let level = Math.floor(100 * mbstmin / mbst); // Initial level guess will underestimate

			while (level < 100) {
				mbst = Math.floor((stats["hp"] * 2 + 31 + 21 + 100) * level / 100 + 10);
				mbst += Math.floor(((stats["atk"] * 2 + 31 + 21 + 100) * level / 100 + 5) * level / 100); // Since damage is roughly proportional to level
				mbst += Math.floor((stats["def"] * 2 + 31 + 21 + 100) * level / 100 + 5);
				mbst += Math.floor(((stats["spa"] * 2 + 31 + 21 + 100) * level / 100 + 5) * level / 100);
				mbst += Math.floor((stats["spd"] * 2 + 31 + 21 + 100) * level / 100 + 5);
				mbst += Math.floor((stats["spe"] * 2 + 31 + 21 + 100) * level / 100 + 5);

				if (mbst >= mbstmin) break;
				level++;
			}

			// Random happiness
			const happiness = this.random(256);

			// Random shininess
			const shiny = this.randomChance(1, 1024);

			team.push({
				name: species.baseSpecies,
				species: species.name,
				gender: species.gender,
				item: item,
				ability: ability,
				moves: moves,
				evs: evs,
				ivs: ivs,
				nature: nature,
				level: level,
				happiness: happiness,
				shiny: shiny,
			});
		}

		return team;
	}

	random6Pokemon() {
		// Pick six random pokemon--no repeats, even among formes
		// Also need to either normalize for formes or select formes at random
		// Unreleased are okay but no CAP
		const last = [0, 151, 251, 386, 493, 649, 721, 807, 890][this.gen];

		const pool: number[] = [];
		for (const id in this.dex.data.FormatsData) {
			if (!this.dex.data.Pokedex[id] || this.dex.data.FormatsData[id].isNonstandard && this.dex.data.FormatsData[id].isNonstandard !== 'Unobtainable') continue;
			const num = this.dex.data.Pokedex[id].num;
			if (num <= 0 || pool.includes(num)) continue;
			if (num > last) break;
			pool.push(num);
		}

		const hasDexNumber: {[k: string]: number} = {};
		for (let i = 0; i < 6; i++) {
			const num = this.sampleNoReplace(pool);
			hasDexNumber[num] = i;
		}

		const formes: string[][] = [[], [], [], [], [], []];
		for (const id in this.dex.data.Pokedex) {
			if (!(this.dex.data.Pokedex[id].num in hasDexNumber)) continue;
			const species = this.dex.getSpecies(id);
			if (species.gen <= this.gen && (!species.isNonstandard || species.isNonstandard === 'Unobtainable')) {
				formes[hasDexNumber[species.num]].push(species.name);
			}
		}

		const sixPokemon = [];
		for (let i = 0; i < 6; i++) {
			if (!formes[i].length) {
				throw new Error("Invalid pokemon gen " + this.gen + ": " + JSON.stringify(formes) + " numbers " + JSON.stringify(hasDexNumber));
			}
			sixPokemon.push(this.sample(formes[i]));
		}
		return sixPokemon;
	}

	randomHCTeam(): PokemonSet[] {
		const team = [];

		const itemPool = Object.keys(this.dex.data.Items);
		const abilityPool = Object.keys(this.dex.data.Abilities);
		const movePool = Object.keys(this.dex.data.Moves);
		const naturePool = Object.keys(this.dex.data.Natures);

		const random6 = this.random6Pokemon();

		for (let i = 0; i < 6; i++) {
			// Choose forme
			const species = this.dex.getSpecies(random6[i]);

			// Random unique item
			let item = '';
			if (this.gen >= 2) {
				do {
					item = this.sampleNoReplace(itemPool);
				} while (this.dex.getItem(item).gen > this.gen || this.dex.data.Items[item].isNonstandard);
			}

			// Random unique ability
			let ability = 'None';
			if (this.gen >= 3) {
				do {
					ability = this.sampleNoReplace(abilityPool);
				} while (this.dex.getAbility(ability).gen > this.gen || this.dex.data.Abilities[ability].isNonstandard);
			}

			// Random unique moves
			const m = [];
			do {
				const moveid = this.sampleNoReplace(movePool);
				const move = this.dex.getMove(moveid);
				if (move.gen <= this.gen && !move.isNonstandard && !move.name.startsWith('Hidden Power ')) {
					m.push(moveid);
				}
			} while (m.length < 4);

			// Random EVs
			const evs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
			const s: StatName[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
			if (this.gen === 6) {
				let evpool = 510;
				do {
					const x = this.sample(s);
					const y = this.random(Math.min(256 - evs[x], evpool + 1));
					evs[x] += y;
					evpool -= y;
				} while (evpool > 0);
			} else {
				for (const x of s) {
					evs[x] = this.random(256);
				}
			}

			// Random IVs
			const ivs: StatsTable = {
				hp: this.random(32),
				atk: this.random(32),
				def: this.random(32),
				spa: this.random(32),
				spd: this.random(32),
				spe: this.random(32),
			};

			// Random nature
			const nature = this.sample(naturePool);

			// Level balance
			const mbstmin = 1307;
			const stats = species.baseStats;
			let mbst = (stats['hp'] * 2 + 31 + 21 + 100) + 10;
			mbst += (stats['atk'] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats['def'] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats['spa'] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats['spd'] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats['spe'] * 2 + 31 + 21 + 100) + 5;
			let level = Math.floor(100 * mbstmin / mbst);
			while (level < 100) {
				mbst = Math.floor((stats['hp'] * 2 + 31 + 21 + 100) * level / 100 + 10);
				mbst += Math.floor(((stats['atk'] * 2 + 31 + 21 + 100) * level / 100 + 5) * level / 100);
				mbst += Math.floor((stats['def'] * 2 + 31 + 21 + 100) * level / 100 + 5);
				mbst += Math.floor(((stats['spa'] * 2 + 31 + 21 + 100) * level / 100 + 5) * level / 100);
				mbst += Math.floor((stats['spd'] * 2 + 31 + 21 + 100) * level / 100 + 5);
				mbst += Math.floor((stats['spe'] * 2 + 31 + 21 + 100) * level / 100 + 5);
				if (mbst >= mbstmin) break;
				level++;
			}

			// Random happiness
			const happiness = this.random(256);

			// Random shininess
			const shiny = this.randomChance(1, 1024);

			team.push({
				name: species.baseSpecies,
				species: species.name,
				gender: species.gender,
				item: item,
				ability: ability,
				moves: m,
				evs: evs,
				ivs: ivs,
				nature: nature,
				level: level,
				happiness: happiness,
				shiny: shiny,
			});
		}

		return team;
	}

	queryMoves(moves: string[] | null, hasType: {[k: string]: boolean} = {}, hasAbility: {[k: string]: boolean} = {}, movePool: string[] = []) {
		// This is primarily a helper function for random setbuilder functions.
		const counter: {[k: string]: any} = {
			Physical: 0, Special: 0, Status: 0, damage: 0, recovery: 0, stab: 0, inaccurate: 0, priority: 0, recoil: 0, drain: 0, sound: 0,
			adaptability: 0, contrary: 0, ironfist: 0, serenegrace: 0, sheerforce: 0, skilllink: 0, strongjaw: 0, technician: 0,
			physicalsetup: 0, specialsetup: 0, mixedsetup: 0, speedsetup: 0, physicalpool: 0, specialpool: 0, hazards: 0,
			damagingMoves: [],
			damagingMoveIndex: {},
			setupType: '',
			Bug: 0, Dark: 0, Dragon: 0, Electric: 0, Fairy: 0, Fighting: 0, Fire: 0, Flying: 0, Ghost: 0, Grass: 0, Ground: 0,
			Ice: 0, Normal: 0, Poison: 0, Psychic: 0, Rock: 0, Steel: 0, Water: 0,
		};

		let typeDef: string;
		for (typeDef in this.dex.data.TypeChart) {
			counter[typeDef] = 0;
		}

		if (!moves || !moves.length) return counter;

		// Moves that restore HP:
		const RecoveryMove = [
			'healorder', 'milkdrink', 'moonlight', 'morningsun', 'recover', 'roost', 'shoreup', 'slackoff', 'softboiled', 'strengthsap', 'synthesis',
		];
		// Moves which drop stats:
		const ContraryMove = [
			'closecombat', 'leafstorm', 'overheat', 'superpower', 'vcreate',
		];
		// Moves that boost Attack:
		const PhysicalSetup = [
			'bellydrum', 'bulkup', 'coil', 'curse', 'dragondance', 'honeclaws', 'howl', 'poweruppunch', 'swordsdance',
		];
		// Moves which boost Special Attack:
		const SpecialSetup = [
			'calmmind', 'chargebeam', 'geomancy', 'nastyplot', 'quiverdance', 'tailglow',
		];
		// Moves which boost Attack AND Special Attack:
		const MixedSetup = [
			'clangoroussoul', 'growth', 'happyhour', 'holdhands', 'noretreat', 'shellsmash', 'workup',
		];
		// Moves which boost Speed:
		const SpeedSetup = [
			'agility', 'autotomize', 'flamecharge', 'rockpolish', 'shiftgear',
		];
		// Moves that shouldn't be the only STAB moves:
		const NoStab = [
			'accelerock', 'aquajet', 'bounce', 'breakingswipe', 'explosion', 'fakeout', 'firstimpression', 'flamecharge', 'flipturn',
			'iceshard', 'machpunch', 'pluck', 'pursuit', 'quickattack', 'selfdestruct', 'skydrop', 'suckerpunch', 'watershuriken',

			'clearsmog', 'eruption', 'icywind', 'incinerate', 'meteorbeam', 'snarl', 'vacuumwave', 'voltswitch', 'waterspout',
		];

		// Iterate through all moves we've chosen so far and keep track of what they do:
		for (const [k, moveId] of moves.entries()) {
			const move = this.dex.getMove(moveId);
			const moveid = move.id;
			let movetype = move.type;
			if (['judgment', 'multiattack', 'revelationdance'].includes(moveid)) movetype = Object.keys(hasType)[0];
			if (move.damage || move.damageCallback) {
				// Moves that do a set amount of damage:
				counter['damage']++;
				counter.damagingMoves.push(move);
				counter.damagingMoveIndex[moveid] = k;
			} else {
				// Are Physical/Special/Status moves:
				counter[move.category]++;
			}
			// Moves that have a low base power:
			if (moveid === 'lowkick' || (move.basePower && move.basePower <= 60 && moveid !== 'rapidspin')) counter['technician']++;
			// Moves that hit up to 5 times:
			if (move.multihit && Array.isArray(move.multihit) && move.multihit[1] === 5) counter['skilllink']++;
			if (move.recoil || move.hasCrashDamage) counter['recoil']++;
			if (move.drain) counter['drain']++;
			// Moves which have a base power, but aren't super-weak like Rapid Spin:
			if (move.basePower > 30 || move.multihit || move.basePowerCallback || moveid === 'infestation' || moveid === 'naturepower') {
				counter[movetype]++;
				if (hasType[movetype]) {
					counter['adaptability']++;
					// STAB:
					// Certain moves aren't acceptable as a Pokemon's only STAB attack
					if (!NoStab.includes(moveid) && (moveid !== 'hiddenpower' || Object.keys(hasType).length === 1)) {
						counter['stab']++;
						// Ties between Physical and Special setup should broken in favor of STABs
						counter[move.category] += 0.1;
					}
				} else if (movetype === 'Normal' && (hasAbility['Aerilate'] || hasAbility['Galvanize'] || hasAbility['Pixilate'] || hasAbility['Refrigerate'])) {
					counter['stab']++;
				} else if (move.priority === 0 && (hasAbility['Libero'] || hasAbility['Protean']) && !NoStab.includes(moveid)) {
					counter['stab']++;
				} else if (movetype === 'Steel' && hasAbility['Steelworker']) {
					counter['stab']++;
				}
				if (move.flags['bite']) counter['strongjaw']++;
				if (move.flags['punch']) counter['ironfist']++;
				if (move.flags['sound']) counter['sound']++;
				counter.damagingMoves.push(move);
				counter.damagingMoveIndex[moveid] = k;
			}
			// Moves with secondary effects:
			if (move.secondary) {
				counter['sheerforce']++;
				if (move.secondary.chance && move.secondary.chance >= 20 && move.secondary.chance < 100) {
					counter['serenegrace']++;
				}
			}
			// Moves with low accuracy:
			if (move.accuracy && move.accuracy !== true && move.accuracy < 90) counter['inaccurate']++;
			// Moves with non-zero priority:
			if (move.category !== 'Status' && (move.priority !== 0 || (moveid === 'grassyglide' && hasAbility['Grassy Surge']))) {
				counter['priority']++;
			}

			// Moves that change stats:
			if (RecoveryMove.includes(moveid)) counter['recovery']++;
			if (ContraryMove.includes(moveid)) counter['contrary']++;
			if (PhysicalSetup.includes(moveid)) {
				counter['physicalsetup']++;
				counter.setupType = 'Physical';
			} else if (SpecialSetup.includes(moveid)) {
				counter['specialsetup']++;
				counter.setupType = 'Special';
			}
			if (MixedSetup.includes(moveid)) counter['mixedsetup']++;
			if (SpeedSetup.includes(moveid)) counter['speedsetup']++;
			if (['spikes', 'stealthrock', 'stickyweb', 'toxicspikes'].includes(moveid)) counter['hazards']++;
		}

		// Keep track of the available moves
		for (const moveid of movePool) {
			const move = this.dex.getMove(moveid);
			if (move.damageCallback) continue;
			if (move.category === 'Physical') counter['physicalpool']++;
			if (move.category === 'Special') counter['specialpool']++;
		}

		// Choose a setup type:
		if (counter['mixedsetup']) {
			counter.setupType = 'Mixed';
		} else if (counter['physicalsetup'] && counter['specialsetup']) {
			const pool = {
				Physical: counter.Physical + counter['physicalpool'],
				Special: counter.Special + counter['specialpool'],
			};
			if (pool.Physical === pool.Special) {
				if (counter.Physical > counter.Special) counter.setupType = 'Physical';
				if (counter.Special > counter.Physical) counter.setupType = 'Special';
			} else {
				counter.setupType = pool.Physical > pool.Special ? 'Physical' : 'Special';
			}
		} else if (counter.setupType === 'Physical') {
			if ((counter.Physical < 2 && (!counter.stab || !counter['physicalpool'])) && (!moves.includes('rest') || !moves.includes('sleeptalk'))) {
				counter.setupType = '';
			}
		} else if (counter.setupType === 'Special') {
			if ((counter.Special < 2 && (!counter.stab || !counter['specialpool'])) && (!moves.includes('rest') || !moves.includes('sleeptalk')) && (!moves.includes('wish') || !moves.includes('protect'))) {
				counter.setupType = '';
			}
		}

		counter['Physical'] = Math.floor(counter['Physical']);
		counter['Special'] = Math.floor(counter['Special']);

		return counter;
	}

	randomSet(species: string | Species, teamDetails: RandomTeamsTypes.TeamDetails = {}, isLead = false, isDoubles = false): RandomTeamsTypes.RandomSet {
		species = this.dex.getSpecies(species);
		let forme = species.name;
		let gmax = false;

		if (typeof species.battleOnly === 'string') {
			// Only change the forme. The species has custom moves, and may have different typing and requirements.
			forme = species.battleOnly;
		}
		if (species.cosmeticFormes) {
			forme = this.sample([species.name].concat(species.cosmeticFormes));
		}
		if (species.name.endsWith('-Gmax')) {
			forme = species.name.slice(0, -5);
			gmax = true;
		}

		const randMoves = !isDoubles ? species.randomBattleMoves : (species.randomDoubleBattleMoves || species.randomBattleMoves);
		const movePool = (randMoves || Object.keys(this.dex.data.Learnsets[species.id]!.learnset!)).slice();
		const rejectedPool = [];
		const moves: string[] = [];
		let ability = '';
		let item = '';
		const evs = {
			hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85,
		};
		const ivs = {
			hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31,
		};
		const hasType: {[k: string]: true} = {};
		hasType[species.types[0]] = true;
		if (species.types[1]) {
			hasType[species.types[1]] = true;
		}
		const hasAbility: {[k: string]: true} = {};
		hasAbility[species.abilities[0]] = true;
		if (species.abilities[1]) {
			hasAbility[species.abilities[1]] = true;
		}
		if (species.abilities['H']) {
			hasAbility[species.abilities['H']] = true;
		}

		let hasMove: {[k: string]: boolean} = {};
		let counter;

		do {
			// Keep track of all moves we have:
			hasMove = {};
			for (const moveid of moves) {
				hasMove[moveid] = true;
			}

			// Choose next 4 moves from learnset/viable moves and add them to moves list:
			const pool = (movePool.length ? movePool : rejectedPool);
			while (moves.length < 4 && pool.length) {
				const moveid = this.sampleNoReplace(pool);
				hasMove[moveid] = true;
				moves.push(moveid);
			}

			counter = this.queryMoves(moves, hasType, hasAbility, movePool);

			// Iterate through the moves again, this time to cull them:
			for (const [k, moveId] of moves.entries()) {
				const move = this.dex.getMove(moveId);
				const moveid = move.id;
				let rejected = false;
				let isSetup = false;

				switch (moveid) {
				// Not very useful without their supporting moves
				case 'acrobatics': case 'drainingkiss':
					if (!counter.setupType && !isDoubles) rejected = true;
					break;
				case 'destinybond': case 'healbell':
					if (movePool.includes('protect') || movePool.includes('wish')) rejected = true;
					break;
				case 'fireblast':
					if (hasAbility['Serene Grace'] && (!hasMove['trick'] || counter.Status > 1)) rejected = true;
					break;
				case 'flamecharge': case 'sacredsword':
					if (counter.damagingMoves.length < 3 && !counter.setupType) rejected = true;
					if (!hasType['Grass'] && movePool.includes('swordsdance')) rejected = true;
					break;
				case 'fly': case 'storedpower':
					if (!counter.setupType) rejected = true;
					break;
				case 'focuspunch': case 'reversal':
					if (!hasMove['substitute'] || counter.damagingMoves.length < 2 || hasMove['liquidation']) rejected = true;
					break;
				case 'futuresight':
					if (!counter.Status || !hasMove['teleport']) rejected = true;
					break;
				case 'payback': case 'psychocut':
					if (!counter.Status || hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'rest':
					if (movePool.includes('sleeptalk')) rejected = true;
					if (!hasMove['sleeptalk'] && (movePool.includes('bulkup') || movePool.includes('calmmind') || movePool.includes('coil') || movePool.includes('curse'))) rejected = true;
					break;
				case 'sleeptalk':
					if (!hasMove['rest']) rejected = true;
					if (movePool.length > 1 && !hasAbility['Contrary']) {
						const rest = movePool.indexOf('rest');
						if (rest >= 0) this.fastPop(movePool, rest);
					}
					break;
				case 'switcheroo': case 'trick':
					if (counter.Physical + counter.Special < 3 || hasMove['futuresight'] || hasMove['rapidspin']) rejected = true;
					break;
				case 'trickroom':
					if (counter.damagingMoves.length < 2 || movePool.includes('nastyplot') || isLead) rejected = true;
					break;
				case 'zenheadbutt':
					if (movePool.includes('boltstrike')) rejected = true;
					break;

				// Set up once and only if we have the moves for it
				case 'bellydrum': case 'bulkup': case 'coil': case 'curse': case 'dragondance': case 'honeclaws': case 'swordsdance':
					if (counter.setupType !== 'Physical') rejected = true;
					if (counter.Physical + counter['physicalpool'] < 2 && (!hasMove['rest'] || !hasMove['sleeptalk'])) rejected = true;
					if (moveid === 'swordsdance' && hasMove['dragondance']) rejected = true;
					isSetup = true;
					break;
				case 'calmmind': case 'nastyplot':
					if (counter.setupType !== 'Special') rejected = true;
					if (counter.Special + counter['specialpool'] < 2 && (!hasMove['rest'] || !hasMove['sleeptalk']) && (!hasMove['wish'] || !hasMove['protect'])) rejected = true;
					if (hasMove['healpulse'] || moveid === 'calmmind' && hasMove['trickroom']) rejected = true;
					isSetup = true;
					break;
				case 'quiverdance':
					isSetup = true;
					break;
				case 'clangoroussoul': case 'shellsmash': case 'workup':
					if (counter.setupType !== 'Mixed') rejected = true;
					if (counter.damagingMoves.length + counter['physicalpool'] + counter['specialpool'] < 2) rejected = true;
					isSetup = true;
					break;
				case 'agility': case 'autotomize': case 'rockpolish': case 'shiftgear':
					if (counter.damagingMoves.length < 2 || hasMove['rest']) rejected = true;
					if (movePool.includes('calmmind') || movePool.includes('nastyplot')) rejected = true;
					if (!counter.setupType) isSetup = true;
					break;

				// Bad after setup
				case 'counter': case 'irontail':
					if (counter.setupType) rejected = true;
					break;
				case 'firstimpression': case 'glare': case 'icywind': case 'tailwind': case 'waterspout':
					if (counter.setupType || !!counter['speedsetup'] || hasMove['rest']) rejected = true;
					break;
				case 'bulletpunch': case 'rockblast':
					if (!!counter['speedsetup'] || counter.damagingMoves.length < 2) rejected = true;
					break;
				case 'circlethrow': case 'leechseed': case 'teleport':
					if (counter.setupType || !!counter['speedsetup']) rejected = true;
					break;
				case 'closecombat': case 'flashcannon':
					if ((hasMove['substitute'] && !hasType['Fighting']) || hasMove['toxic'] && movePool.includes('substitute')) rejected = true;
					if (moveid === 'closecombat' && (hasMove['highjumpkick'] || movePool.includes('highjumpkick')) && !counter.setupType) rejected = true;
					break;
				case 'dracometeor': case 'stormthrow':
					if (hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'fakeout':
					if (counter.setupType || hasMove['protect'] || hasMove['rapidspin'] || hasMove['substitute'] || hasMove['uturn']) rejected = true;
					break;
				case 'healingwish': case 'memento':
					if (counter.setupType || !!counter['recovery'] || hasMove['substitute'] || hasMove['uturn']) rejected = true;
					break;
				case 'highjumpkick': case 'machpunch':
					if (hasMove['curse']) rejected = true;
					break;
				case 'leechseed': case 'teleport':
					if (counter.setupType || !!counter['speedsetup']) rejected = true;
					break;
				case 'partingshot':
					if (!!counter['speedsetup'] || hasMove['bulkup'] || hasMove['uturn']) rejected = true;
					break;
				case 'protect':
					if ((counter.setupType && !hasMove['wish'] && !isDoubles) || hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					if (counter.Status < 2 && !hasAbility['Hunger Switch'] && !hasAbility['Speed Boost'] && !isDoubles) rejected = true;
					if (movePool.includes('leechseed') || movePool.includes('toxic') && !hasMove['wish']) rejected = true;
					if (isDoubles && (movePool.includes('fakeout') || movePool.includes('shellsmash') || movePool.includes('spore') || hasMove['tailwind'])) rejected = true;
					break;
				case 'rapidspin':
					if (hasMove['curse'] || hasMove['nastyplot'] || hasMove['shellsmash'] || teamDetails.rapidSpin) rejected = true;
					if (counter.setupType && counter['Fighting'] >= 2) rejected = true;
					break;
				case 'shadowsneak':
					if (hasMove['trickroom'] || !hasType['Ghost'] && !!counter['recovery']) rejected = true;
					if (hasMove['substitute'] || hasMove['toxic'] || hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'spikes':
					if (counter.setupType || teamDetails.spikes && teamDetails.spikes > 1) rejected = true;
					break;
				case 'stealthrock':
					if (counter.setupType || !!counter['speedsetup'] || hasMove['rest'] || hasMove['substitute'] || hasMove['trickroom'] || teamDetails.stealthRock) rejected = true;
					break;
				case 'stickyweb':
					if (counter.setupType === 'Special' || teamDetails.stickyWeb) rejected = true;
					break;
				case 'superpower':
					if (hasMove['bellydrum'] || hasMove['substitute'] && !hasAbility['Contrary']) rejected = true;
					if (hasMove['hydropump'] || counter.Physical >= 4 && movePool.includes('uturn')) rejected = true;
					if (hasAbility['Contrary']) isSetup = true;
					break;
				case 'taunt':
					if (hasMove['nastyplot'] || hasMove['swordsdance']) rejected = true;
					break;
				case 'thunderwave': case 'voltswitch':
					if (counter.setupType || !!counter['speedsetup'] || hasMove['raindance']) rejected = true;
					if (isDoubles && (hasMove['electroweb'] || hasMove['nuzzle'])) rejected = true;
					break;
				case 'toxic':
					if (counter.setupType || hasMove['sludgewave'] || hasMove['thunderwave'] || hasMove['willowisp']) rejected = true;
					break;
				case 'toxicspikes':
					if (counter.setupType || teamDetails.toxicSpikes) rejected = true;
					break;
				case 'uturn':
					if (counter.setupType || hasType['Bug'] && counter.stab < 2 && counter.damagingMoves.length > 2) rejected = true;
					break;

				// Ineffective having both
				// Attacks:
				case 'explosion':
					if (!!counter['recovery'] || hasMove['painsplit'] || hasMove['wish']) rejected = true;
					if (!!counter['speedsetup'] || hasMove['curse'] || hasMove['drainpunch'] || hasMove['rockblast']) rejected = true;
					break;
				case 'facade':
					if (!!counter['recovery'] || movePool.includes('doubleedge')) rejected = true;
					break;
				case 'quickattack':
					if (!!counter['speedsetup'] || hasType['Rock'] && !!counter.Status) rejected = true;
					if (counter.Physical > 3 && movePool.includes('uturn')) rejected = true;
					break;
				case 'firefang':
					if (hasMove['fireblast'] && !counter.setupType) rejected = true;
					break;
				case 'firepunch': case 'flamethrower':
					if (hasMove['blazekick'] || hasMove['heatwave'] || hasMove['overheat'] || hasMove['shiftgear']) rejected = true;
					if (movePool.includes('bellydrum') || hasMove['earthquake'] && movePool.includes('substitute')) rejected = true;
					break;
				case 'overheat':
					if (hasMove['flareblitz'] || isDoubles && hasMove['calmmind']) rejected = true;
					break;
				case 'aquajet': case 'psychicfangs':
					if (hasMove['rapidspin'] || hasMove['taunt']) rejected = true;
					break;
				case 'aquatail': case 'flipturn': case 'retaliate':
					if (hasMove['aquajet'] || !!counter.Status) rejected = true;
					break;
				case 'hydropump':
					if (hasMove['scald'] && ((counter.Special < 4 && !hasMove['uturn']) || (species.types.length > 1 && counter.stab < 3))) rejected = true;
					break;
				case 'scald':
					if (hasMove['waterpulse']) rejected = true;
					break;
				case 'thunderbolt':
					if (hasMove['powerwhip']) rejected = true;
					break;
				case 'gigadrain':
					if (hasMove['uturn'] || hasType['Poison'] && !counter['Poison']) rejected = true;
					break;
				case 'leafblade':
					if ((hasMove['leafstorm'] || movePool.includes('leafstorm')) && counter.setupType !== 'Physical') rejected = true;
					break;
				case 'leafstorm':
					if (hasMove['gigadrain'] && !!counter.Status) rejected = true;
					if (isDoubles && hasMove['energyball']) rejected = true;
					break;
				case 'powerwhip':
					if (hasMove['leechlife'] || !hasType['Grass'] && counter.Physical > 3 && movePool.includes('uturn')) rejected = true;
					break;
				case 'woodhammer':
					if (hasMove['hornleech'] && counter.Physical < 4) rejected = true;
					break;
				case 'freezedry':
					if ((hasMove['blizzard'] && counter.setupType) || hasMove['icebeam'] && counter.Special < 4) rejected = true;
					if (movePool.includes('bodyslam') || movePool.includes('thunderwave') && hasType['Electric']) rejected = true;
					break;
				case 'bodypress':
					if (hasMove['mirrorcoat'] || hasMove['whirlwind']) rejected = true;
					if (hasMove['shellsmash'] || hasMove['earthquake'] && movePool.includes('shellsmash')) rejected = true;
					break;
				case 'circlethrow':
					if (hasMove['stormthrow'] && !hasMove['rest']) rejected = true;
					break;
				case 'drainpunch':
					if (hasMove['closecombat'] || !hasType['Fighting'] && movePool.includes('swordsdance')) rejected = true;
					break;
				case 'dynamicpunch':
					if (hasMove['closecombat'] || hasMove['facade']) rejected = true;
					break;
				case 'focusblast':
					if (movePool.includes('shellsmash') || hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'hammerarm':
					if (hasMove['fakeout']) rejected = true;
					break;
				case 'seismictoss':
					if (hasMove['protect'] && hasType['Water']) rejected = true;
					break;
				case 'poisonjab':
					if (!hasType['Poison'] && counter.Status >= 2) rejected = true;
					break;
				case 'earthquake':
					if (hasMove['bonemerang'] || hasMove['substitute'] && movePool.includes('toxic')) rejected = true;
					if (movePool.includes('bodypress') && movePool.includes('shellsmash')) rejected = true;
					if (isDoubles && (hasMove['earthpower'] || hasMove['highhorsepower'])) rejected = true;
					break;
				case 'scorchingsands':
					if (hasMove['earthpower'] || hasMove['toxic'] && movePool.includes('earthpower')) rejected = true;
					if (hasMove['willowisp']) rejected = true;
					break;
				case 'photongeyser':
					if (hasMove['morningsun']) rejected = true;
					break;
				case 'psychic':
					if ((hasMove['psyshock'] || hasMove['storedpower']) && counter.setupType) rejected = true;
					if (isDoubles && hasMove['psyshock']) rejected = true;
					break;
				case 'psyshock':
					if ((hasMove['psychic'] || hasAbility['Pixilate']) && counter.Special < 4 && !counter.setupType) rejected = true;
					if (hasAbility['Multiscale'] && !counter.setupType) rejected = true;
					if (isDoubles && hasMove['psychic']) rejected = true;
					break;
				case 'bugbuzz':
					if (hasMove['uturn'] && !counter.setupType) rejected = true;
					break;
				case 'leechlife':
					if (isDoubles && hasMove['lunge']) rejected = true;
					if (movePool.includes('firstimpression') || movePool.includes('spikes')) rejected = true;
					break;
				case 'stoneedge':
					if (hasMove['rockblast'] || hasMove['rockslide'] || !!counter.Status && movePool.includes('rockslide')) rejected = true;
					if (hasAbility['Guts'] && (!hasMove['dynamicpunch'] || hasMove['spikes'])) rejected = true;
					if (hasAbility['Iron Fist'] && movePool.includes('machpunch')) rejected = true;
					break;
				case 'airslash':
					if ((hasMove['hurricane'] && !counter.setupType) || hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					if (movePool.includes('flamethrower') || hasAbility['Simple'] && !!counter['recovery']) rejected = true;
					break;
				case 'bravebird':
					if (hasMove['dragondance']) rejected = true;
					break;
				case 'hurricane':
					if ((hasMove['airslash'] || movePool.includes('airslash')) && counter.setupType) rejected = true;
					break;
				case 'poltergeist':
					if (hasMove['knockoff']) rejected = true;
					break;
				case 'shadowball':
					if (hasAbility['Pixilate'] && (counter.setupType || counter.Status > 1)) rejected = true;
					if (isDoubles && hasMove ['phantomforce']) rejected = true;
					break;
				case 'shadowclaw':
					if (hasType['Steel'] && hasMove['shadowsneak'] && counter.Physical < 4) rejected = true;
					break;
				case 'dragonpulse': case 'spacialrend':
					if (hasMove['dracometeor'] && counter.Special < 4) rejected = true;
					break;
				case 'darkpulse':
					if ((hasMove['foulplay'] || hasMove['knockoff'] || hasMove['suckerpunch'] || hasMove['defog']) && counter.setupType !== 'Special') rejected = true;
					if (!hasType['Dark'] && !!counter.Status) rejected = true;
					break;
				case 'knockoff':
					if (hasMove['darkestlariat']) rejected = true;
					break;
				case 'suckerpunch':
					if (counter.damagingMoves.length < 2 || counter['Dark'] > 1 && !hasType['Dark']) rejected = true;
					if (hasMove['rest']) rejected = true;
					break;
				case 'meteormash':
					if (movePool.includes('extremespeed')) rejected = true;
					break;
				case 'dazzlinggleam':
					if (hasMove['fleurcannon'] || hasMove['moonblast'] || counter.setupType && hasMove['drainingkiss']) rejected = true;
					break;

				// Status:
				case 'bodyslam': case 'clearsmog':
					if (hasMove['sludgebomb'] || hasMove['toxic'] && !hasType['Normal']) rejected = true;
					if (hasMove['trick'] || movePool.includes('recover')) rejected = true;
					break;
				case 'haze':
					if ((hasMove['stealthrock'] || movePool.includes('stealthrock')) && !teamDetails.stealthRock) rejected = true;
					break;
				case 'hypnosis': case 'willowisp': case 'yawn':
					if (hasMove['thunderwave'] || hasMove['toxic']) rejected = true;
					break;
				case 'defog':
					if (hasMove['stealthrock'] || hasMove['toxicspikes'] || teamDetails.defog) rejected = true;
					if (counter.setupType || hasMove['hex'] && !hasMove['thunderwave'] && !hasMove['willowisp']) rejected = true;
					if (hasMove['energyball'] && !hasType['Grass']) rejected = true;
					break;
				case 'painsplit': case 'recover': case 'synthesis':
					if (hasMove['rest'] || hasMove['wish']) rejected = true;
					if (moveid === 'synthesis' && hasMove['gigadrain']) rejected = true;
					break;
				case 'roost':
					if (hasMove['stoneedge'] || hasMove['throatchop']) rejected = true;
					break;
				case 'reflect': case 'lightscreen':
					if (teamDetails.screens) rejected = true;
					break;
				case 'substitute':
					if (hasMove['facade'] || hasMove['rest'] || hasMove['uturn']) rejected = true;
					if (movePool.includes('bulkup') || movePool.includes('painsplit') || movePool.includes('roost') || movePool.includes('calmmind') && !counter['recovery']) rejected = true;
					break;
				case 'wideguard':
					if (hasMove['protect']) rejected = true;
					break;
				}

				// This move doesn't satisfy our setup requirements:
				if (((move.category === 'Physical' && counter.setupType === 'Special') || (move.category === 'Special' && counter.setupType === 'Physical')) && moveid !== 'photongeyser') {
					// Reject STABs last in case the setup type changes later on
					const stabs: number = counter[species.types[0]] + (counter[species.types[1]] || 0);
					if (!hasType[move.type] || stabs > 1 || counter[move.category] < 2) rejected = true;
				}

				// Pokemon should have moves that benefit their types, stats, or ability
				if (!rejected && !move.damage && !isSetup && !move.weather && !move.stallingMove &&
					(isDoubles || (!['facade', 'lightscreen', 'reflect', 'sleeptalk', 'spore', 'substitute', 'toxic', 'whirlpool'].includes(moveid) && (move.category !== 'Status' || !move.flags.heal))) &&
					(!counter.setupType || counter.setupType === 'Mixed' || (move.category !== counter.setupType && move.category !== 'Status') || (counter[counter.setupType] + counter.Status > 3 && !counter.hazards)) &&
				(
					(!counter.stab && counter['physicalpool'] + counter['specialpool'] > 0) ||
					(hasType['Bug'] && movePool.includes('megahorn')) ||
					(hasType['Dark'] && (!counter['Dark'] || (hasMove['suckerpunch'] && (movePool.includes('knockoff') || movePool.includes('wickedblow'))))) ||
					(hasType['Dragon'] && !counter['Dragon'] && !hasMove['substitute'] && !(hasMove['rest'] && hasMove['sleeptalk'])) ||
					(hasType['Electric'] && (!counter['Electric'] || movePool.includes('thunder'))) ||
					(hasType['Fairy'] && !counter['Fairy'] && !hasType['Flying'] && !hasAbility['Pixilate']) ||
					(hasType['Fighting'] && (!counter['Fighting'] || !counter.stab)) ||
					(hasType['Fire'] && (!counter['Fire'] || movePool.includes('flareblitz')) && !hasMove['bellydrum']) ||
					((hasType['Flying'] || hasMove['swordsdance']) && !counter['Flying'] && (movePool.includes('airslash') || movePool.includes('bravebird') || movePool.includes('dualwingbeat') || movePool.includes('oblivionwing'))) ||
					(hasType['Ghost'] && (!counter['Ghost'] || movePool.includes('poltergeist') || movePool.includes('spectralthief')) && !counter['Dark']) ||
					(hasType['Grass'] && !counter['Grass'] && (species.baseStats.atk >= 100 || movePool.includes('leafstorm'))) ||
					(hasType['Ground'] && !counter['Ground']) ||
					(hasType['Ice'] && (!counter['Ice'] || movePool.includes('iciclecrash') || (hasAbility['Snow Warning'] && movePool.includes('blizzard')))) ||
					((hasType['Normal'] && hasAbility['Guts'] && movePool.includes('facade')) || (hasAbility['Pixilate'] && !counter['Normal'])) ||
					(hasType['Poison'] && !counter['Poison'] && (counter.setupType || hasAbility['Sheer Force'] || movePool.includes('gunkshot'))) ||
					(hasType['Psychic'] && !counter['Psychic'] && !hasType['Ghost'] && !hasType['Steel'] && (counter.setupType || hasAbility['Psychic Surge'] || movePool.includes('psychicfangs'))) ||
					(hasType['Rock'] && !counter['Rock'] && species.baseStats.atk >= 80) ||
					((hasType['Steel'] || hasAbility['Steelworker']) && (!counter['Steel'] || (hasMove['bulletpunch'] && counter.stab < 2)) && species.baseStats.atk >= 95) ||
					(hasType['Water'] && ((!counter['Water'] && !hasMove['hypervoice']) || movePool.includes('hypervoice'))) ||
					((hasAbility['Moody'] || hasMove['wish']) && movePool.includes('protect')) ||
					(((hasMove['lightscreen'] && movePool.includes('reflect')) || (hasMove['reflect'] && movePool.includes('lightscreen'))) && !teamDetails.screens) ||
					((movePool.includes('morningsun') || movePool.includes('recover') || movePool.includes('roost') || movePool.includes('slackoff') || movePool.includes('softboiled')) &&
						!!counter.Status && !counter.setupType && !hasMove['healingwish'] && !hasMove['switcheroo'] && !hasMove['trick'] && !hasMove['trickroom'] && !isDoubles) ||
					(movePool.includes('milkdrink') || movePool.includes('quiverdance') || movePool.includes('stickyweb') && !counter.setupType && !teamDetails.stickyWeb)
				)) {
					// Reject Status, non-STAB, or low basepower moves
					if (move.category === 'Status' || !hasType[move.type] || move.basePower < 50 && !move.multihit && !hasAbility['Technician']) {
						rejected = true;
					}
				}

				// Sleep Talk shouldn't be selected without Rest
				if (moveid === 'rest' && rejected) {
					const sleeptalk = movePool.indexOf('sleeptalk');
					if (sleeptalk >= 0) {
						if (movePool.length < 2) {
							rejected = false;
						} else {
							this.fastPop(movePool, sleeptalk);
						}
					}
				}

				// Remove rejected moves from the move list
				if (rejected && movePool.length) {
					if (move.category !== 'Status' && !move.damage) rejectedPool.push(moves[k]);
					moves.splice(k, 1);
					break;
				}
				if (rejected && rejectedPool.length) {
					moves.splice(k, 1);
					break;
				}
			}
		} while (moves.length < 4 && (movePool.length || rejectedPool.length));

		// const baseSpecies: Species = species.battleOnly && !species.requiredAbility ? this.dex.getSpecies(species.battleOnly as string) : species;
		const abilities: string[] = Object.values(species.abilities);
		abilities.sort((a, b) => this.dex.getAbility(b).rating - this.dex.getAbility(a).rating);
		let ability0 = this.dex.getAbility(abilities[0]);
		let ability1 = this.dex.getAbility(abilities[1]);
		let ability2 = this.dex.getAbility(abilities[2]);
		if (abilities[1]) {
			if (abilities[2] && ability1.rating <= ability2.rating && this.randomChance(1, 2)) {
				[ability1, ability2] = [ability2, ability1];
			}
			if (ability0.rating <= ability1.rating && this.randomChance(1, 2)) {
				[ability0, ability1] = [ability1, ability0];
			} else if (ability0.rating - 0.6 <= ability1.rating && this.randomChance(2, 3)) {
				[ability0, ability1] = [ability1, ability0];
			}
			ability = ability0.name;

			let rejectAbility: boolean;
			do {
				rejectAbility = false;
				if (['Cloud Nine', 'Flare Boost', 'Hydration', 'Ice Body', 'Innards Out', 'Insomnia', 'Misty Surge', 'Quick Feet', 'Rain Dish', 'Snow Cloak', 'Steadfast', 'Steam Engine', 'Weak Armor'].includes(ability)) {
					rejectAbility = true;
				} else if (['Adaptability', 'Contrary', 'Serene Grace', 'Skill Link', 'Strong Jaw'].includes(ability)) {
					rejectAbility = !counter[toID(ability)];
				} else if (ability === 'Analytic') {
					rejectAbility = (hasMove['rapidspin'] || species.nfe || isDoubles);
				} else if (ability === 'Bulletproof' || ability === 'Overcoat') {
					rejectAbility = (counter.setupType && hasAbility['Soundproof']);
				} else if (ability === 'Chlorophyll') {
					rejectAbility = (species.baseStats.spe > 100 || !counter['Fire'] && !hasMove['sunnyday'] && !teamDetails['sun']);
				} else if (ability === 'Competitive') {
					rejectAbility = (counter['Special'] < 2 || hasMove['rest'] && hasMove['sleeptalk']);
				} else if (ability === 'Compound Eyes' || ability === 'No Guard') {
					rejectAbility = !counter['inaccurate'];
				} else if (ability === 'Cursed Body') {
					rejectAbility = hasAbility['Infiltrator'];
				} else if (ability === 'Defiant') {
					rejectAbility = !counter['Physical'];
				} else if (ability === 'Download') {
					rejectAbility = counter.damagingMoves.length < 3;
				} else if (ability === 'Early Bird') {
					rejectAbility = (hasType['Grass'] && isDoubles);
				} else if (ability === 'Flash Fire') {
					rejectAbility = (this.dex.getEffectiveness('Fire', species) < -1 || hasAbility['Drought']);
				} else if (ability === 'Gluttony') {
					rejectAbility = !hasMove['bellydrum'];
				} else if (ability === 'Guts') {
					rejectAbility = (!hasMove['facade'] && !hasMove['sleeptalk'] && !species.nfe);
				} else if (ability === 'Harvest') {
					rejectAbility = (hasAbility['Frisk'] && !isDoubles);
				} else if (ability === 'Hustle' || ability === 'Inner Focus') {
					rejectAbility = counter.Physical < 2;
				} else if (ability === 'Infiltrator') {
					rejectAbility = ((hasMove['rest'] && hasMove['sleeptalk']) || isDoubles && hasAbility['Clear Body']);
				} else if (ability === 'Intimidate') {
					rejectAbility = (hasMove['bodyslam'] || hasMove['bounce'] || hasMove['tripleaxel']);
				} else if (ability === 'Iron Fist') {
					rejectAbility = (counter['ironfist'] < 2 || hasMove['dynamicpunch']);
				} else if (ability === 'Justified') {
					rejectAbility = (isDoubles && hasAbility['Inner Focus']);
				} else if (ability === 'Lightning Rod') {
					rejectAbility = species.types.includes('Ground');
				} else if (ability === 'Limber') {
					rejectAbility = species.types.includes('Electric');
				} else if (ability === 'Liquid Voice') {
					rejectAbility = !hasMove['hypervoice'];
				} else if (ability === 'Magic Guard') {
					rejectAbility = (hasAbility['Tinted Lens'] && !counter.Status && !isDoubles);
				} else if (ability === 'Mold Breaker') {
					rejectAbility = (hasAbility['Adaptability'] || hasAbility['Scrappy'] || (hasAbility['Sheer Force'] && !!counter['sheerforce']) || hasAbility['Unburden'] && counter.setupType);
				} else if (ability === 'Moxie') {
					rejectAbility = (!counter['Physical'] || hasMove['stealthrock']);
				} else if (ability === 'Neutralizing Gas') {
					rejectAbility = !hasMove['toxicspikes'];
				} else if (ability === 'Overgrow') {
					rejectAbility = !counter['Grass'];
				} else if (ability === 'Own Tempo') {
					rejectAbility = isDoubles;
				} else if (ability === 'Power Construct') {
					rejectAbility = true;
				} else if (ability === 'Prankster') {
					rejectAbility = !counter['Status'];
				} else if (ability === 'Pressure') {
					rejectAbility = (counter.setupType || counter.Status < 2 || isDoubles);
				} else if (ability === 'Refrigerate') {
					rejectAbility = !counter['Normal'];
				} else if (ability === 'Regenerator') {
					rejectAbility = hasAbility['Magic Guard'];
				} else if (ability === 'Reckless' || ability === 'Rock Head') {
					rejectAbility = !counter['recoil'];
				} else if (ability === 'Sand Force' || ability === 'Sand Veil') {
					rejectAbility = !teamDetails['sand'];
				} else if (ability === 'Sand Rush') {
					rejectAbility = (!teamDetails['sand'] && (!counter.setupType || !counter['Rock'] || hasMove['rapidspin']));
				} else if (ability === 'Sap Sipper') {
					rejectAbility = hasMove['roost'];
				} else if (ability === 'Scrappy') {
					rejectAbility = (hasMove['earthquake'] && hasMove['milkdrink']);
				} else if (ability === 'Screen Cleaner') {
					rejectAbility = !!teamDetails['screens'];
				} else if (ability === 'Shadow Tag') {
					rejectAbility = (species.name === 'Gothitelle' && !isDoubles);
				} else if (ability === 'Shed Skin') {
					rejectAbility = hasMove['dragondance'];
				} else if (ability === 'Sheer Force') {
					rejectAbility = (!counter['sheerforce'] || hasAbility['Guts']);
				} else if (ability === 'Slush Rush') {
					rejectAbility = (!teamDetails['hail'] && !hasAbility['Swift Swim']);
				} else if (ability === 'Sniper') {
					rejectAbility = (counter['Water'] > 1 && !hasMove['focusenergy']);
				} else if (ability === 'Steely Spirit') {
					rejectAbility = (hasMove['fakeout'] && !isDoubles);
				} else if (ability === 'Sturdy') {
					rejectAbility = (!!counter['recoil'] || hasAbility['Solid Rock']);
				} else if (ability === 'Swarm') {
					rejectAbility = (!counter['Bug'] || !!counter['recovery']);
				} else if (ability === 'Sweet Veil') {
					rejectAbility = hasType['Grass'];
				} else if (ability === 'Swift Swim') {
					rejectAbility = (!hasMove['raindance'] && (hasAbility['Intimidate'] || hasAbility['Rock Head'] || hasAbility['Slush Rush'] || hasAbility['Water Absorb']));
				} else if (ability === 'Synchronize') {
					rejectAbility = (counter.setupType || counter.Status < 2);
				} else if (ability === 'Technician') {
					rejectAbility = (!counter['technician'] || hasMove['tailslap'] || hasAbility['Punk Rock'] || movePool.includes('snarl'));
				} else if (ability === 'Tinted Lens') {
					rejectAbility = (hasMove['defog'] || hasMove['hurricane'] || counter.Status > 2 && !counter.setupType);
				} else if (ability === 'Torrent') {
					rejectAbility = (hasMove['focusenergy'] || hasMove['hypervoice']);
				} else if (ability === 'Tough Claws') {
					rejectAbility = (hasType['Steel'] && !hasMove['fakeout']);
				} else if (ability === 'Triage') {
					rejectAbility = !counter['drain'];
				} else if (ability === 'Unaware') {
					rejectAbility = (counter.setupType || hasMove['stealthrock']);
				} else if (ability === 'Unburden') {
					rejectAbility = (hasAbility['Prankster'] || !counter.setupType && !isDoubles);
				} else if (ability === 'Volt Absorb') {
					rejectAbility = (this.dex.getEffectiveness('Electric', species) < -1);
				} else if (ability === 'Water Absorb') {
					rejectAbility = (hasMove['raindance'] || hasAbility['Drizzle'] || hasAbility['Strong Jaw'] || hasAbility['Unaware'] || hasAbility['Volt Absorb']);
				}

				if (rejectAbility) {
					if (ability === ability0.name && ability1.rating >= 1) {
						ability = ability1.name;
					} else if (ability === ability1.name && abilities[2] && ability2.rating >= 1) {
						ability = ability2.name;
					} else {
						// Default to the highest rated ability if all are rejected
						ability = abilities[0];
						rejectAbility = false;
					}
				}
			} while (rejectAbility);

			if (species.name === 'Azumarill' && !isDoubles) {
				ability = 'Sap Sipper';
			} else if (forme === 'Copperajah' && gmax) {
				ability = 'Heavy Metal';
			} else if (hasAbility['Guts'] && (hasMove['facade'] || (hasMove['rest'] && hasMove['sleeptalk']))) {
				ability = 'Guts';
			} else if (hasAbility['Moxie'] && (counter.Physical > 3 || hasMove['bounce']) && !isDoubles) {
				ability = 'Moxie';
			} else if (isDoubles) {
				if (hasAbility['Competitive'] && ability !== 'Shadow Tag' && ability !== 'Strong Jaw') ability = 'Competitive';
				if (hasAbility['Friend Guard']) ability = 'Friend Guard';
				if (hasAbility['Gluttony'] && hasMove['recycle']) ability = 'Gluttony';
				if (hasAbility['Guts']) ability = 'Guts';
				if (hasAbility['Harvest']) ability = 'Harvest';
				if (hasAbility['Intimidate']) ability = 'Intimidate';
				if (hasAbility['Klutz'] && ability === 'Limber') ability = 'Klutz';
				if (hasAbility['Magic Guard'] && ability !== 'Friend Guard' && ability !== 'Unaware') ability = 'Magic Guard';
				if (hasAbility['Ripen']) ability = 'Ripen';
				if (hasAbility['Stalwart']) ability = 'Stalwart';
				if (hasAbility['Storm Drain']) ability = 'Storm Drain';
				if (hasAbility['Telepathy'] && (ability === 'Pressure' || hasAbility['Analytic'])) ability = 'Telepathy';
				if (hasAbility['Triage']) ability = 'Triage';
			}
		} else {
			ability = ability0.name;
		}

		item = !isDoubles ? 'Leftovers' : 'Sitrus Berry';
		if (species.requiredItems) {
			item = this.sample(species.requiredItems);

		// First, the extra high-priority items
		} else if (species.name === 'Eternatus' && counter.Status < 2) {
			item = 'Metronome';
		} else if (species.name === 'Farfetch\u2019d') {
			item = 'Leek';
		} else if (species.name === 'Froslass' && !isDoubles) {
			item = 'Wide Lens';
		} else if (species.name === 'Lopunny') {
			item = isDoubles ? 'Iron Ball' : 'Toxic Orb';
		} else if (species.baseSpecies === 'Marowak') {
			item = 'Thick Club';
		} else if (species.name === 'Oranguru') {
			item = 'Colbur Berry';
		} else if (species.baseSpecies === 'Pikachu') {
			forme = 'Pikachu' + this.sample(['', '-Original', '-Hoenn', '-Sinnoh', '-Unova', '-Kalos', '-Alola', '-Partner']);
			item = 'Light Ball';
		} else if (species.name === 'Shedinja') {
			item = (!teamDetails.defog && !teamDetails.rapidSpin && !isDoubles) ? 'Heavy-Duty Boots' : 'Focus Sash';
		} else if (species.name === 'Shuckle' && hasMove['stickyweb']) {
			item = 'Mental Herb';
		} else if (species.name === 'Tangrowth' && !!counter.Status && !isDoubles) {
			item = 'Rocky Helmet';
		} else if (species.name === 'Unfezant' || hasMove['focusenergy']) {
			item = 'Scope Lens';
		} else if (species.name === 'Wobbuffet' || ['Cheek Pouch', 'Harvest', 'Ripen'].includes(ability)) {
			item = 'Sitrus Berry';
		} else if (ability === 'Gluttony') {
			item = this.sample(['Aguav', 'Figy', 'Iapapa', 'Mago', 'Wiki']) + ' Berry';
		} else if (ability === 'Gorilla Tactics' || ability === 'Imposter' || (ability === 'Magnet Pull' && hasMove['bodypress'] && !isDoubles)) {
			item = 'Choice Scarf';
		} else if (hasMove['trick'] || hasMove['switcheroo'] && !isDoubles) {
			if (species.baseStats.spe >= 60 && species.baseStats.spe <= 108 && !counter['priority']) {
				item = 'Choice Scarf';
			} else {
				item = (counter.Physical > counter.Special) ? 'Choice Band' : 'Choice Specs';
			}
		} else if (species.evos.length && !hasMove['uturn']) {
			item = 'Eviolite';
		} else if (hasMove['bellydrum']) {
			item = (!!counter['priority'] || !hasMove['substitute']) ? 'Sitrus Berry' : 'Salac Berry';
		} else if (hasMove['geomancy'] || hasMove['meteorbeam']) {
			item = 'Power Herb';
		} else if (hasMove['shellsmash']) {
			item = (ability === 'Sturdy' && !isLead && !isDoubles) ? 'Heavy-Duty Boots' : 'White Herb';
		} else if (ability === 'Guts' && (counter.Physical > 2 || isDoubles)) {
			item = hasType['Fire'] ? 'Toxic Orb' : 'Flame Orb';
		} else if (ability === 'Magic Guard' && counter.damagingMoves.length > 1) {
			item = hasMove['counter'] ? 'Focus Sash' : 'Life Orb';
		} else if (ability === 'Sheer Force' && !!counter['sheerforce']) {
			item = 'Life Orb';
		} else if (ability === 'Unburden') {
			item = (hasMove['closecombat'] || hasMove['curse']) ? 'White Herb' : 'Sitrus Berry';
		} else if (hasMove['acrobatics']) {
			item = (ability === 'Grassy Surge') ? 'Grassy Seed' : '';
		} else if (hasMove['auroraveil'] || hasMove['lightscreen'] && hasMove['reflect']) {
			item = 'Light Clay';
		} else if (hasMove['rest'] && !hasMove['sleeptalk'] && ability !== 'Shed Skin') {
			item = 'Chesto Berry';
		} else if (hasMove['substitute'] && hasMove['reversal']) {
			item = 'Liechi Berry';
		} else if (this.dex.getEffectiveness('Rock', species) >= 2 && !isDoubles) {
			item = 'Heavy-Duty Boots';

		// Doubles
		} else if (isDoubles && (hasMove['eruption'] || hasMove['waterspout']) && counter.damagingMoves.length >= 4) {
			item = 'Choice Scarf';
		} else if (isDoubles && hasMove['blizzard'] && ability !== 'Snow Warning' && !teamDetails['hail']) {
			item = 'Blunder Policy';
		} else if (isDoubles && this.dex.getEffectiveness('Rock', species) >= 2 && !hasType['Flying']) {
			item = 'Heavy-Duty Boots';
		} else if (isDoubles && counter.Physical >= 4 && (hasType['Dragon'] || hasType['Fighting'] || hasMove['flipturn'] || hasMove['uturn']) &&
			!hasMove['fakeout'] && !hasMove['feint'] && !hasMove['rapidspin'] && !hasMove['suckerpunch']
		) {
			item = (!counter['priority'] && !hasAbility['Speed Boost'] && !hasMove['aerialace'] && species.baseStats.spe >= 60 && species.baseStats.spe <= 100 && this.randomChance(1, 2)) ? 'Choice Scarf' : 'Choice Band';
		} else if (isDoubles && ((counter.Special >= 4 && (hasType['Dragon'] || hasType ['Fighting'] || hasMove['voltswitch'])) || (counter.Special >= 3 && (hasMove['flipturn'] || hasMove['uturn'])) &&
			!hasMove['acidspray'] && !hasMove['electroweb'])
		) {
			item = (species.baseStats.spe >= 60 && species.baseStats.spe <= 100 && this.randomChance(1, 2)) ? 'Choice Scarf' : 'Choice Specs';
		} else if (isDoubles && counter.damagingMoves.length >= 3 && species.baseStats.spe >= 60 && ability !== 'Multiscale' && ability !== 'Sturdy' && !hasMove['acidspray'] && !hasMove['clearsmog'] && !hasMove['electroweb'] &&
			!hasMove['fakeout'] && !hasMove['feint'] && !hasMove['icywind'] && !hasMove['incinerate'] && !hasMove['naturesmadness'] && !hasMove['rapidspin'] && !hasMove['snarl'] && !hasMove['uturn']
		) {
			item = (species.baseStats.hp + species.baseStats.def + species.baseStats.spd >= 275) ? 'Sitrus Berry' : 'Life Orb';

		// Medium priority
		} else if (counter.Physical >= 4 && ability !== 'Serene Grace' && !hasMove['fakeout'] && !hasMove['flamecharge'] && !hasMove['rapidspin'] && (!hasMove['tailslap'] || hasMove['uturn']) && !isDoubles) {
			const scarfReq = (species.baseStats.atk >= 100 || ability === 'Huge Power') && species.baseStats.spe >= 60 && species.baseStats.spe <= 108;
			if (scarfReq && !counter['priority'] && ability !== 'Speed Boost' && !hasMove['bounce'] && this.randomChance(2, 3)) {
				item = 'Choice Scarf';
			} else {
				item = 'Choice Band';
			}
		} else if (counter.Physical >= 3 && (hasMove['copycat'] || hasMove['partingshot']) && !hasMove['fakeout'] && !hasMove['rapidspin'] && !isDoubles) {
			item = 'Choice Band';
		} else if ((counter.Special >= 4 || (counter.Special >= 3 && (hasMove['flipturn'] || hasMove['partingshot'] || hasMove['uturn']))) && !isDoubles) {
			if (species.baseStats.spa >= 100 && species.baseStats.spe >= 60 && species.baseStats.spe <= 108 && !counter.Physical && ability !== 'Tinted Lens' && this.randomChance(2, 3)) {
				item = 'Choice Scarf';
			} else {
				item = 'Choice Specs';
			}
		} else if (((counter.Physical >= 3 && hasMove['defog']) || (counter.Special >= 3 && hasMove['healingwish'])) && !counter['priority'] && !hasMove['uturn'] && !isDoubles) {
			item = 'Choice Scarf';
		} else if (hasMove['raindance'] || hasMove['sunnyday'] || (ability === 'Speed Boost' && hasMove['destinybond']) || ability === 'Stance Change' && counter.Physical + counter.Special > 2) {
			item = 'Life Orb';
		} else if (this.dex.getEffectiveness('Rock', species) >= 1 && (['Defeatist', 'Emergency Exit', 'Multiscale'].includes(ability) || hasMove['courtchange'] || hasMove['defog'] || hasMove['rapidspin']) && !isDoubles) {
			item = 'Heavy-Duty Boots';
		} else if (species.name === 'Necrozma-Dusk-Mane' || (this.dex.getEffectiveness('Ground', species) < 2 && !!counter['speedsetup'] &&
			counter.damagingMoves.length >= 3 && species.baseStats.hp + species.baseStats.def + species.baseStats.spd >= 300)
		) {
			item = 'Weakness Policy';
		} else if (counter.damagingMoves.length >= 4 && species.baseStats.hp + species.baseStats.def + species.baseStats.spd >= 235) {
			item = 'Assault Vest';
		} else if ((hasMove['clearsmog'] || hasMove['coil'] || hasMove['curse'] || hasMove['dragontail'] || hasMove['healbell'] || hasMove['protect'] || hasMove['sleeptalk']) && (ability === 'Moody' || !isDoubles)) {
			item = 'Leftovers';

		// Better than Leftovers
		} else if (isLead && !['Disguise', 'Sturdy'].includes(ability) && !hasMove['substitute'] && !counter['recoil'] && !counter['recovery'] && species.baseStats.hp + species.baseStats.def + species.baseStats.spd < 255 && !isDoubles) {
			item = 'Focus Sash';
		} else if (ability === 'Water Bubble' && !isDoubles) {
			item = 'Mystic Water';
		} else if (hasMove['clangoroussoul'] || hasMove['boomburst'] && !!counter['speedsetup']) {
			item = 'Throat Spray';
		} else if (((this.dex.getEffectiveness('Rock', species) >= 1 && (!teamDetails.defog || ability === 'Intimidate' || hasMove['uturn'] || hasMove['voltswitch'])) ||
			(hasMove['rapidspin'] && (ability === 'Regenerator' || !!counter['recovery']))) && !isDoubles
		) {
			item = 'Heavy-Duty Boots';
		} else if (this.dex.getEffectiveness('Ground', species) >= 2 && !hasType['Poison'] && ability !== 'Levitate' && !hasAbility['Iron Barbs'] && !isDoubles) {
			item = 'Air Balloon';
		} else if (counter.damagingMoves.length >= 4 && !counter['Dragon'] && !counter['Normal'] && !isDoubles) {
			item = 'Expert Belt';
		} else if (counter.damagingMoves.length >= 3 && !counter['damage'] && ability !== 'Sturdy' && !hasMove['clearsmog'] && !hasMove['foulplay'] && !hasMove['rapidspin'] && !hasMove['substitute'] && !hasMove['uturn'] && !isDoubles &&
			(!!counter['speedsetup'] || hasMove['trickroom'] || !!counter['drain'] || hasMove['psystrike'] || (species.baseStats.spe > 40 && species.baseStats.hp + species.baseStats.def + species.baseStats.spd < 275))
		) {
			item = 'Life Orb';
		} else if ((hasMove['dragondance'] || hasMove['swordsdance']) && !isDoubles &&
			(hasMove['outrage'] || !hasType['Bug'] && !hasType['Fire'] && !hasType['Ground'] && !hasType['Normal'] && !hasType['Poison'] && !['Pastel Veil', 'Storm Drain'].includes(ability))
		) {
			item = 'Lum Berry';
		}

		// For Trick / Switcheroo
		if (item === 'Leftovers' && hasType['Poison']) {
			item = 'Black Sludge';
		}

		const level: number = (!isDoubles ? species.randomBattleLevel : species.randomDoubleBattleLevel) || 80;

		// Prepare optimal HP
		const srWeakness = (ability === 'Magic Guard' || item === 'Heavy-Duty Boots' ? 0 : this.dex.getEffectiveness('Rock', species));
		while (evs.hp > 1) {
			const hp = Math.floor(Math.floor(2 * species.baseStats.hp + ivs.hp + Math.floor(evs.hp / 4) + 100) * level / 100 + 10);
			if (hasMove['substitute'] && (item === 'Sitrus Berry' || (hasMove['bellydrum'] && item === 'Salac Berry'))) {
				// Two Substitutes should activate Sitrus Berry
				if (hp % 4 === 0) break;
			} else if (hasMove['bellydrum'] && (item === 'Sitrus Berry' || ability === 'Gluttony')) {
				// Belly Drum should activate Sitrus Berry
				if (hp % 2 === 0) break;
			} else if (hasMove['substitute'] && hasMove['reversal']) {
				// Reversal users should be able to use four Substitutes
				if (hp % 4 > 0) break;
			} else {
				// Maximize number of Stealth Rock switch-ins
				if (srWeakness <= 0 || hp % (4 / srWeakness) > 0) break;
			}
			evs.hp -= 4;
		}

		if (hasMove['shellsidearm'] && item === 'Choice Specs') evs.atk -= 4;

		// Minimize confusion damage
		if (!counter['Physical'] && !hasMove['transform'] && (!hasMove['shellsidearm'] || !counter.Status)) {
			evs.atk = 0;
			ivs.atk = 0;
		}

		if (hasMove['gyroball'] || hasMove['trickroom']) {
			evs.spe = 0;
			ivs.spe = 0;
		}

		return {
			name: species.baseSpecies,
			species: forme,
			gender: species.gender,
			moves: moves,
			ability: ability,
			evs: evs,
			ivs: ivs,
			item: item,
			level: level,
			shiny: this.randomChance(1, 1024),
			gigantamax: gmax,
		};
	}

	getPokemonPool(type: string, pokemon: RandomTeamsTypes.RandomSet[] = [], isMonotype = false) {
		const exclude = pokemon.map(p => toID(p.species));
		const pokemonPool = [];
		for (const id in this.dex.data.FormatsData) {
			let species = this.dex.getSpecies(id);
			if (species.gen > this.gen || exclude.includes(species.id)) continue;
			if (isMonotype) {
				if (!species.types.includes(type)) continue;
				if (species.battleOnly && typeof species.battleOnly === 'string') {
					species = this.dex.getSpecies(species.battleOnly);
					if (!species.types.includes(type)) continue;
				}
			}
			pokemonPool.push(id);
		}
		return pokemonPool;
	}

	randomTeam() {
		const seed = this.prng.seed;
		const ruleTable = this.dex.getRuleTable(this.format);
		const pokemon = [];

		// For Monotype
		const isMonotype = ruleTable.has('sametypeclause');
		const typePool = Object.keys(this.dex.data.TypeChart);
		const type = this.sample(typePool);

		// PotD stuff
		let potd: Species | false = false;
		if (global.Config && Config.potd && ruleTable.has('potd')) {
			potd = this.dex.getSpecies(Config.potd);
		}

		const baseFormes: {[k: string]: number} = {};

		const tierCount: {[k: string]: number} = {};
		const typeCount: {[k: string]: number} = {};
		const typeComboCount: {[k: string]: number} = {};
		const teamDetails: RandomTeamsTypes.TeamDetails = {};

		// We make at most two passes through the potential Pokemon pool when creating a team - if the first pass doesn't
		// result in a team of six Pokemon we perform a second iteration relaxing as many restrictions as possible.
		for (const restrict of [true, false]) {
			if (pokemon.length >= 6) break;
			const pokemonPool = this.getPokemonPool(type, pokemon, isMonotype);
			while (pokemonPool.length && pokemon.length < 6) {
				let species = this.dex.getSpecies(this.sampleNoReplace(pokemonPool));
				if (!species.exists) continue;

				// Check if the forme has moves for random battle
				if (this.format.gameType === 'singles') {
					if (!species.randomBattleMoves) continue;
				} else {
					if (!species.randomDoubleBattleMoves) continue;
				}

				// Limit to one of each species (Species Clause)
				if (baseFormes[species.baseSpecies]) continue;

				// Adjust rate for species with multiple sets
				switch (species.baseSpecies) {
				case 'Arceus': case 'Silvally':
					if (this.randomChance(17, 18)) continue;
					break;
				case 'Castform':
					if (this.randomChance(2, 3)) continue;
					break;
				case 'Aegislash': case 'Basculin': case 'Cherrim': case 'Giratina': case 'Gourgeist': case 'Meloetta':
					if (this.randomChance(1, 2)) continue;
					break;
				case 'Greninja':
					if (this.gen >= 7 && this.randomChance(1, 2)) continue;
					break;
				case 'Darmanitan':
					if (species.gen === 8 && this.randomChance(1, 2)) continue;
					break;
				case 'Magearna': case 'Toxtricity': case 'Zacian': case 'Zamazenta':
				case 'Appletun': case 'Blastoise': case 'Butterfree': case 'Copperajah': case 'Grimmsnarl': case 'Inteleon': case 'Rillaboom': case 'Snorlax': case 'Urshifu':
					if (this.gen >= 8 && this.randomChance(1, 2)) continue;
					break;
				}

				// Illusion shouldn't be on the last slot
				if (species.name === 'Zoroark' && pokemon.length > 4) continue;

				const tier = species.tier;
				const types = species.types;
				const typeCombo = types.slice().sort().join();

				if (restrict) {
					// Limit one Pokemon per tier, two for Monotype
					if ((tierCount[tier] >= (isMonotype ? 2 : 1)) && !this.randomChance(1, Math.pow(5, tierCount[tier]))) {
						continue;
					}

					if (!isMonotype) {
						// Limit two of any type
						let skip = false;
						for (const typeName of types) {
							if (typeCount[typeName] > 1) {
								skip = true;
								break;
							}
						}
						if (skip) continue;
					}

					// Limit one of any type combination, two in Monotype
					if (typeComboCount[typeCombo] >= (isMonotype ? 2 : 1)) continue;
				}

				// The Pokemon of the Day
				if (!!potd && potd.exists && pokemon.length < 1) species = potd;

				const set = this.randomSet(species, teamDetails, pokemon.length === 0, this.format.gameType !== 'singles');

				// Okay, the set passes, add it to our team
				pokemon.push(set);

				if (pokemon.length === 6) {
					// Set Zoroark's level to be the same as the last Pokemon
					const illusion = teamDetails['illusion'];
					if (illusion) pokemon[illusion - 1].level = pokemon[5].level;

					// Don't bother tracking details for the 6th Pokemon
					break;
				}

				// Now that our Pokemon has passed all checks, we can increment our counters
				baseFormes[species.baseSpecies] = 1;

				// Increment tier counter
				if (tierCount[tier]) {
					tierCount[tier]++;
				} else {
					tierCount[tier] = 1;
				}

				// Increment type counters
				for (const typeName of types) {
					if (typeName in typeCount) {
						typeCount[typeName]++;
					} else {
						typeCount[typeName] = 1;
					}
				}
				if (typeCombo in typeComboCount) {
					typeComboCount[typeCombo]++;
				} else {
					typeComboCount[typeCombo] = 1;
				}

				// Track what the team has
				if (set.ability === 'Drizzle' || set.moves.includes('raindance')) teamDetails['rain'] = 1;
				if (set.ability === 'Drought' || set.moves.includes('sunnyday')) teamDetails['sun'] = 1;
				if (set.ability === 'Sand Stream') teamDetails['sand'] = 1;
				if (set.ability === 'Snow Warning') teamDetails['hail'] = 1;
				if (set.moves.includes('spikes')) teamDetails['spikes'] = (teamDetails['spikes'] || 0) + 1;
				if (set.moves.includes('stealthrock')) teamDetails['stealthRock'] = 1;
				if (set.moves.includes('stickyweb')) teamDetails['stickyWeb'] = 1;
				if (set.moves.includes('toxicspikes')) teamDetails['toxicSpikes'] = 1;
				if (set.moves.includes('defog')) teamDetails['defog'] = 1;
				if (set.moves.includes('rapidspin')) teamDetails['rapidSpin'] = 1;
				if (set.moves.includes('auroraveil') || set.moves.includes('reflect') && set.moves.includes('lightscreen')) teamDetails['screens'] = 1;

				// For setting Zoroark's level
				if (set.ability === 'Illusion') teamDetails['illusion'] = pokemon.length;
			}
		}
		if (pokemon.length < 6) throw new Error(`Could not build a random team for ${this.format} (seed=${seed})`);

		return pokemon;
	}

	/**
	 * @param {Template} template
	 * @param {number} slot
	 * @param {RandomTeamsTypes.FactoryTeamDetails} teamData
	 * @param {string} tier
	 * @return {RandomTeamsTypes.RandomFactorySet | false}
	 */
	randomFactorySet(template, slot, teamData, tier) {
		let speciesId = toID(template.species);
		// let flags = this.randomFactorySets[tier][speciesId].flags;
		let setList = this.randomFactorySets[tier][speciesId].sets;

		/**@type {{[k: string]: number}} */
		let itemsMax = {'choicespecs': 1, 'choiceband': 1, 'choicescarf': 1};
		/**@type {{[k: string]: number}} */
		let movesMax = {'rapidspin': 1, 'batonpass': 1, 'stealthrock': 1, 'defog': 1, 'spikes': 1, 'toxicspikes': 1};
		let requiredMoves = {'stealthrock': 'hazardSet', 'rapidspin': 'hazardClear', 'defog': 'hazardClear'};
		let weatherAbilitiesRequire = {
			'hydration': 'raindance', 'swiftswim': 'raindance',
			'leafguard': 'sunnyday', 'solarpower': 'sunnyday', 'chlorophyll': 'sunnyday',
			'sandforce': 'sandstorm', 'sandrush': 'sandstorm', 'sandveil': 'sandstorm',
			'slushrush': 'hail', 'snowcloak': 'hail',
		};
		let weatherAbilities = ['drizzle', 'drought', 'snowwarning', 'sandstream'];

		// Build a pool of eligible sets, given the team partners
		// Also keep track of sets with moves the team requires
		/**@type {{set: AnyObject, moveVariants?: number[]}[]} */
		let effectivePool = [];
		let priorityPool = [];
		for (const curSet of setList) {
			let item = this.dex.getItem(curSet.item);
			if (teamData.megaCount > 0 && item.megaStone) continue; // reject 2+ mega stones
			if (teamData.zCount && teamData.zCount > 0 && item.zMove) continue; // reject 2+ Z stones
			if (itemsMax[item.id] && teamData.has[item.id] >= itemsMax[item.id]) continue;

			let ability = this.dex.getAbility(curSet.ability);
			// @ts-ignore
			if (weatherAbilitiesRequire[ability.id] && teamData.weather !== weatherAbilitiesRequire[ability.id]) continue;
			if (teamData.weather && weatherAbilities.includes(ability.id)) continue; // reject 2+ weather setters

			let reject = false;
			let hasRequiredMove = false;
			let curSetVariants = [];
			for (const move of curSet.moves) {
				let variantIndex = this.random(move.length);
				let moveId = toID(move[variantIndex]);
				if (movesMax[moveId] && teamData.has[moveId] >= movesMax[moveId]) {
					reject = true;
					break;
				}
				// @ts-ignore
				if (requiredMoves[moveId] && !teamData.has[requiredMoves[moveId]]) {
					hasRequiredMove = true;
				}
				curSetVariants.push(variantIndex);
			}
			if (reject) continue;
			effectivePool.push({set: curSet, moveVariants: curSetVariants});
			if (hasRequiredMove) priorityPool.push({set: curSet, moveVariants: curSetVariants});
		}
		if (priorityPool.length) effectivePool = priorityPool;

		if (!effectivePool.length) {
			if (!teamData.forceResult) return false;
			for (const curSet of setList) {
				effectivePool.push({set: curSet});
			}
		}

		let setData = this.sample(effectivePool);
		let moves = [];
		for (const [i, moveSlot] of setData.set.moves.entries()) {
			moves.push(setData.moveVariants ? moveSlot[setData.moveVariants[i]] : this.sample(moveSlot));
		}

		let item = Array.isArray(setData.set.item) ? this.sample(setData.set.item) : setData.set.item;
		let ability = Array.isArray(setData.set.ability) ? this.sample(setData.set.ability) : setData.set.ability;
		let nature = Array.isArray(setData.set.nature) ? this.sample(setData.set.nature) : setData.set.nature;

		return {
			name: setData.set.name || template.baseSpecies,
			species: setData.set.species,
			gender: setData.set.gender || template.gender || (this.randomChance(1, 2) ? 'M' : 'F'),
			item: item || '',
			ability: ability || template.abilities['0'],
			shiny: typeof setData.set.shiny === 'undefined' ? this.randomChance(1, 1024) : setData.set.shiny,
			level: setData.set.level ? setData.set.level : tier === "LC" ? 5 : 100,
			happiness: typeof setData.set.happiness === 'undefined' ? 255 : setData.set.happiness,
			evs: Object.assign({hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}, setData.set.evs),
			ivs: Object.assign({hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31}, setData.set.ivs),
			nature: nature || 'Serious',
			moves: moves,
		};
	}

	/**
	 * @param {PlayerOptions} [side]
	 * @param {number} [depth]
	 * @return {RandomTeamsTypes.RandomFactorySet[]}
	 */
	randomFactoryTeam(side, depth = 0) {
		let forceResult = (depth >= 4);

		// The teams generated depend on the tier choice in such a way that
		// no exploitable information is leaked from rolling the tier in getTeam(p1).
		let availableTiers = ['Uber', 'OU', 'UU', 'RU', 'NU', 'PU', 'LC', 'Mono'];
		if (!this.FactoryTier) this.FactoryTier = this.sample(availableTiers);
		const chosenTier = this.FactoryTier;

		/**@type {{[k: string]: number}} */
		const tierValues = {
			'Uber': 5,
			'OU': 4, 'UUBL': 4,
			'UU': 3, 'RUBL': 3,
			'RU': 2, 'NUBL': 2,
			'NU': 1, 'PUBL': 1,
			'PU': 0,
		};

		let pokemon = [];
		let pokemonPool = Object.keys(this.randomFactorySets[chosenTier]);

		let typePool = Object.keys(this.dex.data.TypeChart);
		const type = this.sample(typePool);

		/**@type {TeamData} */
		let teamData = {typeCount: {}, typeComboCount: {}, baseFormes: {}, megaCount: 0, zCount: 0, has: {}, forceResult: forceResult, weaknesses: {}, resistances: {}};
		let requiredMoveFamilies = ['hazardSet', 'hazardClear'];
		/**@type {{[k: string]: string}} */
		let requiredMoves = {'stealthrock': 'hazardSet', 'rapidspin': 'hazardClear', 'defog': 'hazardClear'};
		/**@type {{[k: string]: string}} */
		let weatherAbilitiesSet = {'drizzle': 'raindance', 'drought': 'sunnyday', 'snowwarning': 'hail', 'sandstream': 'sandstorm'};
		/**@type {{[k: string]: string[]}} */
		let resistanceAbilities = {
			'dryskin': ['Water'], 'waterabsorb': ['Water'], 'stormdrain': ['Water'],
			'flashfire': ['Fire'], 'heatproof': ['Fire'],
			'lightningrod': ['Electric'], 'motordrive': ['Electric'], 'voltabsorb': ['Electric'],
			'sapsipper': ['Grass'],
			'thickfat': ['Ice', 'Fire'],
			'levitate': ['Ground'],
		};

		while (pokemonPool.length && pokemon.length < 6) {
			let template = this.dex.getTemplate(this.sampleNoReplace(pokemonPool));
			if (!template.exists) continue;

			// Lessen the need of deleting sets of Pokemon after tier shifts
			if (chosenTier in tierValues && template.tier in tierValues && tierValues[template.tier] > tierValues[chosenTier]) continue;

			let speciesFlags = this.randomFactorySets[chosenTier][template.speciesid].flags;

			// Limit to one of each species (Species Clause)
			if (teamData.baseFormes[template.baseSpecies]) continue;

			// Limit the number of Megas to one
			if (teamData.megaCount >= 1 && speciesFlags.megaOnly) continue;

			let set = this.randomFactorySet(template, pokemon.length, teamData, chosenTier);
			if (!set) continue;

			let itemData = this.dex.getItem(set.item);

			// Actually limit the number of Megas to one
			if (teamData.megaCount >= 1 && itemData.megaStone) continue;

			// Limit the number of Z moves to one
			if (teamData.zCount >= 1 && itemData.zMove) continue;

			let types = template.types;

			// Enforce Monotype
			if (chosenTier === 'Mono') {
				// Prevents Mega Evolutions from breaking the type limits
				if (itemData.megaStone) {
					let megaTemplate = this.dex.getTemplate(itemData.megaStone);
					if (types.length > megaTemplate.types.length) types = [template.types[0]];
					// Only check the second type because a Mega Evolution should always share the first type with its base forme.
					if (megaTemplate.types[1] && types[1] && megaTemplate.types[1] !== types[1]) {
						types = [megaTemplate.types[0]];
					}
				}
				if (!types.includes(type)) continue;
			} else {
			// If not Monotype, limit to two of each type
				let skip = false;
				for (const type of types) {
					if (teamData.typeCount[type] > 1 && this.randomChance(4, 5)) {
						skip = true;
						break;
					}
				}
				if (skip) continue;

				// Limit 1 of any type combination
				let typeCombo = types.slice().sort().join();
				if (set.ability + '' === 'Drought' || set.ability + '' === 'Drizzle') {
				// Drought and Drizzle don't count towards the type combo limit
					typeCombo = set.ability + '';
				}
				if (typeCombo in teamData.typeComboCount) continue;
			}

			// Okay, the set passes, add it to our team
			pokemon.push(set);
			let typeCombo = types.slice().sort().join();
			// Now that our Pokemon has passed all checks, we can update team data:
			for (const type of types) {
				if (type in teamData.typeCount) {
					teamData.typeCount[type]++;
				} else {
					teamData.typeCount[type] = 1;
				}
			}
			teamData.typeComboCount[typeCombo] = 1;

			teamData.baseFormes[template.baseSpecies] = 1;

			if (itemData.megaStone) teamData.megaCount++;
			if (itemData.zMove) teamData.zCount++;
			if (itemData.id in teamData.has) {
				teamData.has[itemData.id]++;
			} else {
				teamData.has[itemData.id] = 1;
			}

			let abilityData = this.dex.getAbility(set.ability);
			if (abilityData.id in weatherAbilitiesSet) {
				teamData.weather = weatherAbilitiesSet[abilityData.id];
			}

			for (const move of set.moves) {
				let moveId = toID(move);
				if (moveId in teamData.has) {
					teamData.has[moveId]++;
				} else {
					teamData.has[moveId] = 1;
				}
				if (moveId in requiredMoves) {
					teamData.has[requiredMoves[moveId]] = 1;
				}
			}

			for (let typeName in this.dex.data.TypeChart) {
				// Cover any major weakness (3+) with at least one resistance
				if (teamData.resistances[typeName] >= 1) continue;
				if (resistanceAbilities[abilityData.id] && resistanceAbilities[abilityData.id].includes(typeName) || !this.dex.getImmunity(typeName, types)) {
					// Heuristic: assume that Pokémon with these abilities don't have (too) negative typing.
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
					continue;
				}
				let typeMod = this.dex.getEffectiveness(typeName, types);
				if (typeMod < 0) {
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
				} else if (typeMod > 0) {
					teamData.weaknesses[typeName] = (teamData.weaknesses[typeName] || 0) + 1;
				}
			}
		}
		if (pokemon.length < 6) return this.randomFactoryTeam(side, ++depth);

		// Quality control
		if (!teamData.forceResult) {
			for (const requiredFamily of requiredMoveFamilies) {
				if (!teamData.has[requiredFamily]) return this.randomFactoryTeam(side, ++depth);
			}
			for (let type in teamData.weaknesses) {
				if (teamData.weaknesses[type] >= 3) return this.randomFactoryTeam(side, ++depth);
			}
		}

		return pokemon;
	}

	/**
	 * @param {Template} template
	 * @param {number} slot
	 * @param {RandomTeamsTypes.FactoryTeamDetails} teamData
	 * @return {RandomTeamsTypes.RandomFactorySet | false}
	 */
	randomBSSFactorySet(template, slot, teamData) {
		let speciesId = toID(template.species);
		// let flags = this.randomBSSFactorySets[tier][speciesId].flags;
		let setList = this.randomBSSFactorySets[speciesId].sets;

		/**@type {{[k: string]: number}} */
		let movesMax = {'batonpass': 1, 'stealthrock': 1, 'spikes': 1, 'toxicspikes': 1, 'doubleedge': 1, 'trickroom': 1};
		/**@type {{[k: string]: string}} */
		let requiredMoves = {};
		/**@type {{[k: string]: string}} */
		let weatherAbilitiesRequire = {
			'swiftswim': 'raindance',
			'sandrush': 'sandstorm', 'sandveil': 'sandstorm',
		};
		let weatherAbilities = ['drizzle', 'drought', 'snowwarning', 'sandstream'];

		// Build a pool of eligible sets, given the team partners
		// Also keep track of sets with moves the team requires
		/**@type {{set: AnyObject, moveVariants?: number[], itemVariants?: number, abilityVariants?: number}[]} */
		let effectivePool = [];
		let priorityPool = [];
		for (const curSet of setList) {
			let item = this.dex.getItem(curSet.item);
			if (teamData.megaCount > 1 && item.megaStone) continue; // reject 3+ mega stones
			if (teamData.zCount && teamData.zCount > 1 && item.zMove) continue; // reject 3+ Z stones
			if (teamData.has[item.id]) continue; // Item clause

			let ability = this.dex.getAbility(curSet.ability);
			if (weatherAbilitiesRequire[ability.id] && teamData.weather !== weatherAbilitiesRequire[ability.id]) continue;
			if (teamData.weather && weatherAbilities.includes(ability.id)) continue; // reject 2+ weather setters

			if (curSet.species === 'Aron' && teamData.weather !== 'sandstorm') continue; // reject Aron without a Sand Stream user

			let reject = false;
			let hasRequiredMove = false;
			let curSetVariants = [];
			for (const move of curSet.moves) {
				let variantIndex = this.random(move.length);
				let moveId = toID(move[variantIndex]);
				if (movesMax[moveId] && teamData.has[moveId] >= movesMax[moveId]) {
					reject = true;
					break;
				}
				if (requiredMoves[moveId] && !teamData.has[requiredMoves[moveId]]) {
					hasRequiredMove = true;
				}
				curSetVariants.push(variantIndex);
			}
			if (reject) continue;
			effectivePool.push({set: curSet, moveVariants: curSetVariants});
			if (hasRequiredMove) priorityPool.push({set: curSet, moveVariants: curSetVariants});
		}
		if (priorityPool.length) effectivePool = priorityPool;

		if (!effectivePool.length) {
			if (!teamData.forceResult) return false;
			for (const curSet of setList) {
				effectivePool.push({set: curSet});
			}
		}

		let setData = this.sample(effectivePool);
		let moves = [];
		for (const [i, moveSlot] of setData.set.moves.entries()) {
			moves.push(setData.moveVariants ? moveSlot[setData.moveVariants[i]] : this.sample(moveSlot));
		}

		return {
			name: setData.set.nickname || setData.set.name || template.baseSpecies,
			species: setData.set.species,
			gender: setData.set.gender || template.gender || (this.randomChance(1, 2) ? 'M' : 'F'),
			item: setData.set.item || '',
			ability: setData.set.ability || template.abilities['0'],
			shiny: typeof setData.set.shiny === 'undefined' ? this.randomChance(1, 1024) : setData.set.shiny,
			level: setData.set.level || 50,
			happiness: typeof setData.set.happiness === 'undefined' ? 255 : setData.set.happiness,
			evs: Object.assign({hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}, setData.set.evs),
			ivs: Object.assign({hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31}, setData.set.ivs),
			nature: setData.set.nature || 'Serious',
			moves: moves,
		};
	}

	/**
	 * @param {PlayerOptions} [side]
	 * @param {number} [depth]
	 * @return {RandomTeamsTypes.RandomFactorySet[]}
	 */
	randomBSSFactoryTeam(side, depth = 0) {
		let forceResult = (depth >= 4);

		let pokemon = [];

		let pokemonPool = Object.keys(this.randomBSSFactorySets);

		/**@type {TeamData} */
		let teamData = {typeCount: {}, typeComboCount: {}, baseFormes: {}, megaCount: 0, zCount: 0, eeveeLimCount: 0, has: {}, forceResult: forceResult, weaknesses: {}, resistances: {}};
		/**@type {string[]} */
		let requiredMoveFamilies = [];
		/**@type {{[k: string]: string}} */
		let requiredMoves = {};
		/**@type {{[k: string]: string}} */
		let weatherAbilitiesSet = {'drizzle': 'raindance', 'drought': 'sunnyday', 'snowwarning': 'hail', 'sandstream': 'sandstorm'};
		/**@type {{[k: string]: string[]}} */
		let resistanceAbilities = {
			'waterabsorb': ['Water'],
			'flashfire': ['Fire'],
			'lightningrod': ['Electric'], 'voltabsorb': ['Electric'],
			'thickfat': ['Ice', 'Fire'],
			'levitate': ['Ground'],
		};

		while (pokemonPool.length && pokemon.length < 6) {
			let template = this.dex.getTemplate(this.sampleNoReplace(pokemonPool));
			if (!template.exists) continue;

			let speciesFlags = this.randomBSSFactorySets[template.speciesid].flags;

			// Limit to one of each species (Species Clause)
			if (teamData.baseFormes[template.baseSpecies]) continue;

			// Limit the number of Megas + Z-moves to 3
			if (teamData.megaCount + teamData.zCount >= 3 && speciesFlags.megaOnly) continue;

			// Limit 2 of any type
			let types = template.types;
			let skip = false;
			for (const type of types) {
				if (teamData.typeCount[type] > 1 && this.randomChance(4, 5)) {
					skip = true;
					break;
				}
			}
			if (skip) continue;

			// Restrict Eevee with certain Pokemon
			if (speciesFlags.limEevee) teamData.eeveeLimCount++;
			if (teamData.eeveeLimCount >= 1 && speciesFlags.limEevee) continue;

			let set = this.randomBSSFactorySet(template, pokemon.length, teamData);
			if (!set) continue;

			// Limit 1 of any type combination
			let typeCombo = types.slice().sort().join();
			if (set.ability === 'Drought' || set.ability === 'Drizzle') {
				// Drought and Drizzle don't count towards the type combo limit
				typeCombo = set.ability;
			}
			if (typeCombo in teamData.typeComboCount) continue;

			// Okay, the set passes, add it to our team
			pokemon.push(set);

			// Now that our Pokemon has passed all checks, we can update team data:
			for (const type of types) {
				if (type in teamData.typeCount) {
					teamData.typeCount[type]++;
				} else {
					teamData.typeCount[type] = 1;
				}
			}
			teamData.typeComboCount[typeCombo] = 1;

			teamData.baseFormes[template.baseSpecies] = 1;

			// Limit Mega and Z-move
			let itemData = this.dex.getItem(set.item);
			if (itemData.megaStone) teamData.megaCount++;
			if (itemData.zMove) teamData.zCount++;
			teamData.has[itemData.id] = 1;

			let abilityData = this.dex.getAbility(set.ability);
			if (abilityData.id in weatherAbilitiesSet) {
				teamData.weather = weatherAbilitiesSet[abilityData.id];
			}

			for (const move of set.moves) {
				let moveId = toID(move);
				if (moveId in teamData.has) {
					teamData.has[moveId]++;
				} else {
					teamData.has[moveId] = 1;
				}
				if (moveId in requiredMoves) {
					teamData.has[requiredMoves[moveId]] = 1;
				}
			}

			for (let typeName in this.dex.data.TypeChart) {
				// Cover any major weakness (3+) with at least one resistance
				if (teamData.resistances[typeName] >= 1) continue;
				if (resistanceAbilities[abilityData.id] && resistanceAbilities[abilityData.id].includes(typeName) || !this.dex.getImmunity(typeName, types)) {
					// Heuristic: assume that Pokémon with these abilities don't have (too) negative typing.
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
					continue;
				}
				let typeMod = this.dex.getEffectiveness(typeName, types);
				if (typeMod < 0) {
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
				} else if (typeMod > 0) {
					teamData.weaknesses[typeName] = (teamData.weaknesses[typeName] || 0) + 1;
				}
			}
		}
		if (pokemon.length < 6) return this.randomBSSFactoryTeam(side, ++depth);

		// Quality control
		if (!teamData.forceResult) {
			for (const requiredFamily of requiredMoveFamilies) {
				if (!teamData.has[requiredFamily]) return this.randomBSSFactoryTeam(side, ++depth);
			}
			for (let type in teamData.weaknesses) {
				if (teamData.weaknesses[type] >= 3) return this.randomBSSFactoryTeam(side, ++depth);
			}
		}

		return pokemon;
	}
	randomFormatsTeam() {
		let teams = {
			gen1ou: [

				'Alakazam||||psychic,seismictoss,thunderwave,recover||252,252,252,252,252,252|||||]Chansey||||seismictoss,thunderwave,reflect,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,doubleedge|||||||]Snorlax||||bodyslam,earthquake,hyperbeam,selfdestruct|||||||]Lapras||||thunderbolt,blizzard,sing,bodyslam|||||||',


				'Alakazam||||psychic,seismictoss,thunderwave,recover|||M||||]Chansey||||seismictoss,thunderwave,sing,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|leechseed,rest,psychic,stunspore|||M||||]Rhydon||||earthquake,rockslide,substitute,bodyslam|||M||||]Lapras||||thunderbolt,blizzard,confuseray,bodyslam|||M||||',


				'Alakazam||||psychic,seismictoss,thunderwave,recover|||||||]Chansey||||seismictoss,thunderwave,counter,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,doubleedge|||||||]Snorlax||||bodyslam,earthquake,hyperbeam,selfdestruct|||||||]Persian||||slash,bubblebeam,hyperbeam,thunderbolt|||||||',


				'Alakazam||||psychic,seismictoss,thunderwave,recover|||M||||]Chansey||||seismictoss,thunderwave,reflect,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,stunspore,leechseed,rest|||M||||]Snorlax||||bodyslam,earthquake,reflect,rest|||M||||]Jynx||||psychic,blizzard,lovelykiss,rest|||||||',


				'Alakazam||||psychic,seismictoss,thunderwave,recover|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Gengar|||1|thunderbolt,seismictoss,hypnosis,explosion|||||||]Snorlax||||bodyslam,earthquake,hyperbeam,selfdestruct|||||||]Starmie||||psychic,blizzard,thunderwave,recover|||||||',


				'Alakazam||||psychic,seismictoss,thunderwave,recover|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,hyperbeam,explosion|||||||]Snorlax||||bodyslam,earthquake,hyperbeam,selfdestruct|||||||]Zapdos|||1|thunderbolt,drillpeck,thunderwave,thunder|||||||',


				'Alakazam||||psychic,seismictoss,psywave,recover|||M||||]Chansey||||icebeam,thunderwave,counter,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,eggbomb|||M||||]Snorlax||||icebeam,reflect,amnesia,rest|||M||||]Jolteon|||1|thunderbolt,doublekick,thunderwave,pinmissile|||||||',


				'Alakazam||||psychic,seismictoss,thunderwave,recover|||||||]Chansey||||seismictoss,thunderwave,counter,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,doubleedge|||||||]Snorlax||||bodyslam,blizzard,amnesia,selfdestruct|||||||]Slowbro||||surf,thunderwave,amnesia,rest|||||||',


				'Alakazam||||psychic,seismictoss,thunderwave,recover|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Victreebel|||1|razorleaf,sleeppowder,wrap,swordsdance|||||||]Snorlax||||bodyslam,hyperbeam,reflect,rest|||||||]Cloyster||||blizzard,explosion,clamp,rest|||||||',


				'Jynx||||psychic,blizzard,lovelykiss,rest|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,hyperbeam|||||||]Snorlax||||selfdestruct,earthquake,bodyslam,hyperbeam|||||||]Zapdos|||1|thunderbolt,drillpeck,thunderwave,agility|||||||',


				'Jynx||||psychic,blizzard,lovelykiss,rest|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||M||||]Snorlax||||bodyslam,earthquake,counter,selfdestruct|||M||||]Zapdos|||1|thunderbolt,drillpeck,thunderwave,agility|||||||',


				'Jynx||||psychic,blizzard,lovelykiss,rest|||||||]Chansey||||icebeam,thunderwave,counter,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,hyperbeam|||M||||]Snorlax||||bodyslam,earthquake,hyperbeam,selfdestruct|||M||||]Zapdos|||1|thunderbolt,drillpeck,thunderwave,agility|||||||',


				'Jynx||||psychic,blizzard,lovelykiss,rest|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||||||]Snorlax||||icebeam,reflect,amnesia,rest|||||||]Zapdos|||1|thunderbolt,drillpeck,thunderwave,agility|||||||',


				'Jynx||||psychic,blizzard,lovelykiss,rest|||||||]Chansey||||seismictoss,thunderwave,reflect,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||||||]Snorlax||||bodyslam,selfdestruct,reflect,rest|||||||]Slowbro||||surf,reflect,amnesia,rest|||||||',


				'Jynx||||psychic,blizzard,lovelykiss,rest|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||M||||]Snorlax||||bodyslam,earthquake,reflect,rest|||M||||]Starmie||||thunderbolt,blizzard,thunderwave,recover|||||||',


				'Jynx||||psychic,blizzard,lovelykiss,rest|||||||]Chansey||||icebeam,thunderwave,counter,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||M||||]Snorlax||||megakick,earthquake,hyperbeam,selfdestruct|||M||||]Starmie||||blizzard,thunderbolt,thunderwave,recover|||||||',


				'Starmie||||psychic,blizzard,thunderwave,recover|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||||||]Rhydon||||earthquake,rockslide,substitute,bodyslam|||||||]Snorlax||||bodyslam,earthquake,reflect,rest|||||||',


				'Starmie||||thunderbolt,blizzard,thunderwave,recover|Bashful|252,,252,252,,252||,2,,,,|||]Chansey||||seismictoss,thunderwave,reflect,softboiled||252,,252,252,252,252||,2,,,,|||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard||252,252,252,252,252,252|||||]Exeggutor|||1|psychic,sleeppowder,explosion,hyperbeam|||||||]Snorlax||||bodyslam,earthquake,hyperbeam,selfdestruct|||||||]Alakazam||||psychic,thunderwave,reflect,recover||252,,252,252,252,252||,2,,,,|||',


				'Gengar|||1|thunderbolt,nightshade,hypnosis,explosion|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,fireblast,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||||||]Snorlax||||bodyslam,earthquake,hyperbeam,selfdestruct|||||||]Cloyster||||blizzard,hyperbeam,clamp,explosion|||||||',


				'Gengar|||1|thunderbolt,nightshade,hypnosis,explosion|||||||]Chansey||||thunderbolt,icebeam,thunderwave,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||||||]Snorlax||||bodyslam,earthquake,reflect,rest|||||||]Starmie||||thunderbolt,icebeam,thunderwave,recover|||||||',


				'Exeggutor|||1|psychic,sleeppowder,explosion,megadrain|||M||||]Chansey||||seismictoss,thunderwave,reflect,softboiled|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Starmie||||psychic,blizzard,thunderwave,recover|||||||]Snorlax||||bodyslam,icebeam,amnesia,rest|||M||||]Alakazam||||psychic,thunderwave,reflect,recover|||M||||',


				'Exeggutor|||1|psychic,sleeppowder,explosion,doubleedge|||||||]Snorlax||||bodyslam,earthquake,reflect,selfdestruct|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Victreebel|||1|razorleaf,sleeppowder,hyperbeam,swordsdance|||||||]Golem||||earthquake,rockslide,bodyslam,explosion|||||||]Starmie||||thunderbolt,blizzard,thunderwave,recover|||||||',


				'Exeggutor|||1|psychic,sleeppowder,explosion,megadrain|||||||]Jolteon|||1|thunderbolt,doublekick,thunderwave,pinmissile|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Starmie||||psychic,blizzard,thunderwave,recover|||||||]Snorlax||||bodyslam,earthquake,hyperbeam,selfdestruct|||||||]Zapdos|||1|thunderbolt,drillpeck,thunderwave,lightscreen|||||||',


			],


			gen1ubers: [


				'Jynx||||psychic,blizzard,lovelykiss,rest|||||||]Chansey||||seismictoss,thunderwave,lightscreen,softboiled|||||||]Slowbro||||surf,blizzard,amnesia,rest|||||||]Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||||||]Mewtwo|||1|psychic,blizzard,amnesia,rest|||||||]Mew|||1|bodyslam,thunderwave,reflect,softboiled|||||||',


				'Exeggutor|||1|psychic,sleeppowder,explosion,stunspore|||||||]Chansey||||seismictoss,thunderwave,lightscreen,softboiled|||||||]Slowbro||||surf,reflect,amnesia,rest|||||||]Tauros||||bodyslam,earthquake,hyperbeam,blizzard|||||||]Mewtwo|||1|psychic,blizzard,amnesia,rest|||||||]Mew|||1|bodyslam,thunderwave,reflect,softboiled|||||||',


				'Chansey||||seismictoss,sing,lightscreen,softboiled|||||||]Snorlax||||bodyslam,reflect,rest,selfdestruct|||||||]Slowbro||||surf,blizzard,amnesia,rest|||||||]Golem||||earthquake,rockslide,bodyslam,explosion|||||||]Mewtwo|||1|psychic,thunderbolt,amnesia,recover|||||||]Mew|||1|hyperbeam,earthquake,swordsdance,softboiled|||||||',


				'Gengar|||1|psychic,seismictoss,hypnosis,explosion|||||||]Snorlax||||bodyslam,reflect,rest,selfdestruct|||||||]Slowbro||||surf,thunderwave,amnesia,rest|||||||]Exeggutor|||1|psychic,stunspore,sleeppowder,explosion|||||||]Mewtwo|||1|psychic,blizzard,amnesia,recover|||||||]Mew|||1|bodyslam,earthquake,swordsdance,explosion|||||||',


				'Gengar|||1|psychic,seismictoss,hypnosis,explosion|||||||]Snorlax||||bodyslam,reflect,rest,selfdestruct|||||||]Chansey||||seismictoss,thunderwave,lightscreen,softboiled|||||||]Exeggutor|||1|psychic,stunspore,sleeppowder,explosion|||||||]Mewtwo|||1|psychic,blizzard,amnesia,recover|||||||]Mew|||1|bodyslam,reflect,swordsdance,softboiled|||||||',


				'Gengar|||1|psychic,seismictoss,hypnosis,explosion|||||||]Snorlax||||bodyslam,reflect,rest,selfdestruct|||||||]Chansey||||seismictoss,thunderwave,lightscreen,softboiled|||||||]Slowbro||||surf,blizzard,amnesia,rest|||||||]Mewtwo|||1|psychic,thunderbolt,amnesia,recover|||||||]Mew|||1|bodyslam,reflect,swordsdance,softboiled|||||||',


				'Jynx||||psychic,blizzard,lovelykiss,rest|||||||]Snorlax||||bodyslam,reflect,rest,selfdestruct|||||||]Chansey||||seismictoss,thunderwave,lightscreen,softboiled|||||||]Slowbro||||surf,reflect,amnesia,rest|||||||]Mewtwo|||1|psychic,blizzard,amnesia,rest|||||||]Mew|||1|bodyslam,thunderwave,explosion,swordsdance|||||||',


				'Snorlax||||bodyslam,reflect,hyperbeam,selfdestruct|||||||]Zapdos|||1|thunderbolt,drillpeck,thunderwave,lightscreen|||||||]Slowbro||||surf,thunderwave,amnesia,rest|||||||]Chansey||||seismictoss,sing,reflect,softboiled|||||||]Mewtwo|||1|psychic,blizzard,amnesia,rest|||||||]Mew|||1|bodyslam,hyperbeam,swordsdance,explosion|||||||',

			],


			gen1uu: [


				'Haunter|||1|psychic,thunder,hypnosis,explosion|||||||]Articuno|||1|blizzard,doubleedge,hyperbeam,agility|||||||]Hypno||||psychic,thunderwave,hypnosis,rest|||||||]Raichu|||1|thunderbolt,surf,thunderwave,hyperbeam|||||||]Persian||||slash,bubblebeam,hyperbeam,thunderbolt|||||||]Vaporeon|||1|surf,acidarmor,mimic,rest|||||||',


				'Kadabra||||psychic,seismictoss,thunderwave,recover|||||||]Hypno||||psychic,thunderwave,hypnosis,rest|||||||]Tentacruel||||surf,blizzard,wrap,hyperbeam|||||||]Dugtrio||||earthquake,slash,rockslide,substitute|||||||]Electrode||||thunderbolt,hyperbeam,thunderwave,explosion|||||||]Articuno|||1|blizzard,hyperbeam,reflect,agility|||||||',


				'Haunter|||1|psychic,thunderbolt,hypnosis,explosion|||||||]Articuno|||1|blizzard,hyperbeam,agility,rest|||||||]Hypno||||psychic,thunderwave,hypnosis,rest|||||||]Raichu|||1|thunderbolt,surf,thunderwave,hyperbeam|||||||]Persian||||slash,bubblebeam,hyperbeam,thunderbolt|||||||]Dragonite|||1|blizzard,hyperbeam,wrap,agility|||||||',


				'Kadabra||||psychic,seismictoss,thunderwave,recover|||||||]Victreebel|||1|razorleaf,sleeppowder,wrap,swordsdance|||||||]Tentacruel||||surf,blizzard,wrap,hyperbeam|||||||]Hypno||||psychic,thunderwave,hypnosis,rest|||||||]Aerodactyl||||doubleedge,hyperbeam,fireblast,rest|||||||]Persian||||slash,bubblebeam,hyperbeam,thunderbolt|||||||',


				'Hypno||||psychic,thunderwave,hypnosis,rest|||||||]Kangaskhan||||bodyslam,hyperbeam,earthquake,rest|||||||]Haunter|||1|psychic,thunderbolt,hypnosis,explosion|||||||]Dugtrio||||earthquake,slash,rockslide,substitute|||||||]Tentacruel||||surf,blizzard,wrap,hyperbeam|||||||]Kadabra||||psychic,seismictoss,thunderwave,recover|||||||',


				'Kadabra||||psychic,seismictoss,thunderwave,recover|||||||]Tentacruel||||surf,blizzard,wrap,hyperbeam|||||||]Electabuzz|||1|thunderbolt,psychic,thunderwave,seismictoss|||||||]Dragonite|||1|blizzard,hyperbeam,wrap,agility|||||||]Omastar||||surf,blizzard,seismictoss,rest|||||||]Hypno||||psychic,thunderwave,hypnosis,rest|||||||',


				'Kadabra||||psychic,seismictoss,thunderwave,recover|||||||]Dragonite|||1|blizzard,hyperbeam,wrap,agility|||||||]Raichu|||1|thunderbolt,surf,thunderwave,hyperbeam|||||||]Omastar||||surf,blizzard,seismictoss,rest|||||||]Dodrio||||bodyslam,drillpeck,hyperbeam,agility|||||||]Venusaur|||1|bodyslam,razorleaf,sleeppowder,swordsdance|||||||',


				'Electabuzz|||1|thunderbolt,psychic,thunderwave,seismictoss|||||||]Hypno||||psychic,thunderwave,hypnosis,rest|||||||]Dugtrio||||earthquake,slash,rockslide,substitute|||||||]Dodrio||||bodyslam,drillpeck,hyperbeam,agility|||||||]Vaporeon|||1|hydropump,blizzard,acidarmor,rest|||||||]Tentacruel||||surf,blizzard,wrap,hyperbeam|||||||',


				'Haunter|||1|psychic,thunder,hypnosis,explosion|||||||]Kadabra||||psychic,seismictoss,thunderwave,recover|||||||]Gyarados|||1|thunderbolt,blizzard,hydropump,bodyslam|||||||]Hypno||||psychic,thunderwave,hypnosis,rest|||||||]Raichu|||1|thunderbolt,surf,thunderwave,hyperbeam|||||||]Tentacruel||||surf,blizzard,wrap,hyperbeam|||||||',


				'Hypno||||psychic,thunderwave,hypnosis,rest|||||||]Kangaskhan||||bodyslam,hyperbeam,counter,rest|||||||]Vaporeon|||none|surf,icebeam,acidarmor,rest|||||||]Persian|||none|slash,hyperbeam,thunderbolt,bubblebeam|||||||]Venusaur|||none|bodyslam,razorleaf,hyperbeam,sleeppowder|||||||]Sandslash|||none|earthquake,bodyslam,swordsdance,rest|||||||',

			],

			gen2ou: [

				'Snorlax||leftovers||bodyslam,earthquake,lovelykiss,curse|||||||]Cloyster||leftovers||surf,icywind,spikes,explosion|||||||]Zapdos||leftovers|1|thunder,lightscreen,rest,sleeptalk||252,,252,252,252,252||,2,,,,|||]Steelix||leftovers||earthquake,bodyslam,roar,explosion|||||||]Exeggutor||leftovers|1|psychic,gigadrain,stunspore,explosion|||||||]Charizard||miracleberry|1|fireblast,earthquake,rockslide,bellydrum|||||||',

				'Smeargle||miracleberry||spore,spikes,mirrorcoat,destinybond||252,252,252,252,192,252|||||]Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||252,,252,252,252,252||,,26,,,|||]Exeggutor||leftovers|1|psychic,gigadrain,hiddenpowerfire,explosion||||6,28,24,,,|||]Machamp||leftovers||crosschop,earthquake,rockslide,curse|||||||]Snorlax||leftovers||bodyslam,earthquake,curse,selfdestruct|||||||]Gengar||leftovers|1|thunder,icepunch,dynamicpunch,destinybond|||||||',

				'Nidoking||||earthquake,icebeam,lovelykiss,thief|||||||]Cloyster||leftovers||clamp,screech,spikes,explosion|||||||]Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||252,,252,252,252,252||,,26,,,|||]Exeggutor||leftovers|1|psychic,gigadrain,hiddenpowerfire,explosion||||6,28,24,,,|||]Snorlax||leftovers||bodyslam,earthquake,curse,selfdestruct|||||||]Tentacruel||leftovers||hydropump,sludgebomb,substitute,swordsdance|||||||',

				'Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Snorlax||leftovers||bodyslam,earthquake,fireblast,selfdestruct|||||||]Steelix||leftovers||earthquake,roar,curse,explosion|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Exeggutor||leftovers|1|psychic,gigadrain,sleeppowder,explosion|||||||]Machamp||leftovers||crosschop,earthquake,hiddenpowerbug,curse||||,26,26,,,|||',

				'Exeggutor||leftovers|1|psychic,stunspore,gigadrain,explosion|||||||]Gengar||leftovers|1|thunder,icepunch,hypnosis,explosion|||||||]Golem||leftovers||earthquake,roar,rapidspin,explosion|||||||]Cloyster||leftovers||surf,screech,spikes,explosion|||||||]Snorlax||leftovers||doubleedge,fireblast,curse,rest|||||||]Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||',

				'Exeggutor||leftovers|1|psychic,gigadrain,stunspore,explosion|||||||]Golem||leftovers||earthquake,roar,rapidspin,explosion|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Snorlax||leftovers||doubleedge,earthquake,fireblast,selfdestruct|||||||]Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Jynx||leftovers||psychic,icebeam,lovelykiss,dreameater|||||||',

				'Exeggutor||leftovers|1|psychic,gigadrain,stunspore,explosion|||||||]Steelix||leftovers||earthquake,roar,curse,explosion|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Snorlax||leftovers||doubleedge,earthquake,fireblast,selfdestruct|||||||]Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Nidoking||leftovers||earthquake,lovelykiss,thunderbolt,icebeam|||||||',

				'Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Snorlax||leftovers||bodyslam,earthquake,curse,rest|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Vaporeon||leftovers|1|surf,growth,acidarmor,rest|||||||]Steelix||leftovers||earthquake,roar,curse,explosion|||||||]Exeggutor||leftovers|1|psychic,gigadrain,stunspore,explosion|||||||',

				'Gengar||leftovers|1|thunder,icepunch,destinybond,explosion|||||||]Golem||leftovers||earthquake,roar,rapidspin,explosion|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Exeggutor||leftovers|1|psychic,hiddenpowerfire,sleeppowder,explosion||||6,28,24,,,|||]Snorlax||leftovers||bodyslam,earthquake,thunder,selfdestruct|||||||]Tentacruel||leftovers||surf,sludgebomb,substitute,swordsdance|||||||',

				'Gengar||leftovers|1|thunder,icepunch,hypnosis,explosion|||||||]Steelix||leftovers||earthquake,roar,curse,explosion|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Exeggutor||leftovers|1|psychic,gigadrain,stunspore,explosion|||||||]Snorlax||leftovers||bodyslam,earthquake,thunder,selfdestruct|||||||]Charizard||leftovers|1|fireblast,earthquake,rockslide,bellydrum|||||||',

				'Gengar||leftovers|1|thunder,icepunch,destinybond,explosion|||||||]Steelix||leftovers||earthquake,roar,curse,explosion|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Exeggutor||leftovers|1|psychic,hiddenpowerfire,sleeppowder,explosion||||6,28,24,,,|||]Snorlax||leftovers||bodyslam,earthquake,bellydrum,selfdestruct|||||||]Clefable||leftovers||return,hiddenpowerground,bellydrum,moonlight||||14,24,,,,|||',

				'Gengar||leftovers|1|thunder,icepunch,hypnosis,explosion|||||||]Steelix||leftovers||earthquake,roar,curse,explosion|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Exeggutor||leftovers|1|psychic,gigadrain,stunspore,explosion|||||||]Snorlax||leftovers||bodyslam,earthquake,fireblast,selfdestruct|||||||]Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||',

				'Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Rhydon||leftovers||earthquake,rockslide,roar,curse|||||||]Jynx||leftovers||psychic,icebeam,lovelykiss,substitute|||||||]Snorlax||leftovers||bodyslam,earthquake,curse,rest|||||||]Machamp||leftovers||crosschop,rockslide,hiddenpowerflying,curse||||14,24,26,,,|||',


				'Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Steelix||leftovers||earthquake,bodyslam,roar,explosion|||||||]Jynx||leftovers||psychic,icebeam,lovelykiss,substitute|||||||]Snorlax||leftovers||bodyslam,earthquake,curse,rest|||||||]Gengar||leftovers|1|thunderbolt,icepunch,dynamicpunch,destinybond|||||||',


				'Nidoking||leftovers||earthquake,lovelykiss,thunder,icebeam|||||||]Cloyster||leftovers||surf,toxic,spikes,explosion|||||||]Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||252,,252,252,252,252||,,26,,,|||]Machamp||leftovers||crosschop,earthquake,rockslide,curse|||||||]Snorlax||leftovers||bodyslam,curse,rest,sleeptalk|||||||]Tyranitar||leftovers|1|rockslide,fireblast,roar,pursuit|||||||',


				'Snorlax||leftovers||bodyslam,earthquake,bellydrum,rest|||||||]Starmie||leftovers||surf,psychic,rapidspin,recover|||||||]Skarmory||leftovers||drillpeck,whirlwind,curse,rest|||||||]Suicune||leftovers||surf,toxic,rest,sleeptalk||252,,252,252,252,252||,2,,,,|||]Blissey||leftovers||present,icebeam,sing,softboiled|||||||]Miltank||leftovers||bodyslam,growl,healbell,milkdrink|||||||',


				'Exeggutor|||1|psychic,thief,stunspore,explosion|||||||]Raikou||leftovers|1|thunder,hiddenpowerwater,rest,sleeptalk||||14,28,26,,,|||]Cloyster||leftovers||surf,icebeam,spikes,explosion|||||||]Vaporeon||leftovers|1|surf,growth,acidarmor,rest|||||||]Tyranitar||leftovers|1|rockslide,flamethrower,roar,pursuit|||||||]Snorlax||leftovers||bodyslam,earthquake,lovelykiss,curse|||||||',


				'Exeggutor||leftovers|1|psychic,gigadrain,sleeppowder,explosion|||||||]Forretress||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Suicune||leftovers|1|surf,toxic,roar,rest|||||||]Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Snorlax||leftovers||doubleedge,curse,rest,sleeptalk|||||||]Steelix||leftovers||earthquake,rockslide,roar,curse|||||||',


				'Gengar|||1|thunder,icepunch,thief,explosion|||||||]Nidoking||leftovers||earthquake,lovelykiss,thunder,icebeam|||||||]Jynx||||psychic,icebeam,lovelykiss,thief|||||||]Cloyster||leftovers||surf,screech,spikes,explosion|||||||]Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Snorlax||leftovers||doubleedge,earthquake,curse,rest|||||||',


				'Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||252,,252,252,252,252||,,26,,,|||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,rapidspin||||14,28,,,,|||]Rhydon||leftovers||earthquake,rockslide,roar,curse|||||||]Houndoom||leftovers||fireblast,solarbeam,pursuit,sunnyday||252,,252,252,252,252||,2,,,,|||]Snorlax||leftovers||return,lovelykiss,bellydrum,rest|||||||]Meganium||leftovers|1|razorleaf,leechseed,reflect,synthesis||252,,252,252,252,252|F|,2,,,,|||',

				'Raikou||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Skarmory||leftovers||drillpeck,whirlwind,curse,rest|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||]Golem||leftovers||earthquake,roar,rapidspin,explosion|||||||]Exeggutor||leftovers|1|psychic,hiddenpowerfire,sleeppowder,explosion||||6,28,24,,,|||]Snorlax||leftovers||bodyslam,fireblast,curse,rest|||||||',

				'Raikou||leftovers|1|thunderbolt,roar,reflect,rest|||||||]Snorlax||leftovers||return,earthquake,bellydrum,rest|||||||]Gengar||leftovers|1|thunderbolt,icepunch,toxic,rest|||||||]Cloyster||leftovers||surf,spikes,rapidspin,rest|||||||]Skarmory||leftovers||drillpeck,whirlwind,curse,rest|||||||]Blissey||leftovers||present,lightscreen,healbell,softboiled|||||||',

				'Raikou||leftovers|1|thunderbolt,roar,reflect,rest|||||||]Forretress||leftovers|1|hiddenpowerfire,spikes,rapidspin,explosion||||6,28,24,,,|||]Misdreavus||leftovers|1|thunder,toxic,perishsong,rest|||||||]Skarmory||leftovers||drillpeck,whirlwind,curse,rest|||||||]Suicune||leftovers|1|surf,toxic,rest,sleeptalk|||||||]Snorlax||leftovers||doubleedge,flamethrower,toxic,rest|||||||',

				'Raikou||leftovers|1|thunderbolt,roar,reflect,rest|||||||]Snorlax||leftovers||return,lovelykiss,bellydrum,rest|||||||]Skarmory||leftovers||drillpeck,whirlwind,curse,rest|||||||]Miltank||leftovers||bodyslam,growl,healbell,milkdrink|||||||]Starmie||leftovers||surf,toxic,rapidspin,recover|||||||]Suicune||leftovers|1|surf,icebeam,rest,sleeptalk|||||||',

				'Nidoking||leftovers||earthquake,lovelykiss,thunder,icebeam|||||||]Skarmory||leftovers||drillpeck,whirlwind,curse,rest|||||||]Snorlax||leftovers||doubleedge,fireblast,lovelykiss,selfdestruct|||||||]Vaporeon||leftovers|1|surf,growth,rest,sleeptalk|||||||]Raikou||leftovers|1|thunder,roar,reflect,rest|||||||]Forretress||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||',

				'Umbreon||leftovers|1|confuseray,meanlook,batonpass,moonlight|||||||]Smeargle||miracleberry||spore,agility,batonpass,recover|||||||]Snorlax||leftovers||bodyslam,earthquake,bellydrum,rest|||||||]Marowak||thickclub||earthquake,rockslide,hiddenpowerbug,swordsdance||||,26,26,,,|||]Zapdos||leftovers|1|thunderbolt,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Skarmory||leftovers||drillpeck,whirlwind,rest,sleeptalk|||||||',

				'Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Jolteon||leftovers|1|thunder,hiddenpowerwater,agility,batonpass||||14,28,26,,,|||]Marowak||thickclub||earthquake,rockslide,hiddenpowerbug,swordsdance||252,240,252,252,252,252||,26,26,,,|||]Snorlax||leftovers||return,earthquake,lovelykiss,bellydrum|||||||]Cloyster||leftovers||surf,icebeam,spikes,explosion|||||||]Steelix||leftovers||earthquake,roar,curse,explosion|||||||',

				'Exeggutor|||1|psychic,gigadrain,sleeppowder,thief|||||||]Jolteon||leftovers|1|thunderbolt,roar,growth,batonpass||252,252,252,252,252,100|||||]Zapdos||leftovers|1|thunderbolt,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Snorlax||leftovers||doubleedge,earthquake,thunder,selfdestruct|||||||]Moltres||mintberry|1|fireblast,sunnyday,reflect,rest|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,spikes,explosion||||14,28,,,,|||',

				'Cloyster||leftovers||surf,clamp,spikes,explosion||||14,28,,,,|||]Espeon||leftovers|1|psychic,growth,batonpass,morningsun|||||||]Nidoking||leftovers||earthquake,lovelykiss,thunderbolt,icebeam|||||||]Entei||leftovers|1|fireblast,solarbeam,sunnyday,rest|||||||]Snorlax||leftovers||bodyslam,curse,rest,sleeptalk|||||||]Miltank||leftovers||seismictoss,growl,healbell,milkdrink|||||||',

				'Zapdos||leftovers|1|thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Espeon||leftovers|1|psychic,growth,batonpass,morningsun|||||||]Nidoking||leftovers||earthquake,lovelykiss,thunderbolt,icebeam|||||||]Gengar||leftovers|1|thunder,icepunch,hypnosis,explosion|||||||]Cloyster||leftovers||surf,screech,spikes,explosion|||||||]Snorlax||leftovers||bodyslam,earthquake,curse,rest|||||||',

				'Forretress||leftovers|1|spikes,rapidspin,reflect,toxic|||||||]Raikou||leftovers|1|thunderbolt,sleeptalk,hiddenpowerice,rest||||,,26,,,|||]Omastar||||sandstorm,surf,toxic,thief|||||||]Skarmory||||toxic,thief,whirlwind,rest|||||||]Nidoqueen||||earthquake,icebeam,charm,thief|||||||]Snorlax||leftovers||doubleedge,flamethrower,toxic,rest|||||||',

				'Jynx||||icebeam,psychic,lovelykiss,thief|||||||]Cloyster||leftovers||hiddenpowerelectric,icebeam,spikes,explosion||||14,28,,,,|||]Gengar|||1|thunderbolt,icepunch,thief,explosion|||||||]Snorlax||leftovers||doubleedge,rest,thunder,sleeptalk|||||||]Exeggutor|||1|psychic,hiddenpowerfire,thief,sleeppowder||||6,28,24,,,|||]Raikou||leftovers|1|thunderbolt,hiddenpowerice,sleeptalk,rest||||,,26,,,|||',

				'Nidoking||||earthquake,thief,icebeam,lovelykiss|||||||]Cloyster||leftovers||surf,hiddenpowerelectric,explosion,spikes||||14,28,,,,|||]Exeggutor|||1|psychic,thief,hiddenpowerfire,sleeppowder||||6,28,24,,,|||]Machamp||||crosschop,thief,earthquake,rockslide|||||||]Snorlax||leftovers||doubleedge,thunder,rest,sleeptalk|||||||]Zapdos||leftovers|1|thunderbolt,hiddenpowerice,sleeptalk,rest||||,,26,,,|||',


			],

			gen2ubers: [

				'Ho-Oh||mysteryberry|1|sacredfire,thunderbolt,ancientpower,recover|||||||]Snorlax||leftovers||bodyslam,earthquake,curse,rest|||M||||]Lugia||scopelens|1|aeroblast,whirlwind,curse,recover|||||||]Mewtwo||przcureberry|1|shadowball,submission,curse,recover|||||||]Mew||brightpowder|1|shadowball,rockslide,swordsdance,softboiled|||||||]Celebi||miracleberry|1|psychic,leechseed,healbell,recover|||||||',

				'Forretress||polkadotbow||hiddenpowerbug,explosion,rapidspin,spikes|||M|,26,26,,,|||]Lugia||leftovers|1|aeroblast,whirlwind,curse,recover|||||||]Blissey||miracleberry||icebeam,flamethrower,healbell,softboiled|||||||]Mewtwo||przcureberry|1|psychic,thunder,flamethrower,recover|||||||]Zapdos||magnet|1|thunder,drillpeck,rest,sleeptalk|||||||]Snorlax||mintberry||bodyslam,earthquake,curse,rest|||M||||',

				'Cloyster||polkadotbow||surf,icebeam,spikes,explosion|||M||||]Raikou||miracleberry|1|thunder,crunch,rest,sleeptalk|||||||]Skarmory||mintberry||drillpeck,toxic,whirlwind,rest|||M||||]Lugia||leftovers|1|aeroblast,whirlwind,curse,recover|||||||]Mewtwo||przcureberry|1|psychic,flamethrower,thunder,recover|||||||]Mew||pinkbow|1|earthquake,rockslide,swordsdance,explosion|||||||',

				'Mewtwo||przcureberry|1|thunderbolt,flamethrower,selfdestruct,recover|||||||]Steelix||polkadotbow||earthquake,roar,curse,explosion|||M||||]Forretress||leftovers|1|hiddenpowerbug,sandstorm,spikes,explosion|||M|,26,26,,,|||]Lugia||miracleberry|1|aeroblast,whirlwind,curse,recover|||||||]Tyranitar||iceberry|1|rockslide,crunch,earthquake,pursuit|||M||||]Celebi||mysteryberry|1|psychic,gigadrain,leechseed,recover|||||||',

				'Cloyster||leftovers||surf,icebeam,spikes,rapidspin|||M||||]Umbreon||mysteryberry|1|bite,charm,toxic,moonlight|||M||||]Mew||pinkbow|1|shadowball,explosion,swordsdance,softboiled|||||||]Mewtwo||przcureberry|1|psychic,thunder,icebeam,recover|||||||]Snorlax||polkadotbow||rockslide,shadowball,curse,selfdestruct|||M||||]Ho-Oh||miracleberry|1|sacredfire,thunderbolt,ancientpower,recover|||||||',


				'Mewtwo||leftovers|1|thunder,fireblast,icebeam,selfdestruct|||||||]Mew||leftovers|1|earthquake,rockslide,explosion,swordsdance|||||||]Lugia||leftovers|1|aeroblast,whirlwind,curse,recover|Serious||||||]Snorlax||leftovers||doubleedge,curse,lovelykiss,selfdestruct|||||||]Zapdos||leftovers|1|thunder,hiddenpowerwater,rest,sleeptalk|||||||]Steelix||leftovers||explosion,curse,roar,rockslide|||||||',


			],

			gen2uu: [

				'Hypno||leftovers||seismictoss,psywave,reflect,rest|||||||]Gyarados||leftovers|1|hydropump,doubleedge,hiddenpowerground,zapcannon||||14,24,,,,|||]Quagsire||leftovers||earthquake,surf,curse,rest|||||||]Nidoqueen||leftovers||earthquake,lovelykiss,thunder,icebeam|||||||]Jumpluff||leftovers||sleeppowder,stunspore,encore,leechseed|||||||]Granbull||leftovers||return,healbell,rest,sleeptalk|||||||',

				'Ampharos||leftovers||thunder,hiddenpowerice,rest,sleeptalk||||,,26,,,|||]Nidoqueen||leftovers||earthquake,thunder,icebeam,moonlight|||||||]Slowbro||leftovers||surf,psychic,rest,sleeptalk|||||||]Granbull||leftovers||return,curse,rest,sleeptalk|||||||]Qwilfish||leftovers||hydropump,sludgebomb,spikes,curse|||||||]Crobat||leftovers||hiddenpowerflying,confuseray,toxic,haze||||14,24,26,,,|||',

				'Qwilfish||leftovers||hydropump,sludgebomb,spikes,curse|||||||]Scyther||leftovers||frustration,hiddenpowerground,swordsdance,batonpass||||14,24,,,,|||0]Ampharos||leftovers||thunder,lightscreen,rest,sleeptalk|||||||]Nidoqueen||leftovers||earthquake,lovelykiss,fireblast,thunder|||||||]Dodrio||leftovers||doubleedge,hiddenpowerground,rest,sleeptalk||||14,24,,,,|||]Blastoise||leftovers||surf,reflect,rest,sleeptalk|||||||',

				'Pineco||leftovers||hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Nidoqueen||leftovers||earthquake,thunder,fireblast,moonlight|||||||]Weezing||leftovers||sludgebomb,hiddenpowerground,curse,explosion||||14,24,,,,|||]Haunter||||psychic,thunderbolt,thief,explosion|||||||]Dodrio||polkadotbow||return,hiddenpowerground,flail,endure||||14,24,,,,|||]Politoed||leftovers||surf,hiddenpowerelectric,hypnosis,growth||||14,28,,,,|||',

				'Kadabra||||psychic,firepunch,thunderpunch,thief|||||||]Scyther||leftovers||hiddenpowerbug,wingattack,swordsdance,batonpass||||,26,26,,,|||]Nidoqueen||leftovers||earthquake,lovelykiss,thunder,icebeam|||||||]Electabuzz||leftovers||thunderbolt,icepunch,crosschop,hiddenpowergrass||||6,28,28,,,|||]Granbull||leftovers||frustration,curse,rest,sleeptalk|||||||0]Qwilfish||leftovers||hydropump,sludgebomb,spikes,curse|||||||',

				'Nidoqueen||leftovers||earthquake,lovelykiss,thunder,icebeam|||||||]Scyther||leftovers||wingattack,hiddenpowerground,swordsdance,batonpass|||M|14,24,,,,|||]Dodrio||leftovers||frustration,hiddenpowerground,rest,sleeptalk|||M|14,24,,,,|||0]Politoed||leftovers||surf,growth,rest,sleeptalk|||M||||]Victreebel||leftovers|1|sludgebomb,hiddenpowerground,sleeppowder,swordsdance|||M|14,24,,,,|||]Kabutops||leftovers||hydropump,ancientpower,hiddenpowerground,swordsdance|||M|14,24,,,,|||',

				'Scyther||leftovers||wingattack,hiddenpowerground,swordsdance,batonpass|||M|14,24,,,,|||]Dodrio||pinkbow||frustration,hiddenpowerground,flail,endure|||M|14,24,,,,|||0]Qwilfish||leftovers||hydropump,sludgebomb,hiddenpowerground,spikes|||M|14,24,,,,|||]Nidoqueen||leftovers||earthquake,lovelykiss,thunderbolt,icebeam|||||||]Politoed||leftovers||surf,growth,rest,sleeptalk|||M||||]Vileplume||leftovers|1|razorleaf,sludgebomb,swordsdance,moonlight|||M||||',

				'Girafarig||leftovers||amnesia,agility,batonpass,rest|||M||||]Politoed||leftovers||surf,growth,rest,sleeptalk|||M||||]Granbull||leftovers||frustration,curse,rest,sleeptalk|||M||||0]Vileplume||leftovers|1|razorleaf,sludgebomb,swordsdance,moonlight|||M||||]Gligar||leftovers||earthquake,hiddenpowerflying,curse,rest|||M|14,24,26,,,|||]Shuckle||leftovers||rollout,defensecurl,curse,rest|||M||||',

				'Omastar||leftovers||surf,reflect,haze,rest|||M||||]Poliwrath||leftovers||frustration,lovelykiss,bellydrum,rest|||M||||0]Quagsire||leftovers||earthquake,hiddenpowerrock,bellydrum,rest|||M|22,26,24,,,|||]Blastoise||leftovers|1|surf,haze,rapidspin,rest|||M||||]Gligar||leftovers||earthquake,hiddenpowerflying,curse,rest|||M|14,24,26,,,|||]Chansey||leftovers||toxic,lightscreen,healbell,softboiled|||||||',

				'Qwilfish||leftovers||sludgebomb,spikes,sludgebomb,rest|||M||||]Vileplume||leftovers|1|razorleaf,sludgebomb,swordsdance,moonlight|||M||||]Quagsire||leftovers||earthquake,hiddenpowerrock,bellydrum,rest|||M|22,26,24,,,|||]Blastoise||leftovers|1|surf,haze,rapidspin,rest|||M||||]Gligar||leftovers||earthquake,hiddenpowerflying,curse,rest|||M|14,24,26,,,|||]Chansey||luckypunch||doubleedge,curse,healbell,softboiled|||||||',

				'Qwilfish||leftovers||hydropump,sludgebomb,protect,spikes|||M||||]Dodrio||||frustration,drillpeck,hiddenpowerground,thief|||M|14,24,,,,|||0]Hypno||leftovers||psychic,seismictoss,rest,sleeptalk|||||||]Granbull||leftovers||return,curse,rest,sleeptalk|||||||]Scyther||leftovers||hiddenpowerbug,wingattack,swordsdance,batonpass||||,26,26,,,|||]Nidoqueen||leftovers||earthquake,thunder,icebeam,moonlight|||||||',

				'Pikachu||lightball|1|thunderbolt,surf,sing,substitute|||||||]Lickitung||leftovers||bodyslam,swordsdance,rest,sleeptalk|||||||]Kabutops||leftovers||hydropump,ancientpower,hiddenpowerground,swordsdance|||M|14,24,,,,|||]Gyarados||leftovers|1|doubleedge,hydropump,hiddenpowerground,zapcannon||||14,24,,,,|||]Parasect||leftovers||hiddenpowerbug,gigadrain,spore,stunspore||||,26,26,,,|||]Sandslash||leftovers|1|earthquake,rockslide,swordsdance,substitute|||||||',

			],

			gen2nu: [

				'Raichu||leftovers|1|thunder,surf,hiddenpowerice,seismictoss||||,,26,,,|||]Bayleef||leftovers|1|razorleaf,bodyslam,leechseed,synthesis|||||||]Pineco||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Dugtrio||||earthquake,rockslide,sludgebomb,thief|||||||]Rapidash||leftovers||fireblast,hiddenpowerground,doubleedge,sunnyday||||14,24,,,,|||]Poliwrath||leftovers||return,surf,lovelykiss,bellydrum|||||||',

				'Raichu||leftovers|1|thunder,surf,thunderwave,seismictoss||||,,26,,,|||]Lickitung||leftovers||bodyslam,bellydrum,rest,sleeptalk|||||||]Poliwrath||leftovers||frustration,surf,lovelykiss,bellydrum|||||||0]Flareon||leftovers|1|return,fireblast,hiddenpowerground,zapcannon||||14,24,,,,|||]Sudowoodo||leftovers||rockslide,earthquake,curse,selfdestruct|||||||]Wigglytuff||leftovers||bodyslam,curse,rest,sleeptalk|||||||',

				'Pineco||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Raichu||leftovers|1|thunder,surf,thunderwave,seismictoss||||,,26,,,|||]Weezing|||1|sludgebomb,thunder,thief,explosion|||||||]Exeggcute||leftovers|1|psychic,gigadrain,sleeppowder,explosion|||||||]Dugtrio||leftovers||earthquake,rockslide,sludgebomb,screech|||||||]Gastly|||1|psychic,thunderbolt,thief,explosion|||||||',

				'Raichu||leftovers|1|thunder,surf,thunderwave,seismictoss||||,,26,,,|||]Cubone||thickclub||earthquake,rockslide,hiddenpowerflying,swordsdance||||14,24,26,,,|||]Fearow||leftovers|1|doubleedge,drillpeck,rest,sleeptalk||||14,24,,,,|||]Pineco||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Kingler||leftovers||bodyslam,swordsdance,rest,sleeptalk||||14,24,26,,,|||]Lickitung||leftovers||bodyslam,swordsdance,rest,sleeptalk|||||||',

				'Poliwrath||leftovers||hydropump,icebeam,dynamicpunch,lovelykiss|||||||]Dugtrio||leftovers||earthquake,rockslide,sludgebomb,screech|||||||]Raichu||leftovers|1|thunder,surf,thunderwave,seismictoss|||||||]Pineco||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Fearow||leftovers|1|doubleedge,drillpeck,rest,sleeptalk|||||||]Primeape||miracleberry||crosschop,rockslide,endure,reversal|||||||',

				'Xatu||||psychic,confuseray,protect,thief|||||||]Wigglytuff||leftovers||bodyslam,curse,rest,sleeptalk|||||||]Poliwrath||leftovers||surf,earthquake,rest,sleeptalk|||||||]Pineco||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Dugtrio||leftovers||earthquake,rockslide,substitute,swagger|||||||]Persian||leftovers||return,shadowball,swagger,psychup|||||||',

				'Arbok||leftovers||sludgebomb,earthquake,glare,curse|||||||]Poliwrath||leftovers||surf,earthquake,rest,sleeptalk|||||||]Raichu||leftovers|1|thunder,seismictoss,rest,sleeptalk|||||||]Graveler||leftovers||earthquake,rockslide,rapidspin,explosion|||||||]Wigglytuff||leftovers||bodyslam,curse,rest,sleeptalk|||||||]Lickitung||leftovers||bodyslam,bellydrum,rest,sleeptalk|||||||',

				'Raichu||leftovers|1|thunder,seismictoss,rest,sleeptalk|||||||]Pineco||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Gastly|||1|psychic,thunderbolt,thief,explosion|||||||]Arbok||leftovers||sludgebomb,earthquake,glare,curse|||||||]Wigglytuff||leftovers||bodyslam,curse,rest,sleeptalk|||||||]Poliwrath||leftovers||surf,earthquake,rest,sleeptalk|||||||',

				'Poliwrath||leftovers||surf,earthquake,rest,sleeptalk|||||||]Xatu||leftovers||psychic,nightshade,rest,sleeptalk|||||||]Raichu||leftovers|1|thunder,seismictoss,rest,sleeptalk|||||||]Graveler||leftovers||earthquake,hiddenpowerrock,rapidspin,explosion||||22,26,24,,,|||]Pineco||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Gastly|||1|psychic,thunderbolt,thief,explosion|||||||',

				'Raichu||leftovers|1|thunderbolt,surf,thunderwave,seismictoss||||,,26,,,|||]Pineco||leftovers|1|hiddenpowerbug,spikes,rapidspin,explosion||||,26,26,,,|||]Parasect||leftovers||hiddenpowerbug,gigadrain,spore,stunspore||||,26,26,,,|||]Weezing||leftovers|1|sludgebomb,thunder,curse,explosion|||||||]Poliwrath||leftovers||surf,earthquake,rest,sleeptalk|||||||]Kingler||leftovers||bodyslam,swordsdance,rest,sleeptalk||||14,24,26,,,|||',

				'Arbok||||sludgebomb,earthquake,glare,thief|||||||]Ivysaur||leftovers|1|razorleaf,reflect,leechseed,synthesis|||||||]Lickitung||leftovers||bodyslam,bellydrum,rest,sleeptalk|||||||]Graveler||leftovers||earthquake,rockslide,rapidspin,explosion|||||||]Fearow||leftovers|1|doubleedge,drillpeck,rest,sleeptalk|||||||]Poliwrath||leftovers||surf,earthquake,rest,sleeptalk|||||||',

				'Tangela||leftovers||gigadrain,sleeppowder,stunspore,synthesis|||||||]Golduck||leftovers||hydropump,hypnosis,icebeam,hiddenpowerelectric|||||||]Raichu||leftovers|1|thunder,surf,thunderwave,seismictoss||||,,26,,,|||]Arbok||||sludgebomb,earthquake,glare,thief|||||||]Poliwrath||leftovers||frustration,earthquake,lovelykiss,bellydrum|||||||0]Sudowoodo||leftovers||rockslide,earthquake,curse,selfdestruct|||||||',

				'Rapidash||leftovers||fireblast,hiddenpowerground,doubleedge,sunnyday||||14,24,,,,|||]Poliwrath||leftovers||frustration,earthquake,lovelykiss,bellydrum|||||||0]Xatu||||psychic,confuseray,protect,thief|||||||]Raichu||leftovers|1|thunder,seismictoss,rest,sleeptalk|||||||]Dugtrio||||earthquake,rockslide,sludgebomb,thief|||||||]Hitmonlee||leftovers||highjumpkick,megakick,hiddenpowerrock,meditate||||22,26,24,,,|||',

				'Raichu||leftovers|1|thunderbolt,surf,sing,substitute|||||||]Dugtrio||miracleberry||earthquake,rockslide,sludgebomb,substitute|||||||]Tangela||leftovers||gigadrain,sleeppowder,stunspore,synthesis|||||||]Venomoth||leftovers||sleeppowder,stunspore,sludgebomb,psychic|||||||]Sudowoodo||leftovers||rockslide,selfdestruct,toxic,protect|||||||]Hitmonchan||leftovers||agility,highjumpkick,return,hiddenpowerghost||||22,26,28,,,|||',

			],

			gen2lc: [
				'Abra||berryjuice||psychic,icepunch,thief,thunderwave||||||5|]Poliwag||berryjuice||surf,return,hypnosis,bellydrum|Bashful|252,252,252,252,252,252||||5|]Magby||berryjuice|1|fireblast,thunderpunch,crosschop,thief||||||5|]Cubone||thickclub||earthquake,rockslide,hiddenpowerbug,swordsdance||||,26,26,,,||5|]Chansey||berryjuice||bodyslam,icebeam,thunderwave,softboiled||||||5|]Machop||berryjuice||crosschop,earthquake,hiddenpowerbug,curse||||,26,26,,,||5|',

				'Exeggcute||berryjuice|1|psychic,thief,sleeppowder,explosion||||||5|]Pineco||miracleberry|1|hiddenpowerbug,explosion,spikes,rapidspin||||,26,26,,,||5|]Onix||berryjuice||earthquake,rockslide,sharpen,explosion||||6,28,28,,,||5|]Gastly||berryjuice|1|thunderbolt,gigadrain,thief,explosion||||,,26,,,||5|]Machop||berryjuice||crosschop,earthquake,hiddenpowerbug,curse||||,26,26,,,||5|]Houndour||berryjuice||fireblast,crunch,pursuit,hiddenpowergrass||||6,28,28,,,||5|',

				'Elekid||berryjuice|1|thunderbolt,icepunch,crosschop,thief||||||5|]Exeggcute||berryjuice|1|psychic,reflect,leechseed,explosion||||||5|]Onix||berryjuice||earthquake,rockslide,sharpen,explosion||||||5|]Drowzee||berryjuice||psychic,hiddenpowerground,hypnosis,lightscreen||||14,24,,,,||5|]Remoraid||berryjuice||surf,icebeam,hiddenpowergrass,thief||||6,28,28,,,||5|]Houndour||berryjuice||fireblast,solarbeam,crunch,sunnyday||||||5|',

				'Houndour||berryjuice||fireblast,crunch,pursuit,hiddenpowergrass||||6,28,28,,,||5|]Gastly||berryjuice|1|thunderbolt,gigadrain,hypnosis,destinybond||||,,26,,,||5|]Chansey||berryjuice||bodyslam,icebeam,thunderwave,softboiled||||||5|]Dratini||berryjuice|1|thunderbolt,icebeam,fireblast,outrage||||||5|]Exeggcute||berryjuice|1|psychic,sleeppowder,thief,explosion||||||5|]Elekid||berryjuice|1|thunder,crosschop,icepunch,thief||||||5|',

				'Gastly||berryjuice|1|hypnosis,thunderbolt,gigadrain,thief||||||5|]Houndour||berryjuice||fireblast,crunch,pursuit,hiddenpowergrass||||6,28,28,,,||5|]Squirtle||berryjuice|1|surf,rapidspin,sleeptalk,rest||||||5|]Machop||miracleberry||crosschop,earthquake,hiddenpowerbug,curse||||,26,26,,,||5|]Elekid||berryjuice|1|thunder,crosschop,icepunch,thief||||||5|]Chansey||berryjuice||bodyslam,icebeam,curse,softboiled||||||5|',

				'Nidoran-M||berryjuice||thunderbolt,blizzard,hiddenpowerbug,lovelykiss|Bashful|252,252,252,252,252,252||,26,26,,,||5|]Exeggcute||berryjuice|1|psychic,sleeppowder,thief,explosion||||||5|]Houndour||berryjuice||fireblast,crunch,pursuit,hiddenpowergrass||||6,28,28,,,||5|]Chinchou||berryjuice||surf,thunderbolt,icebeam,thunderwave||||||5|]Onix||berryjuice||earthquake,rockslide,curse,explosion||||||5|]Doduo||berryjuice||drillpeck,return,steelwing,thief|Bashful|252,252,252,252,252,252||||5|',

				'Exeggcute||berryjuice|1|psychic,gigadrain,sleeppowder,explosion||||||5|]Diglett||berryjuice||earthquake,hiddenpowerbug,rockslide,thief||||,26,26,,,||5|]Magby||berryjuice|1|fireblast,hiddenpowergrass,crosschop,thief||||6,28,28,,,||5|]Chinchou||berryjuice||surf,thunderbolt,icebeam,thunderwave||||||5|]Chansey||berryjuice||bodyslam,icebeam,curse,softboiled||||||5|]Houndour||berryjuice||fireblast,crunch,hiddenpowergrass,pursuit||||6,28,28,,,||5|',


			],


			gen3ou: [
				'Jirachi||choiceband||doomdesire,bodyslam,hiddenpowerfighting,shadowball|Jolly|64,252,,,,192||,,30,30,30,30|||]Swampert||leftovers||earthquake,icebeam,roar,protect|Relaxed|252,,216,40,,|M||||]Snorlax||leftovers||bodyslam,fireblast,earthquake,selfdestruct|Sassy|112,76,176,64,80,|||||]Cloyster||leftovers||icebeam,spikes,rapidspin,explosion|Calm|252,,,120,136,|||||]Tyranitar||leftovers||crunch,flamethrower,pursuit,toxic|Modest|176,,4,252,76,|M||||]Salamence||leftovers||dragondance,hiddenpowerflying,earthquake,rockslide|Adamant|,216,,,152,140||,,,30,30,30|||',

				'Metagross||leftovers||thunderpunch,explosion,meteormash,hiddenpowergrass|Rash|184,44,,252,,28||,30,,30,,|||]Zapdos||leftovers||toxic,hiddenpowergrass,thunderwave,thunderbolt|Timid|,,,252,4,252||,2,,30,,|||]Starmie||leftovers|1|hydropump,icebeam,psychic,thunderbolt|Timid|,,,252,4,252||,0,,,,|S||]Aerodactyl||choiceband||doubleedge,earthquake,hiddenpowerflying,rockslide|Jolly|4,252,,,,252|F|30,30,30,30,30,|||]Tyranitar||lumberry||dragondance,earthquake,icebeam,rockslide|Adamant|20,192,,44,,252|F||S||]Snorlax||leftovers||bodyslam,earthquake,fireblast,selfdestruct|Brave|,252,100,88,64,4|||||',

				'Cloyster||leftovers||explosion,icebeam,spikes,surf|Calm|248,4,4,120,104,28|F||S||]Jolteon||leftovers||batonpass,roar,thunderbolt,hiddenpowergrass|Timid|48,,,208,,252|F|,2,,30,,|||]Moltres||leftovers||flamethrower,hiddenpowergrass,roar,willowisp|Modest|,,,252,20,236||,2,,30,,|||]Swampert||leftovers||earthquake,hydropump,icebeam,protect|Relaxed|248,,148,64,4,44|||||]Tyranitar||choiceband||focuspunch,earthquake,hiddenpowerbug,rockslide|Adamant|4,252,,,,252|F|,30,30,,30,|S||]Gengar||leftovers|levitate|explosion,hiddenpowergrass,firepunch,thunderbolt|Hasty|,40,,252,,216|F|,30,,30,,|S||',

				'Salamence||leftovers||fireblast,dragonclaw,hiddenpowergrass,brickbreak|Rash|,4,,252,,252|F|,30,,30,,|||]Weezing||leftovers||willowisp,fireblast,thunder,explosion|Modest|224,12,,156,,116|F||S||]Gyarados||leftovers||taunt,dragondance,hiddenpowerrock,earthquake|Jolly|28,252,,,56,172|F|,,30,,30,30|||]Metagross||leftovers||toxic,meteormash,earthquake,explosion|Adamant|248,176,12,,36,36|||||]Tyranitar||leftovers||substitute,focuspunch,crunch,fireblast|Mild|252,,,148,,108|F||S||]Jolteon||leftovers||thunderbolt,hiddenpowerice,toxic,batonpass|Timid|4,,,252,,252|F|,2,30,,,|||',

				'Hariyama||leftovers||crosschop,knockoff,counter,rest|Impish|24,,252,,180,52|F||||]Claydol||leftovers||earthquake,rapidspin,psychic,refresh|Sassy|252,232,,,24,|||||]Salamence||leftovers||wish,protect,flamethrower,toxic|Bold|252,,200,28,,28|F|,0,,,,|||]Celebi||leftovers||perishsong,recover,leechseed,hiddenpowergrass|Calm|248,,36,92,112,20||,2,,30,,|||]Jirachi||leftovers||wish,substitute,calmmind,firepunch|Calm|252,,36,80,4,136||,0,,,,|||]Heracross||salacberry||substitute,swordsdance,megahorn,rockslide|Adamant|12,252,,,,244|F||||',

				'Venusaur||leftovers||razorleaf,leechseed,sleeppowder,hiddenpowerfire|Timid|,,68,252,56,132|F|,2,,30,,30|S||]Swampert||leftovers||hydropump,icebeam,protect,earthquake|Quiet|248,,116,96,4,44|F||||]Snorlax||leftovers||bodyslam,fireblast,focuspunch,selfdestruct|Brave|,252,100,88,68,|||||]Zapdos||leftovers||thunderbolt,hiddenpowerice,protect,toxic|Timid|,,,252,4,252||,2,30,,,|||]Metagross||choiceband||doubleedge,earthquake,explosion,meteormash|Adamant|220,252,,,,36|||||]Moltres||leftovers||flamethrower,hiddenpowergrass,roar,willowisp|Timid|,,,252,20,236||,2,,30,,|||',

				'Zapdos||leftovers||thunderbolt,batonpass,hiddenpowergrass,thunderwave|Modest|128,,,240,,140||30,,,30,,|||]Swampert||leftovers||hydropump,icebeam,protect,earthquake|Quiet|216,,124,132,,36|||||]Snorlax||leftovers||bodyslam,fireblast,shadowball,selfdestruct|Sassy|112,76,176,64,80,|||||]Jirachi||leftovers||bodyslam,dynamicpunch,firepunch,hiddenpowergrass|Rash|,4,,252,,252||,30,,30,,|||]Tyranitar||choiceband||rockslide,focuspunch,hiddenpowerbug,earthquake|Adamant|100,228,100,,,80||,30,30,,30,|||]Flygon||leftovers||earthquake,rockslide,hiddenpowerbug,fireblast|Naive|12,240,4,,,252||,30,30,,30,|||',

				'Jirachi||lumberry||psychic,firepunch,hiddenpowergrass,dynamicpunch|Hasty|,92,,164,,252||,30,,30,,|||]Swampert||leftovers||earthquake,icebeam,hydropump,protect|Relaxed|232,,136,98,,42|||||]Snorlax||leftovers||bodyslam,fireblast,selfdestruct,counter|Brave|144,56,120,52,136,|F||||]Cloyster||leftovers||icebeam,spikes,rapidspin,explosion|Relaxed|252,,,120,136,|||||]Tyranitar||lumberry||rockslide,earthquake,hiddenpowerbug,dragondance|Jolly|4,252,,,,252|M|,30,30,,30,|||]Salamence||sharpbeak||hiddenpowerflying,fireblast,brickbreak,rockslide|Naughty|,252,,116,,140||30,30,30,30,30,|||',

				'Suicune||leftovers||surf,icebeam,hiddenpowerelectric,calmmind|Modest|4,,,252,,252||,,,30,,|||]Celebi||leftovers||hiddenpowerfire,gigadrain,psychic,calmmind|Timid|104,,,252,,152||,30,,30,,30|||]Jirachi||leftovers||calmmind,psychic,icepunch,hiddenpowergrass|Timid|4,,,252,,252||,30,,30,,|||]Dugtrio||choiceband|1|earthquake,rockslide,hiddenpowerbug,aerialace|Jolly|4,252,,,,252|M|,30,30,,30,|||]Tyranitar||leftovers||dragondance,earthquake,rockslide,hiddenpowerbug|Adamant|88,252,,,,168|M|,30,30,,30,|||]Swampert||leftovers||protect,surf,earthquake,icebeam|Relaxed|252,,252,,4,|M||||',

				'Salamence||choiceband||hiddenpowerflying,earthquake,rockslide,brickbreak|Jolly|4,252,,,,252|M|30,30,30,30,30,|||]Magneton||leftovers||rest,sleeptalk,hiddenpowerfire,thunderbolt|Modest|148,,,252,,108||,30,,30,,30|||]Dugtrio||choiceband|1|earthquake,rockslide,hiddenpowerbug,aerialace|Jolly|8,228,,,44,228|F|,,,,30,30|||]Celebi||leftovers||psychic,leechseed,hiddenpowergrass,recover|Bold|252,,156,100,,||,30,,30,,|||]Swampert||leftovers||earthquake,icebeam,roar,protect|Relaxed|252,,216,,,40|M||||]Snorlax||leftovers||return,shadowball,curse,rest|Adamant|92,128,124,,164,|F||||',

				'Salamence||choiceband||rockslide,earthquake,hiddenpowerflying,brickbreak|Jolly|4,252,,,,252||30,30,30,30,30,|||]Magneton||leftovers||thunderbolt,substitute,hiddenpowergrass,toxic|Modest|4,,,252,,252||,30,,30,,|||]Swampert||leftovers||icebeam,earthquake,protect,toxic|Relaxed|252,,216,,40,|||||]Celebi||leftovers||calmmind,gigadrain,psychic,hiddenpowerfire|Timid|,,72,252,,180||,30,,30,,30|||]Metagross||leftovers||agility,meteormash,earthquake,explosion|Adamant|160,252,,,,96|||||]Porygon2||leftovers||thunderbolt,icebeam,toxic,recover|Bold|252,,148,108,,|||||',

				'Salamence||choiceband||hiddenpowerflying,brickbreak,fireblast,earthquake|Jolly|4,252,,,,252|M|30,30,30,30,30,|||]Magneton||leftovers||thunderbolt,hiddenpowergrass,rest,toxic|Modest|172,,,252,,84||,30,,30,,|||]Snorlax||leftovers|1|rest,shadowball,bodyslam,curse|Adamant|92,128,124,,164,|M||||]Claydol||leftovers||earthquake,psychic,hiddenpowerfire,rapidspin|Relaxed|252,,148,108,,||,30,,30,,30|||]Suicune||leftovers||surf,roar,rest,calmmind|Bold|252,,220,,,36|||||]Celebi||leftovers||healbell,leechseed,hiddenpowergrass,recover|Bold|252,,244,,,12||,30,,30,,|||',

				'Salamence||choiceband||hiddenpowerflying,earthquake,rockslide,brickbreak|Adamant|4,252,,,,252||30,30,30,30,30,|||]Suicune||leftovers||calmmind,hydropump,icebeam,roar|Modest|136,,,216,,156||,0,,,,|||]Jirachi||leftovers||bodyslam,firepunch,wish,protect|Sassy|252,80,56,,120,|||||]Cloyster||leftovers||spikes,rapidspin,icebeam,explosion|Calm|252,,,120,136,|||||]Tyranitar||leftovers||dragondance,rockslide,earthquake,hiddenpowerbug|Adamant|16,192,120,,,180||,30,30,,30,|||]Aerodactyl||choiceband||rockslide,earthquake,hiddenpowerflying,doubleedge|Jolly|4,252,,,,252||30,30,30,30,30,|||',

				'Skarmory||leftovers||spikes,protect,whirlwind,toxic|Careful|252,,,,236,20|F||||]Blissey||leftovers||softboiled,icebeam,toxic,fireblast|Modest|,,252,112,,144||,0,,,,|S||]Tyranitar||leftovers||earthquake,rockslide,hiddenpowerbug,focuspunch|Adamant|248,252,,,,8|F|,30,30,,30,|||]Swampert||leftovers||earthquake,icebeam,hydropump,protect|Relaxed|248,,160,84,4,12|F||||]Gengar||leftovers|levitate|firepunch,gigadrain,explosion,willowisp|Timid|248,8,44,12,100,96|F||S||]Starmie||leftovers|1|hydropump,icebeam,thunderbolt,rapidspin|Timid|4,,,252,,252||,0,,,,|S||',

				'Zapdos||magnet||thunder,thunderbolt,hiddenpowergrass,batonpass|Modest|112,,,240,4,152||,2,,30,,|||]Swampert||leftovers||hydropump,icebeam,protect,earthquake|Quiet|216,,124,132,,36|||||]Skarmory||leftovers||spikes,toxic,protect,whirlwind|Impish|252,,,,252,4|||||]Blissey||leftovers||thunderwave,wish,softboiled,seismictoss|Bold|252,,252,,4,||,0,,,,|||]Tyranitar||choiceband||rockslide,focuspunch,hiddenpowerbug,earthquake|Adamant|100,228,100,,,80||,30,30,,30,|||]Gengar||leftovers|levitate|thunderbolt,icepunch,willowisp,explosion|Naive|96,96,96,40,,180|M||||',

				'Metagross||leftovers||meteormash,pursuit,psychic,explosion|Quiet|252,,,252,4,|||||]Blaziken||choiceband||skyuppercut,rockslide,focuspunch,fireblast|Jolly|4,252,,,,252|||||]Suicune||leftovers||calmmind,hydropump,icebeam,roar|Modest|136,,,216,,156||,0,,,,|||]Magneton||magnet||thunderbolt,hiddenpowerfire,protect,toxic|Modest|,,4,252,,252||,2,,30,,30|||]Porygon2||leftovers||recover,toxic,thunderwave,icebeam|Bold|252,,244,,,12|||||]Celebi||leftovers||hiddenpowergrass,perishsong,leechseed,recover|Calm|240,,36,88,76,68||,2,,30,,|||',

				'Zapdos||magnet||thunder,thunderbolt,hiddenpowergrass,batonpass|Modest|112,,,240,4,152||,2,,30,,|||]Swampert||leftovers||hydropump,icebeam,protect,earthquake|Relaxed|240,,136,96,,36|||||]Cloyster||leftovers||spikes,rapidspin,surf,explosion|Relaxed|252,,,120,136,|||||]Jirachi||leftovers||bodyslam,firepunch,wish,protect|Sassy|240,56,76,,136,|||||]Tyranitar||leftovers||dragondance,rockslide,earthquake,hiddenpowerbug|Adamant|16,192,120,,,180||,30,30,,30,|||]Aerodactyl||choiceband||rockslide,earthquake,hiddenpowerflying,doubleedge|Jolly|4,252,,,,252||30,30,30,30,30,|||',

				'Tyranitar||leftovers||taunt,rockslide,earthquake,toxic|Adamant|232,144,,,,132|F||||]Zapdos||leftovers||thunderbolt,hiddenpowergrass,thunderwave,toxic|Calm|252,,28,,228,||,2,,30,,|||]Snorlax||leftovers||bodyslam,fireblast,earthquake,selfdestruct|Sassy|112,76,176,64,80,|||||]Swampert||leftovers||hydropump,icebeam,protect,earthquake|Quiet|216,,124,132,,36|||||]Skarmory||leftovers||toxic,spikes,whirlwind,taunt|Impish|252,,14,,182,60||,0,,,,|||]Aerodactyl||choiceband||rockslide,earthquake,hiddenpowerflying,doubleedge|Jolly|4,252,,,,252||30,30,30,30,30,|||',

				'Jolteon||leftovers||thunderbolt,hiddenpowergrass,substitute,batonpass|Timid|,,,252,,252||,30,,30,,|||]Aerodactyl||choiceband||rockslide,doubleedge,earthquake,hiddenpowerflying|Jolly|4,252,,,,252||30,30,30,30,30,|||]Skarmory||leftovers|1|rest,sleeptalk,spikes,whirlwind|Impish|252,,4,,252,|||||]Swampert||leftovers||earthquake,icebeam,protect,toxic|Relaxed|252,,216,40,,|M||||]Tyranitar||leftovers||dragondance,earthquake,rockslide,hiddenpowerbug|Adamant|16,200,120,,,172||,30,30,,30,|||]Gengar||leftovers|levitate|hypnosis,icepunch,gigadrain,thunderbolt|Timid|172,,,148,,188|||||',

				'Skarmory||leftovers||toxic,taunt,spikes,whirlwind|Careful|248,,,,228,32|M||||]Aerodactyl||choiceband||doubleedge,earthquake,hiddenpowerflying,rockslide|Adamant|,252,4,,,252|M|,,,30,30,30|||]Tyranitar||choiceband||focuspunch,earthquake,hiddenpowerbug,rockslide|Adamant|32,240,,,,236|M|,,,,30,30|||]Swampert||leftovers||earthquake,icebeam,protect,surf|Relaxed|252,,136,112,,8|M||||]Gengar||leftovers|levitate|gigadrain,hypnosis,icepunch,thunderbolt|Timid|96,,96,140,,176|M||||]Blissey||leftovers||icebeam,seismictoss,softboiled,flamethrower|Modest|20,,252,236,,|||||',

				'Tyranitar||leftovers||flamethrower,hiddenpowergrass,pursuit,rockslide|Naughty|116,104,32,140,12,104|M|,30,,30,,|||]Forretress||leftovers||earthquake,hiddenpowerbug,rapidspin,spikes|Careful|252,,4,,252,|M|,30,30,,30,|||]Blissey||leftovers||calmmind,flamethrower,hiddenpowergrass,softboiled|Modest|4,,252,252,,||,30,,30,,|||]Swampert||leftovers||earthquake,icebeam,protect,toxic|Relaxed|240,,176,24,56,12|M||||]Celebi||leftovers||leechseed,perishsong,psychic,recover|Bold|240,,176,48,,44|||||]Gengar||leftovers|levitate|firepunch,gigadrain,thunderbolt,willowisp|Timid|252,,100,,76,80|M||||',

				'Tyranitar||leftovers||crunch,pursuit,taunt,toxic|Modest|240,,,152,,116||,0,,,,|||]Cacturne||leftovers||substitute,leechseed,hiddenpowerdark,spikes|Timid|252,,,,28,228|M||||]Steelix||leftovers||earthquake,hiddenpowersteel,explosion,roar|Impish|252,92,16,,144,4|M|,,,,30,|||]Magneton||magnet||thunderbolt,hiddenpowerfire,toxic,protect|Modest|120,,,252,,136||,2,,30,,30|||]Milotic||leftovers||surf,hypnosis,recover,toxic|Bold|252,,248,,,8|F||||]Aerodactyl||choiceband||rockslide,earthquake,hiddenpowerflying,doubleedge|Jolly|4,252,,,,252||30,30,30,30,30,|||',

				'Tyranitar||leftovers||crunch,pursuit,taunt,toxic|Modest|240,,,152,,116||,0,,,,|||]Suicune||leftovers||surf,icebeam,roar,calmmind|Modest|240,,,104,,164|||||]Snorlax||leftovers||bodyslam,fireblast,earthquake,selfdestruct|Sassy|112,76,176,64,80,|||||]Cloyster||leftovers||icebeam,explosion,rapidspin,spikes|Relaxed|252,,16,,228,12|M||||]Metagross||choiceband||meteormash,explosion,earthquake,rockslide|Adamant|184,248,,,,76|||||]Aerodactyl||choiceband||rockslide,earthquake,hiddenpowerflying,doubleedge|Jolly|4,252,,,,252||30,30,30,30,30,|||',


			],


			gen3ubers: [

				'Groudon||leftovers||earthquake,swordsdance,thunderwave,rockslide|Adamant|168,176,,,132,32|||||]Lugia||choiceband||aeroblast,shadowball,earthquake,icebeam|Jolly|116,252,,,,140|||||]Latias||souldew||dragonclaw,refresh,calmmind,recover|Timid|252,,,116,,140||,0,,,,|||]Blissey||leftovers||wish,seismictoss,toxic,protect|Calm|4,,252,,252,||,0,,,,|||]Magneton||leftovers||thunderbolt,hiddenpowerfire,protect,toxic|Timid|4,,,252,,252||,2,,30,,30|||]Forretress||leftovers||hiddenpowerbug,explosion,rapidspin,spikes|Impish|252,,4,,252,||,30,30,,30,|||',

				'Latios||souldew||calmmind,recover,icebeam,thunder|Modest|156,,,252,,100|||||]Kyogre||leftovers||thunderwave,icebeam,thunder,surf|Bold|240,,252,,,16||,0,,,,|||]Omastar||mysticwater||toxic,spikes,icebeam,hydropump|Modest|,,40,252,,216||,0,,,,|||]Regice||leftovers||psychup,explosion,thunder,icebeam|Sassy|136,120,,252,,|||S||]Steelix||choiceband||rockslide,doubleedge,earthquake,explosion|Adamant|248,252,,,8,|||||]Deoxys-Attack||petayaberry||substitute,superpower,icebeam,thunder|Mild|,4,,252,,252||30,,,,,|||',

				'Groudon||leftovers||earthquake,rockslide,toxic,roar|Careful|248,,8,,252,|||||]Ho-Oh||choiceband||hiddenpowerflying,sacredfire,shadowball,earthquake|Adamant|248,252,,,8,||30,30,30,30,30,|||]Blissey||leftovers||healbell,softboiled,toxic,seismictoss|Calm|4,,252,,252,||,0,,,,|||]Forretress||leftovers||spikes,rapidspin,hiddenpowerbug,explosion|Careful|252,,4,,252,||,30,30,,30,|||]Latias||souldew||calmmind,recover,refresh,dragonclaw|Bold|252,,252,,,4||,0,,,,|||]Regirock||leftovers||explosion,rockslide,protect,toxic|Impish|252,4,252,,,|||||',

				'Latias||souldew||calmmind,substitute,recover,dragonclaw|Bold|248,,252,8,,||,0,,,,|||]Omastar||mysticwater||toxic,icebeam,surf,hydropump|Timid|36,,,252,,220||,0,,,,|||]Kyogre||leftovers||thunderwave,calmmind,icebeam,surf|Bold|240,,252,,,16||,0,,,,|||]Rayquaza||choiceband||hiddenpowerghost,extremespeed,earthquake,overheat|Adamant|40,252,,,,216||,,30,,30,|||]Blissey||leftovers||toxic,softboiled,aromatherapy,seismictoss|Calm|4,,252,,252,||,0,,,,|||]Forretress||leftovers||spikes,rapidspin,hiddenpowerghost,explosion|Impish|248,28,,,232,||,,30,,30,|||',

				'Groudon||choiceband||earthquake,rockslide,hiddenpowerbug,fireblast|Adamant|160,252,,,,96||,30,30,,30,|||]Metagross||choiceband||meteormash,rockslide,explosion,hiddenpowerfire|Brave|252,252,,4,,||,30,,30,,30|||]Latias||souldew||calmmind,dragonclaw,recover,safeguard|Timid|4,,,252,,252|||||]Jumpluff||leftovers||encore,sleeppowder,swordsdance,hiddenpowerflying|Adamant|,252,120,,,136||30,30,30,30,30,|||]Forretress||leftovers||spikes,rapidspin,explosion,hiddenpowerfire|Relaxed|252,,252,4,,||,30,,30,,30|||]Ho-Oh||leftovers||substitute,sacredfire,toxic,recover|Timid|204,,52,,,252|||||',

				'Groudon||leftovers||swordsdance,earthquake,rockslide,thunderwave|Adamant|248,252,,,,8|||||]Ho-Oh||choiceband||shadowball,earthquake,sacredfire,hiddenpowerrock|Lonely|224,252,,,,32||,,30,,30,30|||]Magneton||leftovers||substitute,thunderbolt,hiddenpowerfire,toxic|Modest|114,,,220,,172||,30,,30,,30|||]Forretress||leftovers||spikes,rapidspin,hiddenpowerbug,explosion|Impish|252,12,,,244,||,30,30,,30,|||]Latios||souldew||calmmind,icebeam,thunderbolt,recover|Timid|,,4,252,,252|||||]Shedinja||lumberry||shadowball,hiddenpowerfighting,protect,swordsdance|Adamant|,252,,4,,252||,,30,30,30,30|||',

				'Latios||souldew||calmmind,recover,icebeam,thunder|Modest|100,,,252,,156||,0,,,,|||]Metagross||leftovers||pursuit,earthquake,meteormash,explosion|Adamant|240,252,,,,16|||||]Aerodactyl||choiceband||doubleedge,rockslide,earthquake,hiddenpowerghost|Adamant|,252,,,32,224||,,30,,30,|||]Kyogre||leftovers||surf,calmmind,rest,icebeam|Modest|240,,244,,,24||,0,,,,|||]Snorlax||leftovers|1|curse,rest,earthquake,bodyslam|Careful|108,,252,,148,|||||]Forretress||leftovers||hiddenpowerbug,spikes,rapidspin,explosion|Careful|252,,4,,252,||,,,,30,30|||',

				'Deoxys-Speed||leftovers||spikes,firepunch,taunt,icebeam|Timid|240,,,252,,16||,0,,,,|||]Gengar||magnet|levitate|thunder,willowisp,shadowball,explosion|Hasty|,252,,4,,252|||S||]Raikou||leftovers||calmmind,substitute,hiddenpowerice,thunder|Timid|4,,,252,,252||,30,30,,,|||]Kyogre||leftovers||thunderwave,icebeam,thunder,surf|Modest|240,,252,,,16|||||]Latios||souldew||dragondance,hiddenpowerfighting,shadowball,thunder|Lonely|,252,,100,,156||,,30,30,30,30|S||]Blissey||leftovers||icebeam,thunder,calmmind,softboiled|Calm|,,,252,252,||,0,,,,|||',

				'Groudon||leftovers||swordsdance,thunderwave,rockslide,earthquake|Adamant|224,,,,252,32|||||]Ho-Oh||choiceband||sacredfire,shadowball,hiddenpowerflying,doubleedge|Adamant|,252,4,,,252||30,30,30,30,30,|||]Blissey||leftovers||softboiled,toxic,seismictoss,aromatherapy|Calm|188,,68,,252,|||||]Regirock||choiceband||earthquake,explosion,rockslide,superpower|Adamant|252,252,,,4,|||||]Exeggutor||leftovers||sleeppowder,stunspore,solarbeam,explosion|Rash|,116,,252,,140|||||]Rayquaza||nevermeltice||extremespeed,icebeam,fireblast,thunderbolt|Modest|40,,,252,,216|||||',


			],


			gen3uu: [
				'Kangaskhan||choiceband||return,shadowball,earthquake,focuspunch|Jolly|,252,,,4,252|||||]Muk||leftovers||sludgebomb,icepunch,explosion,hiddenpowerground|Lonely|252,252,,4,,||,,,30,30,|||]Lunatone||leftovers||calmmind,psychic,icebeam,hiddenpowergrass|Modest|252,,,252,4,||,2,,30,,|||]Pinsir||leftovers||hiddenpowerbug,doubleedge,earthquake,swordsdance|Jolly|,252,4,,,252||,30,30,,30,|||]Omastar||leftovers||raindance,hydropump,spikes,icebeam|Modest|116,,,252,,140||,0,,,,|||]Scyther||choiceband||aerialace,pursuit,quickattack,hiddenpowerbug|Jolly|,252,,,4,252||,30,30,,30,|||',

				'Qwilfish||salacberry||destinybond,selfdestruct,spikes,hiddenpowergrass|Hasty|,252,,32,,224||,30,,30,,|||]Kangaskhan||choiceband||return,earthquake,fakeout,shadowball|Jolly|,252,,,4,252|||||]Manectric||petayaberry||substitute,thunderbolt,hiddenpowerice,crunch|Timid|44,,,248,,216||,2,30,,,|||]Golem||leftovers||earthquake,hiddenpowerrock,counter,protect|Adamant|252,240,,,16,||,,30,,30,30|||]Scyther||salacberry||swordsdance,hiddenpowerbug,reversal,endure|Hasty|,252,,4,,252||,30,30,,30,|||]Tentacruel||leftovers||hydropump,sludgebomb,substitute,swordsdance|Hasty|,232,,92,,184|||||',

				'Manectric||petayaberry||crunch,hiddenpowerwater,substitute,thunderbolt|Timid|,,,252,4,252|M|,30,30,30,,|||]Kangaskhan||choiceband||earthquake,fakeout,return,shadowball|Adamant|4,252,,,,252|||||]Hypno||leftovers||calmmind,psychic,toxic,wish|Calm|252,,252,,4,|M||||]Golem||leftovers||earthquake,explosion,rockblast,toxic|Impish|252,176,80,,,|M||||]Vileplume||leftovers||aromatherapy,hiddenpowergrass,leechseed,sleeppowder|Bold|252,,108,,148,|F|,30,,30,,|||]Scyther||liechiberry||hiddenpowerflying,reversal,substitute,swordsdance|Jolly|4,252,,,,252|M|30,30,30,30,30,|||',

				'Misdreavus||leftovers||thunderbolt,hiddenpowerice,thunderwave,imprison|Modest|236,,68,124,80,||,30,30,,,|||]Lanturn||leftovers||thunderwave,icebeam,surf,protect|Modest|40,,,252,216,|||||]Primeape||leftovers||bulkup,substitute,crosschop,hiddenpowerghost|Jolly|32,252,,,,224||,,30,,30,|||]Hypno||leftovers||thunderwave,psychic,wish,protect|Bold|252,,192,,,64|||||]Kangaskhan||choiceband||doubleedge,earthquake,shadowball,focuspunch|Adamant|4,252,,,,252|||||]Gligar||leftovers||earthquake,toxic,protect,counter|Impish|252,,252,,4,|||||',

				'Omastar||leftovers|1|spikes,surf,protect,toxic|Bold|240,,240,,,28||,0,,,,|||]Shedinja||lumberry||shadowball,swordsdance,protect,hiddenpowerbug|Adamant|,252,,4,,252||,30,30,,30,|||]Hitmontop||leftovers||rapidspin,hiddenpowerghost,toxic,brickbreak|Impish|248,,252,,8,||,,30,,30,|||]Kangaskhan||leftovers||frustration,roar,protect,wish|Careful|248,,44,,216,|||||0]Altaria||leftovers||icebeam,roar,healbell,rest|Bold|248,,200,,60,||,0,,,,|||]Gligar||leftovers||earthquake,hiddenpowerflying,toxic,swordsdance|Impish|252,,240,,,16||30,30,30,30,30,|||',

				'Walrein||leftovers||surf,hiddenpowergrass,icebeam,encore|Modest|156,,,252,,100||,2,,30,,|||]Nidoqueen||leftovers||earthquake,counter,sludgebomb,superpower|Adamant|252,140,36,,,80|||||]Granbull||leftovers||return,earthquake,healbell,thunderwave|Impish|252,,252,,,4|||||]Hypno||leftovers||wish,protect,toxic,psychic|Bold|248,,176,84,,||,0,,,,|||]Omastar||leftovers||spikes,icebeam,surf,toxic|Bold|248,,216,,,44||,0,,,,|||]Scyther||choiceband||silverwind,hiddenpowerflying,quickattack,pursuit|Jolly|4,252,,,,252||30,30,30,30,30,|||',

				'Primeape||leftovers||bulkup,crosschop,hiddenpowerghost,rockslide|Jolly|32,252,,,,224||,,30,,30,|||]Hypno||leftovers||wish,reflect,psychic,protect|Calm|248,,176,,84,||,0,,,,|||]Omastar||leftovers||spikes,surf,toxic,protect|Bold|248,,240,,,20||,0,,,,|||]Kangaskhan||leftovers||focuspunch,return,shadowball,substitute|Adamant|212,252,,,,44|||||]Scyther||choiceband||hiddenpowerflying,silverwind,quickattack,steelwing|Hasty|4,252,,,,252||30,30,30,30,30,|||]Banette||salacberry||shadowball,destinybond,endure,hiddenpowerfighting|Adamant|12,252,,,,244||,,30,30,30,30|||',

				'Nidoking||softsand||earthquake,megahorn,shadowball,icebeam|Jolly|4,252,,,,252|||||]Sharpedo||salacberry||endure,hydropump,icebeam,crunch|Modest|4,,,252,,252||,0,,,,|||]Kangaskhan||leftovers||doubleedge,earthquake,shadowball,focuspunch|Jolly|4,252,,,,252|||||]Scyther||salacberry||swordsdance,aerialace,hiddenpowerground,batonpass|Jolly|4,252,,,,252||,,,30,30,|||]Hypno||leftovers||psychic,reflect,toxic,wish|Sassy|252,,156,,100,||,0,,,,|||]Omastar||mysticwater||raindance,hydropump,icebeam,hiddenpowergrass|Modest|40,,,252,,216||,30,,30,,|||',

				'Camerupt||leftovers||toxic,fireblast,earthquake,explosion|Brave|28,188,,136,156,|||||]Blastoise||leftovers||surf,icebeam,rapidspin,protect|Bold|252,,148,68,,40|||||]Electabuzz||leftovers||thunderbolt,icepunch,crosschop,substitute|Hasty|,84,,208,,216|||||]Grumpig||leftovers||calmmind,psychic,hiddenpowerdark,firepunch|Modest|200,,,220,,88|||||]Aggron||choiceband|1|rockslide,earthquake,doubleedge,focuspunch|Adamant|140,252,,,,116|||||]Nidoking||leftovers||earthquake,icebeam,megahorn,shadowball|Hasty|4,252,,,,252|||||',

				'Kangaskhan||leftovers||doubleedge,shadowball,earthquake,rest|Adamant|212,252,,,,44|||||]Muk||leftovers||sludgebomb,icepunch,explosion,hiddenpowerghost|Lonely|252,252,,4,,||,,30,,30,|||]Hypno||leftovers||wish,thunderwave,psychic,protect|Bold|252,,192,,,64||,0,,,,|||]Pinsir||leftovers||hiddenpowerbug,doubleedge,earthquake,swordsdance|Jolly|,252,4,,,252||,30,30,,30,|||]Lunatone||leftovers||calmmind,hypnosis,psychic,icebeam|Bold|252,,240,,,16||,0,,,,|||]Scyther||salacberry||endure,swordsdance,reversal,hiddenpowerbug|Adamant|128,252,,,,128||,30,30,,30,|||',

				'Omastar||leftovers||spikes,raindance,hydropump,icebeam|Modest|160,,,252,,96|M|,0,,,,|||]Hypno||leftovers||wish,protect,psychic,toxic|Bold|252,,176,,80,|M|,0,,,,|||]Gligar||leftovers||earthquake,hiddenpowerflying,irontail,swordsdance|Adamant|16,240,,,,252|M|30,30,30,30,30,|||]Tentacruel||leftovers||hydropump,sludgebomb,rapidspin,swordsdance|Hasty|,244,,80,,184|F|,,,30,30,|||]Kangaskhan||choiceband||return,earthquake,shadowball,focuspunch|Jolly|,252,,,4,252|||||]Sharpedo||salacberry||endure,crunch,hydropump,icebeam|Modest|,,,252,4,252||,0,,,,|||',

				'Hitmonlee||choiceband||highjumpkick,hiddenpowerghost,machpunch,earthquake|Adamant|,252,,,4,252||,,30,,30,|||]Sharpedo||salacberry||surf,crunch,icebeam,endure|Modest|,,,252,4,252|||||]Solrock||leftovers||reflect,earthquake,rockslide,explosion|Impish|252,76,176,,,4|||||]Cradily||leftovers||mirrorcoat,toxic,recover,rockslide|Adamant|252,192,,,64,|||||]Electabuzz||leftovers||thunderbolt,icepunch,hiddenpowergrass,substitute|Timid|4,,,252,,252||,30,,30,,|||]Gligar||leftovers||earthquake,hiddenpowerflying,irontail,swordsdance|Jolly|4,252,,,,252||30,30,30,30,30,|||',

				'Nidoking||choiceband||sludgebomb,earthquake,megahorn,icebeam|Jolly|,252,4,,,252|||||]Omastar||mysticwater||raindance,hydropump,icebeam,hiddenpowergrass|Modest|,,4,252,,252||,2,,30,,|||]Gorebyss||mysticwater||raindance,hydropump,hiddenpowergrass,icebeam|Modest|,,4,252,,252||,2,,30,,|||]Scyther||choiceband||hiddenpowerflying,silverwind,pursuit,quickattack|Jolly|,208,,,48,252||30,30,30,30,30,|||]Kangaskhan||leftovers||wish,return,shadowball,earthquake|Adamant|208,220,20,,,60|||||]Cradily||leftovers||toxic,recover,rockslide,earthquake|Careful|192,180,36,,84,16|||||',

				'Omastar||leftovers|1|protect,spikes,surf,toxic|Bold|252,,248,,,8|M|,0,,,,|||]Hypno||leftovers||protect,toxic,seismictoss,wish|Calm|252,,,,252,4|M|,0,,,,|||]Altaria||leftovers||rest,roar,healbell,toxic|Calm|252,,236,,20,|F|,0,,,,|||]Gligar||leftovers||swordsdance,earthquake,hiddenpowerflying,toxic|Impish|252,,244,,,12|M|30,30,30,30,30,|||]Kangaskhan||leftovers||frustration,toxic,protect,wish|Careful|252,16,16,,216,8|||||0]Blastoise||leftovers||surf,rapidspin,roar,toxic|Bold|252,,252,,,4|M|,0,,,,|||',

				'Ninetales||leftovers||willowisp,flamethrower,hiddenpowergrass,quickattack|Timid|4,,,252,,252||,30,,30,,|||]Tentacruel||leftovers|1|hydropump,icebeam,gigadrain,rapidspin|Timid|,,,252,4,252||,0,,,,|||]Lunatone||leftovers||calmmind,psychic,icebeam,batonpass|Bold|252,,160,,,96||,0,,,,|||]Shiftry||lumberry||sunnyday,solarbeam,hiddenpowerfire,explosion|Mild|,4,,252,,252||,30,,30,,30|||]Kangaskhan||choiceband||doubleedge,earthquake,shadowball,focuspunch|Jolly|4,252,,,,252|||||]Quagsire||leftovers|1|icebeam,earthquake,sleeptalk,rest|Relaxed|252,,216,,40,|||||',

				'Ninetales||leftovers||flamethrower,hiddenpowergrass,willowisp,quickattack|Hasty|,4,,252,,252||,30,,30,,|||]Shiftry||lumberry||solarbeam,sunnyday,hiddenpowerdark,explosion|Mild|,4,,252,,252|||||]Nidoqueen||choiceband||earthquake,superpower,shadowball,sludgebomb|Adamant|44,248,136,,,80|||||]Omastar||leftovers||spikes,surf,icebeam,toxic|Bold|252,,252,,4,||,0,,,,|||]Scyther||leftovers||substitute,swordsdance,hiddenpowerflying,silverwind|Jolly|,252,,,4,252||30,30,30,30,30,|||]Lanturn||leftovers||thunderbolt,toxic,icebeam,surf|Modest|164,,,252,,92||,0,,,,|||',

				'Fearow||choiceband||quickattack,drillpeck,return,hiddenpowerground|Jolly|4,252,,,,252||,,,30,30,|||]Cradily||leftovers||rockslide,earthquake,mirrorcoat,recover|Adamant|252,164,,,92,|||||]Tentacruel||leftovers||hydropump,sludgebomb,substitute,swordsdance|Hasty|,232,,92,,184|||||]Electrode||leftovers|1|thunderbolt,substitute,hiddenpowergrass,explosion|Hasty|,164,,168,,176||,30,,30,,|||]Omastar||leftovers|1|spikes,surf,icebeam,protect|Bold|252,,200,56,,|||||]Hitmontop||leftovers||bulkup,brickbreak,hiddenpowerghost,earthquake|Adamant|144,252,,,,112||,,30,,30,|||',

				'Scyther||salacberry||swordsdance,hiddenpowerbug,batonpass,aerialace|Jolly|,252,4,,,252|M|,30,30,,30,|||]Electrode||petayaberry||endure,thunderbolt,hiddenpowerice,explosion|Hasty|,4,,252,,252||,30,30,,,|||]Kabutops||salacberry|1|flail,rockslide,endure,swordsdance|Jolly|12,252,68,,,176|||||]Nidoking||leftovers||earthquake,sludgebomb,megahorn,icebeam|Hasty|4,252,,,,252|||||]Kangaskhan||leftovers||doubleedge,earthquake,rest,shadowball|Adamant|248,216,,,,44|||||]Misdreavus||leftovers||calmmind,thunderbolt,hiddenpowerice,thunderwave|Calm|240,,176,,16,76||,2,30,,,|||',

				'Fearow||choiceband||drillpeck,doubleedge,hiddenpowerground,batonpass|Jolly|4,252,,,,252||,,,30,30,|||]Gorebyss||leftovers||raindance,hydropump,icebeam,hiddenpowergrass|Modest|4,,,252,,252||,30,,30,,|||]Electrode||leftovers||explosion,thunderbolt,hiddenpowergrass,raindance|Hasty|4,,,252,,252||,30,,30,,|||]Clefable||leftovers||thunderwave,encore,softboiled,seismictoss|Calm|252,,,,252,4|||||]Vileplume||leftovers||gigadrain,hiddenpowerice,synthesis,sleeppowder|Bold|252,,252,,4,||,30,30,,,|||]Golem||choiceband||explosion,earthquake,hiddenpowerrock,doubleedge|Adamant|252,252,,,,4||,,30,,30,30|||',

				'Scyther||leftovers||swordsdance,hiddenpowerfighting,aerialace,batonpass|Jolly|,252,4,,,252||,,30,30,30,30|||]Golduck||leftovers||calmmind,surf,icebeam,substitute|Timid|,,4,252,,252|||||]Cradily||leftovers||rockslide,earthquake,toxic,recover|Adamant|252,164,,,92,|||||]Muk||choiceband|1|sludgebomb,sleeptalk,hiddenpowerghost,explosion|Adamant|240,252,,,,16||,,30,,30,|||]Lunatone||leftovers||icebeam,calmmind,psychic,hypnosis|Modest|252,,220,,,36|||||]Hitmontop||leftovers||bulkup,brickbreak,hiddenpowerghost,earthquake|Adamant|144,252,,,,112||,,30,,30,|||',

				'Kangaskhan||leftovers||doubleedge,earthquake,shadowball,wish|Adamant|160,252,,,,96|||||]Lunatone||leftovers||calmmind,icebeam,psychic,batonpass|Bold|252,,40,,,216|||||]Omastar||leftovers|1|surf,hiddenpowergrass,spikes,toxic|Bold|252,,136,114,,8|M|,30,,30,,|||]Ninetales||leftovers||fireblast,hiddenpowergrass,roar,quickattack|Timid|72,,,252,,184|F|,30,,30,,|||]Vileplume||leftovers||sunnyday,solarbeam,sleeppowder,hiddenpowerfire|Modest|116,,,248,,144|F|,30,,30,,30|||]Tentacruel||leftovers||swordsdance,hydropump,sludgebomb,substitute|Hasty|,252,,72,,184|M||||',


			],


			gen3nu: [
				'Vigoroth||salacberry||taunt,flail,earthquake,endure|Jolly|4,252,,,,252|||||]Torkoal||leftovers||fireblast,toxic,hiddenpowerwater,explosion|Sassy|252,,,4,252,||,30,30,30,,|||]Mawile||leftovers|1|substitute,swordsdance,batonpass,hiddenpowersteel|Adamant|88,252,,,,168||,,,,30,|||]Golbat||leftovers||sludgebomb,aerialace,hiddenpowerground,toxic|Jolly|4,252,,,,252||,,,30,30,|||]Kingler||choiceband||doubleedge,hiddenpowerground,surf,blizzard|Naughty|,252,,4,,252||,,,30,30,|||]Cacturne||leftovers||spikes,needlearm,hiddenpowerdark,destinybond|Timid|4,,,252,,252|||||',

				'Torkoal||leftovers||fireblast,toxic,protect,explosion|Sassy|252,,,4,252,|||||]Piloswine||leftovers||lightscreen,earthquake,icebeam,roar|Brave|212,204,,92,,|||||]Dewgong||leftovers||surf,icebeam,hiddenpowerelectric,encore|Modest|252,,,252,,4||,,,30,,|||]Hitmonchan||choiceband||skyuppercut,earthquake,hiddenpowerghost,machpunch|Adamant|4,252,,,,252||,,30,,30,|||]Arbok||leftovers||sludgebomb,earthquake,glare,protect|Adamant|76,252,,,,180|||||]Raticate||choiceband|1|doubleedge,shadowball,hiddenpowerground,quickattack|Jolly|4,252,,,,252||,,,30,30,|||',

				'Venomoth||leftovers||sleeppowder,psychic,hiddenpowerfire,stunspore|Timid|4,,,252,,252||,30,,30,,30|||]Lairon||leftovers|1|hiddenpowerrock,toxic,roar,protect|Careful|252,,4,,252,||,,30,,30,30|||]Hitmonchan||choiceband||skyuppercut,machpunch,hiddenpowerghost,earthquake|Adamant|4,252,,,,252||,,30,,30,|||]Pelipper||leftovers||hydropump,icebeam,hiddenpowergrass,agility|Modest|4,,,252,,252||,30,,30,,|||]Torkoal||leftovers||flamethrower,toxic,protect,explosion|Relaxed|252,,4,,252,|||||]Bellossom||leftovers||sunnyday,sleeppowder,solarbeam,hiddenpowerfire|Modest|148,,,252,,108||,30,,30,,30|||',

				'Hitmonchan||leftovers||brickbreak,hiddenpowerghost,toxic,rapidspin|Adamant|252,252,,,,4||,,30,,30,|||]Flareon||leftovers||flamethrower,wish,protect,toxic|Calm|252,,52,56,136,12|F||||]Mawile||leftovers|1|toxic,protect,hiddenpowersteel,batonpass|Impish|252,,252,,,4|M|,,,,30,|||]Sableye||leftovers||recover,shadowball,toxic,seismictoss|Bold|252,,228,,28,|M||||]Roselia||leftovers||spikes,aromatherapy,synthesis,hiddenpowergrass|Bold|252,,188,,60,8|F|,30,,30,,|||]Pelipper||leftovers||rest,sleeptalk,surf,toxic|Bold|252,,252,,,4|M||||',

				'Venomoth||leftovers||sleeppowder,psychic,hiddenpowerfire,stunspore|Timid|4,,,252,,252||,30,,30,,30|||]Lairon||leftovers|1|hiddenpowerrock,toxic,roar,protect|Careful|252,,4,,252,||,,30,,30,30|||]Hitmonchan||choiceband||skyuppercut,machpunch,hiddenpowerghost,earthquake|Adamant|4,252,,,,252||,,30,,30,|||]Pelipper||leftovers||hydropump,icebeam,hiddenpowergrass,agility|Modest|4,,,252,,252||,30,,30,,|||]Torkoal||leftovers||flamethrower,toxic,protect,explosion|Relaxed|252,,4,,252,|||||]Bellossom||leftovers||sunnyday,sleeppowder,solarbeam,hiddenpowerfire|Modest|148,,,252,,108||,30,,30,,30|||',

				'Hitmonchan||leftovers||rapidspin,skyuppercut,machpunch,hiddenpowerghost|Impish|252,4,252,,,||,,30,,30,|||]Flareon||leftovers||flamethrower,wish,toxic,protect|Timid|252,,52,56,12,136|M||||]Lileep||leftovers||recover,gigadrain,protect,toxic|Bold|252,,196,,60,|F||||]Sableye||leftovers||recover,toxic,protect,shadowball|Careful|252,8,60,,184,4|F||||]Chimecho||leftovers||psychic,healbell,protect,calmmind|Bold|252,,252,,,4|M||||]Dewgong||leftovers||perishsong,sleeptalk,surf,rest|Bold|252,,156,,100,|M||||',

				'Pidgeot||choiceband||doubleedge,aerialace,toxic,hiddenpowerground|Adamant|4,252,,,,252|M|,,,30,30,|||]Hitmonchan||leftovers||bulkup,skyuppercut,hiddenpowerghost,rockslide|Jolly|4,252,,,,252||,,30,,30,|||]Magcargo||leftovers||fireblast,yawn,selfdestruct,rockslide|Relaxed|252,,252,,4,|M||||]Roselia||leftovers||spikes,stunspore,magicalleaf,leechseed|Calm|252,,,4,252,|F||||]Chimecho||leftovers||calmmind,psychic,reflect,hiddenpowerfire|Bold|252,,252,,4,|M|,30,,30,,30|||]Seaking||leftovers||hydropump,icebeam,raindance,hiddenpowergrass|Modest|4,,,252,,252|F|,30,,30,,|||',

				'Glalie||leftovers||spikes,taunt,explosion,icebeam|Naive|252,4,,,,252|||||]Mawile||leftovers|1|substitute,focuspunch,batonpass,hiddenpowersteel|Adamant|252,132,,,,124||,,,,30,|||]Golbat||leftovers||sludgebomb,hiddenpowerflying,gigadrain,protect|Naughty|252,112,,,,144||30,30,30,30,30,|||]Huntail||leftovers||raindance,hydropump,icebeam,hiddenpowerelectric|Modest|148,,,252,,108||,,,30,,|||]Piloswine||choiceband||earthquake,rockslide,blizzard,doubleedge|Naughty|208,252,,,,48|||||]Noctowl||leftovers||toxic,hiddenpowerflying,whirlwind,protect|Careful|252,,,,252,4||30,30,30,30,30,|||',

				'Sudowoodo||choiceband||rockslide,earthquake,explosion,hiddenpowerflying|Adamant|252,252,,,4,|M|30,30,30,30,30,|||]Tangela||leftovers||sunnyday,sleeppowder,solarbeam,hiddenpowerfire|Modest|4,,,252,,252|M|,30,,30,,30|||]Haunter||leftovers||thunderbolt,substitute,explosion,hiddenpowerdark|Naive|,4,,252,,252|M||||]Shelgon||leftovers||brickbreak,rockslide,dragondance,doubleedge|Adamant|4,252,,,,252|M||||]Chimecho||leftovers||reflect,psychic,lightscreen,toxic|Bold|252,,252,,4,|F||||]Dewgong||leftovers||surf,icebeam,rest,sleeptalk|Calm|252,,4,,252,|F||||',

				'Hitmonchan||leftovers||skyuppercut,machpunch,earthquake,toxic|Adamant|,252,4,,,252|||||]Haunter||leftovers||substitute,hiddenpowerfire,psychic,thunderbolt|Timid|,,,252,4,252||,30,,30,,30|||]Metang||leftovers||meteormash,toxic,reflect,explosion|Impish|252,4,252,,,|||||]Kecleon||leftovers||return,shadowball,toxic,protect|Careful|252,4,,,252,|||||]Octillery||leftovers||surf,fireblast,hiddenpowerelectric,thunderwave|Modest|40,,,252,,216||,,,30,,|||]Pupitar||leftovers||dragondance,earthquake,rockslide,hiddenpowerbug|Jolly|4,252,,,,252||,30,30,,30,|||',

				'Glalie||leftovers||spikes,taunt,icebeam,explosion|Naive|252,4,,,,252|F||||]Hitmonchan||choiceband||skyuppercut,hiddenpowerghost,machpunch,rockslide|Adamant|4,252,,,,252||,,30,,30,|||]Relicanth||leftovers||rockslide,toxic,rest,sleeptalk|Impish|252,,252,,,4|||||]Kecleon||leftovers||toxic,bodyslam,shadowball,icywind|Sassy|252,4,,,252,|M||||]Chimecho||leftovers||psychic,protect,toxic,reflect|Modest|252,,,252,,4|||||]Bellossom||leftovers||sleeppowder,sunnyday,solarbeam,hiddenpowerfire|Modest|4,,,252,,252|F|,30,,30,,30|||',

				'Hitmonchan||leftovers||skyuppercut,hiddenpowerghost,rapidspin,machpunch|Adamant|184,252,,,,72||,,30,,30,|||]Venomoth||leftovers||substitute,hiddenpowerbug,sludgebomb,batonpass|Adamant|,252,,,4,252||,30,30,,30,|||]Mawile||leftovers|1|irondefense,hiddenpowersteel,batonpass,substitute|Adamant|124,252,,,,132||,,,,30,|||]Vigoroth||leftovers||taunt,shadowball,bulkup,slackoff|Adamant|252,104,,,,152|||||]Bellossom||leftovers||sunnyday,solarbeam,hiddenpowerfire,sleeppowder|Modest|108,,,252,,148||,30,,30,,30|||]Abra||twistedspoon||psychic,firepunch,thunderpunch,encore|Timid|,,4,252,,252|||||',

				'Hitmonchan||leftovers||rapidspin,skyuppercut,hiddenpowerghost,toxic|Adamant|252,,120,,,136||,,30,,30,|||]Swalot||leftovers||sludgebomb,hiddenpowerground,counter,explosion|Impish|252,,84,,172,||,,,30,30,|||]Sableye||leftovers||recover,calmmind,hiddenpowerdark,substitute|Bold|252,,252,,4,|||||]Roselia||leftovers||spikes,leechseed,toxic,hiddenpowergrass|Calm|252,,4,,252,||,30,,30,,|||]Chimecho||leftovers||healbell,toxic,protect,psychic|Modest|252,,144,112,,|||||]Dewgong||leftovers||icebeam,perishsong,toxic,protect|Calm|252,,4,,252,|||||',

				'Torkoal||leftovers||fireblast,protect,toxic,explosion|Sassy|252,,4,,252,|||||]Golbat||leftovers||sludgebomb,toxic,aerialace,hiddenpowerground|Jolly|4,252,,,,252||,,,30,30,|||]Mawile||leftovers|1|substitute,batonpass,swordsdance,hiddenpowersteel|Adamant|128,252,,,,128||,,,,30,|||]Dewgong||leftovers||surf,toxic,rest,sleeptalk|Calm|252,,,,252,4|||||]Tropius||leftovers||swordsdance,hiddenpowerflying,earthquake,synthesis|Jolly|160,252,,,,96||30,30,30,30,30,|||]Pupitar||leftovers||dragondance,earthquake,rockslide,hiddenpowerbug|Jolly|4,252,,,,252||,30,30,,30,|||',

				'Vigoroth||salacberry||taunt,flail,earthquake,endure|Jolly|4,252,,,,252|||||]Torkoal||leftovers||fireblast,toxic,hiddenpowerwater,explosion|Sassy|252,,,4,252,||,30,30,30,,|||]Mawile||leftovers|1|substitute,swordsdance,batonpass,hiddenpowersteel|Adamant|88,252,,,,168||,,,,30,|||]Golbat||leftovers||sludgebomb,aerialace,hiddenpowerground,toxic|Jolly|4,252,,,,252||,,,30,30,|||]Kingler||choiceband||doubleedge,hiddenpowerground,surf,blizzard|Naughty|,252,,4,,252||,,,30,30,|||]Cacturne||leftovers||spikes,needlearm,hiddenpowerdark,destinybond|Timid|4,,,252,,252|||||',

				'Seadra||petayaberry||hydropump,icebeam,hiddenpowergrass,endure|Timid|4,,,252,,252||,30,,30,,|||]Murkrow||choiceband||drillpeck,doubleedge,shadowball,hiddenpowergrass|Naive|4,252,,,,252||,30,,30,,|||]Flareon||leftovers||fireblast,batonpass,overheat,hiddenpowergrass|Modest|4,,,252,,252||,30,,30,,|||]Dewgong||leftovers||icebeam,toxic,rest,sleeptalk|Calm|252,,,,252,4|||||]Hitmonchan||leftovers||rapidspin,skyuppercut,hiddenpowerghost,toxic|Adamant|192,252,,,,64||,,30,,30,|||]Vigoroth||salacberry||endure,earthquake,flail,shadowball|Adamant|4,252,,,,252|||||',


			],

			gen3pu: [
				'Aipom||leftovers|1|substitute,batonpass,doubleedge,hiddenpowergrass|Naive|,252,,4,,252||,30,,30,,|||]Dragonair||leftovers||icebeam,thunderbolt,toxic,rest|Calm|248,,,,252,8|||||]Clamperl||deepseatooth||surf,icebeam,hiddenpowerelectric,substitute|Modest|,,4,252,,252||,3,,30,,|||]Shuckle||leftovers||toxic,wrap,encore,rest|Impish|252,,252,,,4|||||]Marshtomp||leftovers||earthquake,surf,toxic,protect|Relaxed|248,,252,,8,|||||]Ivysaur||leftovers||synthesis,hiddenpowergrass,toxic,leechseed|Calm|252,,,,224,32||,2,,30,,|||',

				'Snorunt||salacberry||spikes,icywind,icebeam,endure|Timid|252,,,,4,252||,0,,,,|||]Aipom||leftovers|1|hiddenpowergrass,batonpass,substitute,agility|Timid|252,,,4,,252||,2,,30,,|||]Seviper||leftovers||sludgebomb,earthquake,crunch,rest|Adamant|,252,,,4,252|||||]Sunflora||leftovers||gigadrain,hiddenpowerice,substitute,growth|Calm|252,,,,64,192||,2,30,,,|||]Clamperl||deepseatooth||surf,icebeam,hiddenpowerelectric,substitute|Modest|,,,252,4,252||,3,,30,,|||]Gastly||leftovers||thunderbolt,hiddenpowerice,gigadrain,destinybond|Naive|,4,,252,,252||,2,30,,,|||',

				'Marshtomp||choiceband||earthquake,rockslide,hiddenpowerghost,bodyslam|Adamant|,252,,,4,252||,,30,,30,|||]Sealeo||leftovers||substitute,surf,icebeam,encore|Modest|52,,,252,,204||,0,,,,|||]Houndour||leftovers|1|pursuit,crunch,fireblast,hiddenpowergrass|Modest|,,,252,4,252||,2,,30,,|||]Shuckle||leftovers||rocktomb,toxic,encore,rest|Impish|248,,248,,,12|||||]Minun||leftovers||wish,protect,batonpass,thunderbolt|Timid|,,,252,4,252||,0,,,,|||]Doduo||choiceband|1|doubleedge,drillpeck,hiddenpowerground,quickattack|Jolly|,252,4,,,252||,,,30,30,|||',

				'Lairon||leftovers|1|irontail,rockslide,earthquake,protect|Adamant|,252,,,4,252|||||]Mightyena||leftovers||crunch,healbell,roar,protect|Bold|252,,252,,,4||,0,,,,|||]Duskull||leftovers||willowisp,nightshade,rest,sleeptalk|Bold|248,,252,,,8||,0,,,,|||]Tentacool||leftovers|1|surf,toxic,protect,rapidspin|Calm|252,,,4,252,||,0,,,,|||]Minun||leftovers||wish,protect,thunderbolt,batonpass|Timid|252,,,,4,252||,0,,,,|||]Furret||choiceband|1|doubleedge,shadowball,brickbreak,quickattack|Jolly|,252,,,4,252|||||',

				'Omanyte||leftovers|1|spikes,toxic,surf,icebeam|Bold|252,,252,,4,||,0,,,,|||]Weepinbell||leftovers||solarbeam,hiddenpowerfire,sleeppowder,sunnyday|Modest|,,,252,4,252||,2,,30,,30|||]Lickitung||leftovers|1|wish,protect,seismictoss,healbell|Careful|252,,,,252,4||,0,,,,|||]Dustox||leftovers||moonlight,toxic,protect,psychic|Bold|252,,160,,,96||,0,,,,|||]Machoke||leftovers||bulkup,crosschop,rockslide,hiddenpowerghost|Adamant|104,252,,,,152||,,30,,30,|||]Rhyhorn||leftovers||protect,toxic,rockslide,earthquake|Impish|252,4,252,,,|||||',

				'Omanyte||leftovers|1|protect,surf,icebeam,spikes|Bold|244,,228,,36,||,0,,,,|||]Smoochum||salacberry||icebeam,psychic,substitute,calmmind|Timid|,,4,252,,252||28,0,,,,|||]Duskull||leftovers||nightshade,taunt,willowisp,rest|Careful|252,4,,,252,||,0,,,,|||]Mightyena||leftovers||protect,crunch,healbell,roar|Bold|252,,252,,4,||,0,,,,|||]Quilava||leftovers||overheat,fireblast,quickattack,hiddenpowergrass|Timid|,4,,252,,252||,30,,30,,|||]Drowzee||leftovers||protect,wish,thunderwave,seismictoss|Calm|252,,4,,252,||,0,,,,|||',

				'Aipom||choiceband||frustration,irontail,shadowball,batonpass|Jolly|,252,,,4,252|||||0]Furret||leftovers|1|doubleedge,shadowball,substitute,focuspunch|Naive|,252,4,,,252|||||]Beedrill||leftovers||swordsdance,sludgebomb,hiddenpowerghost,brickbreak|Jolly|,252,,,4,252||,,30,,30,|||]Marshtomp||leftovers||earthquake,surf,toxic,protect|Relaxed|252,,252,,4,|||||]Shuckle||leftovers||toxic,wrap,encore,protect|Impish|252,,252,,,4|||||]Dragonair||leftovers||thunderwave,rest,thunderbolt,icebeam|Bold|252,,216,,,40||,0,,,,|||',

				'Furret||choiceband|1|doubleedge,shadowball,irontail,focuspunch|Naive|,252,,4,,252|||||]Gastly||leftovers||thunderbolt,hiddenpowerice,gigadrain,destinybond|Timid|,,,252,4,252||,2,30,,,|||]Omanyte||leftovers|1|surf,icebeam,toxic,spikes|Bold|252,,252,,4,||,0,,,,|||]Dragonair||leftovers||thunderbolt,icebeam,fireblast,thunderwave|Timid|,,,252,4,252||,0,,,,|||]Vibrava||choiceband||earthquake,rockslide,hiddenpowerghost,quickattack|Jolly|,252,,,4,252||,,30,,30,|||]Marshtomp||choiceband||earthquake,rockslide,bodyslam,hiddenpowerghost|Adamant|,252,,,4,252||,,30,,30,|||',

				'Aipom||choiceband||doubleedge,irontail,shadowball,batonpass|Jolly|,252,4,,,252|F||S||]Omanyte||leftovers|1|spikes,icebeam,toxic,protect|Bold|248,,248,,,12|F|,0,,,,|S||]Marshtomp||choiceband||earthquake,doubleedge,rockslide,hiddenpowerflying|Adamant|,252,4,,,252|F|30,30,30,30,30,|S||]Dragonair||leftovers||fireblast,icebeam,thunderbolt,agility|Modest|168,,,224,,116|F|,0,,,,|S||]Vibrava||choiceband||earthquake,doubleedge,rockslide,quickattack|Jolly|,252,4,,,252|F||S||]Gastly||magnet||thunderbolt,hiddenpowerice,willowisp,destinybond|Timid|,,4,252,,252|F|,2,30,,,|S||',

				'Corsola||leftovers|1|surf,icebeam,recover,calmmind|Bold|252,,252,,4,||,0,,,,|||]Sunflora||leftovers||gigadrain,hiddenpowerice,substitute,growth|Calm|252,,,,64,192||,2,30,,,|||]Houndour||salacberry|1|fireblast,crunch,pursuit,hiddenpowergrass|Timid|,,,252,4,252||,2,,30,,|||]Pineco||leftovers||spikes,rapidspin,explosion,toxic|Careful|252,,4,,252,|||||]Aipom||choiceband||doubleedge,shadowball,irontail,batonpass|Jolly|4,252,,,,252|||||]Duskull||leftovers||willowisp,nightshade,rest,sleeptalk|Bold|252,,252,,4,||,0,,,,|||',

				'Snorunt||salacberry||spikes,icywind,icebeam,endure|Timid|252,,,,4,252||,0,,,,|||]Dragonair||leftovers||hiddenpowerground,dragondance,doubleedge,irontail|Adamant|,252,4,,,252||,,,30,30,|||0]Minun||magnet||thunderbolt,batonpass,hiddenpowergrass,substitute|Timid|4,,,252,,252||,30,,30,,|||]Beedrill||salacberry||swordsdance,sludgebomb,endure,brickbreak|Jolly|,252,,,4,252|||||]Combusken||salacberry||reversal,endure,swordsdance,flamethrower|Hasty|,252,,4,,252|||||]Sealeo||leftovers||protect,surf,icebeam,toxic|Bold|252,,252,,4,||,0,,,,|||',

				'Omanyte||leftovers|1|spikes,icebeam,toxic,protect|Bold|248,,248,,,12|F|,0,,,,|S||]Drowzee||leftovers||wish,protect,seismictoss,toxic|Calm|240,,,,252,16|F|,0,,,,|S||]Shuckle||leftovers||wrap,toxic,encore,rest|Impish|248,,248,,,12|F||S||]Tentacool||leftovers|1|rapidspin,surf,toxic,protect|Calm|248,,,,248,12|F|,0,,,,|S||]Mightyena||leftovers||crunch,roar,protect,healbell|Bold|248,,248,,,12|F|,0,,,,|||]Bayleef||leftovers||hiddenpowergrass,leechseed,synthesis,reflect|Bold|240,,224,,,44|F|,2,,30,,|S||',


				'Doduo||salacberry|1|drillpeck,flail,endure,hiddenpowerground|Jolly|,252,,4,,252||,,,30,30,|||]Clamperl||deepseatooth||surf,hiddenpowergrass,icebeam,icywind|Modest|,,4,252,,252||,2,,30,,|||]Rhyhorn||choiceband|1|earthquake,rockslide,megahorn,hiddenpowerghost|Adamant|,252,,,4,252||,,30,,30,|||]Koffing||leftovers||sludgebomb,haze,willowisp,painsplit|Impish|252,,252,,,4|||||]Chinchou||leftovers||hydropump,thunderbolt,thunderwave,hiddenpowergrass|Modest|252,,,252,4,||,2,,30,,|||]Machoke||choiceband||crosschop,rockslide,hiddenpowerghost,facade|Adamant|104,252,,,,152||,,30,,30,|||',

				'Marshtomp||choiceband||earthquake,rockslide,hiddenpowerghost,bodyslam|Adamant|,252,,,4,252||,,30,,30,|||0]Ponyta||leftovers|1|fireblast,hiddenpowergrass,quickattack,toxic|Timid|,,,252,4,252||,30,,30,,|||]Dragonair||leftovers||thunderbolt,icebeam,hiddenpowergrass,thunderwave|Modest|,,,252,4,252||,2,,30,,|||]Corsola||leftovers|1|calmmind,recover,surf,icebeam|Bold|252,,252,,,4||,0,,,,|||]Gastly||leftovers||thunderbolt,hiddenpowerice,gigadrain,substitute|Timid|,,,252,4,252||,2,30,,,|||]Yanma||liechiberry||substitute,reversal,hiddenpowerflying,toxic|Jolly|,252,,,4,252||30,30,30,30,30,|||',


				'Aipom||leftovers|1|doubleedge,substitute,hiddenpowergrass,batonpass|Naive|,252,,4,,252||,30,,30,,|||0]Drowzee||leftovers||wish,seismictoss,protect,psychic|Calm|248,,,,252,8|||||]Clamperl||deepseatooth||surf,hiddenpowerelectric,icebeam,substitute|Modest|,,4,252,,252||,3,,30,,|||]Shuckle||leftovers||toxic,wrap,encore,rest|Impish|252,,252,,,4|||||]Marshtomp||leftovers||earthquake,surf,toxic,protect|Relaxed|248,,252,,8,|||||]Ivysaur||leftovers||synthesis,hiddenpowergrass,toxic,leechseed|Calm|252,,,,224,32||,2,,30,,|||',


				'Aipom||leftovers|1|doubleedge,substitute,hiddenpowergrass,batonpass|Naive|,252,,4,,252||,30,,30,,|||0]Dragonair||leftovers||icebeam,thunderbolt,toxic,rest|Calm|248,,,,252,8||,0,,,,|||]Clamperl||deepseatooth||surf,hiddenpowerelectric,icebeam,substitute|Modest|,,4,252,,252||,3,,30,,|||]Shuckle||leftovers||toxic,wrap,encore,rest|Impish|252,,252,,,4|||||]Marshtomp||leftovers||earthquake,surf,toxic,protect|Relaxed|248,,252,,8,|||||]Ivysaur||leftovers||synthesis,hiddenpowergrass,toxic,leechseed|Calm|252,,,,224,32||,2,,30,,|||',


				'Ponyta||leftovers|1|fireblast,hiddenpowergrass,quickattack,toxic|Hasty|,4,,252,,252||,30,,30,,|||]Omanyte||leftovers||surf,icebeam,hiddenpowergrass,spikes|Bold|248,,188,,,72||,2,,30,,|||]Dragonair||leftovers||icebeam,thunderbolt,thunderwave,rest|Calm|248,,,,252,8||,0,,,,|||]Gastly||leftovers||substitute,thunderbolt,psychic,taunt|Timid|,,,252,4,252||,0,,,,|||]Doduo||choiceband|1|drillpeck,doubleedge,quickattack,hiddenpowerground|Jolly|,252,4,,,252||,,,30,30,|||]Beedrill||salacberry||substitute,swordsdance,sludgebomb,hiddenpowerbug|Jolly|,252,4,,,252||,30,30,,30,|||',


			],


			gen3lc: [

				'Houndour||salacberry|1|fireblast,endure,overheat,crunch|Timid|,,36,200,36,236|M|,0,,30,,||5|]Shellder||sitrusberry||surf,explosion,rapidspin,icywind|Bold|196,,196,,,116|M|||5|]Trapinch||sitrusberry|1|hiddenpowerbug,earthquake,rockslide,quickattack|Adamant|76,36,156,,240,|M|,30,30,,30,||5|]Elekid||petayaberry||substitute,thunderbolt,icepunch,hiddenpowergrass|Timid|,,,240,,236|M|,2,,30,,||5|]Anorith||sitrusberry||swordsdance,rockblast,doubleedge,hiddenpowerbug|Jolly|,240,,,,236|M|,30,30,,30,||5|]Doduo||choiceband|1|drillpeck,doubleedge,hiddenpowergrass,quickattack|Naive|,240,,,,236|M|,30,,30,,||5|',

				'Voltorb||sitrusberry|1|thunderbolt,taunt,thunderwave,explosion|Hasty|,40,,240,,196||||5|]Diglett||salacberry|1|endure,earthquake,sludgebomb,rockslide|Hasty|36,236,,,,236||||5|]Doduo||choiceband|1|drillpeck,doubleedge,quickattack,hiddenpowergrass|Naive|,240,,,,236||,30,,30,,||5|]Shellder||sitrusberry||surf,icywind,rapidspin,explosion|Bold|196,,196,,,116||||5|]Exeggcute||sitrusberry||sleeppowder,explosion,solarbeam,sunnyday|Modest|36,,,196,,196||||5|]Oddish||sitrusberry||sunnyday,sleeppowder,solarbeam,hiddenpowerfire|Modest|,,,236,,196||,2,,30,,30||5|',

				'Abra||salacberry|1|psychic,hiddenpowerwater,endure,thunderpunch|Timid|,,76,236,,196||,2,30,30,,||5|]Diglett||choiceband|1|earthquake,rockslide,hiddenpowerghost,sludgebomb|Jolly|36,236,,,,236||,,30,,30,||5|]Doduo||sitrusberry|1|drillpeck,hiddenpowerfighting,doubleedge,quickattack|Adamant|,236,,,,240||,,30,30,30,30||5|]Larvitar||sitrusberry||dragondance,earthquake,rockslide,hiddenpowerfighting|Jolly|,244,40,,,192||,,30,30,30,30||5|]Meowth||silkscarf||fakeout,doubleedge,shadowball,hypnosis|Jolly|36,236,,,36,200||||5|]Koffing||sitrusberry||explosion,sludgebomb,willowisp,hiddenpowerfighting|Impish|36,76,236,,160,||,,30,30,30,30||5|',

				'Pineco||sitrusberry||spikes,explosion,rapidspin,bodyslam|Careful|196,,36,,236,|||S|5|]Bagon||sitrusberry||dragondance,doubleedge,hiddenpowerghost,substitute|Adamant|76,236,,,,196||,,30,,30,||5|]Larvitar||berryjuice||dragondance,earthquake,rockslide,substitute|Jolly|,244,36,,36,188||||5|]Staryu||berryjuice|1|hydropump,thunderwave,icebeam,recover|Timid|36,,,196,,236||,0,,,,||5|]Duskull||berryjuice||thief,shadowball,memento,willowisp|Careful|196,,196,,116,|||S|5|]Porygon||sitrusberry||icebeam,thunderbolt,thunderwave,recycle|Modest|,,196,156,156,||,0,,,,||5|',

				'Ponyta||sitrusberry|1|hiddenpowergrass,fireblast,doublekick,flamethrower|Timid|36,,,240,,196||,30,,30,,||5|]Baltoy||sitrusberry||shadowball,earthquake,explosion,rapidspin|Adamant|116,196,156,,36,||||5|]Cacnea||sitrusberry||spikes,gigadrain,encore,destinybond|Timid|116,,36,76,36,236||||5|]Chinchou||sitrusberry||icebeam,thunder,raindance,surf|Timid|,,52,232,,220||,0,,,,||5|]Horsea||sitrusberry||surf,icebeam,raindance,hiddenpowergrass|Modest|,,36,196,76,196||,2,,30,,||5|]Diglett||choiceband|1|earthquake,rockslide,hiddenpowerbug,doubleedge|Hasty|,240,,,,236||,30,30,,30,||5|',

				'Elekid||berryjuice||substitute,thunderbolt,icepunch,focuspunch|Naive|,92,,160,,236|M|,30,,30,,||5|]Oddish||sitrusberry||sunnyday,solarbeam,hiddenpowerfire,sleeppowder|Timid|156,,76,160,,40|F|,2,,30,,30||5|]Wailmer||sitrusberry||waterspout,hiddenpowergrass,icebeam,hydropump|Timid|36,,76,200,,196|M|,30,,30,,||5|]Ponyta||berryjuice|1|sunnyday,fireblast,solarbeam,agility|Timid|,,76,236,,196|F|,0,,,,|S|5|]Porygon||sitrusberry||thunderwave,icebeam,thunder,recycle|Bold|156,,156,,156,||,0,,,,||5|]Trapinch||berryjuice|1|hiddenpowerbug,earthquake,rockslide,quickattack|Adamant|76,36,156,,240,|M|,30,30,,30,||5|',

				'Meowth||silkscarf||fakeout,doubleedge,hypnosis,shadowball|Jolly|36,236,,,,196|M|||5|]Diglett||berryjuice|1|earthquake,rockslide,thief,substitute|Jolly|36,236,,,,236|M|||5|]Doduo||salacberry|1|endure,flail,drillpeck,hiddenpowergrass|Adamant|,236,,,,236|M|,30,,30,,||5|]Ponyta||sitrusberry||sunnyday,fireblast,agility,solarbeam|Timid|36,,,236,,196|M|,0,,,,|S|5|]Gastly||choiceband||shadowball,sludgebomb,hiddenpowerground,explosion|Jolly|36,236,36,,,196|M|,,,30,30,|S|5|]Wailmer||sitrusberry||waterspout,hiddenpowergrass,hydropump,icebeam|Timid|196,,,116,,196|M|,2,,30,,||5|',

				'Ponyta||sitrusberry||solarbeam,agility,sunnyday,fireblast|Timid|76,,,236,,196|F|,0,,,,|S|5|]Poliwag||berryjuice||bellydrum,return,hiddenpowerghost,hypnosis|Jolly|,196,40,,40,196|M|,,30,,30,||5|]Porygon||berryjuice||agility,shadowball,recover,frustration|Adamant|76,196,,,,196||||5|0]Ledyba||salacberry|1|substitute,batonpass,gigadrain,endure|Timid|196,,40,36,,236|F|,0,,,,||5|]Trapinch||berryjuice|1|hiddenpowerbug,earthquake,rockslide,quickattack|Adamant|76,36,156,,240,|M|,30,30,,30,||5|]Wailmer||sitrusberry||waterspout,selfdestruct,hydropump,icebeam|Modest|196,,,116,,196|M|||5|',


				'Pineco||sitrusberry||hiddenpowerghost,spikes,rapidspin,explosion|Impish|116,,200,,160,||,,30,,30,||5|]Lotad||sitrusberry||gigadrain,surf,raindance,thief|Calm|36,,36,116,196,116||,0,,,,||5|]Kabuto||petayaberry||substitute,surf,icebeam,raindance|Modest|36,,,236,,236||,0,,,,||5|]Porygon||sitrusberry||recycle,thunderbolt,icebeam,thunderwave|Timid|76,,,76,156,196||,0,,,,||5|]Abra||berryjuice|1|calmmind,psychic,substitute,thief|Timid|76,,,236,,196||,0,,,,||5|]Doduo||choiceband|1|doubleedge,drillpeck,quickattack,return|Jolly|,236,,,,236||||5|',

				'Pineco||sitrusberry||spikes,rapidspin,explosion,earthquake|Adamant|,236,36,,236,||||5|]Porygon||sitrusberry||recover,icebeam,thunderwave,thunderbolt|Modest|,,200,236,,72||,30,30,,,||5|]Magnemite||sitrusberry||toxic,substitute,thunderbolt,hiddenpowerice|Bold|,,200,72,236,||,30,30,,,||5|]Mankey||choiceband||crosschop,earthquake,rockslide,hiddenpowerghost|Jolly|116,196,,,,196||,,30,,30,||5|]Chinchou||sitrusberry||surf,thunderbolt,icebeam,thunderwave|Modest|,,52,228,228,||||5|]Diglett||choiceband|1|earthquake,hiddenpowerbug,rockslide,sleeptalk|Jolly|28,244,,,,236||,30,30,,30,||5|',


			],


			gen4ou: [
				'Flygon||choicescarf||outrage,earthquake,uturn,stoneedge|Adamant|,252,,,4,252|||||]Scizor||choiceband|1|uturn,superpower,quickattack,bulletpunch|Adamant|224,252,,,,32|M||||]Breloom||toxicorb|1|spore,machpunch,seedbomb,superpower|Adamant|204,252,,,,52|||||]Heatran||passhoberry||fireblast,earthpower,hiddenpowerelectric,stealthrock|Timid|44,,,212,,252||,3,,30,,|||]Starmie||leftovers|1|surf,thunderbolt,icebeam,rapidspin|Timid|4,,,252,,252||,0,,,,|||]Tyranitar||shucaberry||dragondance,stoneedge,icepunch,earthquake|Jolly|,252,4,,,252|F||||',

				'Skarmory||shedshell|1|bravebird,stealthrock,spikes,roost|Impish|252,,232,,,24|||||]Breloom||toxicorb|1|seedbomb,superpower,machpunch,spore|Jolly|4,252,,,,252|||||]Gyarados||choiceband||waterfall,earthquake,stoneedge,payback|Adamant|72,252,,,,184|||||]Scizor||leftovers|1|bulletpunch,bugbite,swordsdance,roost|Adamant|248,44,,,216,|||||]Jolteon||expertbelt||thunderbolt,hiddenpowerice,shadowball,batonpass|Timid|,,,252,4,252||,2,30,,,|||]Infernape||choicescarf||flareblitz,closecombat,hiddenpowerice,uturn|Naive|,252,,4,,252||,30,30,,,|||',

				'Flygon||choicescarf||earthquake,outrage,firepunch,uturn|Jolly|,252,,,4,252|||||]Skarmory||leftovers|1|bravebird,spikes,whirlwind,roost|Impish|252,,232,,,24|||||]Tentacruel||leftovers|1|surf,sludgebomb,rapidspin,toxicspikes|Calm|252,,120,,136,||,0,,,,|||]Rotom-Wash||leftovers||thunderbolt,shadowball,protect,willowisp|Bold|252,,208,,,48||,0,,,,|||]Tyranitar||lumberry||stoneedge,superpower,fireblast,stealthrock|Hasty|,252,,16,,240|||||]Raikou||lifeorb||thunderbolt,shadowball,hiddenpowerice,calmmind|Timid|4,,,252,,252||,2,30,,,|||',

				'Bronzong||damprock|levitate|raindance,hypnosis,stealthrock,explosion|Impish|252,152,8,,96,|||||]Cresselia||lightclay|levitate|psychic,thunderwave,raindance,lunardance|Bold|252,,148,,40,68||,0,,,,|||]Kingdra||choicespecs|swiftswim|hydropump,surf,dracometeor,dragonpulse|Timid|32,,,252,,224||,0,,,,|||]Qwilfish||lifeorb|swiftswim|waterfall,poisonjab,swordsdance,explosion|Adamant|,252,4,,,252|||||]Heracross||choiceband|guts|closecombat,megahorn,stoneedge,sleeptalk|Jolly|4,252,,,,252|||||]Metagross||lumberry|clearbody|meteormash,earthquake,thunderpunch,agility|Jolly|60,252,,,,196|||||',

				'Tyranitar||custapberry||stoneedge,superpower,fireblast,pursuit|Hasty|,252,,16,,240|||||]Jirachi||leftovers||psychic,grassknot,hiddenpowerground,calmmind|Timid|,,,252,4,252||,3,,30,30,|||]Bronzong||leftovers||earthquake,hiddenpowerice,payback,stealthrock|Sassy|252,84,80,,92,||,30,30,,,|||]Zapdos||leftovers||discharge,hiddenpowerice,toxic,roost|Timid|192,,64,,,252||,2,30,,,|||]Lucario||choicescarf||closecombat,thunderpunch,icepunch,crunch|Jolly|,252,,,4,252|||||]Starmie||lifeorb|1|hydropump,thunderbolt,icebeam,recover|Timid|,,,252,4,252|||||',

				'Machamp||lumberry|1|dynamicpunch,payback,stoneedge,bulletpunch|Adamant|16,252,,,,240|||||]Tyranitar||lumberry||stoneedge,crunch,stealthrock,pursuit|Adamant|180,252,,,,76|||||]Breloom||toxicorb|1|seedbomb,superpower,machpunch,spore|Jolly|4,252,,,,252|||||]Gyarados||leftovers||waterfall,earthquake,stoneedge,dragondance|Adamant|,252,4,,,252|||||]Jirachi||expertbelt||ironhead,firepunch,icepunch,grassknot|Naive|,252,,,4,252|||||]Flygon||choicescarf||earthquake,outrage,firepunch,uturn|Jolly|,252,,,4,252|||||',

				'Heatran||passhoberry||magmastorm,hiddenpowergrass,dragonpulse,explosion|Modest|128,,,216,,164||,30,,30,,|||]Jirachi||choicescarf||ironhead,icepunch,trick,uturn|Jolly|,252,,,4,252|||||]Tyranitar||choiceband||stoneedge,crunch,fireblast,pursuit|Lonely|180,252,,,,76|||||]Celebi||lifeorb||leafstorm,hiddenpowerfire,stealthrock,recover|Modest|232,,,240,,36||,2,,30,,30|||]Starmie||leftovers|1|surf,reflect,rapidspin,recover|Timid|252,,,,4,252||,0,,,,|||]Gliscor||yacheberry||earthquake,stoneedge,swordsdance,roost|Jolly|252,,,,196,60|||||',

				'Machamp||focussash|1|dynamicpunch,payback,icepunch,bulletpunch|Adamant|16,252,,,,240|||||]Magnezone||custapberry||thunderbolt,hiddenpowerfire,explosion,endure|Modest|172,,,252,,84||,30,,30,,30|||]Kingdra||lumberry||waterfall,outrage,substitute,dragondance|Adamant|4,252,,,,252|||||]Flygon||choicescarf||earthquake,outrage,stoneedge,uturn|Hasty|,252,,4,,252|||||]Bronzong||occaberry||gyroball,earthquake,stealthrock,explosion|Sassy|252,84,80,,92,||,,,,,0|||]Cresselia||leftovers||psychic,hiddenpowerfighting,calmmind,moonlight|Modest|252,,,252,,4||,3,30,30,30,30|||',

				'Zapdos||leftovers||thunderbolt,heatwave,hiddenpowergrass,roost|Bold|248,,228,,,32||,2,,30,,|||]Swampert||leftovers||protect,earthquake,icebeam,stealthrock|Relaxed|252,,216,,40,|||||]Forretress||shedshell||gyroball,earthquake,spikes,rapidspin|Relaxed|252,112,144,,,|||||]Blissey||leftovers||thunderbolt,icebeam,thunderwave,softboiled|Bold|252,,252,4,,||,0,,,,|||]Tyranitar||choiceband||stoneedge,crunch,superpower,pursuit|Adamant|180,252,,,,76|||||]Dugtrio||focussash|1|earthquake,stoneedge,substitute,aerialace|Jolly|,252,,,4,252|||||',

				'Flygon||choicescarf||earthquake,outrage,firepunch,uturn|Jolly|,252,,,4,252|||||]Zapdos||leftovers||thunderbolt,heatwave,thunderwave,roost|Calm|248,,,,228,32||,0,,,,|||]Starmie||colburberry|1|hydropump,thunderbolt,icebeam,rapidspin|Timid|,,,252,4,252||,0,,,,|||]Tyranitar||lumberry||stoneedge,superpower,fireblast,stealthrock|Hasty|,252,,16,,240|||||]Jirachi||leftovers||psychic,thunderbolt,calmmind,wish|Bold|252,,224,,,32||,0,,,,|||]Breloom||toxicorb|1|seedbomb,superpower,machpunch,spore|Jolly|4,252,,,,252|||||',

				'Machamp||lumberry|1|dynamicpunch,payback,bulletpunch,icepunch|Adamant|240,248,,,16,4|||||]Flygon||choicescarf||earthquake,outrage,uturn,stoneedge|Jolly|,252,,,4,252|||||]Breloom||toxicorb|1|substitute,focuspunch,spore,seedbomb|Adamant|12,252,,,,244|||||]Heatran||shucaberry||stealthrock,fireblast,earthpower,explosion|Naive|,,,252,4,252|||||]Gengar||leftovers|levitate|shadowball,sludgebomb,focusblast,substitute|Timid|4,,,252,,252||,0,,,,|||]Starmie||lifeorb|1|hydropump,thunderbolt,icebeam,recover|Timid|,,,252,4,252|||||',


				'Bronzong||lumberry|1|stealthrock,gyroball,earthquake,explosion|Brave||||||]Gengar||lifeorb|levitate|shadowball,focusblast,explosion,hiddenpowerfire|Naive|||,30,,30,,30|||]Tyranitar||choiceband||stoneedge,crunch,pursuit,superpower|Adamant||M||||]Kingdra||choicespecs||hydropump,dracometeor,surf,dragonpulse|Modest|||,0,,,,|||]Flygon||choicescarf||uturn,outrage,earthquake,thunderpunch|Jolly||M||||]Lucario||lifeorb|1|closecombat,swordsdance,bulletpunch,extremespeed|Adamant||||||',

				'Jirachi||occaberry||stealthrock,psychic,thunderbolt,hiddenpowerground|Timid|80,,,252,,176||,,,30,30,|||]Rotom-Heat||choicescarf||thunderbolt,shadowball,overheat,trick|Timid|4,,,252,,252|||||]Tyranitar||choiceband||crunch,pursuit,stoneedge,superpower|Adamant|176,252,,,,80|M||||]Kingdra||mysticwater||raindance,hydropump,dracometeor,hiddenpowerelectric|Modest|92,,,252,,164|M|,3,,30,,|||]Breloom||toxicorb|1|spore,machpunch,seedbomb,superpower|Adamant|236,176,16,,4,76|||||]Empoleon||shucaberry||hydropump,icebeam,grassknot,agility|Modest|88,,,252,,168|M||||',

				'Jirachi||leftovers||bodyslam,stealthrock,uturn,ironhead|Jolly|80,252,,,,176|||||]Gengar||lifeorb|levitate|shadowball,focusblast,explosion,hiddenpowerfire|Naive|,4,,252,,252||,30,,30,,30|||]Tyranitar||choiceband||stoneedge,crunch,pursuit,superpower|Adamant|,252,,,44,212|M||||]Kingdra||choicescarf||hydropump,dracometeor,icebeam,hiddenpowerelectric|Timid|4,,,252,,252||,3,,30,,|||]Abomasnow||expertbelt||woodhammer,iceshard,earthquake,hiddenpowerfire|Lonely|,252,,96,,160||,30,,30,,30|||]Lucario||lifeorb|1|closecombat,swordsdance,bulletpunch,extremespeed|Adamant|,252,,,4,252|||||',

				'Zapdos||leftovers||thunderbolt,hiddenpowerice,uturn,roost|Modest|16,,,252,,240||,30,30,,,|||]Tyranitar||passhoberry||stealthrock,crunch,fireblast,superpower|Lonely|48,104,,40,68,248|||||]Gengar||lifeorb|levitate|explosion,focusblast,shadowball,hiddenpowerfire|Timid|4,,,252,,252|M|,30,,30,,30|||]Breloom||toxicorb|1|spore,machpunch,seedbomb,superpower|Adamant|204,252,,,,52|||||]Suicune||leftovers||calmmind,hydropump,icebeam,hiddenpowerelectric|Modest|32,,,248,,228||,,,30,,|S||]Heatran||choicescarf||fireblast,hiddenpowerice,earthpower,explosion|Hasty|,,,252,4,252|M|,30,30,,,|||',

				'Bronzong||lumberry|1|gyroball,stealthrock,earthquake,explosion|Brave|248,252,,,8,||,,,,,0|||]Dragonite||choiceband||outrage,dragonclaw,extremespeed,earthquake|Adamant|48,252,,,,208|M||||]Mamoswine||lifeorb||iceshard,earthquake,stoneedge,superpower|Jolly|,252,4,,,252|M||||]Magnezone||leftovers||thunderbolt,thunderwave,substitute,hiddenpowerfire|Modest|140,,,252,,116||,2,,30,,30|||]Flygon||choicescarf||outrage,earthquake,stoneedge,uturn|Adamant|,252,6,,,252|||||]Kingdra||chestoberry||dragondance,waterfall,outrage,rest|Adamant|144,160,,,40,164|M||||',

				'Roserade||focussash|1|sleeppowder,toxicspikes,leafstorm,hiddenpowerground|Modest|,,4,252,,252|F|,3,,30,30,|S||]Tyranitar||passhoberry||stealthrock,crunch,fireblast,superpower|Lonely|48,104,,40,68,248|||||]Gengar||lifeorb|levitate|shadowball,focusblast,substitute,painsplit|Timid|,,4,252,,252||,0,,,,|S||]Flygon||lifeorb||dracometeor,fireblast,earthquake,outrage|Naive|,52,,204,,252|||||]Suicune||leftovers||calmmind,hydropump,icebeam,hiddenpowerelectric|Modest|32,,,248,,228||,,,30,,|S||]Heatran||choicescarf||fireblast,hiddenpowerice,earthpower,explosion|Hasty|,,,252,4,252|M|,30,30,,,|||',

				'Starmie||lifeorb|1|hydropump,icebeam,thunderbolt,rapidspin|Timid|,,,252,4,252||,0,,,,|||]Rotom-Heat||choicescarf||thunderbolt,shadowball,overheat,trick|Timid|4,,,252,,252|||||]Breloom||toxicorb|1|spore,machpunch,seedbomb,superpower|Adamant|204,252,,,,52|||||]Tyranitar||passhoberry||stealthrock,crunch,fireblast,superpower|Lonely|48,104,,40,68,248|||||]Bronzong||choiceband||earthquake,gyroball,explosion,trick|Brave|252,252,,,4,||,,,,,0|||]Dragonite||lumberry||dragondance,outrage,earthquake,firepunch|Jolly|,252,,,4,252|F||||',

				'Azelf||colburberry||stealthrock,taunt,thunderwave,explosion|Jolly|8,140,,,144,216|||||]Roserade||blacksludge||toxicspikes,spikes,grassknot,hiddenpowerfire|Calm|248,,124,,136,|F|,2,,30,,30|||]Tyranitar||choiceband||superpower,crunch,stoneedge,pursuit|Adamant|24,252,,,100,132|M||||]Milotic||leftovers||hydropump,icebeam,hiddenpowerelectric,recover|Timid|252,,4,,,252||,3,,30,,|||]Flygon||lifeorb||dracometeor,fireblast,earthquake,outrage|Naive|,52,,204,,252|||||]Rotom-Heat||choicescarf||thunderbolt,shadowball,overheat,hiddenpowerice|Timid|4,,,252,,252||,2,30,,,|||',

				'Skarmory||leftovers||whirlwind,bravebird,roost,spikes|Careful|248,,8,,252,|M||||]Roserade||blacksludge||toxicspikes,sleeppowder,grassknot,hiddenpowerfire|Calm|248,,124,,136,|F|,0,,30,,30|||]Tyranitar||passhoberry||stealthrock,crunch,fireblast,superpower|Lonely|48,104,,40,68,248|||||]Flygon||lifeorb||dracometeor,fireblast,earthquake,outrage|Naive|,52,,204,,252|||||]Rotom-Heat||choicescarf||thunderbolt,shadowball,overheat,hiddenpowerice|Timid|4,,,252,,252||,2,30,,,|||]Milotic||leftovers||surf,hiddenpowerelectric,recover,haze|Calm|248,,244,,16,||,3,,30,,|S||',

				'Bronzong||leftovers||stealthrock,gyroball,earthquake,explosion|Sassy|252,84,80,,92,||,,,,,0|||]Rotom-Heat||choicescarf||overheat,thunderbolt,hiddenpowerice,shadowball|Timid|,,,252,4,252||,2,30,,,|||]Dugtrio||choiceband|1|earthquake,stoneedge,pursuit,aerialace|Jolly|,252,4,,,252|M||||]Suicune||leftovers||calmmind,hydropump,icebeam,hiddenpowerelectric|Timid|120,,,192,,196||,3,,30,,|||]Roserade||blacksludge||toxicspikes,leafstorm,sleeppowder,hiddenpowerfire|Timid|120,,,156,,232||,2,,30,,30|||]Raikou||leftovers||protect,calmmind,hiddenpowerice,thunderbolt|Timid|,,,252,4,252||,2,30,,,|S||',

				'Azelf||colburberry||taunt,explosion,stealthrock,uturn|Jolly|248,,,,44,216|||S||]Dragonite||lifeorb||dracometeor,fireblast,superpower,extremespeed|Rash|24,136,,252,,96|M||S||]Breloom||toxicorb|1|spore,machpunch,seedbomb,superpower|Adamant|204,252,,,,52|||S||]Gyarados||leftovers||dragondance,waterfall,bounce,taunt|Adamant|156,72,84,,,196|M||S||]Tyranitar||choiceband||superpower,crunch,stoneedge,pursuit|Adamant|16,232,,,128,132|M||S||]Heatran||choicescarf||fireblast,hiddenpowerice,earthpower,explosion|Hasty|,,,252,4,252|M|,30,30,,,|S||',

				'Gliscor||leftovers||taunt,uturn,earthquake,stealthrock|Jolly|248,,44,,,216|||||]Bronzong||choiceband||earthquake,gyroball,explosion,trick|Brave|252,252,,,4,||,,,,,0|||]Tyranitar||choiceband||superpower,crunch,stoneedge,pursuit|Adamant|24,252,,,100,132|M||||]Starmie||leftovers|1|rapidspin,surf,icebeam,thunderbolt|Timid|,,4,252,,252||,0,,,,|||]Metagross||lifeorb||agility,zenheadbutt,earthquake,icepunch|Jolly|,252,,,4,252|||||]Rotom-Heat||choicescarf||thunderbolt,shadowball,overheat,hiddenpowerice|Timid|4,,,252,,252||,2,30,,,|||',

				'Starmie||choicespecs|1|rapidspin,hydropump,icebeam,thunderbolt|Timid|,,,252,4,252|||||]Heatran||passhoberry||fireblast,earthpower,hiddenpowerelectric,stealthrock|Timid|44,,,212,,252||,,,30,,|||]Dragonite||choiceband||outrage,dragonclaw,extremespeed,firepunch|Adamant|64,252,,,,192|||||]Shaymin||occaberry||seedflare,earthpower,hiddenpowerice,healingwish|Timid|40,,,248,,220||,30,30,,,|||]Jirachi||choicescarf||uturn,ironhead,firepunch,icepunch|Jolly|4,252,,,,252|||||]Kingdra||chestoberry||dragondance,waterfall,outrage,rest|Adamant|144,160,,,40,164|M||||',

				'Vaporeon||choicespecs||hydropump,hiddenpowerelectric,icebeam,batonpass|Modest|4,,,252,,252||,3,,30,,|||]Bronzong||lumberry||gyroball,stealthrock,payback,explosion|Brave|248,252,,,8,||,,,,,0|||]Tyranitar||choiceband||superpower,crunch,stoneedge,pursuit|Adamant|24,252,,,100,132|M||||]Gyarados||leftovers||dragondance,waterfall,icefang,earthquake|Adamant|60,252,,,,196|F||||]Breloom||toxicorb|1|spore,superpower,seedbomb,machpunch|Adamant|108,132,80,,,188|||||]Rotom-Wash||choicescarf||hydropump,willowisp,thunderbolt,shadowball|Timid|,,,252,4,252||,30,30,,,|||',


			],


			gen4ubers: [
				'Mew||lumberry||taunt,stealthrock,uturn,explosion|Jolly|252,4,,,,252|||||]Dialga||choicescarf||dracometeor,outrage,flamethrower,thunder|Modest|,,,252,,252|||||]Latios||souldew||dracometeor,roost,thunder,surf|Timid|4,,,252,,252|||||]Mewtwo||lifeorb||icebeam,aurasphere,flamethrower,selfdestruct|Hasty|,4,,252,,252|||||]Rayquaza||lifeorb||dracometeor,extremespeed,fireblast,outrage|Rash|,36,4,252,,216|||S||]Jirachi||leftovers||wish,uturn,thunderwave,ironhead|Calm|252,,4,,216,36|||||',

				'Cloyster||focussash||payback,iceshard,spikes,toxicspikes|Jolly|,252,4,,,252|M||||]Dialga||leftovers||dragonpulse,thunder,roar,stealthrock|Modest|248,,,16,204,40|||||]Giratina-Origin||griseousorb||shadowsneak,earthquake,thunder,dracometeor|Rash|,244,,216,,48|||||]Scizor||choiceband|1|uturn,bulletpunch,pursuit,superpower|Adamant|248,244,,,16,|M||||]Palkia||lustrousorb||spacialrend,hydropump,thunder,fireblast|Timid|,,,252,4,252|||||]Kyogre||choicescarf||waterspout,surf,icebeam,thunder|Modest|,,,252,4,252|||||',

				'Ho-Oh||lumberry||bravebird,sacredfire,earthquake,roost|Adamant|64,252,,,,192|||||]Groudon||leftovers||earthquake,dragonclaw,stealthrock,roar|Adamant|120,252,,,,136|||||]Forretress||leftovers||toxicspikes,payback,spikes,rapidspin|Careful|248,,8,,252,|F|,,,,,30|||]Giratina-O|giratinaorigin|griseousorb||shadowsneak,dracometeor,hiddenpowerfire,outrage|Mild|,64,,248,,196||,30,,30,,30|||]Palkia||choicescarf||spacialrend,fireblast,thunder,outrage|Hasty|,4,,252,,252|||||]Darkrai||lifeorb||darkpulse,focusblast,darkvoid,nastyplot|Timid|,,,252,4,252|||||',

				'Deoxys-Speed||colburberry||superpower,spikes,taunt,shadowball|Naive|,24,,232,,252|||||]Gyarados||lifeorb||dragondance,waterfall,outrage,earthquake|Adamant|,252,,,4,252|||||]Giratina||leftovers||substitute,thunder,dragonpulse,calmmind|Timid|,,132,36,88,252||,0,,,,|||]Latios||souldew||dracometeor,grassknot,thunder,recover|Timid|,,4,252,,252||,0,,,,|||]Jirachi||leftovers||thunderwave,wish,ironhead,stealthrock|Careful|252,,,,224,32|||||]Kyogre||choicescarf||surf,thunder,waterspout,icebeam|Modest|4,,,252,,252|||||',

				'Tyranitar||lumberry||fireblast,payback,stealthrock,superpower|Adamant|248,24,12,16,164,44|M||||]Forretress||leftovers||payback,protect,rapidspin,spikes|Careful|248,,8,,252,|M||||]Giratina-Origin||griseousorb||earthquake,outrage,shadowsneak,willowisp|Adamant|248,136,60,,36,28|||||]Latias||souldew||calmmind,dragonpulse,recover,thunder|Timid|136,,,176,,196|||||]Kyogre||leftovers||calmmind,rest,roar,surf|Bold|248,,228,,,32|||||]Jirachi||choicescarf||icepunch,ironhead,trick,uturn|Jolly|40,252,,,,216|||||',

				'Tentacruel||focussash||hydropump,icebeam,rapidspin,toxicspikes|Timid|4,,,252,,252|F||||]Mewtwo||leftovers||taunt,willowisp,recover,selfdestruct|Jolly|252,4,,,,252|||||]Giratina-Origin||griseousorb||dracometeor,earthquake,thunder,shadowsneak|Mild|,236,,212,,56|||||]Dialga||choicescarf||dracometeor,flamethrower,aurasphere,outrage|Modest|4,,,252,,252|||||]Ludicolo||leftovers|1|leechseed,substitute,protect,icebeam|Sassy|252,,4,,252,|F||||]Jirachi||leftovers||wish,stealthrock,thunderwave,ironhead|Calm|252,,4,,212,40|||||',

				'Rayquaza||lifeorb||dracometeor,brickbreak,extremespeed,fireblast|Naive|,40,,252,,216|||||]Dialga||lifeorb||dracometeor,flamethrower,outrage,stealthrock|Hasty|,4,,252,,252|||||]Scizor||leftovers|1|bulletpunch,uturn,superpower,roost|Careful|244,20,76,,168,|F||||]Palkia||choicescarf||spacialrend,surf,fireblast,outrage|Hasty|,4,,252,,252|||||]Groudon||leftovers||thunderwave,swordsdance,stoneedge,earthquake|Adamant|200,112,108,,,88|||||]Mewtwo||lifeorb||aurasphere,icebeam,selfdestruct,flamethrower|Hasty|,24,,252,,232|||||',

				'Froslass||focussash||icywind,shadowball,spikes,destinybond|Timid|,,4,252,,252||,0,,,,|||]Dialga||lifeorb||dracometeor,outrage,fireblast,stealthrock|Hasty|,4,,252,,252|||||]Palkia||choicescarf||spacialrend,surf,thunder,dracometeor|Timid|4,,,252,,252||,0,,,,|||]Giratina|giratinaorigin|griseousorb||shadowsneak,hiddenpowerfire,dracometeor,dragonclaw|Lonely|,248,,60,,200||,30,,30,,30|||]Lucario||lifeorb||swordsdance,closecombat,crunch,extremespeed|Adamant|,252,,,4,252|M||||]Rayquaza||lifeorb||swordsdance,extremespeed,dragonclaw,earthquake|Adamant|,252,,4,,252|||||',

				'Deoxys||focussash||stealthrock,spikes,shadowball,extremespeed|Rash|,24,112,136,,236|||||]Maria|giratinaorigin|griseousorb||earthquake,outrage,shadowsneak,willowisp|Adamant|248,176,36,,32,16|||||]Scizor||choiceband|1|uturn,bulletpunch,superpower,pursuit|Adamant|248,96,,,164,|M||||]Groudon||leftovers||swordsdance,rockpolish,earthquake,dragonclaw|Adamant|128,252,,,,128|||||]Rayquaza||lifeorb||dracometeor,fireblast,earthquake,extremespeed|Rash|,40,,252,,216|||||]Palkia||habanberry||spacialrend,fireblast,thunder,outrage|Hasty|,4,,252,,252|||||',

				'Qwilfish||focussash|1|toxicspikes,payback,aquajet,explosion|Adamant|,252,4,,,252|M||||]Dialga||leftovers||stealthrock,dragonpulse,flamethrower,roar|Modest|248,,,112,120,28|||||]Skarmory||leftovers||spikes,whirlwind,roost,toxic|Impish|248,,16,,244,|M||||]Giratina-Origin||griseousorb||calmmind,dragonpulse,rest,sleeptalk|Bold|248,,252,,,8|||||]Kyogre||choicescarf||waterspout,surf,icebeam,thunder|Timid|64,,,252,,192|||||]BRO FIST|ludicolo|leftovers|1|substitute,leechseed,protect,icebeam|Calm|248,,8,,252,|M||||',

				'Tyranitar||focussash||stealthrock,crunch,fireblast,lowkick|Hasty|,252,,4,,252|||||]Garchomp||salacberry||earthquake,outrage,substitute,swordsdance|Jolly|,252,4,,,252|||||]Jirachi||leftovers||ironhead,protect,uturn,wish|Careful|248,,,,240,20|||||]Giratina-Origin||griseousorb||hiddenpowerfire,dracometeor,shadowsneak,outrage|Mild|108,56,,252,,92||,30,,30,,30|||]Deoxys-Attack||lifeorb||psychoboost,superpower,extremespeed,shadowball|Hasty|,4,,252,,252|||||]Palkia||lustrousorb||hydropump,spacialrend,thunder,fireblast|Timid|,,4,252,,252|||||',

				'Mew||lumberry||explosion,stealthrock,taunt,uturn|Jolly|252,36,,,,220|||||]Scizor||choiceband|1|bulletpunch,pursuit,superpower,uturn|Adamant|200,56,,,252,|M||||]Kyogre||choicespecs||icebeam,surf,thunder,waterspout|Modest|220,,,252,,36|||||]Rayquaza||choiceband||dragonclaw,earthquake,extremespeed,outrage|Jolly|,252,,,4,252|||||]Dialga||choicespecs||dracometeor,dragonpulse,flamethrower,thunder|Timid|4,,,252,,252|||||]Mewtwo||leftovers||aurasphere,calmmind,icebeam,taunt|Timid|,,4,252,,252|||||',

				'Deoxys-Speed||focussash||stealthrock,spikes,taunt,hiddenpowerfire|Timid|,,,252,4,252||,30,,30,,30|||]is whale|kyogre|lumberry||hydropump,thunder,icebeam,calmmind|Timid|,,,252,4,252|||||]Palkia||choicescarf||spacialrend,surf,thunder,outrage|Hasty|,,,252,4,252|||||]Latios||souldew||dragonpulse,surf,recover,calmmind|Timid|,,,252,4,252|||||]Scizor||choiceband|1|bulletpunch,uturn,pursuit,superpower|Adamant|248,252,,,,8|M||||]Darkrai||lifeorb||darkpulse,darkvoid,focusblast,nastyplot|Timid|,,,252,4,252|||||',

				'Cloyster||focussash||payback,iceshard,spikes,toxicspikes|Jolly|,252,4,,,252|M||||]Dialga||leftovers||dragonpulse,thunder,roar,stealthrock|Modest|248,,,16,204,40|||||]Giratina-Origin||griseousorb||shadowsneak,earthquake,thunder,dracometeor|Rash|,244,,216,,48|||||]Scizor||choiceband|1|uturn,bulletpunch,pursuit,superpower|Adamant|248,244,,,16,|M||||]Palkia||lustrousorb||spacialrend,hydropump,thunder,fireblast|Timid|,,,252,4,252|||||]Kyogre||choicescarf||waterspout,surf,icebeam,thunder|Modest|,,,252,4,252|||||',

				'Giratina-Origin||griseousorb||dracometeor,shadowsneak,stoneedge,hiddenpowerfire|Rash|,212,,140,,156||,30,,30,,30|||]Forretress||leftovers||protect,toxicspikes,rapidspin,payback|Careful|248,8,,,252,|M||||]Groudon||leftovers||stealthrock,earthquake,dragonclaw,roar|Impish|248,,96,,164,|||||]Kyogre||leftovers||surf,roar,rest,sleeptalk|Calm|248,,8,,252,|||||]Jirachi||leftovers||wish,protect,toxic,ironhead|Careful|248,,8,,252,|||||]Dialga||choicescarf||dracometeor,fireblast,dragonpulse,thunder|Modest|64,,,252,,192|||||',


				'Froslass||focussash||spikes,taunt,icywind,shadowball|Timid|,,4,252,,252|||||]Giratina-Origin||griseousorb||calmmind,dragonpulse,thunder,aurasphere|Timid|,,4,252,,252|||||]Kyogre||lumberry||calmmind,hydropump,thunder,icebeam|Timid|,,,252,4,252|||||]Omastar||focussash||hydropump,icebeam,stealthrock,toxicspikes|Modest|48,,,252,,208|M||||]Latias||souldew||dragonpulse,recover,surf,calmmind|Timid|,,,252,4,252|||||]Jirachi||choicescarf||uturn,ironhead,icepunch,healingwish|Jolly|40,252,,,,216|||||',


				'Rayquaza||focussash||dracometeor,fireblast,extremespeed,earthquake|Rash|,36,,252,,220|||||]Dialga||leftovers||dracometeor,flamethrower,thunder,thunderwave|Modest|188,,,252,,68|||||]Palkia||habanberry||hydropump,spacialrend,fireblast,thunder|Timid|,,,252,4,252|||||]Bronzong||leftovers||payback,grassknot,stealthrock,explosion|Sassy|252,4,,,252,|||||]Jirachi||choicescarf||ironhead,uturn,trick,icepunch|Jolly|,252,,,4,252|||||]Tyranitar||lumberry||stoneedge,crunch,earthquake,dragondance|Jolly|,252,,,4,252|||||',


			],


			gen4uu: [
				'Jynx||focussash||lovelykiss,icebeam,psychic,protect|Timid|,,,252,4,252||,0,,,,|||]Clefable||lifeorb|1|calmmind,icebeam,thunderbolt,softboiled|Modest|160,,,252,,96||,0,,,,|||]Feraligatr||leftovers||substitute,dragondance,waterfall,return|Adamant|100,252,,,,156|||||]Rhyperior||leftovers|1|stealthrock,stoneedge,earthquake,megahorn|Adamant|168,16,,,240,84|||||]Milotic||leftovers||surf,icebeam,haze,recover|Calm|252,,192,,56,8|||||]Toxicroak||blacksludge|1|swordsdance,icepunch,lowkick,suckerpunch|Adamant|228,252,,,,28|||||',

				'Omastar||focussash||stealthrock,spikes,surf,icebeam|Timid|4,,,252,,252|||||]Swellow||toxicorb||protect,facade,bravebird,uturn|Jolly|,252,4,,,252|||||]Venusaur||lifeorb||leafstorm,sleeppowder,sludgebomb,synthesis|Timid|4,,,252,,252|||||]Kabutops||lifeorb||swordsdance,rapidspin,stoneedge,aquajet|Adamant|4,252,,,,252|||||]Houndoom||passhoberry|1|nastyplot,fireblast,darkpulse,beatup|Timid|,,,252,4,252|||||]Rotom||choicescarf||thunderbolt,shadowball,hiddenpowerice,trick|Timid|4,,,252,,252||,30,30,,,|||',

				'Mesprit||leftovers||stealthrock,grassknot,psychic,uturn|Modest|120,,,252,,136|||||]Leafeon||leftovers||doubleedge,swordsdance,leafblade,synthesis|Jolly|4,252,,,,252|||||]Swellow||toxicorb||facade,uturn,quickattack,bravebird|Jolly|4,252,,,,252|||||]Dugtrio||choiceband|1|earthquake,suckerpunch,beatup,stoneedge|Jolly|12,244,,,,252|||||]Kabutops||leftovers||aquajet,rapidspin,swordsdance,stoneedge|Adamant|120,252,,,,136|||||]Arcanine||leftovers||willowisp,flareblitz,extremespeed,morningsun|Careful|252,,4,,252,|||||',

				'Ambipom||lifeorb||fakeout,taunt,uturn,return|Jolly|4,252,,,,252|||||]Torterra||lifeorb||earthquake,woodhammer,stoneedge,stealthrock|Adamant|44,252,,,,212|||||]Toxicroak||blacksludge|1|substitute,focuspunch,suckerpunch,icepunch|Adamant|148,252,,,,108|||||]Mesprit||lifeorb||calmmind,psychic,thunderbolt,hiddenpowerground|Timid|,,,252,4,252||,,,30,30,|||]Milotic||leftovers||surf,icebeam,haze,recover|Calm|252,,192,,56,8||,30,,30,,|||]Blaziken||choicescarf||flareblitz,superpower,thunderpunch,stoneedge|Jolly|,252,,,4,252|||||',

				'Omastar||focussash||stealthrock,spikes,surf,hiddenpowergrass|Timid|4,,,252,,252||,30,,30,,|||]Blaziken||lifeorb||fireblast,superpower,hiddenpowerelectric,vacuumwave|Mild|,4,,252,,252||,,,30,,|||]Alakazam||lifeorb||substitute,psychic,shadowball,focusblast|Timid|4,,,252,,252|||||]Rotom||choicescarf||thunderbolt,shadowball,hiddenpowerice,trick|Timid|4,,,252,,252||,30,30,,,|||]Swellow||flameorb||facade,bravebird,quickattack,uturn|Jolly|4,252,,,,252|||||]Ursaring||toxicorb|1|protect,facade,closecombat,crunch|Jolly|4,252,,,,252|||||',

				'Scyther||lumberry|1|swordsdance,batonpass,aerialace,uturn|Jolly|,252,4,,,252|||||]Rhyperior||leftovers|1|stealthrock,stoneedge,earthquake,megahorn|Adamant|140,252,32,,,84|||||]Milotic||leftovers||recover,surf,icebeam,hiddenpowergrass|Modest|248,,,252,,8||,30,,30,,|||]Altaria||lifeorb||dragondance,outrage,earthquake,fireblast|Adamant|,252,,,4,252|||||]Sceptile||lifeorb||leafstorm,focusblast,hiddenpowerice,gigadrain|Timid|4,,,252,,252||,30,30,,,|||]Hitmontop||leftovers|1|rapidspin,machpunch,fakeout,stoneedge|Adamant|252,252,,,,4|||||',

				'Qwilfish||focussash||explosion,spikes,taunt,waterfall|Jolly|4,252,,,,252|F||||]Rhyperior||leftovers|1|stealthrock,stoneedge,earthquake,megahorn|Adamant|132,212,,,,164|M||||]Mismagius||leftovers||taunt,willowisp,shadowball,painsplit|Timid|252,,,80,,176|M||||]Spiritomb||blackglasses||pursuit,suckerpunch,shadowsneak,sleeptalk|Adamant|252,252,4,,,|F||||]Blastoise||leftovers||surf,foresight,roar,rapidspin|Calm|252,,28,,224,|F||||]Moltres||choicescarf||fireblast,airslash,hiddenpowergrass,roost|Modest|,,,252,4,252||,30,,30,,|||',


				'Omastar||leftovers||spikes,stealthrock,surf,icebeam|Bold|252,,252,,4,|||||]Mismagius||leftovers||taunt,willowisp,shadowball,thunderbolt|Timid|4,,,252,,252|||||]Hitmontop||leftovers||rapidspin,foresight,closecombat,stoneedge|Impish|252,,252,,4,|||||]Milotic||leftovers||surf,recover,toxic,icebeam|Calm|252,,192,,56,8|||||]Tangrowth||leftovers||sleeppowder,leechseed,earthquake,powerwhip|Impish|252,,252,,,4||,30,30,,,|||]Clefable||leftovers|1|calmmind,icebeam,thunderbolt,softboiled|Bold|252,,252,,4,|||||',

				'Ambipom||silkscarf||fakeout,return,pursuit,uturn|Jolly|,252,,,4,252|||||]Drapion||leftovers||taunt,crunch,swordsdance,earthquake|Jolly|252,,,,120,136|||||]Kabutops||leftovers||stoneedge,aquajet,swordsdance,rapidspin|Adamant|132,252,,,,124|||||]Torterra||leftovers||woodhammer,stealthrock,earthquake,synthesis|Careful|252,,4,,252,|||||]Moltres||lifeorb||fireblast,airslash,hiddenpowergrass,roost|Timid|,,,252,4,252||,30,,30,,|||]Poliwrath||leftovers||waterfall,focuspunch,substitute,encore|Adamant|152,252,,,,104|||||',

				'Mesprit||colburberry||psychic,uturn,grassknot,stealthrock|Brave|252,96,,160,,|||||]Azumarill||leftovers|1|substitute,focuspunch,return,aquajet|Adamant|252,224,,,,32|||||]Registeel||leftovers||curse,ironhead,rest,sleeptalk|Careful|248,,,,240,20|||||]Arcanine||leftovers||flareblitz,extremespeed,toxic,morningsun|Careful|252,4,,,252,|||||]Donphan||leftovers||earthquake,rapidspin,odorsleuth,headsmash|Adamant|224,252,,,8,24|||||]Sceptile||lifeorb||leafstorm,focusblast,hiddenpowerice,synthesis|Timid|,,,252,4,252||,2,30,,,|||',

				'Rotom||leftovers||substitute,thunderbolt,willowisp,shadowball|Timid|252,,4,,,252|||||]Kabutops||leftovers||stoneedge,aquajet,swordsdance,rapidspin|Adamant|132,252,,,,124|||||]Milotic||leftovers||surf,hiddenpowergrass,toxic,recover|Bold|248,,252,,,8||,30,,30,,|||]Arcanine||choiceband||flareblitz,extremespeed,thunderfang,morningsun|Jolly|,252,,,4,252|||||]Torterra||leftovers||woodhammer,earthquake,stealthrock,synthesis|Careful|252,,,,252,4|||||]Drapion||leftovers||crunch,swordsdance,taunt,earthquake|Jolly|252,,,,120,136|||||',

				'Alakazam||focussash|1|taunt,psychic,counter,shadowball|Timid|4,,,252,,252|||||]Torterra||leftovers||stealthrock,woodhammer,earthquake,synthesis|Careful|252,,,,252,4|||||]Rotom||choicespecs||thunderbolt,shadowball,hiddenpowerice,trick|Timid|4,,,252,,252||,30,30,,,|||]Milotic||leftovers||surf,icebeam,recover,toxic|Bold|252,,252,,,4|||||]Houndoom||lifeorb|1|suckerpunch,fireblast,darkpulse,nastyplot|Hasty|,100,,184,,224|||||]Toxicroak||lifeorb|1|nastyplot,sludgebomb,focusblast,vacuumwave|Timid|4,,,252,,252|||||',

				'Cloyster||leftovers||surf,spikes,toxicspikes,rapidspin|Calm|252,,,,252,4||,0,,,,|||]Mismagius||leftovers||willowisp,taunt,painsplit,shadowball|Timid|252,,,4,,252||,0,,,,|||]Aggron||shucaberry|1|headsmash,magnetrise,stealthrock,lowkick|Adamant|200,252,,,,56|||||]Sceptile||lifeorb||leafstorm,hiddenpowerice,focusblast,synthesis|Timid|,,,252,4,252||,2,30,,,|||]Houndoom||lifeorb|1|pursuit,darkpulse,fireblast,suckerpunch|Hasty|,4,,252,,252|||||]Primeape||choicescarf||stoneedge,uturn,closecombat,earthquake|Jolly|,252,,,4,252|||||',

				'Snover||focussash||blizzard,leechseed,energyball,iceshard|Calm|248,,,,172,88|||||]Walrein||leftovers|1|surf,toxic,protect,substitute|Bold|232,,220,,,56|||||]Nidoqueen||blacksludge||blizzard,toxicspikes,stealthrock,earthpower|Bold|252,,252,,,4|||||]Hitmontop||leftovers||closecombat,foresight,rapidspin,stoneedge|Impish|252,4,252,,,|||||]Chansey||leftovers||aromatherapy,softboiled,toxic,seismictoss|Bold|4,,252,,252,|||||]Registeel||occaberry||curse,ironhead,explosion,earthquake|Adamant|252,252,4,,,|||||',

				'Moltres||choicespecs||overheat,airslash,hiddenpowergrass,uturn|Modest|,,,252,4,252||,30,,30,,|||]Venusaur||choicescarf||sleeppowder,leafstorm,sludgebomb,hiddenpowerrock|Timid|,,,252,4,252||,3,30,,30,30|||]Aggron||stoneplate|1|headsmash,earthquake,magnetrise,toxic|Adamant|,252,4,,,252|||||]Donphan||leftovers||stealthrock,earthquake,toxic,rapidspin|Impish|252,32,216,,,8|||||]Milotic||leftovers||surf,haze,toxic,recover|Bold|252,,188,,56,12||,0,,,,30|||]Clefable||leftovers|1|icebeam,thunderbolt,calmmind,softboiled|Calm|252,,32,,216,8||,0,,,,|||',

				'Mismagius||choicespecs||shadowball,thunderbolt,energyball,trick|Timid|,,,252,4,252||,0,,,,|||]Arcanine||leftovers||flareblitz,toxic,extremespeed,morningsun|Careful|248,,4,,252,4|||||]Kabutops||leftovers||swordsdance,aquajet,waterfall,stoneedge|Jolly|,252,,,4,252|||||]Sceptile||lifeorb||synthesis,leafstorm,focusblast,hiddenpowerice|Timid|,,,252,4,252||30,,30,,,|||]Donphan||leftovers||earthquake,headsmash,rapidspin,stealthrock|Adamant|252,252,,,,4|||||]Registeel||leftovers||ironhead,curse,rest,sleeptalk|Careful|252,,32,,224,|||||',


				'Omastar||focussash||stealthrock,spikes,surf,icebeam|Timid|4,,,252,,252|||||]Swellow||toxicorb||protect,facade,bravebird,quickattack|Jolly|,252,4,,,252|||||]Houndoom||passhoberry|1|nastyplot,fireblast,darkpulse,hiddenpowergrass|Timid|,,,252,4,252||,30,,30,,|||]Rotom||choicescarf||thunderbolt,shadowball,hiddenpowerice,trick|Timid|4,,,252,,252||,30,30,,,|||]Exeggutor||lifeorb||sunnyday,solarbeam,psychic,explosion|Rash|,4,,252,,252|||||]Toxicroak||lifeorb|1|nastyplot,vacuumwave,sludgebomb,darkpulse|Timid|4,,,252,,252|||||',


				'Mismagius||leftovers||taunt,willowisp,shadowball,thunderbolt|Timid|48,,,208,,252||,0,,,,|||]Registeel||leftovers||stealthrock,ironhead,thunderwave,counter|Impish|248,,96,,164,|||||]Venusaur||leftovers||swordsdance,powerwhip,earthquake,sleeppowder|Jolly|16,240,,,,252|||||]Milotic||leftovers||surf,hiddenpowergrass,recover,icebeam|Bold|248,,244,,,16||,2,,30,,|||]Houndoom||passhoberry|1|nastyplot,fireblast,darkpulse,hiddenpowergrass|Timid|,,,252,4,252||,2,,30,,|||]Primeape||choicescarf||closecombat,stoneedge,icepunch,uturn|Jolly|,252,,,4,252|||||',


				'Uxie||damprock||raindance,psychic,uturn,stealthrock|Bold|252,,252,,4,|||||]Ludicolo||lifeorb||hydropump,energyball,hiddenpowerpsychic,raindance|Modest|32,,,248,,228||,2,,,,30|||]Kabutops||lifeorb||swordsdance,stoneedge,waterfall,aquajet|Adamant|,252,,,4,252||29,,,,,|||]Dugtrio||choiceband|1|earthquake,stoneedge,toxic,beatup|Jolly|4,252,,,,252|||||]Toxicroak||lifeorb|1|nastyplot,focusblast,sludgebomb,vacuumwave|Timid|8,,,248,,252||,0,,,,|||]Registeel||leftovers||curse,ironhead,rest,sleeptalk|Careful|252,4,,,252,|||||',


				'Uxie||damprock||raindance,stealthrock,psychic,memento|Relaxed|252,,252,,4,||,,,,,0|||]Ludicolo||lifeorb||swordsdance,seedbomb,waterfall,icepunch|Adamant|32,252,,,,224|||||]Kabutops||lifeorb||swordsdance,stoneedge,waterfall,lowkick|Adamant|,252,4,,,252|||||]Registeel||damprock||raindance,explosion,shadowclaw,ironhead|Adamant|252,252,,,,4|||||]Dugtrio||choiceband|1|earthquake,pursuit,nightslash,stoneedge|Jolly|4,252,,,,252|||||]Electrode||lifeorb||thunder,hiddenpowerice,raindance,explosion|Naive|4,,,252,,252||,30,30,,,|||',


			],

			gen4nu: [
				'Jynx||focussash||lovelykiss,icebeam,grassknot,nastyplot|Timid|,,,252,4,252|||||]Regirock||leftovers||rockslide,stealthrock,earthquake,explosion|Adamant|204,148,,,156,|||||]Haunter||lifeorb||sludgebomb,shadowball,substitute,hiddenpowerground|Timid|,,4,252,,252||,,,30,30,|||]Manectric||choicescarf||thunderbolt,overheat,hiddenpowergrass,switcheroo|Timid|,,,252,4,252||,30,,30,,|||]Hitmonchan||leftovers|1|bulkup,drainpunch,icepunch,machpunch|Adamant|160,252,,,,96|||||]Skuntank||leftovers|1|taunt,pursuit,explosion,suckerpunch|Adamant|,252,,,4,252|||||',

				'Jynx||focussash|1|fakeout,lovelykiss,icebeam,psychic|Timid|,,,252,4,252|||||]Medicham||choicescarf||highjumpkick,psychocut,thunderpunch,icepunch|Adamant|4,252,,,,252|||||]Tauros||lumberry||doubleedge,earthquake,rockslide,pursuit|Adamant|4,252,,,,252|||||]Magmortar||expertbelt||fireblast,hiddenpowergrass,thunderbolt,focusblast|Timid|20,,,252,,236||,30,,30,,|||]Probopass||leftovers|1|stealthrock,thunderwave,powergem,earthpower|Calm|252,,,,252,4|||||]Meganium||leftovers||leechseed,aromatherapy,synthesis,energyball|Bold|252,,252,,,4|||||',

				'Solrock||lumberry||stealthrock,explosion,trickroom,stoneedge|Brave|252,252,4,,,||,,,,,0|||]Marowak||thickclub||doubleedge,earthquake,swordsdance,rockslide|Brave|248,252,8,,,||,,,,,0|||]Camerupt||lifeorb|1|hiddenpowergrass,earthquake,explosion,fireblast|Quiet|,252,4,252,,||,30,,30,,1|||]Medicham||lifeorb||fakeout,bulletpunch,highjumpkick,thunderpunch|Adamant|,252,4,,,252|||||]Tauros||choiceband||return,earthquake,pursuit,facade|Jolly|,252,4,,,252|||||]Gardevoir||choicescarf|1|psychic,thunderbolt,focusblast,trick|Timid|,,4,252,,252||,0,,,,|||',

				'Floatzel||focussash||taunt,waterfall,batonpass,icepunch|Jolly|4,252,,,,252|||||]Gardevoir||choicescarf|1|psychic,trick,thunderbolt,focusblast|Timid|4,,,252,,252|||||]Sandslash||leftovers||rapidspin,stealthrock,shadowclaw,earthquake|Impish|252,,252,,4,|||||]Skuntank||blackglasses|1|crunch,pursuit,suckerpunch,explosion|Adamant|4,252,,,,252|||||]Charizard||lifeorb||airslash,fireblast,hiddenpowergrass,roost|Timid|,,,252,4,252||,30,,30,,|||]Vileplume||lifeorb||sunnyday,solarbeam,sludgebomb,sleeppowder|Timid|4,,,252,,252|||||',

				'Charizard||choicespecs||fireblast,hiddenpowergrass,focusblast,airslash|Timid|,,4,252,,252|F|,30,,30,,|||]Jumpluff||lifeorb||swordsdance,seedbomb,aerialace,sleeppowder|Jolly|,252,,,4,252|F||||]Sandslash||leftovers||earthquake,rapidspin,stealthrock,nightslash|Impish|252,4,252,,,|F||||]Grumpig||leftovers||healbell,toxic,psychic,focusblast|Calm|252,,80,,176,|F||||]Poliwrath||leftovers||substitute,encore,waterfall,focuspunch|Adamant|120,252,,,,136|F||||]Tauros||choiceband||pursuit,doubleedge,rockslide,earthquake|Jolly|,252,,,4,252|||||',

				'Glalie||focussash||spikes,taunt,explosion,iceshard|Jolly|4,252,,,,252|||||]Haunter||lifeorb||substitute,shadowball,sludgebomb,hiddenpowerground|Timid|,4,,252,,252||,3,,30,30,|||]Tauros||choiceband||doubleedge,earthquake,stoneedge,payback|Jolly|4,252,,,,252|||||]Rhydon||leftovers||earthquake,stoneedge,megahorn,stealthrock|Adamant|244,16,,,248,|||||]Manectric||choicescarf||thunderbolt,overheat,hiddenpowergrass,switcheroo|Timid|,,,252,4,252||,30,,30,,|||]Drifblim||chestoberry|1|calmmind,rest,shadowball,hiddenpowerfighting|Modest|,,252,108,,148||,,30,30,30,30|||',

				'Gligar||leftovers|1|taunt,stealthrock,roost,earthquake|Jolly|252,4,,,,252|||||]Charizard||lifeorb||swordsdance,thunderpunch,earthquake,firepunch|Jolly|,252,,,4,252|||||]Typhlosion||choicescarf||eruption,fireblast,hiddenpowergrass,focusblast|Timid|,,,252,4,252||,30,,30,,|||]Shiftry||lifeorb|1|suckerpunch,leafstorm,explosion,darkpulse|Mild|,88,,252,,168|||||]Lickilicky||leftovers||swordsdance,bodyslam,aquatail,substitute|Careful|72,252,,,,184|||||]Sandslash||leftovers||rapidspin,nightslash,earthquake,sandstorm|Adamant|196,252,,,,60|||||',

				'Solrock||focussash||stealthrock,trickroom,explosion,stoneedge|Brave|252,252,4,,,||,,,,,0|||]Slowking||lifeorb|1|trickroom,nastyplot,surf,slackoff|Quiet|248,,,252,8,||,,,,,0|||]Porygon2||leftovers||trickroom,recover,thunderbolt,icebeam|Sassy|252,,,40,216,||,,,,,0|||]Marowak||thickclub||substitute,earthquake,stoneedge,doubleedge|Brave|252,252,4,,,|||||]Gardevoir||lightclay|1|reflect,lightscreen,memento,psychic|Modest|4,,,252,,252|||||]Charizard||choicescarf||fireblast,airslash,focusblast,hiddenpowergrass|Timid|,,4,252,,252||,30,,30,,|||',

				'Machoke||lumberry|1|dynamicpunch,payback,icepunch,bulletpunch|Adamant|248,252,,,8,|F||||]Sandslash||leftovers||earthquake,shadowclaw,stealthrock,rapidspin|Adamant|248,252,,,,8|M||||]Charizard||lifeorb||fireblast,airslash,hiddenpowergrass,roost|Timid|,,,252,4,252|M|,30,,30,,|||]Manectric||choicescarf||thunderbolt,flamethrower,hiddenpowergrass,switcheroo|Timid|40,,,252,,216|M|,30,,30,,|||]Whiscash||leftovers|1|earthquake,waterfall,dragondance,stoneedge|Adamant|,252,4,,,252|M||||]Jumpluff||lifeorb||seedbomb,aerialace,sleeppowder,swordsdance|Jolly|,252,4,,,252|M||||',

				'Golem||focussash||stealthrock,explosion,earthquake,suckerpunch|Adamant|,252,4,,,252|||||]Meganium||leftovers||swordsdance,synthesis,seedbomb,return|Adamant|212,252,,,,44|||||]Slowking||choicespecs|1|surf,psychic,fireblast,trick|Modest|252,,4,252,,|||||]Magmortar||expertbelt||fireblast,thunderbolt,focusblast,hiddenpowergrass|Timid|,,,252,4,252||,30,,30,,|||]Drifblim||leftovers||substitute,calmmind,shadowball,thunderbolt|Timid|,,4,252,,252|||||]Dodrio||choiceband|1|bravebird,return,quickattack,pursuit|Adamant|,252,4,,,252|||||',

				'Jynx||focussash||fakeout,lovelykiss,psychic,icebeam|Timid|4,,,252,,252|||||]Haunter||lifeorb||substitute,shadowball,hiddenpowerground,sludgebomb|Timid|,,4,252,,252|F|,,,30,30,|||]Manectric||choicescarf|1|flamethrower,thunderbolt,hiddenpowergrass,switcheroo|Timid|,,4,252,,252|F|,30,,30,,|||]Regirock||leftovers||explosion,rockslide,stealthrock,thunderwave|Careful|252,,4,,252,|||||]Tauros||choiceband||doubleedge,earthquake,stoneedge,zenheadbutt|Jolly|4,252,,,,252|||||]Slowking||leftovers|1|surf,psychic,slackoff,thunderwave|Calm|252,,144,,112,|||||',

				'Piloswine||lifeorb||earthquake,avalanche,iceshard,stealthrock|Adamant|200,252,,,,56|M||||]Magneton||leftovers||substitute,flashcannon,thunderbolt,hiddenpowerground|Modest|64,,,228,,216||,,,30,30,|||]Politoed||leftovers||surf,encore,toxic,protect|Calm|188,,68,,252,|M||||]Haunter||lifeorb||shadowball,hiddenpowerground,substitute,sludgebomb|Timid|,,,252,4,252|M|,,,30,30,|||]Magmortar||choicescarf||thunderbolt,fireblast,focusblast,earthquake|Hasty|,,,252,4,252|M||||]Jynx||leftovers||lovelykiss,icebeam,substitute,nastyplot|Timid|8,,,248,,252|||||',

				'Electrode||focussash|1|taunt,raindance,explosion,hiddenpowerwater|Lonely|,72,,252,,184||,30,30,30,,|||]Gorebyss||lifeorb||hydropump,hiddenpowergrass,icebeam,shadowball|Timid|4,,,252,,252||,30,,30,,|||]Relicanth||lifeorb||stoneedge,earthquake,return,waterfall|Adamant|4,252,,,,252|||||]Skuntank||blackglasses|1|raindance,explosion,suckerpunch,poisonjab|Jolly|4,252,,,,252|||||]Medicham||choicescarf||highjumpkick,psychocut,icepunch,thunderpunch|Jolly|4,252,,,,252|||||]Lickilicky||damprock||raindance,explosion,earthquake,powerwhip|Adamant|252,252,4,,,|||||',

				'Electrode||focussash|1|taunt,raindance,explosion,hiddenpowerwater|Lonely|,72,,252,,184||,30,30,30,,|||]Gorebyss||lifeorb||hydropump,hiddenpowergrass,icebeam,shadowball|Timid|4,,,252,,252||,30,,30,,|||]Floatzel||lifeorb||aquajet,waterfall,icepunch,crunch|Adamant|,252,4,,,252|||||]Hypno||leftovers||raindance,batonpass,seismictoss,protect|Bold|252,,152,,104,|||||]Probopass||leftovers|1|stealthrock,earthpower,powergem,thunderwave|Modest|252,,,252,,4|||||]Lickilicky||damprock||raindance,explosion,earthquake,powerwhip|Adamant|252,252,4,,,|||||',


			],


			gen4pu: [
				'Electabuzz||lifeorb||thunderbolt,psychic,focusblast,hiddenpowergrass|Timid|,,,252,4,252||,2,,30,,|||]Rhydon||rindoberry|1|stealthrock,earthquake,stoneedge,swordsdance|Adamant|156,252,,,,100|||||]Cacturne||lifeorb||seedbomb,suckerpunch,spikes,synthesis|Jolly|,252,,,4,252|||||]Sneasel||choiceband||punishment,icepunch,iceshard,pursuit|Jolly|,252,,,4,252|||||]Poliwrath||leftovers||hydropump,focusblast,hiddenpowerelectric,vacuumwave|Modest|32,,,252,,224||,3,,30,,|||]Golbat||blacksludge||bravebird,taunt,uturn,roost|Jolly|248,,164,,,96|||||',

				'Glalie||focussash||taunt,spikes,icebeam,explosion|Naive|,252,,4,,252|||||]Electabuzz||lifeorb||hiddenpowergrass,thunderbolt,focusblast,toxic|Timid|,,,252,4,252||,2,,30,,|||]Poliwrath||leftovers||hydropump,focusblast,vacuumwave,encore|Modest|,,,252,4,252||,0,,,,|||]Victreebel||lifeorb||swordsdance,leafblade,suckerpunch,frustration|Jolly|,252,,,4,252|||||0]Marowak||thickclub||bonemerang,stealthrock,stoneedge,doubleedge|Jolly|,252,,,4,252|||||]Xatu||choicescarf||psychic,uturn,tailwind,heatwave|Timid|,,,252,4,252|||||',

				'Poliwrath||leftovers||hydropump,vacuumwave,focusblast,icebeam|Modest|120,,,252,,136||,0,,,,|||]Sableye||leftovers||willowisp,recover,seismictoss,taunt|Bold|252,,252,,,4||,0,,,,|||]Muk||blacksludge|1|poisonjab,payback,rest,sleeptalk|Careful|248,,,,252,8|||||]Mr. Mime||choicescarf|1|psychic,energyball,focusblast,healingwish|Timid|,,,252,4,252||,0,,,,|||]Lickilicky||leftovers|1|bodyslam,wish,protect,powerwhip|Careful|252,4,,,252,|||||]Rhydon||lumberry||stealthrock,stoneedge,earthquake,swordsdance|Jolly|,252,,,4,252|||||',

				'Purugly||silkscarf||fakeout,frustration,suckerpunch,uturn|Jolly|,252,,,4,252|||||0]Pelipper||leftovers||surf,airslash,roost,uturn|Bold|248,,136,,,124|||||]Bellossom||leftovers||sleeppowder,energyball,hiddenpowerground,synthesis|Calm|248,,8,,252,||,3,,30,30,|||]Metang||leftovers||stealthrock,meteormash,earthquake,bulletpunch|Adamant|,252,4,,,252|||||]Victreebel||lifeorb||swordsdance,leafblade,frustration,suckerpunch|Adamant|,252,,,4,252|||||0]Xatu||choicescarf||psychic,heatwave,gigadrain,uturn|Modest|,,,252,4,252|||||',

				'Electabuzz||magnet||thunderbolt,hiddenpowergrass,lowkick,toxic|Hasty|,4,,252,,252||,30,,30,,|||]Dragonair||lifeorb||dragondance,outrage,extremespeed,aquatail|Adamant|,252,,,4,252|||||]Misdreavus||choicescarf||thunderbolt,trick,memento,shadowball|Timid|,,,252,4,252||,0,,,,|||]Pelipper||leftovers||surf,airslash,roost,uturn|Bold|248,,136,,,124|||||]Victreebel||lifeorb||leafblade,suckerpunch,swordsdance,frustration|Jolly|,252,,,4,252|||||0]Metang||leftovers||stealthrock,meteormash,zenheadbutt,bulletpunch|Adamant|,252,4,,,252|||||0',

				'Rhydon||leftovers||stealthrock,toxic,earthquake,stoneedge|Careful|248,,,,252,8|||||]Misdreavus||leftovers||memento,taunt,willowisp,shadowball|Timid|,,4,252,,252||,0,,,,|||]Poliwrath||leftovers||bulkup,substitute,focuspunch,waterfall|Adamant|252,252,4,,,|M||||]Xatu||lightclay||reflect,lightscreen,wish,uturn|Jolly|248,,32,,,228|||||]Linoone||salacberry|1|bellydrum,extremespeed,seedbomb,shadowclaw|Adamant|132,252,,,,124|||||]Golbat||lifeorb||sludgebomb,gigadrain,heatwave,nastyplot|Timid|,,4,252,,252||29,0,,,,|||',

				'Purugly||silkscarf||fakeout,frustration,suckerpunch,uturn|Jolly|,252,,,4,252|||||0]Sneasel||choiceband||punishment,icepunch,iceshard,pursuit|Jolly|,252,,,4,252|||||]Metang||leftovers||meteormash,zenheadbutt,earthquake,stealthrock|Adamant|,252,4,,,252|||||0]Muk||blacksludge|1|poisonjab,payback,rest,sleeptalk|Careful|248,,,,252,8|||||]Poliwrath||leftovers||hydropump,focusblast,vacuumwave,encore|Modest|,,,252,4,252||,0,,,,|||]Monferno||choicescarf||flareblitz,closecombat,grassknot,uturn|Naive|,252,,4,,252|||||',

				'Electabuzz||lifeorb||thunderbolt,hiddenpowergrass,lowkick,toxic|Hasty|,4,,252,,252||,30,,30,,|||]Dragonair||lifeorb||dragondance,outrage,extremespeed,aquatail|Adamant|,252,,,4,252|||||]Misdreavus||choicescarf||thunderbolt,trick,memento,shadowball|Timid|,,,252,4,252||,0,,,,|||]Pelipper||leftovers||surf,airslash,roost,uturn|Bold|248,,136,,,124|||||]Victreebel||lifeorb||leafblade,suckerpunch,swordsdance,frustration|Jolly|,252,,,4,252|||||0]Metang||leftovers||stealthrock,meteormash,earthquake,bulletpunch|Adamant|,252,4,,,252|||||',

				'Solrock||leftovers||stealthrock,trickroom,explosion,magiccoat|Brave|252,180,76,,,||,,,,,0|||]Marowak||thickclub||substitute,stoneedge,earthquake,doubleedge|Brave|252,252,4,,,||,,,,,0|||]Chimecho||leftovers||yawn,trickroom,healingwish,psychic|Sassy|252,,,4,252,||,0,,,,0|||]Octillery||lifeorb|1|surf,icebeam,energyball,fireblast|Quiet|232,,,252,24,||,0,,,,0|||]Machoke||flameorb||closecombat,payback,thunderpunch,earthquake|Adamant|192,252,32,,32,|||||]Xatu||choicescarf||psychic,heatwave,shadowball,uturn|Timid|,,,252,4,252|||||',

				'Misdreavus||leftovers||memento,taunt,willowisp,shadowball|Timid|,,4,252,,252||,0,,,,|||]Metang||leftovers||meteormash,pursuit,toxic,stealthrock|Adamant|,252,4,,,252|||||0]Golbat||blacksludge||bravebird,taunt,uturn,roost|Jolly|248,,164,,,96|||||]Gastrodon||leftovers||surf,earthquake,toxic,recover|Sassy|248,,140,,120,|||||]Bellossom||leftovers||energyball,leechseed,sleeppowder,synthesis|Calm|248,,8,,252,||,0,,,,|||]Monferno||choiceband||flareblitz,closecombat,machpunch,uturn|Jolly|,252,,,4,252|||||',

				'Metang||leftovers||stealthrock,zenheadbutt,bulletpunch,earthquake|Jolly|,252,4,,,252|||||]Pelipper||leftovers||surf,uturn,airslash,roost|Bold|88,,252,,,168|||||]Rhydon||lumberry|1|earthquake,rockpolish,swordsdance,stoneedge|Adamant|,252,4,,,252|||||]Poliwrath||leftovers||surf,focusblast,vacuumwave,encore|Modest|128,,,252,,128||,0,,,,|||]Bellossom||leftovers||energyball,sleeppowder,synthesis,hiddenpowerfire|Calm|248,,,,252,8||,2,,30,,30|||]Misdreavus||choicescarf||shadowball,hiddenpowerfighting,trick,willowisp|Timid|,,,252,4,252||,3,30,30,30,30|||',

				'Metang||lumberry||stealthrock,zenheadbutt,bulletpunch,explosion|Jolly|,252,4,,,252|||||]Marowak||thickclub||swordsdance,bonemerang,stoneedge,substitute|Jolly|,252,4,,,252|||||]Rapidash||leftovers|1|fireblast,frustration,hiddenpowerelectric,morningsun|Naive|,4,,252,,252||,,,30,,|||0]Pelipper||lifeorb||hydropump,airslash,uturn,roost|Timid|,,4,252,,252|||||]Electabuzz||choicescarf||thunderbolt,hiddenpowergrass,psychic,lowkick|Hasty|,4,,252,,252||,30,,30,,|||]Victreebel||lifeorb||swordsdance,leafblade,frustration,suckerpunch|Adamant|,252,4,,,252|||||0',

				'Sneasel||lifeorb||icepunch,pursuit,iceshard,lowkick|Jolly|,252,,,4,252|||||]Regigigas||leftovers||substitute,thunderwave,frustration,earthquake|Jolly|120,252,,,,136|||||0]Rapidash||leftovers|1|flareblitz,morningsun,willowisp,hiddenpowergrass|Jolly|,252,,,4,252||,30,,30,,|||0]Armaldo||lumberry||swordsdance,stoneedge,rapidspin,earthquake|Jolly|40,252,,,,216|||||]Poliwrath||leftovers||rest,sleeptalk,surf,toxic|Bold|248,,252,,,8||,0,,,,|||]Metang||leftovers||stealthrock,meteormash,zenheadbutt,toxic|Adamant|248,248,,,,|||||',

				'Armaldo||leftovers||rapidspin,stealthrock,stoneedge,earthquake|Impish|248,8,252,,,|||||]Glaceon||choicespecs||icebeam,waterpulse,hiddenpowergrass,batonpass|Modest|,,4,252,,252||,2,,30,,|||]Lickilicky||leftovers||protect,wish,bodyslam,powerwhip|Impish|248,,252,,8,|||||]Muk||blacksludge|1|curse,rest,poisonjab,sleeptalk|Careful|252,4,,,252,|||||]Poliwrath||leftovers||substitute,focuspunch,waterfall,encore|Adamant|156,252,,,,100|||||]Rapidash||leftovers|1|morningsun,willowisp,flareblitz,frustration|Jolly|,252,4,,,252|||||0',

				'Purugly||lifeorb||fakeout,frustration,hiddenpowergrass,uturn|Jolly|,252,,,4,252||,30,,30,,|||0]Metang||leftovers||stealthrock,meteormash,zenheadbutt,pursuit|Adamant|248,248,,,,12|||||]Misdreavus||leftovers||willowisp,painsplit,healbell,shadowball|Bold|248,,252,,8,||,0,,,,|||]Victreebel||lifeorb||swordsdance,leafblade,frustration,suckerpunch|Jolly|,252,,,4,252|||||0]Poliwrath||leftovers||surf,icebeam,focusblast,vacuumwave|Modest|120,,,252,,136||,0,,,,|||]Rapidash||leftovers|1|fireblast,hiddenpowergrass,frustration,morningsun|Naive|,4,,252,,252||,30,,30,,|||0',

				'Bronzor||leftovers||stealthrock,toxic,reflect,rest|Bold|248,,252,,,8||,0,,,,|||]Armaldo||leftovers||toxic,rockblast,earthquake,rapidspin|Impish|248,,212,,,48|||||]Rapidash||leftovers|1|flamethrower,toxic,substitute,morningsun|Bold|252,,252,,,4||,0,,,,|||]Misdreavus||leftovers||willowisp,painsplit,taunt,shadowball|Bold|248,,252,,,8||,0,,,,|||]Lickilicky||leftovers|1|bodyslam,wish,protect,healbell|Careful|252,4,,,252,|||||]Muk||leftovers|1|rest,sleeptalk,poisonjab,curse|Careful|252,4,,,252,|||||',

				'Kadabra||lifeorb||substitute,shadowball,hiddenpowerfighting,psychic|Timid|,,,252,4,252||,3,30,30,30,30|||]Muk||blacksludge|1|substitute,poisonjab,focuspunch,shadowsneak|Adamant|216,252,,,,40|||||]Gastrodon-East||leftovers||toxic,waterfall,earthquake,recover|Impish|248,,144,,108,8|||S||]Bellossom||leftovers||synthesis,stunspore,leechseed,gigadrain|Calm|248,,,40,220,||,0,,,,|||]Poliwrath||leftovers||surf,focusblast,icebeam,vacuumwave|Modest|156,,,252,,100||,0,,,,|||]Electabuzz||lifeorb||thunderbolt,hiddenpowergrass,psychic,focusblast|Timid|,,,252,4,252||,2,,30,,|||',


			],


			gen4lc: [
				'Chimchar||focussash||fakeout,overheat,hiddenpowergrass,stealthrock|Hasty|4,56,,216,4,188||,30,,30,,||5|]Elekid||lifeorb||thunderbolt,icepunch,crosschop,hiddenpowergrass|Hasty|,96,,160,,240||,30,,30,,||5|]Clamperl||deepseascale||rest,sleeptalk,surf,hiddenpowerelectric|Bold|236,,236,8,,20||,,,30,,||5|]Munchlax||oranberry|1|recycle,pursuit,return,firepunch|Sassy|76,,196,,236,||||5|]Drifloon||oranberry|1|calmmind,shadowball,hiddenpowerfighting,substitute|Modest|116,,8,200,8,120||,,30,30,30,30||5|]Croagunk||lifeorb|1|fakeout,suckerpunch,vacuumwave,darkpulse|Lonely|,188,,188,,116||||5|',

				'Meowth||focussash|1|fakeout,seedbomb,bite,hypnosis|Jolly|,236,76,,,196||||5|]Dratini||lifeorb||dragondance,outrage,waterfall,extremespeed|Adamant|28,244,,,36,196||||5|]Munchlax||oranberry|1|recycle,pursuit,return,firepunch|Sassy|76,,196,,236,||||5|]Bronzor||oranberry||stealthrock,recycle,earthquake,hiddenpowerice|Relaxed|220,8,156,4,68,12||,30,30,,,||5|]Magby||lifeorb||flareblitz,machpunch,thunderpunch,overheat|Hasty|,240,,,,252||||5|]Gligar||choicescarf||uturn,earthquake,aerialace,aquatail|Jolly|,236,,,,236||||5|',

				'Machop||oranberry|1|bulletpunch,dynamicpunch,icepunch,protect|Adamant|196,196,36,,76,||||5|]Stunky||lifeorb|1|crunch,explosion,hiddenpowerground,suckerpunch|Jolly|12,252,,,,244||,,,30,30,||5|]Gligar||oranberry|1|aquatail,earthquake,stoneedge,swordsdance|Jolly|76,156,,,,236||||5|]Staryu||lifeorb|1|hiddenpowerfire,hydropump,icebeam,thunderbolt|Timid|,,,200,,240||,30,,30,,30||5|]Gastly||choicescarf||explosion,shadowball,sludgebomb,thunderbolt|Rash|36,76,,196,,196||||5|]Croagunk||lifeorb|1|fakeout,icepunch,suckerpunch,vacuumwave|Mild|,188,,188,,116||||5|',

				'Omanyte||lifeorb||hydropump,ancientpower,icebeam,stealthrock|Modest|236,,,36,,236||||5|]Stunky||lifeorb|1|crunch,suckerpunch,explosion,hiddenpowerground|Jolly|12,252,,,,244||,,,30,30,||5|]Gligar||choicescarf|1|earthquake,aquatail,stoneedge,uturn|Adamant|,236,,,,236||||5|]Chinchou||lifeorb||agility,hydropump,thunderbolt,icebeam|Modest|,,58,228,,220||||5|]Porygon||lifeorb||agility,triattack,icebeam,shadowball|Timid|76,,,236,,196||||5|]Staryu||lifeorb|1|hydropump,icebeam,thunderbolt,hiddenpowerfire|Timid|,,,240,,240||,30,,30,,30||5|',

				'Bronzor||oranberry||stealthrock,psychic,earthquake,raindance|Relaxed|220,8,152,4,68,12||||5|]Munchlax||oranberry|1|icepunch,bodyslam,earthquake,pursuit|Impish|236,,36,,236,||||5|]Gastly||lifeorb||substitute,shadowball,hiddenpowerfighting,explosion|Naive|,76,,200,,200||,,30,30,30,30||5|]Mantyke||oranberry||raindance,hydropump,icebeam,hiddenpowerelectric|Modest|36,,36,200,36,196||,,,30,,||5|]Croagunk||lifeorb|1|fakeout,suckerpunch,vacuumwave,icepunch|Lonely|,188,,188,,116||||5|]Gligar||oranberry||swordsdance,earthquake,stoneedge,aquatail|Jolly|,236,,,,236||||5|',

				'Machop||oranberry|1|dynamicpunch,icepunch,payback,bulletpunch|Adamant|116,196,36,,76,76||||5|]Houndour||lifeorb|1|suckerpunch,crunch,fireblast,pursuit|Lonely|,196,,196,36,76||||5|]Aron||oranberry|1|rockpolish,headsmash,earthquake,magnetrise|Jolly|36,196,36,,36,196||||5|]Wynaut||oranberry||encore,counter,mirrorcoat,destinybond|Impish|76,,132,,212,12||||5|]Chinchou||oranberry||agility,hydropump,thunderbolt,icebeam|Modest|,,52,228,,220||||5|]Psyduck||choicescarf|1|hydropump,icebeam,crosschop,hiddenpowergrass|Naive|,24,,240,,236||,30,,30,,||5|',

				'Chimchar||focussash||fakeout,overheat,hiddenpowergrass,stealthrock|Hasty|4,56,,216,4,188||,30,,30,,||5|]Gligar||oranberry|1|swordsdance,agility,batonpass,earthquake|Impish|156,,76,,236,||||5|]Teddiursa||toxicorb|1|facade,closecombat,crunch,protect|Jolly|36,196,36,,36,196||||5|]Munchlax||oranberry|1|return,earthquake,pursuit,firepunch|Adamant|,236,36,,236,||||5|]Elekid||lifeorb||thunderbolt,icepunch,lowkick,psychic|Hasty|,92,,160,,240||||5|]Snover||lifeorb||swordsdance,substitute,iceshard,woodhammer|Adamant|36,184,36,,36,120||||5|',

				'Houndour||focussash||suckerpunch,taunt,overheat,reversal|Naive|,76,,196,,236||||5|]Gligar||choicescarf|1|uturn,earthquake,aquatail,aerialace|Adamant|,236,,,,236||||5|]Magnemite||oranberry||magnetrise,substitute,thunderbolt,hiddenpowerice|Modest|76,,40,236,,156||,30,30,,,||5|]Bronzor||oranberry||psychic,earthquake,hiddenpowerice,stealthrock|Relaxed|220,8,152,4,68,12||,30,30,,,||5|]Totodile||lifeorb||swordsdance,waterfall,return,aquajet|Jolly|36,236,4,,52,172||||5|]Snover||oranberry||blizzard,woodhammer,iceshard,hiddenpowerfire|Adamant|196,184,36,24,,40||,30,,30,,30||5|',

				'Gastly||focussash||trickroom,explosion,shadowball,hypnosis|Quiet|36,,166,196,76,||,,,,,0||5|]Munchlax||oranberry|1|return,earthquake,pursuit,firepunch|Adamant|,236,36,,236,||||5|]Numel||lifeorb||fireblast,earthquake,hiddenpowerelectric,return|Quiet|36,196,36,240,,||,,,30,,||5|]Porygon||oranberry||trickroom,triattack,thunderbolt,recover|Quiet|236,,36,236,,||,0,,,,||5|]Cubone||thickclub||earthquake,doubleedge,firepunch,icebeam|Brave|196,196,76,,36,||,,,,,0||5|]Slowpoke||oranberry|1|fireblast,aquatail,slackoff,trickroom|Relaxed|196,,236,,36,||||5|',

				'Drifloon||focussash|1|explosion,shadowball,suckerpunch,thunderbolt|Hasty|,116,,196,,196||||5|]Doduo||lifeorb|1|bravebird,return,quickattack,hiddenpowerfighting|Naughty|,240,,,,240||,,30,30,30,30||5|]Gligar||choicescarf|1|uturn,earthquake,aquatail,aerialace|Adamant|,236,,,,236||||5|]Taillow||toxicorb||facade,bravebird,quickattack,uturn|Jolly|36,236,,,,236||||5|]Magnemite||oranberry||magnetrise,substitute,thunderbolt,hiddenpowerice|Modest|76,,40,236,,156||,30,30,,,||5|]Diglett||focussash|1|earthquake,hiddenpowerice,suckerpunch,substitute|Hasty|,240,,,,236||,30,30,,,||5|',

				'Gastly||focussash||hypnosis,shadowball,sludgebomb,explosion|Hasty|,76,,196,,196||||5|]Gligar||choicescarf|1|uturn,earthquake,aquatail,aerialace|Adamant|,236,,,,236||||5|]Bronzor||oranberry||psychic,earthquake,hiddenpowerice,stealthrock|Relaxed|220,8,152,4,68,12||,30,30,,,||5|]Ponyta||oranberry|1|fireblast,return,quickattack,hiddenpowergrass|Hasty|36,240,,,,196||,30,,30,,||5|]Croagunk||lifeorb|1|fakeout,suckerpunch,vacuumwave,darkpulse|Lonely|,188,,188,,116||||5|]Bagon||oranberry||dragondance,outrage,firefang,dragonclaw|Adamant|,236,36,,36,196|||S|5|',

				'Diglett||focussash|1|stealthrock,earthquake,suckerpunch,protect|Jolly|36,236,,,,236||||5|]Bellsprout||lifeorb||swordsdance,seedbomb,suckerpunch,sleeppowder|Jolly|36,236,,,36,196||||5|]Munchlax||oranberry|1|sunnyday,return,earthquake,pursuit|Sassy|156,,196,,156,||||5|]Bronzor||heatrock||sunnyday,psychic,earthquake,hiddenpowerice|Relaxed|220,8,152,4,68,12||,30,30,,,||5|]Ponyta||oranberry|1|fireblast,solarbeam,sunnyday,hiddenpowerelectric|Timid|72,,,240,,196||,3,,30,,|S|5|]Machop||oranberry|1|bulkup,dynamicpunch,bulletpunch,icepunch|Adamant|196,36,36,,236,||||5|',

				'Abra||lightclay|1|reflect,lightscreen,encore,psychic|Timid|236,,76,,,196||||5|]Gligar||oranberry|1|swordsdance,agility,batonpass,earthquake|Impish|156,,76,,236,||||5|]Bronzor||lightclay||reflect,lightscreen,psychic,stealthrock|Sassy|220,4,148,4,68,12||,0,,,,||5|]Mankey||choicescarf||closecombat,uturn,payback,icepunch|Adamant|116,196,,,,196||||5|]Cranidos||lifeorb||rockpolish,stoneedge,earthquake,icebeam|Naughty|60,236,,,,212||||5|]Bidoof||oranberry||substitute,return,quickattack,aquatail|Jolly|44,236,36,,,188||||5|',

				'Gligar||focussash|1|stealthrock,earthquake,quickattack,aquatail|Jolly|,236,,,,236||||5|]Wailmer||choicescarf||waterspout,hydropump,icebeam,hiddenpowerelectric|Modest|36,,76,200,,196||,3,,30,,||5|]Bronzor||oranberry||psychic,earthquake,recycle,hiddenpowerfire|Relaxed|220,8,152,4,68,12||,30,,30,,30||5|]Snover||oranberry||blizzard,woodhammer,iceshard,swordsdance|Adamant|196,184,36,,52,40||||5|]Gastly||choicescarf||shadowball,sludgebomb,hiddenpowerground,explosion|Timid|36,,40,200,,200||,,,30,30,||5|]Machop||oranberry|1|bulkup,dynamicpunch,bulletpunch,icepunch|Adamant|196,36,36,,236,||||5|',

				'Staryu||oranberry|1|rapidspin,hydropump,thunderbolt,icebeam|Timid|36,,,196,,236||,0,,,,|S|5|]Magnemite||oranberry||magnetrise,substitute,thunderbolt,hiddenpowerice|Modest|76,,40,236,,156||,30,30,,,|S|5|]Snover||lifeorb||swordsdance,substitute,iceshard,seedbomb|Adamant|36,184,36,,36,120|||S|5|]Gligar||choicescarf|1|uturn,earthquake,aquatail,aerialace|Jolly|,236,,,,236|||S|5|]Gastly||oranberry||substitute,hypnosis,sludgebomb,shadowball|Timid|4,,,196,112,196|||S|5|]Aron||lifeorb|1|rockpolish,headsmash,earthquake,ironhead|Adamant|36,196,36,,36,196|||S|5|',

				'Gastly||focussash||trickroom,explosion,shadowball,hypnosis|Quiet|36,,166,196,76,||,,,,,0||5|]Bronzor||oranberry||trickroom,psychic,earthquake,hiddenpowerice|Relaxed|220,8,152,4,68,12||,,,,,2||5|]Slowpoke||oranberry|1|flamethrower,aquatail,slackoff,trickroom|Relaxed|196,,236,,36,||||5|]Porygon||oranberry||trickroom,triattack,thunderbolt,shadowball|Quiet|236,,36,236,,||||5|]Cubone||thickclub||earthquake,doubleedge,firepunch,icebeam|Brave|196,196,76,,36,||,,,,,0||5|]MakuFlex|makuhita|oranberry||bellydrum,closecombat,bulletpunch,icepunch|Brave|180,,116,,36,||||5|',

				'Drifloon||focussash|1|raindance,explosion,suckerpunch,thunder|Naive|,196,,116,,196||||5|]Bronzor||damprock||raindance,psychic,stealthrock,hiddenpowerfighting|Bold|220,,152,4,68,16||,3,30,30,30,30||5|]Voltorb||damprock|1|raindance,thunder,explosion,taunt|Hasty|36,40,,236,,196||||5|]Croagunk||lifeorb|1|fakeout,suckerpunch,vacuumwave,darkpulse|Lonely|,188,,188,,116||||5|]Mantyke||lifeorb||hydropump,icebeam,hiddenpowerflying,raindance|Modest|76,,36,200,,196||30,2,30,30,30,||5|]Buizel||lifeorb||waterfall,aquajet,return,bulkup|Jolly|,236,,,36,236||||5|',

				'Dratini||focussash||protect,dracometeor,surf,extremespeed|Hasty|28,84,,196,,196||||5|]Stunky||lifeorb|1|crunch,suckerpunch,explosion,fireblast|Hasty|12,252,,,,244||||5|]Gastly||lifeorb||substitute,shadowball,sludgebomb,hypnosis|Modest|,,36,200,,200||,0,,,,|S|5|]Ponyta||oranberry|1|fireblast,return,quickattack,hiddenpowergrass|Hasty|36,240,,,,196||,30,,30,,|S|5|]Gligar||choicescarf|1|uturn,earthquake,aquatail,aerialace|Jolly|,236,,,,236|||S|5|]Riolu||lifeorb|1|agility,highjumpkick,crunch,icepunch|Adamant|,196,36,,36,196||||5|',

				'Wingull||focussash||airslash,icebeam,hiddenpowerground,quickattack|Naive|,32,,240,,236||,,,30,30,||5|]Chinchou||lifeorb||agility,hydropump,thunderbolt,hiddenpowerfire|Modest|,,52,228,,220||,2,,30,,30||5|]Bronzor||oranberry||psychic,stealthrock,recycle,hiddenpowerfire|Bold|220,,152,4,68,16||,2,,30,,30||5|]Dratini||lifeorb||substitute,extremespeed,fireblast,dracometeor|Lonely|,244,,116,,116||||5|]Bagon||oranberry||dragondance,outrage,firefang,dragonclaw|Adamant|,236,36,,36,196||||5|]Gligar||choicescarf|1|uturn,earthquake,aquatail,aerialace|Jolly|,236,,,,236|||S|5|',

				'Carvanha||focussash||hydropump,icebeam,taunt,aquajet|Timid|,36,,236,,236||||5|]Stunky||lifeorb|1|pursuit,crunch,fireblast,suckerpunch|Naive|,252,,12,,244||||5|]Houndour||lifeorb||fireblast,darkpulse,suckerpunch,willowisp|Timid|,,76,196,,236||||5|]Bronzor||oranberry||psychic,stealthrock,recycle,hiddenpowerfire|Bold|220,,152,4,68,16||,2,,30,,30||5|]Mankey||choicescarf||closecombat,payback,icepunch,uturn|Jolly|,196,,,76,196||||5|]Krabby||oranberry|1|agility,swordsdance,crabhammer,xscissor|Adamant|,236,,,76,196||||5|',

				'Gligar||choicescarf|1|uturn,earthquake,aquatail,nightslash|Adamant|,236,,,,236||||5|]Duskull||oranberry||shadowsneak,return,willowisp,painsplit|Impish|196,116,36,,116,||||5|]Chinchou||oranberry||hydropump,thunderbolt,hiddenpowerfire,agility|Modest|,,52,232,,224||,2,,30,,30||5|]Munchlax||oranberry|1|return,icepunch,firepunch,pursuit|Adamant|,236,36,,236,||||5|]Houndour||oranberry|1|crunch,pursuit,suckerpunch,willowisp|Jolly|,196,36,,36,236||||5|]Drifloon||oranberry|1|shadowball,hiddenpowerfighting,calmmind,substitute|Modest|116,,8,200,8,120||,3,30,30,30,30||5|',

				'Gligar||focussash|1|stealthrock,earthquake,quickattack,aquatail|Jolly|,236,,,,236||||5|]Dratini||choiceband||outrage,waterfall,extremespeed,fireblast|Hasty|28,244,,36,,196||||5|]Houndour||lifeorb|1|suckerpunch,fireblast,substitute,pursuit|Lonely|,196,,196,36,76||||5|]Duskull||oranberry||willowisp,shadowsneak,return,painsplit|Relaxed|196,116,36,,116,||||5|]Bronzor||oranberry||psychic,hiddenpowerice,calmmind,recycle|Modest|220,,72,84,68,12||,2,30,,,||5|]Diglett||lifeorb|1|earthquake,suckerpunch,hiddenpowerice,substitute|Hasty|,240,,,,236||,30,30,,,||5|',


			],


			gen5ou: [
				'Reuniclus||leftovers|1|psyshock,focusblast,recover,calmmind|Bold|252,,252,4,,|||||]Skarmory||leftovers|1|bravebird,spikes,roost,whirlwind|Careful|248,,,,252,8|||||]Garchomp||choiceband|H|outrage,earthquake,dualchop,firefang|Adamant|,252,,,4,252|||||]Jellicent||leftovers||scald,willowisp,taunt,recover|Bold|240,,252,,,16|M||||]Tyranitar||choicescarf||icebeam,crunch,pursuit,superpower|Hasty|,252,,4,,252|||||]Heatran||leftovers||lavaplume,protect,stealthrock,toxic|Calm|252,,,8,248,|||||',

				'Tyranitar||chopleberry||crunch,pursuit,superpower,stealthrock|Careful|252,64,,,192,|M||||]Landorus|landorustherian|choicescarf||earthquake,stoneedge,hiddenpowerice,uturn|Naughty|96,216,8,,,188||,,,,,30|||]Heatran||leftovers||flamethrower,earthpower,willowisp,protect|Calm|252,,4,,252,|F|,0,,,,|||]Mew||leftovers||icebeam,willowisp,taunt,softboiled|Bold|252,,140,,,116||,0,,,,|||]Breloom||toxicorb|1|drainpunch,bulkup,protect,spore|Careful|236,,56,,216,|F||||]Starmie||leftovers|1|scald,psychic,rapidspin,recover|Timid|252,,32,,,224||,0,,,,|||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|M||||]Landorus|landorustherian|leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Relaxed|252,16,224,8,8,||,,,,,30|||]Rotom|rotomwash|leftovers||voltswitch,hydropump,willowisp,painsplit|Calm|252,,128,,128,||,0,,,,|||]Scizor||lumberry|1|bugbite,bulletpunch,superpower,swordsdance|Adamant|56,236,,,,216|F||||]Reuniclus||lifeorb|1|psychic,shadowball,focusblast,trickroom|Quiet|252,,4,252,,|F|,0,,,,0|||]Dragonite||choiceband|H|outrage,firepunch,earthquake,extremespeed|Adamant|,252,4,,,252|M||||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|F||||]Landorus|landorustherian|leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Relaxed|252,16,228,4,8,||,,,,,30|||]Garchomp||yacheberry|H|outrage,earthquake,swordsdance,substitute|Adamant|16,252,,,,240|F||||]Slowking||leftovers|H|psyshock,surf,fireblast,thunderwave|Quiet|252,,20,216,20,|M|,0,,,,0|||]Jirachi||leftovers||psychic,grassknot,hiddenpowerfire,calmmind|Modest|136,,,240,,132||,30,,30,,30|||]Ferrothorn||leftovers||powerwhip,leechseed,spikes,protect|Sassy|252,,84,,172,|M|,,,,,19|||',

				'Tyranitar||choiceband||crunch,pursuit,stoneedge,superpower|Adamant|104,240,,,40,124|M||||]Landorus|landorustherian|leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Relaxed|252,12,228,8,8,||,,,,,30|||]Garchomp||dragongem|H|outrage,earthquake,substitute,swordsdance|Adamant|16,252,,,,240|M||||]Latios||choicespecs||dracometeor,psyshock,surf,hiddenpowerfire|Timid|4,,,252,,252||,30,,30,,30|||]Jirachi||choicescarf||ironhead,uturn,icepunch,healingwish|Jolly|104,200,,,56,148|||||]Keldeo||fightinggem||hydropump,secretsword,calmmind,hiddenpowerelectric|Timid|,,4,252,,252||,,,30,,|||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|M||||]Landorus|landorustherian|leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Relaxed|252,8,228,12,8,||,30,30,,,|||]Garchomp||yacheberry|H|outrage,earthquake,substitute,swordsdance|Adamant|16,252,,,,240|M||||]Latios||choicespecs||dracometeor,psyshock,surf,hiddenpowerfire|Timid|4,,,252,,252||,30,,30,,30|||]Jirachi||leftovers||psychic,hiddenpowerfire,grassknot,calmmind|Modest|148,,,232,,128||,30,,30,,30|||]Kingdra||choicespecs||dracometeor,hydropump,dragonpulse,hiddenpowerfire|Modest|16,,8,252,,232|M|,30,,30,,30|||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|M||||]Landorus|landorustherian|leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Relaxed|252,12,228,8,8,||,,,,,30|||]Garchomp||yacheberry|H|outrage,earthquake,substitute,swordsdance|Adamant|16,252,,,,240|M||||]Rotom|rotomwash|leftovers||voltswitch,hydropump,willowisp,painsplit|Calm|252,,128,,128,||,0,,,,|||]Jirachi||leftovers||psychic,grassknot,hiddenpowerfire,calmmind|Modest|144,,,232,,132||,30,,30,,30|||]Keldeo||fightinggem||hydropump,secretsword,calmmind,hiddenpowerice|Timid|,,4,252,,252||,30,30,,,|||',

				'Hydreigon||lifeorb||dracometeor,darkpulse,focusblast,roost|Modest|,,,252,4,252|||||]Skarmory||leftovers|1|spikes,bravebird,whirlwind,roost|Careful|248,,,,252,8|||||]Gastrodon||leftovers|1|scald,icebeam,toxic,recover|Bold|248,,252,8,,|||||]Tyranitar||choicescarf||crunch,pursuit,stoneedge,superpower|Jolly|,252,,,4,252|||||]Alakazam||focussash|H|psychic,focusblast,hiddenpowerice,shadowball|Timid|,,,252,4,252||,30,30,,,|||]Landorus-Therian||leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Naive|248,,112,,,148||,30,30,,,|||',

				'Alakazam||focussash|H|psychic,focusblast,encore,shadowball|Timid|4,,,252,,252|||||]Garchomp||choiceband|H|outrage,earthquake,firefang,dualchop|Adamant|,252,,,4,252|||||]Ferrothorn||leftovers||gyroball,leechseed,protect,spikes|Sassy|248,,112,,148,||,,,,,0|||]Landorus-Therian||choicescarf||earthquake,stoneedge,uturn,hiddenpowerice|Naive|,252,,4,,252||,30,30,,,|||]Jellicent||leftovers||scald,willowisp,taunt,recover|Bold|248,,236,,,24|M||S||]Tyranitar||expertbelt||crunch,fireblast,superpower,stealthrock|Lonely|,144,,156,,208|||||',

				'Hippowdon||leftovers||earthquake,icefang,stealthrock,slackoff|Impish|252,,216,,40,|F||||]Celebi||leftovers||gigadrain,earthpower,hiddenpowerice,nastyplot|Modest|136,,,240,,132||,30,30,,,|||]Dragonite||leftovers|H|dragonclaw,dragondance,substitute,roost|Impish|252,,36,,28,192|F||||]Jirachi||leftovers||ironhead,bodyslam,wish,protect|Careful|252,8,24,,224,|||||]Starmie||leftovers|1|scald,reflecttype,rapidspin,recover|Timid|252,,32,,,224||,0,,,,|||]Garchomp||yacheberry|H|outrage,earthquake,substitute,swordsdance|Adamant|16,252,,,,240|M||||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|F||||]Garchomp||yacheberry|H|outrage,earthquake,swordsdance,stealthrock|Jolly|4,252,,,,252|M||||]Rotom|rotomwash|leftovers||voltswitch,hydropump,willowisp,painsplit|Calm|252,,120,,136,||,0,,,,|||]Ferrothorn||leftovers||powerwhip,spikes,leechseed,protect|Sassy|252,,88,,168,|M|,,,,,19|||]Reuniclus||lifeorb|1|psychic,shadowball,focusblast,trickroom|Quiet|252,,4,252,,|M|,0,,,,0|||]Gengar||blacksludge|levitate|shadowball,focusblast,substitute,willowisp|Timid|4,,,252,,252|M|,0,,,,|||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|M||||]Garchomp||yacheberry|H|outrage,earthquake,fireblast,stealthrock|Naive|4,252,,,,252|F||||]Breloom||toxicorb|1|drainpunch,bulkup,protect,spore|Careful|236,,48,,224,|F||||]Latios||choicespecs||dracometeor,psyshock,surf,hiddenpowerfire|Timid|4,,,252,,252||,30,,30,,30|||]Jirachi||leftovers||psychic,hiddenpowerfire,grassknot,calmmind|Modest|148,,,232,,128||,30,,30,,30|||]Terrakion||lifeorb||closecombat,stoneedge,hiddenpowerice,quickattack|Hasty|4,252,,,,252||,30,30,,,|||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|M||||]Garchomp||yacheberry|H|outrage,earthquake,substitute,swordsdance|Adamant|16,252,,,,240|F||||]Dragonite||leftovers|H|fireblast,icebeam,thunderwave,roost|Calm|252,,40,80,136,|F|,0,,,,|||]Ferrothorn||leftovers||powerwhip,leechseed,stealthrock,spikes|Sassy|252,,84,,172,|F|,,,,,19|||]Starmie||leftovers|1|scald,psychic,rapidspin,recover|Timid|252,,32,,,224||,0,,,,|||]Reuniclus||leftovers|1|psyshock,focusblast,calmmind,recover|Bold|252,,236,,16,4|M|,0,,,,|||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|M||||]Garchomp||yacheberry|H|outrage,earthquake,swordsdance,stealthrock|Jolly|4,252,,,,252|M||||]Breloom||focussash|H|lowsweep,bulletseed,machpunch,spore|Adamant|4,252,,,,252|F||||]Latios||choicespecs||dracometeor,psyshock,surf,hiddenpowerfire|Timid|4,,,252,,252||,30,,30,,30|||]Scizor||flyinggem|1|acrobatics,bulletpunch,superpower,swordsdance|Adamant|44,252,,,,212|F||||]Keldeo||fightinggem||hydropump,secretsword,calmmind|Timid|,,4,252,,252|||||',

				'Slowking||leftovers|H|trickroom,scald,fireblast,psyshock|Modest|252,,,252,4,||,0,,,,0|||]Tyranitar||choicescarf||rockslide,crunch,lowkick,fireblast|Naive|76,182,,,,252|||||]Ferrothorn||leftovers||spikes,leechseed,powerwhip,gyroball|Relaxed|252,,48,,208,|||||]Garchomp||yacheberry|H|swordsdance,outrage,earthquake,fireblast|Naive|,252,,4,,252|||||]Landorus-Therian||leftovers||stealthrock,earthquake,uturn,hiddenpowerice|Naive|248,,172,,,88||,30,30,,,|||]Excadrill||leftovers|H|rapidspin,earthquake,swordsdance,rockslide|Adamant|176,60,,,252,20|||||',

				'Landorus-Therian||choicescarf||earthquake,stoneedge,uturn,hiddenpowerice|Naive|,252,,4,,252||,30,30,,,|||]Mew||leftovers||psychic,willowisp,softboiled,taunt|Bold|252,,148,,,108|||||]Gastrodon||leftovers|1|scald,icebeam,toxic,recover|Bold|248,,252,8,,|||||]Ferrothorn||leftovers||spikes,gyroball,leechseed,protect|Sassy|248,,112,,148,||,,,,,0|||]Latios||choicespecs||dracometeor,surf,psyshock,trick|Timid|,,,252,4,252|||||]Tyranitar||expertbelt||crunch,fireblast,superpower,stealthrock|Lonely|,144,,156,,208|||||',

				'Skarmory||rockyhelmet|1|spikes,bravebird,whirlwind,roost|Impish|248,,180,,60,20|||||]Gastrodon||leftovers|1|scald,earthquake,toxic,recover|Relaxed|252,,252,4,,|||||]Reuniclus||leftovers|1|psyshock,focusblast,recover,calmmind|Bold|248,,252,,,8|||||]Tyranitar||chopleberry||crunch,stealthrock,pursuit,stoneedge|Adamant|168,88,,,252,|||||]Latias||leftovers||thunderwave,dracometeor,surf,recover|Timid|92,,,164,,252|||||]Heatran||choicescarf||fireblast,toxic,hiddenpowerice,earthpower|Timid|136,,,176,,196||,30,30,,,|||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,244,,12,,252|F||||]Garchomp||rockyhelmet|H|dragontail,earthquake,fireblast,stealthrock|Naughty|168,140,,,,200|M||||]Skarmory||leftovers|1|bravebird,spikes,whirlwind,roost|Impish|252,,240,,16,|F||||]Gastrodon||leftovers|1|scald,icebeam,toxic,recover|Bold|252,,200,,56,|F|,0,,,,|||]Gengar||blacksludge|levitate|shadowball,focusblast,substitute,willowisp|Timid|188,,,68,,252|F|,0,,,,|||]Reuniclus||leftovers|1|psyshock,focusblast,calmmind,recover|Bold|252,,228,,24,4|F|,0,,,,|||',

				'Tyranitar||chopleberry||crunch,pursuit,superpower,stealthrock|Careful|252,44,,,184,28|F||||]Skarmory||leftovers|1|bravebird,spikes,whirlwind,roost|Impish|252,,240,,16,|F||||]Gastrodon||leftovers|1|scald,icebeam,toxic,recover|Bold|252,,200,,56,|F|,0,,,,|||]Heatran||choicescarf||fireblast,earthpower,hiddenpowerice,stoneedge|Timid|52,,,252,,204||,30,30,,,|||]Latias||leftovers||dracometeor,hiddenpowerfire,thunderwave,roost|Timid|252,,,60,,196||,30,,30,,30|||]Reuniclus||leftovers|1|psyshock,focusblast,calmmind,recover|Bold|252,,228,,24,4|F|,0,,,,|||',

				'Tyranitar||chopleberry||crunch,pursuit,superpower,stealthrock|Careful|252,44,,,184,28|F||||]Gliscor||toxicorb|H|earthquake,toxic,taunt,protect|Impish|252,,180,,,76|F||||]Skarmory||leftovers|1|taunt,spikes,roost,whirlwind|Impish|252,,216,,,40|F||||]Jellicent||leftovers||scald,willowisp,taunt,recover|Bold|252,,136,,,120|M|,0,,,,|||]Breloom||toxicorb|1|drainpunch,leechseed,protect,spore|Calm|252,,40,,216,|M||||]Alakazam||focussash|H|psyshock,focusblast,shadowball,psychup|Timid|4,,,252,,252|M||||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|F||||]Landorus|landorustherian|leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Relaxed|252,8,228,12,8,||,,,,,30|||]Heatran||leftovers||flamethrower,earthpower,willowisp,protect|Calm|252,,4,,252,|M|,0,,,,|||]Ferrothorn||leftovers||powerwhip,spikes,leechseed,protect|Sassy|252,,28,,228,|F|,,,,,19|||]Jellicent||leftovers||scald,willowisp,taunt,recover|Bold|252,,136,,,120|F|,0,,,,|||]Reuniclus||leftovers|1|psyshock,focusblast,calmmind,recover|Bold|252,,228,,24,4|M|,0,,,,|||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|F||||]Hippowdon||leftovers||earthquake,whirlwind,stealthrock,slackoff|Impish|252,,252,,4,|M||||]Heatran||leftovers||flamethrower,earthpower,willowisp,protect|Calm|252,,4,,252,|M|,0,,,,|||]Amoonguss||leftovers|H|gigadrain,hiddenpowerice,spore,sleeptalk|Calm|252,,40,,216,|F|,30,30,,,|||]Jellicent||leftovers||scald,taunt,willowisp,recover|Bold|252,,136,,,120|M|,0,,,,|||]Forretress||leftovers||gyroball,spikes,toxicspikes,rapidspin|Relaxed|252,,16,,236,|M|,,,,,0|||',

				'Tyranitar||choicescarf||crunch,pursuit,superpower,icebeam|Hasty|,248,,8,,252|F||||]Landorus|landorustherian|leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Relaxed|252,8,228,12,8,||,,,,,30|||]Politoed||leftovers|H|scald,icebeam,toxic,protect|Bold|252,,224,,32,|F|,0,,,,|||]Breloom||fightinggem|H|machpunch,focuspunch,bulletseed,spore|Adamant|4,252,,,,252|F||||]Jirachi||leftovers||psychic,hiddenpowerfire,grassknot,calmmind|Modest|128,,,248,,132||,30,,30,,30|||]Keldeo||choicescarf||hydropump,surf,secretsword,hiddenpowerice|Timid|4,,,252,,252||,30,30,,,|||',

				'Politoed||choicespecs|H|hydropump,icebeam,focusblast,hiddenpowergrass|Timid|8,,,252,4,244|M|,30,,30,,|||]Garchomp||yacheberry|H|outrage,earthquake,swordsdance,substitute|Adamant|16,252,,,,240|F||||]Rasputin|thundurustherian|expertbelt||thunder,hiddenpowerice,focusblast,agility|Modest|136,,,252,,120||,30,30,,,|||]Starmie||lifeorb|H|hydropump,thunder,icebeam,psyshock|Timid|4,,,252,,252|||||]Ferrothorn||leftovers||powerwhip,leechseed,stealthrock,spikes|Sassy|252,,48,,208,|M|,,,,,19|||]SongofWind|keldeo|choicescarf||hydropump,secretsword,icywind,hiddenpowerelectric|Timid|4,,,252,,252||,,,30,,|||',

				'Politoed||choicespecs|H|hydropump,icebeam,focusblast,hypnosis|Modest|80,,,252,,176|M|,0,,,,|||]Garchomp||yacheberry|H|outrage,earthquake,swordsdance,substitute|Adamant|16,252,,,,240|M||||]Latios||choicespecs||dracometeor,surf,psyshock,trick|Timid|4,,,252,,252||,0,,,,|||]Starmie||lifeorb|H|hydropump,icebeam,thunder,psyshock|Timid|4,,,252,,252||,0,,,,|||]Jirachi||leftovers||psychic,thunder,calmmind,substitute|Modest|252,,12,120,8,116||,0,,,,|||]Ferrothorn||leftovers||powerwhip,leechseed,stealthrock,spikes|Sassy|252,,76,,180,|M||||',

				'Politoed||leftovers|H|scald,toxic,protect,encore|Bold|252,,224,,32,|F|,0,,,,|||]Skarmory||leftovers|1|bravebird,spikes,roost,whirlwind|Impish|252,,248,,8,|F||||]Chansey||eviolite||seismictoss,toxic,softboiled,aromatherapy|Bold|56,,224,,228,||,0,,,,|||]Gliscor||toxicorb|H|earthquake,toxic,substitute,protect|Impish|252,,252,,4,|M||||]Ferrothorn||leftovers||powerwhip,leechseed,stealthrock,protect|Sassy|252,,72,,184,|F|,,,,,19|||]Tentacruel||leftovers|H|scald,toxicspikes,rapidspin,protect|Bold|252,,240,,16,|M|,0,,,,|||',

				'Starmie||lifeorb|H|hydropump,icebeam,psyshock,rapidspin|Timid|,,,252,4,252||,0,,,,|||]Politoed||choicescarf|H|hydropump,icebeam,scald,encore|Timid|,,,252,4,252||,0,,,,|||]Tornadus||choicespecs||hurricane,focusblast,uturn,raindance|Timid|,,,252,4,252|||||]Ferrothorn||leftovers||spikes,gyroball,protect,stealthrock|Sassy|248,,112,,148,||,,,,,0|||]Garchomp||yacheberry|H|dragonclaw,earthquake,swordsdance,aquatail|Jolly|,252,,,4,252|||||]Jirachi||leftovers||thunder,psychic,substitute,calmmind|Timid|252,,,92,,164||,0,,,,|||',

				'Politoed||choicescarf|H|hydropump,icebeam,hiddenpowerelectric,encore|Timid|,,4,252,,252||,,,30,,|||]Starmie||lifeorb|H|hydropump,icebeam,thunder,rapidspin|Timid|,,,252,4,252|||||]Moltres||choicespecs||hurricane,fireblast,uturn,hiddenpowergrass|Timid|,,4,252,,252||,30,,30,,|||]Garchomp||lumberry|H|outrage,earthquake,aquatail,swordsdance|Jolly|,252,,,4,252|||||]Ferrothorn||leftovers||gyroball,stealthrock,leechseed,protect|Sassy|248,,112,,148,||,,,,,0|||]Toxicroak||lifeorb|1|suckerpunch,drainpunch,icepunch,swordsdance|Adamant|,252,4,,,252|||||',

				'Politoed||choicespecs|H|hydropump,icebeam,focusblast,hypnosis|Modest|80,,,252,,176|M|,0,,,,|||]Jirachi||leftovers||ironhead,bodyslam,wish,protect|Careful|252,4,12,,224,16|||||]Kyurem|kyuremblack|leftovers||icebeam,earthpower,fusionbolt,substitute|Mild|52,,,216,,240|||||]Thundurus|thundurustherian|expertbelt||thunder,hiddenpowerice,focusblast,agility|Modest|136,,,252,,120||,30,30,,,|||]Donphan||leftovers||earthquake,iceshard,stealthrock,rapidspin|Impish|252,4,252,,,|M||||]Keldeo||choicescarf||hydropump,surf,secretsword,hiddenpowerice|Timid|4,,,252,,252||,30,30,,,|||',

				'Politoed||choicescarf|H|hydropump,scald,icebeam,encore|Timid|12,,,252,,244|F|,0,,,,|||]Landorus|landorustherian|leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Relaxed|252,8,232,8,8,||,,,,,30|||]Jirachi||leftovers||ironhead,bodyslam,wish,protect|Careful|252,8,12,,220,16|||||]Celebi||leftovers||gigadrain,earthpower,hiddenpowerice,nastyplot|Modest|128,,,244,,136||,30,30,,,|||]Kyurem||leftovers||icebeam,earthpower,substitute,roost|Mild|76,,,252,4,176||,0,,,,|||]Tentacruel||leftovers|H|scald,toxicspikes,rapidspin,protect|Bold|252,,240,,16,|F|,0,,,,|||',

				'Politoed||choicespecs|H|hydropump,icebeam,focusblast,hiddenpowergrass|Modest|80,,,252,,176|M|,30,,30,,|||]Garchomp||yacheberry|H|outrage,earthquake,swordsdance,stealthrock|Jolly|4,252,,,,252|M||||]Jirachi||leftovers||ironhead,bodyslam,wish,protect|Careful|252,20,16,,204,16|||||]Celebi||leftovers||psychic,calmmind,recover,batonpass|Bold|252,,136,,88,32||,0,,,,|||]Thundurus|thundurustherian|leftovers||thunder,hiddenpowerice,focusblast,agility|Modest|156,,,252,,100||,30,30,,,|||]Keldeo||choicescarf||hydropump,surf,secretsword,hiddenpowerice|Timid|4,,,252,,252||,30,30,,,|||',

				'Politoed||choicescarf|H|hydropump,scald,icebeam,encore|Timid|12,,,252,,244|M|,0,,,,|||]Garchomp||yacheberry|H|outrage,earthquake,swordsdance,substitute|Adamant|16,252,,,,240|F||||]Gyarados||leftovers||waterfall,bounce,substitute,dragondance|Adamant|40,252,,,,216|M||||]Latios||choicespecs||dracometeor,psyshock,surf,trick|Modest|56,,8,252,,192||,0,,,,|||]Starmie||lifeorb|H|hydropump,thunder,icebeam,psyshock|Timid|4,,,252,,252||,0,,,,|||]Ferrothorn||leftovers||powerwhip,leechseed,stealthrock,spikes|Sassy|252,,68,,188,|F|,,,,,19|||',

				'Sharpedo||lifeorb|H|waterfall,crunch,zenheadbutt,protect|Adamant|,252,,,4,252|||||]Politoed||choicespecs|H|hydropump,icebeam,focusblast,surf|Modest|120,,,252,,136|||||]Celebi||leftovers||swordsdance,batonpass,seedbomb,recover|Careful|248,,,,196,64|||||]Garchomp||lumberry|H|outrage,earthquake,swordsdance,aquatail|Jolly|,252,4,,,252|||||]Ferrothorn||leftovers||stealthrock,gyroball,leechseed,protect|Sassy|248,,56,,204,||,,,,,0|||]Terrakion||choicescarf||closecombat,stoneedge,rockslide,xscissor|Jolly|,252,,,4,252|||||',

				'Politoed||leftovers|H|scald,toxic,protect,encore|Bold|252,,220,,36,|F|,0,,,,|||]Gliscor||toxicorb|H|earthquake,toxic,substitute,protect|Impish|252,,200,,,56|M||||]Bronzong||leftovers||hiddenpowerice,earthquake,stealthrock,protect|Relaxed|252,,168,,88,||,,,,,30|||]Ferrothorn||leftovers||powerwhip,leechseed,spikes,protect|Sassy|252,,72,,184,|F|,,,,,19|||]Tentacruel||leftovers|H|scald,toxicspikes,rapidspin,protect|Bold|252,,240,,16,|M|,0,,,,|||]Tornadus||choicespecs||hurricane,focusblast,uturn,sleeptalk|Timid|,,4,252,,252|||||',

				'Breloom||toxicorb|1|drainpunch,bulkup,protect,spore|Calm|252,,40,,216,|F||||]Alakazam||focussash|H|psychic,focusblast,shadowball,hiddenpowerice|Timid|4,,,252,,252|M|,30,30,,,|||]Garchomp||yacheberry|H|outrage,earthquake,stealthrock,swordsdance|Jolly|4,252,,,,252|M||||]Froslass||focussash|H|icebeam,spikes,taunt,destinybond|Timid|4,,,252,,252||,0,,,,|||]Scizor||choiceband|1|bulletpunch,uturn,superpower,pursuit|Adamant|152,252,,,8,96|F||||]Keldeo||fightinggem||hydropump,secretsword,hiddenpowerice,calmmind|Timid|4,,,252,,252||,30,30,,,|||',

				'Garchomp||yacheberry|H|outrage,earthquake,swordsdance,stealthrock|Jolly|4,252,,,,252|F||||]Kyurem|kyuremblack|lifeorb||icebeam,earthpower,fusionbolt,roost|Mild|,,,252,4,252|||||]Dragonite||lumberry|H|outrage,firepunch,extremespeed,dragondance|Adamant|32,252,,,,224|M||||]Starmie||lifeorb|H|hydropump,icebeam,thunder,rapidspin|Timid|4,,,252,,252|||||]Jirachi||choicescarf||ironhead,uturn,icepunch,healingwish|Jolly|136,192,,,32,148|||||]Magnezone||brightpowder||thunderbolt,flashcannon,hiddenpowerfire,substitute|Modest|16,,,252,,240||,30,,30,,30|||',

				'Garchomp||yacheberry|H|outrage,earthquake,swordsdance,stealthrock|Jolly|4,252,,,,252|M||||]Dragonite||lumberry|H|outrage,firepunch,extremespeed,dragondance|Adamant|32,252,,,,224|F||||]Starmie||expertbelt|H|hydropump,thunder,icebeam,rapidspin|Timid|4,,,252,,252|||||]Scizor||lifeorb|1|bugbite,bulletpunch,superpower,swordsdance|Adamant|248,252,4,,4,|F||||]Breloom||focussash|H|lowsweep,bulletseed,machpunch,spore|Adamant|4,252,,,,252|M||||]Volcarona||passhoberry||flamethrower,gigadrain,hiddenpowerice,quiverdance|Modest|136,,,252,,120|F|,30,30,,,|||',

				'Mamoswine||focussash|H|earthquake,iceshard,endeavor,stealthrock|Adamant|4,252,,,,252|M||||]Latios||choicespecs||dracometeor,psychic,surf,hiddenpowerfire|Modest|56,,,252,4,196||,30,,30,,30|||]Scizor||choiceband|1|uturn,bulletpunch,superpower,quickattack|Adamant|240,252,,,,16|F||||]Kyurem|kyuremblack|choiceband||outrage,dragonclaw,fusionbolt,icebeam|Adamant|4,252,,,,252|||||]Salamence||choicescarf|H|outrage,dragonclaw,earthquake,fireblast|Jolly|,252,4,,,252|M||||]Magnezone||choicespecs||thunderbolt,hiddenpowerfire,flashcannon,voltswitch|Modest|4,,,252,,252||,30,,30,,30|||',

				'Azelf||focussash||fireblast,hiddenpowerice,stealthrock,explosion|Naive|,64,,192,,252||,30,30,,,|||]Garchomp||dragongem|H|outrage,earthquake,swordsdance,substitute|Adamant|16,252,,,,240|M||||]Breloom||fightinggem|H|focuspunch,bulletseed,machpunch,spore|Adamant|4,252,,,,252|F||||]Scizor||flyinggem|1|acrobatics,bulletpunch,superpower,swordsdance|Adamant|60,240,,,,208|F||||]Dragonite||lumberry|H|outrage,firepunch,extremespeed,dragondance|Adamant|32,252,,,,224|M||||]Salamence||choicescarf|H|outrage,dragonclaw,earthquake,fireblast|Jolly|,252,4,,,252|M||||',

				'Skarmory||custapberry|1|stealthrock,spikes,bravebird,taunt|Jolly|4,252,,,,252|F||||]Rotom|rotomwash|leftovers||voltswitch,hydropump,willowisp,painsplit|Calm|252,,120,,136,||,0,,,,|||]Scizor||flyinggem|1|acrobatics,superpower,bulletpunch,swordsdance|Adamant|56,236,,,8,208|M||||]Dragonite||choiceband|H|outrage,extremespeed,firepunch,earthquake|Adamant|,252,,,4,252|M||||]Gengar||leftovers|levitate|shadowball,focusblast,willowisp,substitute|Timid|4,,,252,,252|M|,0,,,,|||]Alakazam||focussash|H|psychic,signalbeam,focusblast,hiddenpowerice|Timid|4,,,252,,252|M|,30,30,,,|||',

				'Skarmory||custapberry|1|bravebird,stealthrock,spikes,taunt|Jolly|4,252,,,,252|M||||]Garchomp||yacheberry|H|outrage,earthquake,substitute,swordsdance|Adamant|16,252,,,,240|M||||]Scizor||lifeorb|1|bulletpunch,bugbite,superpower,swordsdance|Adamant|32,252,8,,,216|F||||]Jellicent||leftovers||scald,willowisp,taunt,recover|Impish|252,,136,,,120|M|,0,,,,|||]Alakazam||focussash|H|psychic,shadowball,focusblast,hiddenpowerice|Timid|4,,,252,,252|M|,30,30,,,|||]Salamence||choicescarf|H|outrage,dragonclaw,earthquake,fireblast|Jolly|,252,4,,,252|M||||',

				'Volcarona||passhoberry||fireblast,gigadrain,hiddenpowerice,quiverdance|Timid|,,,252,4,252||,30,30,,,|||]Keldeo|keldeoresolute|ghostgem||hydropump,secretsword,hiddenpowerghost,calmmind|Timid|,,,252,4,252||,,30,,30,|||]Starmie||lifeorb|H|hydropump,psyshock,icebeam,rapidspin|Timid|,,,252,4,252|||||]Garchomp||rockyhelmet|H|dragonclaw,earthquake,swordsdance,stealthrock|Jolly|,252,,,4,252|||||]Jirachi||choicescarf||ironhead,icepunch,healingwish,uturn|Jolly|104,252,,,4,148|||||]Dragonite||choiceband|H|outrage,firepunch,earthquake,extremespeed|Adamant|40,252,,,,216|||||',

				'Excadrill||airballoon|H|earthquake,rapidspin,rockslide,ironhead|Jolly|4,252,,,,252|||||]Keldeo||choicescarf||hydropump,secretsword,hiddenpowerghost,surf|Timid|,,,252,4,252||,,30,,30,|||]Alakazam||focussash|H|psychic,focusblast,shadowball,encore|Timid|,,,252,4,252|||||]Garchomp||focussash|H|stealthrock,outrage,earthquake,fireblast|Naive|,252,,4,,252|||||]Skarmory||leftovers|1|spikes,roost,whirlwind,bravebird|Careful|224,,32,,252,|||||]Celebi||leftovers||batonpass,nastyplot,gigadrain,recover|Calm|252,,,,192,64|||||',

				'Scizor||leftovers|1|bulletpunch,uturn,roost,swordsdance|Adamant|248,16,12,,216,16|||||]Magnezone||choicespecs||thunderbolt,flashcannon,hiddenpowerfire,voltswitch|Modest|36,,,252,,220||,30,,30,,30|||]Landorus-T|landorustherian|choicescarf||earthquake,stoneedge,hiddenpowerice,uturn|Naive|,252,,4,,252||,30,30,,,|||]Starmie||lifeorb|H|hydropump,icebeam,psyshock,rapidspin|Timid|,,,252,4,252|||||]Dragonite||choiceband|H|outrage,earthquake,firepunch,extremespeed|Adamant|40,252,,,,216|||||]Garchomp||lumberry|H|outrage,earthquake,swordsdance,stealthrock|Jolly|,252,,,4,252|||||',

				'Abomasnow||expertbelt||blizzard,woodhammer,hiddenpowerfire,iceshard|Lonely|,204,,164,,140|M|,30,,30,,30|||]Landorus|landorustherian|leftovers||earthquake,hiddenpowerice,uturn,stealthrock|Relaxed|252,16,228,8,4,||,,,,,30|||]Latios||choicespecs||dracometeor,psyshock,surf,sleeptalk|Timid|4,,,252,,252||,0,,,,|||]Starmie||lifeorb|H|hydropump,blizzard,thunderbolt,rapidspin|Timid|4,,,252,,252|||||]Jirachi||choicescarf||ironhead,uturn,icepunch,healingwish|Jolly|104,176,,,76,152|||||]Volcarona||leftovers||fireblast,bugbuzz,hiddenpowerground,quiverdance|Modest|136,,,252,,120|M|,,,30,30,|||',

				'Abomasnow||expertbelt||woodhammer,iceshard,hiddenpowerfire,protect|Lonely|,244,,156,,108|F|,30,,30,,30|||]Jellicent||leftovers||surf,willowisp,taunt,recover|Bold|252,,136,,4,116|F|,0,,,,|||]Heatran||leftovers||flamethrower,earthpower,willowisp,stealthrock|Calm|252,,4,,252,|F|,0,,,,|||]Forretress||leftovers||gyroball,spikes,toxicspikes,rapidspin|Relaxed|252,,24,,232,|M|,,,,,0|||]Gliscor||toxicorb|H|earthquake,toxic,taunt,protect|Impish|252,,196,,,60|M||||]Kyurem||leftovers||icebeam,earthpower,substitute,roost|Modest|80,,,252,,176||,0,,,,|||',


			],


			gen5ubers: [
				'Groudon||earthplate||stealthrock,earthquake,stoneedge,dragontail|Adamant|,252,4,,,252|||||]Cloyster||focussash|1|shellsmash,iciclespear,rapidspin,spikes|Jolly|,252,4,,,252|||||]Ho-Oh||choiceband|H|sacredfire,bravebird,earthquake,sleeptalk|Adamant|144,252,,,,112|||||]Arceus||silkscarf||swordsdance,extremespeed,shadowclaw,earthquake|Adamant|200,252,,,,56|||||]Genesect||choicescarf||uturn,icebeam,flamethrower,ironhead|Naive|,248,,8,,252|||||]Latias||souldew||dracometeor,psyshock,hiddenpowerfire,healingwish|Timid|164,,,148,,196||,0,,30,,30|||',

				'Tyranitar||focussash||stealthrock,crunch,lowkick,fireblast|Hasty|,252,,4,,252|||||]Kyogre||leftovers||rest,sleeptalk,roar,scald|Calm|248,,8,,252,||,0,,,,|||]Ferrothorn||leftovers||leechseed,spikes,knockoff,powerwhip|Careful|252,4,,,252,|||||]Arceus-Fighting||fistplate||judgment,toxic,recover,stoneedge|Timid|248,,8,,,252|||||]Giratina-Origin||griseousorb||substitute,dragontail,earthquake,shadowsneak|Adamant|,156,248,,,104|||||]Genesect||choicescarf||uturn,thunder,bugbuzz,icebeam|Naive|,8,,248,,252|||||',

				'Deoxys-Speed||focussash||stealthrock,spikes,taunt,darkpulse|Timid|248,,8,,,252|||||]Arceus-Ghost||spookyplate||judgment,focusblast,calmmind,recover|Timid|248,,,8,,252|||||]Kyogre||choicespecs||waterspout,hydropump,thunder,icebeam|Modest|,,4,252,,252|||||]Kingdra||lifeorb||hydropump,dragonpulse,dracometeor,substitute|Modest|32,,8,252,,216|M||||]Genesect||choicescarf||uturn,ironhead,icebeam,explosion|Naive|,252,,4,,252|||||]Rayquaza||lifeorb||dragonclaw,vcreate,extremespeed,swordsdance|Adamant|32,252,8,,,216|||||',

				'Tyranitar||chopleberry||stealthrock,payback,superpower,fireblast|Brave|252,64,56,,136,|||||]Rayquaza||lifeorb||dracometeor,outrage,fireblast,extremespeed|Hasty|,4,,252,,252|||||]Arceus-Fighting||fistplate||judgment,toxic,stoneedge,recover|Timid|248,,,148,,112|||||]Genesect||choicescarf||uturn,ironhead,icebeam,explosion|Naive|,248,,8,,252|||||]Excadrill||airballoon||swordsdance,rapidspin,ironhead,earthquake|Adamant|4,252,,,,252|||||]Latias||souldew||dracometeor,psyshock,calmmind,recover|Timid|112,,,204,,192|||||',

				'Arceus-Fighting||fistplate||judgment,stealthrock,recover,icebeam|Bold|248,,48,,,212|||||]Omastar||choicespecs||hydropump,surf,icebeam,earthpower|Modest|,,4,252,,252|||||]Ferrothorn||leftovers||leechseed,protect,spikes,gyroball|Careful|248,,8,,252,||,,,,,0|||]Giratina-Origin||griseousorb||dragontail,earthquake,shadowsneak,outrage|Adamant|152,252,,,,104|||||]Mewtwo||leftovers|H|psystrike,willowisp,recover,taunt|Timid|248,,84,,,176||,0,,,,|||]Kyogre||leftovers||scald,rest,sleeptalk,roar|Calm|240,,,,252,16|||||',

				'Kyogre||choicespecs||surf,waterspout,icebeam,thunder|Timid|,,,252,4,252|||||]Latias||souldew||dracometeor,thunder,psyshock,roost|Timid|48,,,252,24,184|||||]Arceus-Fighting||fistplate||judgment,icebeam,thunderwave,recover|Timid|252,,,144,12,100|||||]Tyranitar||chopleberry||payback,lowkick,pursuit,stealthrock|Adamant|252,64,,,184,8|||||]Dialga||choicescarf||dracometeor,fireblast,dragonpulse,sleeptalk|Modest|,,4,252,,252|||||]Kabutops||lifeorb||waterfall,lowkick,stoneedge,rapidspin|Adamant|,252,4,,,252|||||',

				'Dialga||lumberry||stealthrock,dracometeor,fireblast,roar|Modest|240,,,12,236,20|||S||]Giratina-Origin||griseousorb||dragontail,willowisp,magiccoat,shadowsneak|Adamant|,212,252,,,44|||S||]Kyogre||leftovers||scald,roar,rest,sleeptalk|Bold|248,,236,,,24|||||]Palkia||lustrousorb||hydropump,spacialrend,fireblast,thunder|Timid|,,,252,,252|||S||]Kabutops||lifeorb||waterfall,stoneedge,lowkick,rapidspin|Adamant|,252,4,,,252|M||S||]Darkrai||lifeorb||darkvoid,focusblast,darkpulse,suckerpunch|Naive|,12,,244,,252|||||',

				'Kyogre||leftovers||rest,sleeptalk,scald,roar|Calm|248,,,,252,8||,0,,,,|||]Latias||souldew||dracometeor,thunder,calmmind,roost|Timid|112,,,144,,252||,0,,,,|||]Ferrothorn||leftovers||leechseed,spikes,powerwhip,knockoff|Careful|248,,8,,252,|||||]Excadrill||leftovers|H|stealthrock,earthquake,rapidspin,toxic|Adamant|252,,80,,136,40|||||]Arceus-Ghost||spookyplate||judgment,surf,willowisp,recover|Timid|248,,8,,,252||,0,,,,|||]Genesect||choicescarf||uturn,icebeam,bugbuzz,thunder|Naive|,8,,248,,252|||||',

				'Kyogre||choicespecs||waterspout,hydropump,thunder,icebeam|Modest|168,,,252,,88||,0,,,,|||]Landorus-Therian||earthplate||stealthrock,earthquake,toxic,uturn|Jolly|,252,4,,,252|||||]Arceus-Grass||meadowplate||willowisp,judgment,recover,magiccoat|Timid|248,,84,,,176||,0,,,,|||]Terrakion||choicescarf||closecombat,stoneedge,doublekick,sleeptalk|Jolly|,252,4,,,252|||||]Heatran||leftovers||lavaplume,taunt,toxic,protect|Calm|248,,36,,224,||,0,,,,|||]Jirachi||leftovers||ironhead,wish,protect,thunder|Sassy|248,,,,252,8|||||',

				'Tyranitar||chopleberry||crunch,thunderwave,stealthrock,fireblast|Sassy|248,16,80,,160,4|||||]Latios||souldew||dracometeor,calmmind,recover,psyshock|Timid|,,12,228,16,252||,0,,,,|||]Skarmory||leftovers|1|spikes,roost,toxic,taunt|Calm|248,,,,244,16||,0,,,,|||]Excadrill||airballoon||swordsdance,earthquake,shadowclaw,rapidspin|Adamant|,248,,,68,192|||||]Terrakion||choicescarf||closecombat,sleeptalk,doublekick,stoneedge|Jolly|,224,32,,,252|||||]Arceus-Water||splashplate||judgment,willowisp,recover,roar|Timid|248,,8,,,252||,0,,,,|||',

				'Tyranitar||chopleberry||crunch,thunderwave,stealthrock,fireblast|Sassy|248,16,80,,160,4|||||]Giratina-Origin||griseousorb||magiccoat,willowisp,dragontail,shadowsneak|Adamant|,168,248,,,92|||S||]Excadrill||choicescarf|H|earthquake,sleeptalk|Adamant|,236,,,68,204|||||]Latios||souldew||dracometeor,hiddenpowerfire,grassknot,psyshock|Timid|,,,240,16,252||,2,,30,,30|||]Ferrothorn||leftovers||leechseed,gyroball,knockoff,spikes|Careful|248,,8,,252,||,,,,,0|S||]Arceus-Fighting||fistplate||judgment,toxic,stoneedge,recover|Timid|248,,,8,,252||,0,,,,|||',

				'Lugia||leftovers|H|substitute,toxic,roost,dragontail|Bold|248,,56,,,204|||||]Giratina||leftovers||willowisp,rest,sleeptalk,roar|Calm|248,,,,212,48||,0,,,,|||]Kyogre||leftovers||scald,roar,rest,sleeptalk|Calm|248,,,,200,60||,0,,,,|||]Arceus-Grass||meadowplate||judgment,willowisp,stealthrock,recover|Timid|248,,8,,,252||,0,,,,|||]Forretress||leftovers||spikes,painsplit,toxic,rapidspin|Careful|248,,8,,252,||,0,,,,|||]Jirachi||leftovers||thunder,ironhead,protect,wish|Sassy|248,,,,252,8|||||',

				'Groudon||leftovers||stealthrock,earthquake,thunderwave,stoneedge|Careful|208,,,,252,48|||||]Giratina-Origin||griseousorb||magiccoat,willowisp,dragontail,shadowsneak|Adamant|,176,248,,,84|||||]Latios||souldew||dracometeor,calmmind,psyshock,roost|Timid|,,4,252,,252||,0,,,,|||]Zekrom||choicescarf||boltstrike,outrage,sleeptalk,voltswitch|Hasty|,252,,4,,252|||||]Arceus-Water||splashplate||recover,icebeam,willowisp,toxic|Timid|248,,8,,,252||,0,,,,|||]Probopass||leftovers|1|taunt,painsplit,toxic,earthpower|Calm|248,,,,248,12||,0,,,,|||',

				'Kyogre||leftovers||scald,rest,sleeptalk,roar|Calm|248,,40,,200,20||,0,,,,|||]Rayquaza||lifeorb||extremespeed,dracometeor,vcreate,dragontail|Naughty|,84,,172,,252|||||]Genesect||choicescarf||uturn,ironhead,icebeam,explosion|Hasty|,232,,8,16,252|||S||]Latios||souldew||dragonpulse,calmmind,psyshock,roost|Timid|,,12,228,16,252||,0,,,,|||]Arceus-Ghost||spookyplate||judgment,stealthrock,willowisp,recover|Timid|248,,8,,,252||,0,,,,|||]Forretress||custapberry||spikes,endure,gyroball,rapidspin|Brave|248,240,20,,,||,,,,,0|||',

				'Tyranitar||leftovers||stealthrock,thunderwave,payback,fireblast|Sassy|248,,84,,176,|||||]Aerodactyl||leftovers|1|toxic,taunt,roost,substitute|Timid|248,,,,28,232||,0,,,,|||]Ferrothorn||leftovers||leechseed,spikes,protect,powerwhip|Relaxed|248,,252,,8,|||S||]Palkia||choicescarf||dracometeor,spacialrend,hydropump,fireblast|Timid|,,4,252,,252||,0,,,,|||]Kyogre||leftovers||scald,roar,rest,sleeptalk|Calm|248,,,,200,60||,0,,,,|||]Arceus-Ghost||spookyplate||judgment,recover,willowisp,magiccoat|Timid|248,,8,,,252||,0,,,,|||',

				'Kyogre||leftovers||scald,roar,rest,sleeptalk|Calm|248,,,,200,60||,0,,,,|||]Latios||souldew||dracometeor,magiccoat,surf,thunder|Timid|,,,240,16,252||,0,,,,|||]Arceus-Ghost||spookyplate||stealthrock,judgment,willowisp,recover|Timid|248,,8,,,252||,0,,,,|||]Excadrill||choicescarf|H|earthquake,rapidspin,bulldoze,rockslide|Adamant|,240,,,64,204|||||]Ferrothorn||leftovers||leechseed,powerwhip,protect,spikes|Impish|248,,252,,8,|||S||]Kingdra||lifeorb||yawn,dracometeor,hydropump,scald|Modest|,,4,252,,252||,0,,,,|||',

				'Tyranitar||chopleberry||crunch,pursuit,stealthrock,fireblast|Sassy|248,16,80,,160,4|||||]Kyogre||leftovers||scald,rest,sleeptalk,thunderwave|Calm|248,,16,,200,44||,0,,,,|||]Giratina-Origin||griseousorb||willowisp,magiccoat,dragontail,shadowsneak|Adamant|,216,248,,,44|||||]Arceus-Ground||earthplate||swordsdance,earthquake,stoneedge,recover|Jolly|,252,,,4,252|||||]Palkia||choicescarf||dracometeor,hydropump,thunder,spacialrend|Timid|,,,252,4,252||,0,,,,|||]Forretress||leftovers||toxic,spikes,painsplit,rapidspin|Sassy|248,,8,,252,|F|,0,,,,|||',

				'Kyogre||leftovers||scald,rest,sleeptalk,roar|Calm|248,,16,,200,44||,0,,,,|||]Genesect||choicescarf||ironhead,uturn,extremespeed,icebeam|Hasty|,232,,8,16,252|||S||]Latias||souldew||calmmind,dragonpulse,reflecttype,recover|Timid|248,,80,,,180||,0,,,,|||]Omastar||choicespecs||hydropump,earthpower,icebeam,knockoff|Modest|,,4,252,,252|||||]Arceus-Ghost||spookyplate||judgment,willowisp,stealthrock,recover|Timid|248,,8,,,252||,0,,,,|||]Forretress||custapberry||spikes,toxicspikes,gyroball,rapidspin|Brave|,252,,,,||0,,0,,0,0|||',

				'Giratina-Origin||griseousorb||dragontail,shadowsneak,magiccoat,earthquake|Adamant|,204,252,,,52|||S||]Arceus-Steel||ironplate||calmmind,judgment,recover,roar|Timid|248,,,,8,252||,0,,,,|||]Landorus-Therian||earthplate||stealthrock,earthquake,uturn,knockoff|Jolly|,144,112,,,252|||||]Kyogre||leftovers||scald,roar,rest,sleeptalk|Calm|248,,,,200,60||,0,,,,|||]Palkia||choicescarf||dracometeor,hydropump,spacialrend,thunder|Timid|,,,252,4,252||,0,,,,|||]Ariados||focussash|1|toxicspikes,xscissor,twineedle,shadowsneak|Adamant|,176,,,224,108|||||',

				'Latios||souldew||grassknot,dragonpulse,hiddenpowerfire,psyshock|Timid|,,,252,4,252||,30,,30,,30|||]Mewtwo||lifeorb||psystrike,fireblast,aurasphere,calmmind|Timid|,,,252,4,252|||||]Genesect||choicescarf||uturn,ironhead,flamethrower,explosion|Hasty|,236,,4,16,252|||S||]Arceus||lumberry||swordsdance,extremespeed,shadowclaw,earthquake|Jolly|,252,4,,,252|||||]Groudon||lifeorb||stealthrock,firepunch,earthquake,dragontail|Jolly|,252,4,,,252|||||]Accelgor||focussash|H|bugbuzz,yawn,spikes,uturn|Naive|,4,,252,,252||0,,0,,3,|||',

				'Hippowdon||leftovers||stealthrock,earthquake,slackoff,whirlwind|Impish|252,,252,,,4|||||]Excadrill||airballoon||swordsdance,earthquake,shadowclaw,rapidspin|Adamant|,248,,,68,192|||||]Ho-Oh||leftovers|H|bravebird,sacredfire,roost,sleeptalk|Adamant|248,156,,,84,20|||||]Latios||souldew||dracometeor,psyshock,roost,calmmind|Timid|,,12,228,16,252||,0,,,,|||]Genesect||choicescarf||uturn,ironhead,extremespeed,icebeam|Hasty|,232,,8,16,252|||S||]Arceus-Water||splashplate||fireblast,magiccoat,toxic,recover|Timid|248,,8,,,252||,0,,,,|||',

				'Kyogre||leftovers||scald,rest,sleeptalk,roar|Calm|248,,,,212,48||,0,,,,|||]Landorus-Therian||earthplate||earthquake,stealthrock,toxic,uturn|Jolly|,252,4,,,252|||||]Latios||souldew||calmmind,dracometeor,surf,roost|Timid|,,4,252,,252||,0,,,,|||]Arceus-Ghost||spookyplate||calmmind,judgment,focusblast,recover|Timid|252,,,4,,252||,0,,,,|||]Forretress||custapberry||toxicspikes,gyroball,spikes,rapidspin|Brave|252,252,,,,4|F|,,,,,0|S||]Genesect||choicescarf||uturn,bugbuzz,thunder,icebeam|Hasty|,4,,252,,252|||S||',

				'Kyogre||choicescarf||waterspout,hydropump,thunder,icebeam|Modest|,,4,252,,252||,0,,,,|||]Palkia||choicespecs||hydropump,thunder,dracometeor,spacialrend|Timid|,,,252,4,252||,0,,,,|||]Giratina-Origin||griseousorb||substitute,willowisp,dragontail,shadowsneak|Adamant|,168,248,,,92|||||]Dialga||lifeorb||stealthrock,dracometeor,thunder,aurasphere|Timid|,,,252,4,252||,0,,,,|||]Arceus-Steel||ironplate||judgment,calmmind,roar,recover|Timid|248,,,,8,252||,0,,,,|||]Accelgor||focussash|H|uturn,bugbuzz,spikes,yawn|Naive|,4,,252,,252||0,,0,,3,|||',

				'Tyranitar||chopleberry||stealthrock,payback,pursuit,fireblast|Sassy|252,84,48,,124,|||||]Giratina||leftovers||dragontail,roar,rest,sleeptalk|Careful|224,,,,252,32|||||]Arceus-Fighting||fistplate||judgment,icebeam,toxic,recover|Timid|248,,,,84,176||,0,,,,|||]Excadrill||airballoon||swordsdance,shadowclaw,rockslide,earthquake|Adamant|,248,,,68,192|||||]Ferrothorn||leftovers||spikes,leechseed,protect,powerwhip|Careful|248,,8,,252,|M||S||]Gliscor||toxicorb|H|substitute,taunt,toxic,earthquake|Jolly|248,,28,,,232|||||',

				'Deoxys-Speed||rockyhelmet||icywind,psychoboost,stealthrock,spikes|Timid|56,,60,252,120,20||,0,,,,|||]Giratina-Origin||griseousorb||dragontail,earthquake,magiccoat,shadowsneak|Adamant|,176,248,,,84|||S||]Darkrai||lifeorb||darkvoid,thunder,darkpulse,focusblast|Timid|,,4,252,,252||,0,,,,|||]Latios||souldew||dracometeor,surf,hiddenpowerfire,psyshock|Timid|,,12,228,16,252||,2,,30,,30|||]Genesect||choicescarf||uturn,icebeam,explosion,ironhead|Hasty|,232,,8,16,252|||S||]Arceus||silkscarf||extremespeed,shadowclaw,earthquake,swordsdance|Adamant|176,252,,,,80|||||',

				'Kyogre||choicespecs||waterspout,hydropump,thunder,icebeam|Timid|,,4,252,,252||,0,,,,|||]Dialga||leftovers||dracometeor,fireblast,thunder,stealthrock|Calm|248,,,60,160,40||,0,,,,|||]Zekrom||choicescarf||outrage,sleeptalk,voltswitch,boltstrike|Hasty|,252,,,4,252|||||]Giratina-Origin||griseousorb||willowisp,dragontail,shadowsneak,aquatail|Adamant|140,224,84,,,60|||||]Froslass||focussash|H|spikes,shadowball,icywind,taunt|Timid|,,4,252,,252||,0,,,,|||]Arceus-Steel||ironplate||thunder,calmmind,judgment,recover|Timid|248,,,,8,252||,0,,,,|||',

				'Kyogre||icegem||hydropump,icebeam,thunder,calmmind|Modest|40,,80,252,,136||,0,,,,|||]Groudon||lumberry||earthquake,thunderwave,swordsdance,stoneedge|Adamant|40,176,,,252,40|||||]Latios||souldew||dracometeor,calmmind,psyshock,roost|Timid|,,12,228,16,252||,0,,,,|||]Genesect||choicescarf||uturn,ironhead,icebeam,flamethrower|Hasty|,232,,8,16,252|||S||]Arceus-Ghost||spookyplate||judgment,calmmind,substitute,focusblast|Timid|8,,,248,,252||,0,,,,|||]Excadrill||focussash|H|stealthrock,earthquake,rapidspin,bulldoze|Jolly|,88,200,,,220|||||',

				'Kyogre||leftovers||scald,roar,rest,sleeptalk|Calm|248,,,,200,60||,0,,,,|||]Terrakion||choicescarf||closecombat,stoneedge,sleeptalk,quickattack|Jolly|,252,4,,,252|||||]Latias||souldew||reflecttype,roost,dragonpulse,calmmind|Timid|24,,,252,52,180||,0,,,,|||]Ferrothorn||leftovers||spikes,leechseed,protect,gyroball|Relaxed|252,,252,,4,||,,,,,0|||]Arceus-Ghost||spookyplate||judgment,willowisp,stealthrock,recover|Timid|248,,8,,,252||,0,,,,|||]Tentacruel||blacksludge|H|scald,protect,toxicspikes,rapidspin|Bold|252,,184,,72,||,0,,,,|||',

				'Kyogre||choicespecs||hydropump,thunder,waterspout,icebeam|Timid|,,4,252,,252||,0,,,,|||]Arceus-Ghost||spookyplate||judgment,focusblast,calmmind,substitute|Timid|,,4,252,,252||,0,,,,|||]Rayquaza||lifeorb||swordsdance,vcreate,extremespeed,dragonclaw|Jolly|,252,,4,,252|||||]Dialga||choicescarf||dracometeor,aurasphere,thunder,sleeptalk|Timid|,,4,252,,252||,0,,,,|||]Deoxys-Speed||focussash||icywind,stealthrock,spikes,taunt|Timid|232,,,24,,252||,0,,,,|||]Wobbuffet||custapberry||counter,encore,mirrorcoat,destinybond|Calm|104,,252,,152,||,0,,,,|||',

				'Kyogre||leftovers||scald,roar,rest,sleeptalk|Calm|248,,,,200,60||,0,,,,|||]Excadrill||leftovers|H|stealthrock,earthquake,toxic,rapidspin|Careful|192,,,,252,64|||||]Lugia||leftovers|H|dragontail,toxic,roost,substitute|Bold|248,,56,,,204||,0,,,,|||]Palkia||choicescarf||hydropump,thunder,spacialrend,fireblast|Timid|,,,252,4,252||,0,,,,|||]Ferrothorn||leftovers||gyroball,leechseed,spikes,protect|Relaxed|252,,252,,4,||,,,,,0|||]Arceus-Ghost||spookyplate||judgment,perishsong,recover,willowisp|Timid|248,,8,,,252||,0,,,,|||',

				'Kyogre||choicespecs||waterspout,hydropump,icebeam,thunder|Timid|,,4,252,,252|||||]Giratina-Origin||griseousorb||aquatail,willowisp,shadowsneak,dragontail|Adamant|,224,240,,,44|||||]Excadrill||focussash|H|toxic,rapidspin,earthquake,stealthrock|Impish|176,,52,,252,28|||||]Latias||souldew||dracometeor,psyshock,roost,calmmind|Timid|,,4,252,,252||,0,,,,|||]Terrakion||choicescarf||closecombat,stoneedge,sleeptalk|Jolly|,252,4,,,252|||||]Arceus-Steel||ironplate||calmmind,roar,judgment,recover|Timid|248,,,,8,252||,0,,,,|||',

				'Tyranitar||chopleberry||crunch,pursuit,stealthrock,fireblast|Sassy|248,16,80,,160,4|||||]Arceus-Grass||meadowplate||judgment,willowisp,stealthrock,recover|Timid|248,,8,,,252|||||]Giratina||leftovers||dragontail,roar,sleeptalk,rest|Careful|216,,,,252,40|||||]Skarmory||leftovers|1|roar,spikes,taunt,roost|Bold|248,,,,252,8||,0,,,,|||]Ho-Oh||leftovers|H|bravebird,sacredfire,roost,sleeptalk|Adamant|248,156,,,84,20|||||]Excadrill||airballoon||swordsdance,earthquake,shadowclaw,rapidspin|Adamant|,248,,,68,192|||||',


			],


			gen5uu: [
				'Victini||choiceband||vcreate,boltstrike,zenheadbutt,uturn|Adamant|,252,,,4,252|||||]Xatu||choicescarf|H|psyshock,heatwave,grassknot,trick|Timid|,,,252,4,252||,0,,,,|||]Seismitoad||choicespecs|H|hydropump,sludgewave,earthpower,grassknot|Modest|136,,,252,,120|||||]Cobalion||leftovers||stealthrock,thunderwave,sacredsword,hiddenpowerice|Lax|248,,220,,,40||,30,30,,,|||]Amoonguss||blacksludge|H|spore,stunspore,gigadrain,sludgebomb|Bold|248,,252,,8,||,0,,,,|||]Snorlax||leftovers|1|whirlwind,rest,sleeptalk,bodyslam|Careful|144,,188,,176,|||||',

				'Golurk||leftovers||stealthrock,earthquake,protect,icepunch|Adamant|236,252,,,,20|||||]Druddigon||choiceband||outrage,earthquake,firepunch,sleeptalk|Adamant|196,252,,,,60|||||]Heracross||choicescarf|H|closecombat,megahorn,stoneedge,earthquake|Jolly|,252,,,4,252|||||]Zapdos||lifeorb||thunderbolt,heatwave,hiddenpowergrass,roost|Timid|,,,252,4,252||,30,,30,,|||]Bisharp||lifeorb||swordsdance,ironhead,suckerpunch,pursuit|Adamant|,252,,,4,252|||||]Suicune||leftovers||calmmind,hydropump,icebeam,hiddenpowerelectric|Timid|,,,252,4,252||,,,30,,|||',

				'Victini||choicescarf||vcreate,uturn,boltstrike,flareblitz|Jolly|,252,,,4,252|||||]Durant||choiceband|1|ironhead,thunderfang,xscissor,superpower|Jolly|,252,,,4,252|M||||]Nidoqueen||lifeorb|H|earthpower,icebeam,focusblast,stealthrock|Modest|168,,,252,,88||,0,,,,|||]Zapdos||lifeorb||thunderbolt,hiddenpowergrass,roost,heatwave|Timid|,,,252,,252||,2,,30,,|||]Druddigon||choiceband|H|suckerpunch,outrage,earthquake,dragonclaw|Adamant|208,252,,,,48|F||||]Blastoise||leftovers||rapidspin,scald,roar,toxic|Bold|248,,236,,,24|M||||',

				'Roserade||lifeorb||leafstorm,sludgebomb,sleeppowder,toxicspikes|Timid|,,,252,4,252|M|,0,,,,|||]Rhyperior||leftovers|1|stealthrock,earthquake,rockblast,dragontail|Adamant|248,16,,,244,|M||||]Cofagrigus||leftovers||trickroom,nastyplot,shadowball,hiddenpowerfighting|Quiet|248,,8,252,,|M|,2,30,30,30,2|||]Heracross||choicescarf|H|closecombat,megahorn,stoneedge,earthquake|Jolly|,252,,,4,252|M||||]Slowking||lifeorb|H|trickroom,surf,psyshock,nastyplot|Quiet|248,,8,252,,|M|,,,,,0|||]Escavalier||choiceband||ironhead,megahorn,pursuit,sleeptalk|Brave|248,252,,,8,|M|,,,,,0|||',

				'Zapdos||leftovers||thunderbolt,hiddenpowerflying,chargebeam,roost|Timid|252,,,,80,176||30,2,30,30,30,|||]Slowking||leftovers|H|scald,calmmind,dragontail,slackoff|Relaxed|248,16,244,,,|||||]Roserade||blacksludge||spikes,gigadrain,sludgebomb,rest|Calm|248,,,,220,40||,0,,,,|||]Gligar||eviolite|H|stealthrock,earthquake,knockoff,roost|Impish|232,,216,,,60|||||]Umbreon||leftovers||foulplay,wish,protect,healbell|Calm|252,,4,,252,||,0,,,,|||]Hitmontop||leftovers||rapidspin,toxic,rest,closecombat|Impish|252,,252,,,4|||||',

				'Qwilfish||blacksludge|H|taunt,spikes,waterfall,painsplit|Impish|232,,220,,,56|M||||]Rotom||choicespecs||voltswitch,shadowball,trick,thunderbolt|Timid|,,,252,4,252||,0,,,,|||]Rhyperior||leftovers|1|stealthrock,earthquake,rockblast,dragontail|Adamant|248,16,,,236,8|M||||]Shaymin||leftovers||seedflare,protect,psychic,leechseed|Timid|80,,,252,,176||,0,,,,|||]Mienshao||choicescarf|H|highjumpkick,uturn,aerialace,stoneedge|Jolly|,252,,,4,252|M||||]Escavalier||choiceband||ironhead,megahorn,pursuit,sleeptalk|Adamant|160,252,,,,96|M||||',

				'Raikou||leftovers||voltswitch,thunderbolt,hiddenpowerice,calmmind|Timid|,,4,252,,252||,2,30,,,|||]Cresselia||leftovers||calmmind,psyshock,hiddenpowerfighting,substitute|Bold|252,,176,,,80||30,2,,30,30,30|||]Togekiss||leftovers|1|nastyplot,airslash,thunderwave,roost|Timid|176,,,80,,252||,0,,,,|||]Umbreon||leftovers||wish,foulplay,healbell,protect|Calm|252,,4,,252,|||||]Gligar||eviolite|H|stealthrock,earthquake,aerialace,roost|Impish|236,,216,,,56|||||]Blastoise||leftovers|H|scald,toxic,rapidspin,roar|Bold|252,,252,,4,|||||',

				'Mew||leftovers||softboiled,willowisp,taunt,psyshock|Timid|248,,,,84,176|||||]Rhyperior||leftovers|1|rockblast,earthquake,stealthrock,dragontail|Adamant|244,16,,,248,|M||||]Qwilfish||blacksludge|H|spikes,scald,painsplit,taunt|Bold|248,,200,,,60|F||||]Heracross||leftovers|1|swordsdance,megahorn,stoneedge,closecombat|Jolly|,252,4,,,252|F||||]Togekiss||leftovers|1|airslash,healbell,roost,nastyplot|Bold|248,,160,,,100|M||||]Umbreon||leftovers||wish,foulplay,protect,toxic|Calm|252,,,,252,4|M||||',

				'Rhyperior||lifeorb|1|rockpolish,stoneedge,earthquake,megahorn|Jolly|,252,,,4,252|||||]Cacturne||focussash|H|spikes,counter,darkpulse,focusblast|Timid|,,,252,4,252|||||]Hitmonlee||liechiberry|H|endure,reversal,stoneedge,machpunch|Adamant|,252,,,4,252|||||]Azelf||lifeorb||psychic,fireblast,shadowball,explosion|Hasty|,4,,252,,252|||||]Venomoth||insectplate|1|quiverdance,sleeppowder,bugbuzz,psychic|Timid|,,,252,4,252|||||]Cobalion||expertbelt||stealthrock,voltswitch,hiddenpowerice,closecombat|Naive|,4,,252,,252||,30,30,,,|||',

				'Mew||normalgem||stealthrock,taunt,tailwind,explosion|Jolly|,252,,,4,252|||||]Victini||charcoal||vcreate,zenheadbutt,brickbreak,grassknot|Lonely|,252,,4,,252|||||]Tornadus||lifeorb||hurricane,superpower,grassknot,tailwind|Hasty|,4,,252,,252|||||]Suicune||leftovers||calmmind,hydropump,icebeam,hiddenpowerelectric|Timid|,,,252,4,252||,3,,30,,|||]Nidoking||lifeorb|H|earthpower,icebeam,fireblast,shadowball|Timid|,,,252,4,252||,0,,,,|||]Druddigon||choiceband|H|outrage,earthquake,dragonclaw,suckerpunch|Adamant|132,240,,,4,132|||||',

				'Mew||choicescarf||uturn,gigadrain,psychic,trick|Timid|4,,,252,,252|||||]Darmanitan||choicescarf||flareblitz,rockslide,superpower,uturn|Jolly|4,252,,,,252|||||]Lanturn||leftovers||voltswitch,scald,healbell,toxic|Sassy|252,,,4,252,|||||]Xatu||rockyhelmet|H|uturn,nightshade,grassknot,roost|Relaxed|252,,252,,4,|||||]Mienshao||lifeorb|1|fakeout,hijumpkick,stoneedge,uturn|Jolly|4,252,,,,252|||||]Gligar||eviolite|H|roost,stealthrock,uturn,earthquake|Impish|252,4,252,,,|||||',

				'Rhyperior||leftovers|1|earthquake,rockblast,stealthrock,dragontail|Adamant|248,16,,,244,|||||]Qwilfish||leftovers|H|waterfall,haze,painsplit,spikes|Impish|252,4,252,,,|||||]Shaymin||lifeorb||seedflare,psychic,synthesis,earthpower|Timid|,,,252,4,252|||||]Snorlax||choiceband|1|return,firepunch,pursuit,earthquake|Adamant|,252,,,252,4|||||]Zoroark||choicespecs||darkpulse,flamethrower,trick,focusblast|Timid|,,,252,4,252|||||]Heracross||choicescarf|H|megahorn,closecombat,earthquake,stoneedge|Jolly|,252,4,,,252|||||',

				'Zapdos||leftovers||thunderbolt,toxic,roost,substitute|Calm|248,,180,,56,24||,0,,,,|||]Swampert||leftovers||stealthrock,scald,earthquake,roar|Relaxed|252,,252,,,4|||||]Umbreon||leftovers||foulplay,healbell,wish,protect|Calm|252,,4,,252,|||||]Roserade||focussash||gigadrain,spikes,toxicspikes,sludgebomb|Timid|,,,252,,252||,0,,,,|||]Mew||lifeorb||swordsdance,drainpunch,suckerpunch,zenheadbutt|Jolly|,252,,,4,252|||||]Heracross||choicescarf|H|closecombat,megahorn,earthquake,stoneedge|Jolly|4,252,,,,252|||||',


			],


			gen5ru: [

				'Medicham||choiceband||highjumpkick,psychocut,icepunch,batonpass|Jolly|,252,,,4,252|||||]Manectric||choicescarf|1|voltswitch,thunderbolt,flamethrower,switcheroo|Timid|,,,252,4,252||,0,,,,|||]Archeops||flyinggem||acrobatics,uturn,earthquake,stoneedge|Jolly|,252,,,4,252|||||]Uxie||leftovers||thunderwave,psychic,uturn,stealthrock|Calm|252,,,,152,104||,0,,,,|||]Hitmonchan||leftovers|1|rapidspin,drainpunch,foresight,toxic|Impish|248,,224,,,36|||||]Alomomola||leftovers|H|waterfall,toxic,wish,protect|Impish|252,4,252,,,|||||',


				'Gallade||leftovers|H|bulkup,drainpunch,nightslash,substitute|Careful|240,,,,212,56|||||]Moltres||lifeorb||fireblast,hurricane,hiddenpowergrass,roost|Timid|,,4,252,,252||,30,,30,,|||]Durant||choicescarf||xscissor,superpower,stoneedge,ironhead|Adamant|,252,4,,,252|||||]Rhydon||eviolite|1|stealthrock,earthquake,rockblast,megahorn|Adamant|88,252,,,84,84|||||]Cryogonal||leftovers||rapidspin,icebeam,recover,toxic|Calm|248,,168,,92,|||||]Alomomola||leftovers|H|wish,protect,waterfall,toxic|Impish|252,4,252,,,|||||',

				'Slowking||leftovers|H|nastyplot,trickroom,psychic,scald|Modest|252,,4,252,,||,0,,,,29|||]Druddigon||choiceband||outrage,dragonclaw,firepunch,suckerpunch|Adamant|76,252,,,,180|||||]Sceptile||flyinggem|H|swordsdance,leafblade,acrobatics,earthquake|Adamant|,252,,,4,252|||||]Medicham||lifeorb||fakeout,highjumpkick,zenheadbutt,thunderpunch|Jolly|,252,,,4,252|||||]Omastar||focussash|H|spikes,scald,icebeam,stealthrock|Timid|,,,252,4,252||,0,,,,|||]Rotom||choicescarf||thunderbolt,voltswitch,shadowball,trick|Timid|,,,252,4,252||,0,,,,|||',

				'Spiritomb||blackglasses||shadowsneak,suckerpunch,willowisp,pursuit|Adamant|236,252,,,,20|||||]Ferroseed||eviolite||spikes,leechseed,gyroball,protect|Relaxed|248,,252,,8,||,,,,,0|||]Medicham||lifeorb||highjumpkick,thunderpunch,bulletpunch,zenheadbutt|Jolly|,252,,,4,252|||||]Druddigon||leftovers||stealthrock,toxic,dragonclaw,earthquake|Adamant|172,252,,,64,20|||||]Rotom||choicescarf||voltswitch,shadowball,thunderbolt,trick|Timid|,,,252,4,252|||||]Cryogonal||lifeorb||icebeam,hiddenpowerfire,recover,rapidspin|Timid|64,,,252,,192||,30,,30,,30|||',

				'Jynx||lifeorb|H|icebeam,lovelykiss,nastyplot,psychic|Timid|,,,252,4,252|||||]Haunter||lifeorb||sludgebomb,shadowball,thunderbolt,destinybond|Timid|,,,252,4,252||,0,,,,|||]Druddigon||leftovers||dragontail,earthquake,dragonclaw,stealthrock|Careful|196,,,,252,60|||||]Emboar||leftovers||flareblitz,hammerarm,protect,willowisp|Impish|240,,248,,,20|M||||]Sawsbuck||choicescarf|1|hornleech,batonpass,doubleedge,naturepower|Jolly|,252,,,4,252|||||]Kabutops||lumberry|H|aquajet,rapidspin,swordsdance,stoneedge|Adamant|,252,4,,,252|||||',

				'Slowking||leftovers|H|calmmind,scald,psyshock,slackoff|Bold|252,,212,,,44|||||]Spiritomb||leftovers|H|willowisp,foulplay,rest,sleeptalk|Bold|252,,252,,4,|||||]Rhydon||eviolite|1|stealthrock,earthquake,rockblast,megahorn|Adamant|88,252,,,84,84|||||]Durant||choicescarf|1|ironhead,xscissor,superpower,batonpass|Jolly|,252,,,4,252|||||]Druddigon||rockyhelmet||rest,sleeptalk,roar,dragontail|Impish|252,,252,,4,|||||]Roselia||eviolite||gigadrain,sludgebomb,spikes,rest|Calm|252,,4,,252,|||||',

				'Scolipede||focussash|1|spikes,toxicspikes,megahorn,swordsdance|Jolly|,252,,,4,252|||||]Mesprit||lifeorb||icebeam,psychic,stealthrock,healingwish|Timid|,,,252,4,252|||||]Misdreavus||eviolite||substitute,willowisp,shadowball,painsplit|Timid|144,,112,,,252|||||]Omastar||lumberry|H|shellsmash,hydropump,icebeam,hiddenpowergrass|Timid|,,,252,4,252||,30,,30,,|||]Escavalier||leftovers|H|substitute,swordsdance,ironhead,megahorn|Adamant|172,252,,,,84|||||]Uxie||leftovers||substitute,calmmind,psychic,thunderbolt|Timid|96,,,188,,224|||||',

				'Electrode||focussash|H|raindance,thunder,taunt,voltswitch|Hasty|4,,,252,,252|||S||]Poliwrath||sitrusberry|H|bellydrum,waterfall,earthquake,icepunch|Jolly|4,252,,,,252|M||||]Kabutops||waveincense||waterfall,stoneedge,swordsdance,rapidspin|Adamant|4,252,,,,252|F||||]Moltres||lifeorb||airslash,fireblast,hurricane,hiddenpowergrass|Timid|,,,252,4,252||,30,,30,,|||]Gardevoir||damprock|1|healingwish,raindance,thunderbolt,psychic|Modest|252,,,252,,4|F||||]Ludicolo||lifeorb||gigadrain,hydropump,icebeam,raindance|Modest|4,,,252,,252|M||S||',

			],


			gen5nu: [
				'Alomomola||rockyhelmet|H|protect,wish,scald,knockoff|Bold|104,,252,,152,|||||]Gothorita||choicescarf|H|psychic,toxic,rest,trick|Bold|252,,172,,,84||,0,,,,|||]Roselia||eviolite||gigadrain,sludgebomb,spikes,rest|Calm|248,,8,,252,||,0,,,,|||]Miltank||leftovers||bodyslam,stealthrock,healbell,milkdrink|Careful|252,,4,,252,|||||]Mandibuzz||leftovers||foulplay,toxic,taunt,roost|Bold|248,,148,,,112||,0,,,,|||]Gurdurr||eviolite|H|drainpunch,knockoff,machpunch,icepunch|Adamant|252,252,4,,,|||||',

				'Mandibuzz||leftovers||foulplay,bravebird,taunt,roost|Bold|248,,148,,,112|||||]Sawk||choiceband|H|closecombat,earthquake,icepunch,stoneedge|Adamant|4,252,,,,252|||||]Rotom-Frost||leftovers||thunderbolt,blizzard,voltswitch,painsplit|Timid|,,,252,4,252||,0,,,,|||]Samurott||lumberry||waterfall,megahorn,aquajet,swordsdance|Adamant|200,252,,,,56|||||]Golurk||custapberry||earthquake,shadowpunch,thunderpunch,stealthrock|Adamant|80,252,,,,176|||||]Duosion||eviolite|1|psyshock,signalbeam,calmmind,recover|Bold|252,,252,4,,||,0,,,,|||',

				'Garbodor||rockyhelmet|H|gunkshot,drainpunch,seedbomb,painsplit|Adamant|240,252,,,,16|||||]Charizard||lifeorb||fireblast,airslash,hiddenpowergrass,roost|Timid|,,,252,4,252||,2,,30,,|||]Misdreavus||eviolite||shadowball,thunderbolt,taunt,nastyplot|Timid|40,,,252,,216||,0,,,,|||]Piloswine||eviolite|H|earthquake,iceshard,stealthrock,roar|Adamant|240,252,,,,16|||||]Skuntank||lumberry|1|pursuit,crunch,suckerpunch,taunt|Adamant|,252,,,72,184|||||]Samurott||lumberry||waterfall,megahorn,aquajet,swordsdance|Adamant|200,252,,,,56|||||',

				'Alomomola||rockyhelmet|H|protect,wish,scald,healingwish|Bold|104,,252,,152,||,0,,,,|||]Regirock||leftovers||rockslide,drainpunch,stealthrock,toxic|Impish|240,252,,,,16|||||]Torterra||choiceband||woodhammer,earthquake,stoneedge,bulletseed|Adamant|88,252,,,,168|||||]Duosion||eviolite|1|psyshock,thunder,calmmind,recover|Bold|252,,252,4,,||,0,,,,|||]Skuntank||lumberry|1|poisonjab,pursuit,suckerpunch,taunt|Adamant|,252,,,176,80|||||]Charizard||choicescarf||fireblast,flamethrower,focusblast,airslash|Timid|,,4,252,,252|||||',

				'Mandibuzz||leftovers||foulplay,toxic,taunt,roost|Bold|248,,148,,,112||,0,,,,|||]Garbodor||rockyhelmet|H|gunkshot,toxic,spikes,painsplit|Impish|252,,240,,,16|||||]Haunter||lifeorb||shadowball,sludgebomb,hiddenpowerground,substitute|Timid|,,4,252,,252||,3,,30,30,|||]Piloswine||eviolite|H|earthquake,iciclespear,iciclespear,stealthrock|Adamant|240,252,,,,16|||||]Serperior||lifeorb||gigadrain,hiddenpowerrock,taunt,calmmind|Timid|,,4,252,,252||,3,30,,30,30|||]Alomomola||rockyhelmet|H|protect,wish,scald,healingwish|Bold|104,,252,,152,||,0,,,,|||',

				'Samurott||grassgem||hydropump,icebeam,hiddenpowergrass,taunt|Timid|,,4,252,,252|M|,2,,30,,|||]Charizard||choicespecs||fireblast,airslash,hiddenpowergrass,flamethrower|Timid|,,,252,4,252||,2,,30,,|||]Sawk||choiceband|H|closecombat,earthquake,icepunch,stoneedge|Adamant|4,252,,,,252|||||]Serperior||lifeorb||gigadrain,hiddenpowerrock,taunt,calmmind|Timid|,,,252,4,252|M|,3,30,,30,30|||]Rotom-Frost||choicescarf||thunderbolt,blizzard,voltswitch,trick|Timid|,,,252,4,252||,0,,,,|||]Mawile||leftovers|1|stealthrock,taunt,substitute,batonpass|Jolly|252,,4,,,252||,0,,,,|||',

				'Golurk||custapberry||earthquake,shadowpunch,thunderpunch,stealthrock|Adamant|200,224,,,,84|||||]Gothorita||choicespecs|H|psychic,toxic,rest,trick|Bold|252,,172,,,84||,0,,,,|||]Carracosta||lifeorb||shellsmash,waterfall,stoneedge,aquajet|Adamant|,252,4,,,252|||||]Kangaskhan||choiceband|1|doubleedge,earthquake,suckerpunch,return|Jolly|4,252,,,,252|||||]Skuntank||lumberry|1|pursuit,crunch,suckerpunch,taunt|Adamant|,252,,,72,184|||||]Ludicolo||lifeorb||hydropump,gigadrain,icebeam,raindance|Modest|4,,,252,,252||,0,,,,|||',

				'Carracosta||lifeorb||shellsmash,waterfall,stoneedge,aquajet|Adamant|,252,4,,,252|||||]Garbodor||rockyhelmet|H|gunkshot,toxic,spikes,painsplit|Impish|252,,240,,,16|||||]Ludicolo||lifeorb||hydropump,gigadrain,icebeam,raindance|Modest|4,,,252,,252||,0,,,,|||]Piloswine||eviolite|H|earthquake,iceshard,stealthrock,toxic|Adamant|240,252,,,,16|||||]Misdreavus||eviolite||shadowball,thunderbolt,taunt,nastyplot|Timid|40,,,252,,216||,0,,,,|||]Gardevoir||choicescarf|1|psychic,signalbeam,focusblast,destinybond|Timid|,,,252,4,252|||||',

				'Musharna||leftovers|1|psychic,batonpass,calmmind,moonlight|Bold|240,,252,,16,||,0,,,,|||]Charizard||choicescarf||fireblast,flamethrower,focusblast,airslash|Timid|,,4,252,,252|||||]Regirock||leftovers||earthquake,stoneedge,thunderwave,stealthrock|Impish|252,240,16,,,|||||]Wartortle||eviolite||scald,foresight,toxic,rapidspin|Bold|248,,172,,88,||,0,,,,|||]Serperior||lifeorb||gigadrain,hiddenpowerrock,calmmind,substitute|Timid|,,4,252,,252||,,30,,30,30|||]Scraggy||eviolite||drainpunch,crunch,bulkup,rest|Careful|248,8,,,252,|||||',

				'Charizard||choicespecs||fireblast,airslash,hiddenpowergrass,flamethrower|Timid|,,,252,4,252||,2,,30,,|||]Sawk||lumberry|H|closecombat,earthquake,taunt,icepunch|Jolly|4,252,,,,252|||||]Skuntank||lumberry|1|pursuit,crunch,suckerpunch,taunt|Adamant|,252,,,72,184|||||]Misdreavus||eviolite||shadowball,thunderbolt,willowisp,nastyplot|Timid|40,,,252,,216||,0,,,,|||]Golurk||passhoberry||earthquake,shadowpunch,thunderpunch,stealthrock|Adamant|200,224,,,,84|||||]Serperior||lifeorb||gigadrain,hiddenpowerrock,calmmind,substitute|Timid|,,4,252,,252||,,30,,30,30|||',

				'Regirock||mentalherb||earthquake,stoneedge,thunderwave,stealthrock|Impish|252,240,16,,,|||||]Riolu||eviolite|H|roar,copycat,substitute,toxic|Impish|252,,252,,4,|||||]Garbodor||rockyhelmet|H|gunkshot,toxic,spikes,painsplit|Impish|252,,240,,,16|||||]Serperior||lifeorb||gigadrain,hiddenpowerrock,substitute,calmmind|Timid|,,4,252,,252||,3,30,,30,30|||]Misdreavus||eviolite||shadowball,thunderbolt,taunt,nastyplot|Timid|40,,,252,,216||,0,,,,|||]Gardevoir||choicescarf|1|psychic,signalbeam,focusblast,destinybond|Timid|,,,252,4,252|||||',

				'Garbodor||rockyhelmet|H|gunkshot,toxic,spikes,painsplit|Impish|252,,240,,,16|||||]Regice||lumberry||icebeam,thunderbolt,focusblast,rockpolish|Modest|32,,,252,,224||,0,,,,|||]Musharna||leftovers|1|psychic,batonpass,calmmind,moonlight|Bold|240,,252,,16,||,0,,,,|||]Golurk||choiceband|H|earthquake,stoneedge,icepunch,dynamicpunch|Adamant|80,252,,,,176|||||]Mandibuzz||leftovers||foulplay,toxic,taunt,roost|Bold|248,,148,,,112||,0,,,,|||]Cradily||leftovers|H|gigadrain,rockslide,stealthrock,recover|Relaxed|252,,252,,4,|||||',

				'Charizard||choicescarf||fireblast,focusblast,airslash,willowisp|Timid|,,4,252,,252||,0,,,,|||]Misdreavus||eviolite||shadowball,thunderbolt,taunt,nastyplot|Timid|40,,,252,,216||,0,,,,|||]Piloswine||eviolite|H|earthquake,iceshard,stealthrock,toxic|Adamant|240,252,,,,16|||||]Skuntank||lumberry|1|pursuit,crunch,suckerpunch,taunt|Adamant|,252,,,72,184|||||]Samurott||lumberry||waterfall,megahorn,aquajet,swordsdance|Adamant|200,252,,,,56|||||]Garbodor||rockyhelmet|1|gunkshot,seedbomb,toxicspikes,spikes|Impish|240,,160,,,108|M||||',

				'Sawk||lumberry|moldbreaker|closecombat,earthquake,taunt,icepunch|Jolly|4,252,,,,252|||||]Charizard||choicescarf|blaze|fireblast,flamethrower,focusblast,airslash|Timid|,,4,252,,252|||||]Golem||leftovers|sturdy|earthquake,earthquake,stealthrock,explosion|Adamant|200,252,,,,56|||||]Wartortle||eviolite|torrent|scald,foresight,toxic,rapidspin|Bold|248,,172,,88,||,0,,,,|||]Gothorita||eviolite|shadowtag|psychic,toxic,calmmind,rest|Bold|248,,176,,,84||,0,,,,|||]Serperior||lifeorb|overgrow|gigadrain,hiddenpowerrock,calmmind,substitute|Timid|,,4,252,,252||,,30,,30,30|||',


				'Alomomola||rockyhelmet|H|scald,wish,protect,healingwish|Bold|104,,252,,152,||,0,,,,|||]Charizard||choicespecs||fireblast,airslash,hiddenpowergrass,flamethrower|Timid|,,4,252,,252||,30,,30,,|||]Eelektross||leftovers||thunderbolt,voltswitch,gigadrain,flamethrower|Modest|224,,,252,,32||,0,,,,|||]Serperior||lifeorb||gigadrain,hiddenpowerrock,calmmind,substitute|Timid|,,4,252,,252||,,30,,30,30|||]Golurk||leftovers||earthquake,icepunch,toxic,stealthrock|Adamant|252,84,76,,96,|||||]Skuntank||lumberry|1|pursuit,crunch,suckerpunch,taunt|Adamant|,252,,,72,184|||||',

				'Skuntank||blackglasses|1|suckerpunch,crunch,pursuit,taunt|Adamant|,252,,,112,144|M||||]Gardevoir||lifeorb|1|psychic,focusblast,thunderbolt,destinybond|Timid|,,,252,4,252|M|,0,,,,|||]Regirock||leftovers||stealthrock,thunderwave,earthquake,stoneedge|Impish|252,240,16,,,|||||]Misdreavus||eviolite||nastyplot,shadowball,thunderbolt,willowisp|Timid|,,,252,4,252|M|,0,,,,|||]Seismitoad||leftovers|H|hydropump,grassknot,earthpower,sludgewave|Timid|,,,252,4,252|M|,0,,,,|||]Braviary||choicescarf|H|bravebird,superpower,uturn,return|Jolly|,252,,,4,252|||||',


				'Rotom-Fan||expertbelt||voltswitch,willowisp,airslash,hiddenpowergrass|Timid|,,,252,4,252||,2,,30,,|||]Gardevoir||leftovers|1|taunt,willowisp,psychic,signalbeam|Timid|248,,164,,,96|M|,0,,,,|||]Golurk||passhoberry||stealthrock,thunderpunch,earthquake,shadowpunch|Adamant|200,224,,,,84|||||]Alomomola||leftovers|H|wish,waterfall,mirrorcoat,protect|Careful|104,,144,,252,8|M||||]Garbodor||rockyhelmet|H|toxicspikes,spikes,seedbomb,gunkshot|Impish|240,,160,,,108|M||||]Kangaskhan||silkscarf|1|fakeout,earthquake,suckerpunch,doubleedge|Adamant|,252,,,4,252|||||',


				'Swellow||toxicorb||facade,uturn,quickattack,tailwind|Jolly|,252,4,,,252|||||]Kangaskhan||silkscarf|1|earthquake,fakeout,suckerpunch,doubleedge|Adamant|,252,,,4,252|||||]Zangoose||toxicorb|H|facade,quickattack,nightslash,closecombat|Jolly|,252,,,4,252|||||]Gothorita||choicespecs|H|trick,psychic,grassknot,hiddenpowerground|Modest|40,,,252,,216|M|,,,30,30,|||]Golurk||yacheberry||stealthrock,earthquake,shadowpunch,icepunch|Adamant|60,252,,,,196|||||]Rotom-Frost||widelens||blizzard,thunderbolt,willowisp,voltswitch|Timid|,,,252,4,252|||||',


				'Charizard||flyinggem||acrobatics,swordsdance,earthquake,roost|Jolly|,252,,,4,252|M||||]Piloswine||eviolite|H|stealthrock,toxic,iceshard,earthquake|Impish|240,,96,,156,16|M||||]Serperior||lifeorb||taunt,calmmind,gigadrain,hiddenpowerrock|Timid|,,,252,4,252|M|,2,30,,30,30|||]Gothorita||choicespecs|H|psychic,grassknot,signalbeam,trick|Modest|,,,252,4,252|M|,0,,,,|||]Alomomola||leftovers|H|wish,waterfall,healingwish,protect|Careful|120,,124,,252,12|M||||]Garbodor||choicescarf|H|gunkshot,seedbomb,drainpunch,explosion|Jolly|,252,,,4,252|M||||0',


				'Charizard||lifeorb||fireblast,airslash,roost,focusblast|Timid|,,4,252,,252|F||||]Torterra||lifeorb||rockpolish,earthquake,woodhammer,swordsdance|Adamant|,252,4,,,252|M||||]Samurott||lifeorb||hydropump,icebeam,hiddenpowergrass,taunt|Timid|,,4,252,,252|M|,30,,30,,|||]Piloswine||eviolite|H|stealthrock,earthquake,roar,iceshard|Impish|252,,200,,56,|M||||]Gone.|fraxure|eviolite|1|dragondance,outrage,lowkick,taunt|Jolly|4,252,,,,252|M||||]Musharna||leftovers|1|batonpass,moonlight,psychic,thunderwave|Bold|240,,244,,,24|M||||',


			],


			gen5pu: [

				'Combusken||eviolite|H|fireblast,focusblast,substitute,protect|Modest|,,,252,4,252||,0,,,,|||]Graveler||eviolite|1|earthquake,stoneedge,stealthrock,rest|Impish|252,,252,,4,|||||]Natu||colburberry|H|nightshade,reflect,uturn,roost|Impish|248,,204,,,56|||||]Persian||choiceband||doubleedge,seedbomb,switcheroo,uturn|Jolly|,252,,,4,252|||||]Beheeyem||leftovers|H|psychic,signalbeam,nastyplot,recover|Modest|172,,,252,,84||,0,,,,|||]Maractus||leftovers||spikes,gigadrain,synthesis,leechseed|Bold|252,,120,,,136||,0,,,,|||',

				'Gothorita||choicescarf|H|psychic,toxic,rest,trick|Bold|252,,172,,,84||,0,,,,|||]Muk||leftovers|1|poisonjab,curse,sleeptalk,rest|Careful|252,4,,,252,|||||]Torterra||leftovers||stealthrock,woodhammer,earthquake,synthesis|Adamant|252,128,128,,,|||||]Natu||colburberry|H|nightshade,thunderwave,uturn,roost|Bold|248,,204,,,56|||||]Vullaby||eviolite|1|foulplay,bravebird,whirlwind,roost|Bold|252,,252,,,4|||||]Chinchou||eviolite||scald,voltswitch,icebeam,rest|Calm|252,,4,,252,||,0,,,,|||',

				'Monferno||focussash||overheat,taunt,stealthrock,endeavor|Timid|252,,,4,,252||,0,,,,|||]Rotom-Frost||choicescarf||blizzard,thunderbolt,voltswitch,trick|Timid|,,,252,4,252||,0,,,,|||]Fraxure||eviolite|1|outrage,lowkick,taunt,dragondance|Adamant|,252,,,4,252|||||]Simipour||lifeorb|H|hydropump,icebeam,hiddenpowergrass,nastyplot|Timid|,,,252,4,252||,2,,30,,|||]Victreebel||lifeorb||sleeppowder,leafstorm,sludgebomb,suckerpunch|Rash|,4,,252,,252|||||]Vigoroth||eviolite||bulkup,taunt,slackoff,return|Careful|252,,,,224,32|||||',

				'Beedrill||focussash||endeavor,tailwind,toxicspikes,uturn|Jolly|252,,,,4,252|||||]Combusken||eviolite|H|fireblast,focusblast,substitute,protect|Modest|,,,252,4,252||,0,,,,|||]Dodrio||choiceband|1|bravebird,return,pursuit,quickattack|Jolly|,252,4,,,252|||||]Beheeyem||leftovers|1|nastyplot,recover,psychic,signalbeam|Bold|252,,252,4,,||,0,,,,|||]Rotom-Frost||choicescarf||voltswitch,thunderbolt,blizzard,trick|Timid|,,,252,4,252||,0,,,,|||]Graveler||eviolite|1|earthquake,stoneedge,stealthrock,rest|Impish|252,,252,,4,|||||',

				'Combusken||eviolite|H|fireblast,focusblast,substitute,protect|Modest|,,,252,4,252||,0,,,,|||]Chinchou||eviolite||voltswitch,scald,rest,sleeptalk|Calm|252,,,,252,4||,0,,,,|||]Graveler||eviolite|1|earthquake,stoneedge,stealthrock,rest|Impish|252,,252,,4,|||||]Zweilous||choiceband||outrage,crunch,superpower,headsmash|Jolly|,252,,,4,252|||||]Vileplume||blacksludge|H|gigadrain,sludgebomb,sleeppowder,moonlight|Bold|252,,252,,4,||,0,,,,|||]Shoutout Swagger|murkrow|eviolite|H|thunderwave,taunt,bravebird,roost|Jolly|,252,4,,,252|||||',

				'Zebstrika||choicespecs|H|voltswitch,thunderbolt,overheat,hiddenpowergrass|Timid|,,4,252,,252||,2,,30,,|||]Chinchou||eviolite||voltswitch,scald,healbell,thunderwave|Calm|252,,208,,48,||,0,,,,|||]Torterra||leftovers||stealthrock,woodhammer,synthesis,earthquake|Adamant|252,156,100,,,|||||]Beheeyem||leftovers|H|calmmind,recover,psychic,shadowball|Relaxed|252,,252,4,,||,0,,,,|||]Shoutout Swagger|murkrow|eviolite|H|thunderwave,taunt,bravebird,roost|Jolly|,252,4,,,252|||||]Machoke||eviolite|1|dynamicpunch,rockslide,icepunch,sleeptalk|Adamant|252,128,128,,,|||||',

				'Muk||choiceband|H|gunkshot,shadowsneak,firepunch,explosion|Adamant|252,252,,,4,|||||]Simipour||lifeorb|H|superpower,hydropump,icebeam,hiddenpowerelectric|Hasty|,4,,252,,252||,,,30,,|||]Rotom-Frost||choicescarf||voltswitch,thunderbolt,blizzard,trick|Timid|,,,252,4,252|||||]Torterra||leftovers||stealthrock,woodhammer,earthquake,synthesis|Adamant|180,252,,,,76|||||]Fraxure||eviolite|1|dragondance,outrage,lowkick,toxic|Jolly|,252,4,,,252|||||]Rapidash||lifeorb|1|flareblitz,wildcharge,lowkick,morningsun|Jolly|,252,,,4,252|||||',

				'Zebstrika||lifeorb||voltswitch,thunderbolt,overheat,hiddenpowergrass|Timid|,,,252,4,252||,2,,30,,|||]Natu||eviolite|H|roost,toxic,nightshade,uturn|Impish|248,,252,,,8|||||]Graveler||eviolite|1|stealthrock,rockblast,earthquake,toxic|Impish|252,4,252,,,|||||]Dodrio||choiceband|1|bravebird,frustration,pursuit,quickattack|Jolly|,252,,,4,252|||||0]Maractus||leftovers||gigadrain,hiddenpowerice,spikes,synthesis|Calm|248,,,,248,12||,2,30,,,|||]Klang||eviolite|H|shiftgear,geargrind,substitute,voltswitch|Impish|252,,156,,100,|||||',


				'Maractus||leftovers||spikes,gigadrain,synthesis,leechseed|Bold|252,,120,,,136||,0,,,,|||]Bronzor||eviolite||stealthrock,psywave,toxic,rest|Bold|252,,144,,112,||,0,,,,|||]Audino||leftovers|1|wish,protect,healbell,frustration|Careful|252,4,,,252,|||||0]Duosion||eviolite|1|calmmind,acidarmor,psyshock,recover|Bold|252,,252,4,,||,0,,,,|||]Frillish||eviolite||scald,willowisp,nightshade,recover|Calm|252,,4,,252,||,0,,,,|||]Zweilous||eviolite||dragontail,roar,sleeptalk,rest|Careful|252,4,,,252,|||||',

				'Torterra||leftovers||stealthrock,woodhammer,earthquake,synthesis|Adamant|252,128,128,,,|||||]Chinchou||eviolite||voltswitch,scald,rest,sleeptalk|Calm|252,,,,252,4||,0,,,,|||]Fraxure||eviolite|1|taunt,dragondance,outrage,superpower|Jolly|,252,,,4,252|||||]Rotom-Frost||choicescarf||voltswitch,blizzard,thunderbolt,trick|Timid|,,,252,4,252||,0,,,,|||]Volbeat||leftovers|H|thunderwave,encore,uturn,roost|Impish|248,,252,,8,|||||]Klang||eviolite|H|shiftgear,geargrind,rest,sleeptalk|Impish|248,,144,,,116|||||',


			],


			gen5lc: [

				'Clamperl||deepseatooth|H|shellsmash,surf,icebeam,hiddenpowergrass|Timid|80,,,248,,180||,30,,30,,||5|]Mienfoo||eviolite|1|drainpunch,uturn,fakeout,knockoff|Impish|156,76,116,,36,76||||5|]Wynaut||eviolite||mirrorcoat,counter,destinybond,encore|Bold|76,,132,,212,12||||5|]Foongus||eviolite|H|spore,stunspore,gigadrain,sludgebomb|Bold|204,,236,,,||||5|]Chinchou||eviolite||scald,discharge,rest,sleeptalk|Bold|76,,132,,228,60||||5|]Pawniard||eviolite||substitute,swordsdance,suckerpunch,ironhead|Adamant|76,236,,,,196||||5|',

				'Snover||choicescarf||blizzard,gigadrain,hiddenpowerrock,iceshard|Timid|124,,,184,,200||,,30,,30,30||5|]Timburr||eviolite||bulkup,drainpunch,machpunch,payback|Careful|76,196,,,236,||||5|]Misdreavus||eviolite||willowisp,shadowball,hiddenpowerfighting,taunt|Timid|,,,240,,240||,,30,30,30,30||5|]Staryu||eviolite|1|hydropump,rapidspin,recover,thunderbolt|Timid|36,,,200,,236||||5|]Mienfoo||choicescarf|1|drainpunch,highjumpkick,stoneedge,uturn|Adamant|,236,36,,,236||||5|]Pawniard||eviolite||swordsdance,ironhead,suckerpunch,brickbreak|Adamant|,236,36,,40,196||||5|',

				'Larvesta||eviolite||flareblitz,willowisp,uturn,morningsun|Adamant|76,236,156,,,36||||5|]Snover||choicescarf||blizzard,gigadrain,iceshard,hiddenpowerfire|Naive|,104,,184,,200||,30,,30,,30||5|]Mienfoo||eviolite|1|drainpunch,uturn,knockoff,fakeout|Impish|156,76,116,,36,76||||5|]Staryu||eviolite|1|hydropump,thunderbolt,rapidspin,recover|Timid|36,,,200,,240||||5|]Porygon||eviolite||triattack,thunderwave,shadowball,recover|Calm|236,,196,,76,||||5|]Pawniard||eviolite||swordsdance,suckerpunch,brickbreak,ironhead|Jolly|,156,36,,116,196||||5|',

				'Hippopotas||eviolite||earthquake,stealthrock,whirlwind,slackoff|Impish|132,20,212,,120,20||||5|]Mienfoo||eviolite|1|drainpunch,uturn,knockoff,taunt|Impish|156,76,116,,36,76||||5|]Tentacool||eviolite|1|toxicspikes,rapidspin,knockoff,scald|Calm|196,,76,,196,36||||5|]Ferroseed||eviolite||spikes,leechseed,stealthrock,gyroball|Relaxed|164,,188,,148,||,,,,,0||5|]Slowpoke||eviolite|H|scald,psychic,slackoff,toxic|Bold|196,,156,36,116,||,0,,,,||5|]Lileep||eviolite|H|gigadrain,toxic,protect,recover|Bold|228,,220,,60,||,0,,,,||5|',

				'Misdreavus||eviolite||shadowball,hiddenpowerfighting,nastyplot,willowisp|Timid|,,,240,,240||,3,30,30,30,30||5|]Mienfoo||choicescarf|1|highjumpkick,uturn,stoneedge,drainpunch|Adamant|,236,36,,,236||||5|]Foongus||eviolite|H|spore,gigadrain,stunspore,clearsmog|Bold|124,,156,76,76,76||||5|]Bronzor||eviolite||stealthrock,psychic,flashcannon,toxic|Calm|220,48,68,4,148,12||,0,,,,||5|]Carvanha||lifeorb|H|waterfall,crunch,protect,hiddenpowerfire|Naughty|,200,36,,,240||,30,,30,,30||5|]Stunky||choicespecs|1|darkpulse,sludgebomb,fireblast,suckerpunch|Naive|,12,,188,,244||||5|',

				'Abra||lightclay|H|reflect,lightscreen,taunt,psychic|Timid|76,,236,,,196||,0,,,,||5|]Shellder||eviolite|1|iciclespear,rockblast,iceshard,shellsmash|Naive|36,156,36,,76,196||||5|]Diglett||focussash|1|earthquake,rockslide,reversal,stealthrock|Jolly|,236,,,,236||||5|]Clamperl||deepseatooth|H|surf,icebeam,hiddenpowergrass,shellsmash|Timid|80,,,248,,180||,2,,30,,||5|]Misdreavus||eviolite||shadowball,hiddenpowerfighting,willowisp,nastyplot|Timid|,,36,236,,236||,3,30,30,30,30||5|]Porygon||eviolite|1|triattack,shadowball,agility,recover|Timid|76,,,236,,196||,0,,,,||5|',

				'Dwebble||oranberry||stealthrock,spikes,rockblast,xscissor|Jolly|36,236,,,,236||||5|]Mienfoo||eviolite|1|drainpunch,uturn,fakeout,knockoff|Impish|156,76,116,,36,76||||5|]Drilbur||choicescarf|H|earthquake,rockslide,shadowclaw,rapidspin|Jolly|,236,,,,212||||5|]Misdreavus||eviolite||willowisp,shadowball,hiddenpowerfighting,painsplit|Timid|36,,120,,80,240||,3,30,30,30,30||5|]Vullaby||eviolite|1|whirlwind,bravebird,roost,knockoff|Careful|116,76,116,,156,||||5|]Carvanha||lifeorb|H|surf,darkpulse,protect,hiddenpowerfire|Modest|,,,240,,240||,2,,30,,30||5|',

				'Mienfoo||flyinggem|1|drainpunch,acrobatics,fakeout,uturn|Jolly|,236,36,,,236||||5|]Porygon||eviolite||triattack,thunderwave,shadowball,recover|Calm|236,,196,,76,||||5|]Timburr||eviolite||bulkup,drainpunch,machpunch,payback|Careful|76,196,,,236,||||5|]Foongus||eviolite|H|spore,stunspore,gigadrain,sludgebomb|Bold|204,,236,,,||||5|]Misdreavus||eviolite||shadowball,thunderbolt,hiddenpowerfighting,shadowsneak|Mild|,,,240,240,||,,30,30,30,30||5|]Bronzor||eviolite||stealthrock,earthquake,flashcannon,toxic|Careful|220,4,68,4,148,16||||5|',


			],

			gen6ou: [

				'Medicham||medichamite||fakeout,highjumpkick,thunderpunch,icepunch|Adamant|,252,4,,,252|M||||]Keldeo-Resolute||choicespecs||scald,hydropump,secretsword,hiddenpowerflying|Timid|,,4,252,,252||30,0,30,30,30,|||]Landorus-Therian||choicescarf||earthquake,stoneedge,knockoff,uturn|Jolly|72,240,,,,196|||||]Rotom-Wash||leftovers||voltswitch,hydropump,willowisp,thunderwave|Bold|248,,252,,8,||,0,,,,|||]Jirachi||leftovers||stealthrock,ironhead,uturn,healingwish|Careful|240,,,,236,32|||||]Latios||lifeorb||dracometeor,hiddenpowerfire,defog,recover|Timid|,,,252,4,252||29,0,,30,,30|||',

				'Slowbro||slowbronite|regenerator|calmmind,slackoff,rest,scald|Bold|248,,84,,176,|F|,0,,,,|||]Alakazam||lifeorb|H|psychic,shadowball,focusblast,hiddenpowerice|Timid|,,,252,4,252|F|,0,30,,,|||]Zapdos||leftovers||discharge,heatwave,roost,defog|Calm|240,,36,,216,16||,0,,,,|||]Tyranitar||choicescarf||crunch,pursuit,stoneedge,earthquake|Jolly|,252,,,4,252|F||||]Gliscor||toxicorb|H|taunt,knockoff,roost,earthquake|Jolly|244,,,,152,112|F||||]Ferrothorn||leftovers||stealthrock,spikes,leechseed,gyroball|Relaxed|248,,84,,176,|F|,,,,,0|||',

				'Keldeo||choicespecs||scald,focusblast,hydropump,hiddenpowergrass|Timid|,,4,252,,252||,0,,30,,|||]Tyranitar||choicescarf||stoneedge,crunch,superpower,pursuit|Jolly|,252,,,4,252|||||]Gliscor||toxicorb|H|swordsdance,roost,earthquake,facade|Careful|244,,,,188,76|||||]Ferrothorn||leftovers||stealthrock,spikes,leechseed,powerwhip|Impish|252,,88,,168,|||||]Tornadus-Therian||assaultvest||hurricane,heatwave,knockoff,uturn|Timid|232,,,24,,252|||||]Slowbro||slowbronite|regenerator|calmmind,slackoff,scald,psyshock|Bold|248,,76,,184,||,0,,,,|||',

				'Metagross||metagrossite||stealthrock,bulletpunch,meteormash,hammerarm|Jolly|4,252,,,,252|||||]Clefable||leftovers|1|calmmind,flamethrower,icebeam,softboiled|Bold|252,,252,4,,|F|,0,,,,|||]Gliscor||toxicorb|H|swordsdance,earthquake,knockoff,roost|Careful|252,,4,,252,|M||||]Tyranitar||choicescarf||stoneedge,crunch,superpower,pursuit|Jolly|4,252,,,,252|M||||]Skarmory||rockyhelmet|1|spikes,ironhead,whirlwind,roost|Impish|252,,252,,4,|M||||]Amoonguss||blacksludge|H|gigadrain,clearsmog,toxic,spore|Calm|252,,188,,68,|M|,0,,,,|||',

				'Tyranitar||choiceband||crunch,pursuit,stoneedge,superpower|Adamant|136,156,,,,216|M||||]Gardevoir||gardevoirite|trace|calmmind,substitute,focusblast,hypervoice|Timid|16,,8,232,,252|F|,0,,,,|||]Latios||lifeorb||dracometeor,psyshock,hiddenpowerfire,recover|Timid|,,,252,4,252||29,0,,30,,30|||]Jirachi||leftovers||stealthrock,healingwish,bodyslam,ironhead|Jolly|240,84,56,,32,96|||||]Landorus-Therian||earthplate||rockpolish,swordsdance,stoneedge,earthquake|Adamant|,252,4,,,252|||||]Keldeo-Resolute||choicescarf||hydropump,secretsword,icywind,scald|Timid|,,,252,4,252||,0,,,,|||',

				'Scizor||scizorite||uturn,swordsdance,bulletpunch,roost|Impish|248,,124,,136,|||||]Heatran||leftovers||lavaplume,protect,stealthrock,taunt|Timid|248,,,,8,252||,0,,,,|||]Starmie||leftovers|1|rapidspin,scald,toxic,recover|Timid|252,,4,,,252||,0,,,,|||]Amoonguss||blacksludge|H|spore,hiddenpowerfire,clearsmog,gigadrain|Bold|248,,236,,,24||,0,,30,,30|||]Gliscor||toxicorb|H|swordsdance,facade,roost,earthquake|Careful|244,,,,192,72|||||]Weavile||choiceband||knockoff,pursuit,iciclecrash,iceshard|Jolly|,252,,,4,252|||||',

				'Lopunny||lopunnite|limber|fakeout,highjumpkick,return,icepunch|Jolly|,252,4,,,252|F||||]Ferrothorn||leftovers||leechseed,spikes,ironhead,thunderwave|Impish|248,,72,,160,28|M||||]Clefable||leftovers|1|calmmind,flamethrower,moonblast,softboiled|Calm|248,,196,,64,|F|,0,,,,15|||]Landorus-Therian||rockyhelmet||stealthrock,earthquake,hiddenpowerfire,uturn|Relaxed|248,,208,44,8,||,30,,30,,30|||]Starmie||leftovers|1|scald,thunderwave,rapidspin,recover|Timid|248,,,,8,252||,0,,,,|||]Tyranitar||choiceband||stoneedge,crunch,ironhead,pursuit|Adamant|,252,,,4,252|M||||',

				'Kyurem-Black||lifeorb||icebeam,fusionbolt,earthpower,roost|Naive|,4,,252,,252|||||]Ferrothorn||leftovers||spikes,leechseed,knockoff,powerwhip|Relaxed|252,,88,,168,||,,,,,0|||]Landorus-Therian||rockyhelmet||uturn,earthquake,stoneedge,stealthrock|Impish|248,8,252,,,||,,,,,29|||]Starmie||leftovers|1|scald,thunderwave,rapidspin,recover|Timid|248,,,,8,252|||||]Diancie||diancite||moonblast,diamondstorm,hiddenpowerfire,protect|Naive|,252,,4,,252||,30,,30,,30|||]Talonflame||leftovers|H|swordsdance,willowisp,bravebird,roost|Careful|248,,,,224,36|||||',

				'Diancie||diancite|clearbody|diamondstorm,moonblast,hiddenpowerfire,protect|Naive|,168,,88,,252||,30,,30,,30|||]Volcarona||lumberry||quiverdance,gigadrain,bugbuzz,fireblast|Timid|72,,,252,,184||,0,,,,|||]Starmie||leftovers|1|scald,thunderwave,recover,rapidspin|Timid|252,,,,4,252||,0,,,,|||]Ferrothorn||leftovers||spikes,leechseed,powerwhip,knockoff|Impish|252,,88,,168,|||||]Landorus-Therian||rockyhelmet||stealthrock,earthquake,toxic,uturn|Impish|252,4,252,,,|||||]Weavile||choiceband||pursuit,knockoff,iciclecrash,iceshard|Jolly|,252,,,4,252|||||',

				'Metagross||metagrossite||bulletpunch,meteormash,zenheadbutt,earthquake|Jolly|4,252,,,,252|||||]Garchomp||rockyhelmet|H|stealthrock,dragontail,earthquake,toxic|Impish|216,,200,,,92|M||||]Magnezone||choicescarf||thunderbolt,flashcannon,hiddenpowerfire,voltswitch|Timid|4,,,252,,252||,0,,30,,30|||]Latios||choicespecs||dracometeor,psychic,surf,defog|Timid|4,,,252,,252||,0,,,,|||]Clefable||leftovers|1|calmmind,thunderbolt,icebeam,softboiled|Bold|252,,248,8,,|F|,0,,,,|||]Keldeo||choicespecs||scald,hydropump,focusblast,hiddenpowergrass|Timid|,,4,252,,252||,0,,30,,|||0',

				'Hydreigon||choicespecs||dracometeor,darkpulse,fireblast,flashcannon|Timid|,,40,216,,252||,0,,,,|||]Jellicent||colburberry||willowisp,scald,recover,taunt|Bold|232,,252,,,24||,0,,,,|||]Heatran||leftovers||stealthrock,lavaplume,toxic,taunt|Calm|252,,,,212,44||,0,,,,|||]Keldeo||choicespecs||scald,hydropump,focusblast,hiddenpowergrass|Timid|,,4,252,,252||,0,,30,,|||]Metagross||metagrossite||zenheadbutt,earthquake,bulletpunch,pursuit|Jolly|,252,4,,,252|||||]Landorus-Therian||choicescarf||uturn,earthquake,stoneedge,knockoff|Jolly|,184,72,,,252|||||',

				'Alakazam||alakazite|magicguard|psychic,focusblast,shadowball,hiddenpowerice|Timid|,,4,252,,252|M|,0,30,,,|||]Manaphy||leftovers||surf,energyball,icebeam,tailglow|Modest|,,,252,4,252||,0,,,,|||]Tornadus-Therian||assaultvest||hurricane,uturn,superpower,knockoff|Hasty|224,32,,,,252|||||]Ferrothorn||leftovers||powerwhip,knockoff,spikes,leechseed|Impish|252,,44,,212,|||||]Heatran||leftovers||lavaplume,willowisp,stealthrock,taunt|Careful|240,,,,200,68|M|,0,,,,|||]Gliscor||toxicorb|H|earthquake,icefang,roost,swordsdance|Careful|244,,48,,140,76|||||',

				'Nidoking||lifeorb|H|earthpower,sludgewave,flamethrower,icebeam|Timid|,,,252,4,252||,0,,,,|||]Scizor||scizorite|lightmetal|swordsdance,bulletpunch,uturn,roost|Adamant|248,16,60,,124,60|M||||]Latios||lifeorb||calmmind,dracometeor,psyshock,roost|Timid|32,,,224,,252||,0,,,,|||]Rotom-Wash||leftovers||hydropump,voltswitch,willowisp,painsplit|Bold|252,,236,,20,||,0,,,,30|||]Tornadus-Therian||assaultvest||hurricane,knockoff,heatwave,uturn|Timid|248,,,8,,252|||||]Landorus-Therian||rockyhelmet||stealthrock,earthquake,stoneedge,uturn|Impish|248,,224,,28,8|||||',

				'Charizard||charizarditey||fireblast,solarbeam,focusblast,roost|Timid|,,,252,4,252||,0,,,,|||]Clefable||leftovers|1|stealthrock,moonblast,toxic,softboiled|Bold|248,,184,,76,||,0,,,,|||]Slowbro||leftovers|H|calmmind,scald,psyshock,slackoff|Bold|248,,216,,40,4||,0,,,,|||]Tyranitar||choicescarf||pursuit,crunch,stoneedge,superpower|Jolly|,252,4,,,252|||||]Excadrill||airballoon||swordsdance,earthquake,ironhead,rapidspin|Jolly|,252,,,4,252|||||]Keldeo||choicespecs||hydropump,scald,secretsword,hiddenpowergrass|Timid|,,,252,4,252||,0,,30,,|||',

				'Tyranitar||choiceband||stoneedge,crunch,pursuit,superpower|Adamant|156,252,,,,100|||||]Volcanion||choicespecs||steameruption,flamethrower,hiddenpowergrass,sludgebomb|Timid|,,,252,4,252||,0,,30,,|||]Latias||lifeorb||dracometeor,psyshock,defog,recover|Timid|72,,,184,,252||,0,,,,|||]Landorus-Therian||rockyhelmet||stealthrock,earthquake,uturn,smackdown|Impish|248,,228,,24,8|||||]Scizor||scizorite||bulletpunch,swordsdance,roost,superpower|Impish|248,48,104,,92,16|||||]Thundurus||lifeorb||thunderwave,thunderbolt,hiddenpowerice,knockoff|Naive|,4,,252,,252||,30,30,,,|||',

				'Clefable||leftovers|1|stealthrock,moonblast,thunderwave,softboiled|Sassy|248,,196,,64,|F|,0,,,,|||]Keldeo-Resolute||choicespecs||scald,hydropump,secretsword,focusblast|Timid|,,4,252,,252||,0,,,,|||]Scizor||scizorite||swordsdance,bulletpunch,uturn,roost|Impish|248,,252,,8,|M||||]Landorus-Therian||choicescarf||earthquake,stoneedge,knockoff,uturn|Jolly|72,240,,,,196|||||]Latios||lifeorb||dracometeor,surf,hiddenpowerfire,recover|Timid|,,,252,4,252||29,0,,30,,30|||]Tyranitar||choiceband||stoneedge,crunch,superpower,pursuit|Adamant|,252,4,,,252|M||||',

			],


			gen6ubers: [

				'Dialga||shucaberry||dracometeor,flashcannon,thunder,stealthrock|Modest|96,,,252,,160||,0,,,,|||]Groudon||redorb||precipiceblades,rockslide,swordsdance,thunderwave|Adamant|168,252,,,32,56|||||]Xerneas||powerherb||moonblast,rest,sleeptalk,geomancy|Modest|72,,100,252,,84||,0,,,,|||]Deoxys-Attack||lifeorb||psychoboost,superpower,knockoff,extremespeed|Rash|,4,,252,,252|||||]Arceus||lifeorb||extremespeed,shadowclaw,earthquake,swordsdance|Jolly|4,252,,,,252|||||]Salamence||salamencite|intimidate|facade,doubleedge,dragondance,roost|Adamant|200,132,,,,176|||||',

				'Gengar||gengarite|levitate|protect,focusblast,hex,willowisp|Timid|4,,,252,,252||,0,,,,|||]Groudon||redorb||stealthrock,precipiceblades,rockslide,thunderwave|Careful|248,,,,208,52|||||]Ho-Oh||choiceband|H|sacredfire,bravebird,earthquake,sleeptalk|Adamant|4,252,,,,252|||||]Giratina-Origin||griseousorb||hex,toxic,defog,thunderwave|Modest|,,252,216,,40|||||]Arceus-Water||splashplate||judgment,toxic,icebeam,recover|Bold|252,,200,,,56||,0,,,,|||]Klefki||leftovers||thunderwave,spikes,toxic,playrough|Careful|248,8,,,252,|||||',

				'Deoxys-Speed||focussash||taunt,skillswap,spikes,stealthrock|Timid|252,,4,,,252||,0,,,,|||]Salamence||salamencite||dragondance,doubleedge,facade,roost|Adamant|200,132,,,,176|||||]Arceus||lifeorb||swordsdance,extremespeed,shadowclaw,earthquake|Jolly|,252,4,,,252|||||]Darkrai||lifeorb||darkvoid,nastyplot,thunder,darkpulse|Timid|,,4,252,,252||,0,,,,|||]Groudon||redorb||precipiceblades,rockslide,swordsdance,rockpolish|Adamant|168,252,,,32,56|||||]Xerneas||powerherb||moonblast,rest,sleeptalk,geomancy|Modest|72,,100,252,,84||,0,,,,|||',

				'Gengar||gengarite|levitate|protect,hex,focusblast,willowisp|Timid|4,,,252,,252||,0,,,,|||]Cloyster||focussash|1|shellsmash,toxicspikes,iciclespear,rapidspin|Jolly|4,252,,,,252|||||]Rayquaza||choiceband||dragonascent,waterfall,vcreate,extremespeed|Jolly|,252,4,,,252|||||]Arceus-Ground||earthplate||swordsdance,earthquake,stoneedge,recover|Jolly|4,252,,,,252|||||]Groudon||redorb||stealthrock,precipiceblades,rocktomb,dragonclaw|Adamant|156,196,,,104,52|||||]Xerneas||powerherb||geomancy,moonblast,hiddenpowerrock,focusblast|Modest|,,200,252,,56||,,30,,30,30|||',

				'Deoxys-Attack||lifeorb||psychoboost,superpower,knockoff,extremespeed|Rash|,4,,252,,252|||||]Salamence||salamencite||dragondance,roost,facade,doubleedge|Adamant|200,132,,,,176|||||]Arceus||lifeorb||swordsdance,shadowclaw,earthquake,extremespeed|Jolly|,252,4,,,252|||||]Groudon||redorb||swordsdance,rockpolish,stoneedge,precipiceblades|Adamant|168,252,,,32,56|||||]Xerneas||powerherb||geomancy,sleeptalk,rest,moonblast|Modest|,,212,252,,44||,0,,,,|||]Dialga||shucaberry||stealthrock,toxic,flashcannon,dracometeor|Modest|4,,,252,,252||,0,,,,|||',

				'Deoxys-Speed||rockyhelmet||taunt,skillswap,spikes,stealthrock|Timid|252,,240,,,16||,0,,,,|||]Salamence||salamencite|intimidate|dragondance,roost,earthquake,doubleedge|Adamant|216,156,,,,136|||||]Arceus||lifeorb||swordsdance,extremespeed,stoneedge,earthquake|Jolly|,252,4,,,252|||||]Groudon||redorb||rockpolish,precipiceblades,stoneedge,swordsdance|Adamant|168,252,,,32,56|||||]Xerneas||powerherb||geomancy,moonblast,focusblast,hiddenpowerrock|Modest|,,208,252,,48||,,30,,30,30|||]Darkrai||lifeorb||darkvoid,nastyplot,darkpulse,sludgebomb|Timid|,,4,252,,252||,0,,,,|||',

				'Excadrill||airballoon||ironhead,swordsdance,earthquake,rapidspin|Adamant|4,252,,,,252|M||||]Salamence||salamencite|intimidate|dragondance,roost,facade,doubleedge|Adamant|80,252,,,,176|||||]Arceus||lifeorb||swordsdance,extremespeed,shadowclaw,recover|Adamant|192,252,,,,64|||||]Groudon||redorb||rockpolish,swordsdance,stoneedge,precipiceblades|Adamant|128,252,,,72,56|||||]Deoxys-Attack||lifeorb||psychoboost,icebeam,superpower,knockoff|Mild|,20,,252,,236|||||]Tyranitar||shucaberry||stealthrock,thunderwave,foulplay,rockslide|Careful|252,,108,,148,|||||',

				'Rayquaza||lifeorb||dracometeor,vcreate,extremespeed,dragonascent|Naive|,212,44,,,252|||||]Gengar||gengarite||hex,focusblast,destinybond,protect|Timid|,,4,252,,252||,0,,,,|||]Arceus||lifeorb||swordsdance,extremespeed,shadowclaw,recover|Adamant|80,252,,,,176|||||]Groudon||redorb||stealthrock,thunderwave,rockslide,precipiceblades|Careful|248,,,,248,12|||||]Klefki||leftovers||spikes,thunderwave,healblock,dazzlinggleam|Calm|252,,,96,160,||,0,,,,|||]Giratina-Origin||griseousorb||toxic,dracometeor,defog,hex|Modest|,,244,252,,12||,0,,,,|||',

				'Groudon||redorb|drought|stealthrock,precipiceblades,lavaplume,dragontail|Adamant|,248,,,176,84|||||]Latios||souldew||calmmind,dracometeor,psyshock,recover|Timid|,,,252,4,252||,0,,,,|||]Klefki||leftovers||spikes,thunderwave,toxic,playrough|Careful|248,8,,,252,|||S||]Salamence||salamencite|intimidate|dragondance,frustration,refresh,roost|Adamant|248,128,,,40,92|||||0]Giratina-Origin||griseousorb||dragontail,shadowsneak,shadowforce,defog|Adamant|40,200,252,,,16|||||]Arceus-Ground||earthplate||swordsdance,earthquake,stoneedge,recover|Jolly|,252,,,4,252|||||',

				'Giratina-Origin||griseousorb||hex,toxic,defog,thunderwave|Modest|,,252,216,,40|||||]Gengar||gengarite||protect,willowisp,hex,focusblast|Timid|,,4,252,,252||,0,,,,|||]Arceus||leftovers||extremespeed,shadowclaw,swordsdance,recover|Adamant|200,252,,,,56|||||]Groudon||redorb||stealthrock,thunderwave,rockslide,precipiceblades|Careful|248,,,,248,12|||||]Klefki||leftovers||thunderwave,spikes,toxic,playrough|Careful|248,8,,,252,|||||]Ho-Oh||choiceband|H|sacredfire,bravebird,earthquake,sleeptalk|Adamant|,252,4,,,252|||||',

				'Diancie||diancite|clearbody|moonblast,diamondstorm,earthpower,protect|Timid|,80,,252,,176|||||]Ho-Oh||choiceband|H|bravebird,sacredfire,earthquake,sleeptalk|Adamant|208,252,,,,48|||||]Lugia||leftovers|H|icebeam,toxic,whirlwind,roost|Bold|248,,124,,,136|||||]Arceus||splashplate||judgment,toxic,recover,defog|Timid|240,,252,,,16||,0,,,,|||]Latios||souldew||grassknot,dracometeor,psyshock,roost|Modest|8,,,252,,248|||||]Groudon||redorb||precipiceblades,lavaplume,roar,stealthrock|Careful|248,,,,252,8|||||',

				'Sableye||sablenite|H|fakeout,willowisp,foulplay,recover|Impish|252,,252,,4,|F||||]Ho-Oh||lifeorb|H|bravebird,sacredfire,earthquake,sleeptalk|Adamant|,252,4,,,252|||||]Klefki||leftovers||toxic,thunderwave,playrough,spikes|Careful|252,,4,,252,|M||||]Lugia||leftovers|H|toxic,icebeam,roost,whirlwind|Bold|248,,124,,,136||,0,,,,|||]Arceus-Water||splashplate||judgment,defog,toxic,recover|Bold|248,,244,,,16||,0,,,,|||]Groudon||redorb||stealthrock,precipiceblades,stoneedge,rest|Careful|248,,,,252,8|||||',

				'Sableye||sablenite|H|fakeout,willowisp,foulplay,recover|Careful|248,,8,,252,|M||||]Arceus-Water||splashplate||judgment,toxic,recover,defog|Bold|248,,136,,,124||,0,,,,|||]Lugia||leftovers|H|icebeam,toxic,roost,whirlwind|Bold|248,,124,,,136|||||]Blissey||leftovers||toxic,snatch,softboiled,aromatherapy|Calm|4,,252,,252,||,0,,,,|||]Tyranitar||leftovers||pursuit,stoneedge,stealthrock,rest|Careful|252,,4,,252,|M||||]Groudon||redorb||lavaplume,roar,rest,precipiceblades|Sassy|252,,,4,252,|||||',


			],


			gen6uu: [
				'Swampert||leftovers||stealthrock,earthquake,scald,roar|Relaxed|240,,248,,,20|||||]Tentacruel||blacksludge|1|rapidspin,toxicspikes,scald,acidspray|Timid|248,,160,,,100||,0,,,,|||]Krookodile||choiceband||earthquake,knockoff,pursuit,superpower|Jolly|,216,40,,,252|||||]Sylveon||choicespecs|H|hypervoice,psyshock,shadowball,hiddenpowerfire|Modest|,,4,252,,252||,0,,30,,30|||]Celebi||leftovers||nastyplot,gigadrain,psychic,shadowball|Timid|48,,,208,,252||,0,,,,|||]Aerodactyl||aerodactylite|unnerve|stoneedge,aerialace,earthquake,roost|Jolly|,252,4,,,252|||||',

				'Kyurem||choicespecs||dracometeor,icebeam,focusblast,dragonpulse|Modest|,,,252,4,252||,0,,,,|||]Reuniclus||leftovers|1|calmmind,psyshock,focusblast,recover|Bold|252,,252,,,4||,0,,,,|||]Tentacruel||blacksludge|1|toxicspikes,scald,haze,rapidspin|Bold|240,,240,,,28||,0,,,,|||]Bronzong||leftovers||stealthrock,ironhead,earthquake,toxic|Sassy|252,,88,,168,|||||]Conkeldurr||assaultvest||drainpunch,knockoff,thunderpunch,machpunch|Adamant|,244,,,248,16|||||]Swampert||swampertite|damp|raindance,waterfall,earthquake,icepunch|Jolly|32,252,,,,224|||||',

				'Mamoswine||lifeorb|H|iceshard,earthquake,iciclecrash,knockoff|Adamant|,252,4,,,252|||||]Hydreigon||choicescarf||dracometeor,uturn,darkpulse,fireblast|Timid|,,,252,4,252|||||]Toxicroak||lumberry|1|knockoff,drainpunch,gunkshot,swordsdance|Jolly|40,252,,,,216|||||]Whimsicott||choicespecs|1|energyball,moonblast,uturn,switcheroo|Timid|,,,252,4,252|||||]Slowking||leftovers|H|scald,psyshock,dragontail,slackoff|Bold|248,,252,8,,|||||]Forretress||leftovers|H|gyroball,voltswitch,stealthrock,rapidspin|Relaxed|252,,16,,240,||,,,,,0|||',

				'Doublade||eviolite||swordsdance,ironhead,shadowsneak,pursuit|Adamant|240,252,,,16,|||||]Whimsicott||leftovers||gigadrain,moonblast,encore,uturn|Timid|,,4,252,,252|||||]Cobalion||leftovers||stealthrock,closecombat,taunt,voltswitch|Jolly|144,112,,,,252|||||]Snorlax||leftovers|1|curse,bodyslam,rest,sleeptalk|Careful|144,,176,,188,|||||]Tentacruel||blacksludge|1|scald,rapidspin,toxicspikes,acidspray|Bold|248,,236,,,24||,0,,,,|||]Hydreigon||choicescarf||dracometeor,darkpulse,flamethrower,uturn|Timid|,,,252,4,252|||||',

				'Hydreigon||lifeorb||irontail,superpower,darkpulse,dracometeor|Naive|,56,,220,,232|||||]Whimsicott||expertbelt||encore,gigadrain,moonblast,shadowball|Timid|,,,252,4,252|||||]Lucario||lifeorb|H|swordsdance,bulletpunch,closecombat,extremespeed|Jolly|,252,,,4,252|||||]Swampert||swampertite|damp|stealthrock,waterfall,earthquake,icepunch|Adamant|40,252,,,,216|||||]Doublade||eviolite||swordsdance,pursuit,shadowsneak,ironhead|Adamant|232,252,,,8,16|||||]Crobat||skyplate|H|taunt,roost,uturn,bravebird|Jolly|,252,,,4,252|||||',

				'Hydreigon||choicespecs||uturn,dracometeor,darkpulse,flashcannon|Timid|,,,252,4,252|||||]Doublade||eviolite||swordsdance,shadowclaw,shadowsneak,ironhead|Adamant|240,252,,,,16|||||]Toxicroak||lifeorb|1|gunkshot,drainpunch,swordsdance,suckerpunch|Jolly|,252,,,4,252|||||]Swampert||swampertite|H|stealthrock,waterfall,earthquake,icepunch|Adamant|212,252,,,,44|||||]Cresselia||leftovers||thunderwave,psyshock,moonlight,lunardance|Bold|252,,252,,,4||,0,,,,|||]Whimsicott||pixieplate||stunspore,uturn,encore,moonblast|Timid|,,,252,4,252|||||',

				'Krookodile||rockyhelmet||stealthrock,taunt,knockoff,earthquake|Jolly|,252,4,,,252|||||]Haxorus||lifeorb|1|dragondance,earthquake,dragonclaw,irontail|Jolly|,252,,,4,252|||||]Metagross||lifeorb||grassknot,meteormash,hiddenpowerfire,explosion|Mild|,184,,144,,180||,30,,30,,30|||]Celebi||colburberry||nastyplot,gigadrain,dazzlinggleam,earthpower|Timid|,,,252,4,252||,0,,,,|||]Mienshao||choicescarf|H|highjumpkick,uturn,stoneedge,knockoff|Jolly|,252,,,4,252|||||]Swampert||swampertite|H|raindance,poweruppunch,earthquake,waterfall|Adamant|,252,,,4,252|||||',

				'Cresselia||leftovers||calmmind,psyshock,moonlight,moonblast|Bold|252,,160,,,96||,0,,,,|||]Whimsicott||pixieplate||moonblast,encore,uturn,energyball|Timid|,,,252,4,252|||||]Nidoqueen||lifeorb|H|stealthrock,earthpower,sludgewave,icebeam|Modest|,,4,252,,252||,0,,,,|||]Blastoise||blastoisinite||darkpulse,aurasphere,rapidspin,hydropump|Modest|104,,,252,,152||,0,,,,|||]Cobalion||shucaberry||swordsdance,closecombat,ironhead,xscissor|Jolly|,252,,,4,252|||||]Haxorus||lumberry|1|dragondance,earthquake,outrage,poisonjab|Adamant|,252,,,4,252|||||',

				'Sceptile||sceptilite|overgrow|gigadrain,dragonpulse,leafstorm,hiddenpowerfire|Timid|,,,252,4,252||,0,,30,,30|||]Swampert||leftovers||stealthrock,scald,earthquake,roar|Relaxed|236,,248,,,24|||||]Cobalion||shucaberry||swordsdance,closecombat,ironhead,stoneedge|Jolly|,252,4,,,252|||||]Gardevoir||choicespecs|1|psyshock,moonblast,focusblast,trick|Timid|,,,252,4,252||,0,,,,|||]Snorlax||choiceband|1|return,earthquake,pursuit,facade|Adamant|,252,,,240,16|||||]Crobat||sharpbeak|H|bravebird,uturn,defog,roost|Jolly|,252,,,4,252|||||',

				'Swampert||leftovers||stealthrock,earthquake,scald,roar|Relaxed|240,,248,,,20|||||]Forretress||leftovers|H|spikes,rapidspin,heavyslam,voltswitch|Relaxed|248,,16,,244,|||||]Sylveon||leftovers|H|wish,protect,hypervoice,healbell|Bold|248,,244,,16,||,0,,,,|||]Celebi||leftovers||nastyplot,gigadrain,psychic,shadowball|Timid|48,,,208,,252||,0,,,,|||]Conkeldurr||leftovers||bulkup,drainpunch,knockoff,machpunch|Adamant|248,16,,,244,|||||]Aerodactyl||aerodactylite||stoneedge,aerialace,pursuit,roost|Jolly|,252,,,4,252|||||',

				'Aerodactyl||focussash|1|taunt,stealthrock,doubleedge,fireblast|Hasty|,176,,80,,252|||||]Cobalion||lumberry||swordsdance,closecombat,ironhead,rockpolish|Jolly|,252,,,4,252|||||]Hydreigon||lifeorb||dracometeor,darkpulse,superpower,irontail|Naive|,4,,252,,252|||||]Swampert||swampertite|damp|raindance,earthquake,waterfall,icepunch|Adamant|80,252,,,,176|||||]Gyarados||lumberry||dragondance,waterfall,bounce,earthquake|Jolly|,252,,,4,252|||||]Metagross||expertbelt||meteormash,earthquake,thunderpunch,bulletpunch|Adamant|,252,4,,,252|||||',

				'Aerodactyl||aerodactylite|rockhead|roost,pursuit,earthquake,stoneedge|Jolly|252,160,,,,96|||||]Florges||leftovers||calmmind,aromatherapy,moonblast,synthesis|Calm|252,,232,,24,|||||]Jellicent||leftovers||scald,willowisp,recover,taunt|Timid|248,,112,,,148|||||]Slowking||leftovers|H|scald,slackoff,psyshock,calmmind|Bold|252,,252,4,,|||||]Cobalion||shucaberry||closecombat,ironhead,swordsdance,stealthrock|Jolly|,252,,,4,252|||||]Gligar||eviolite||defog,uturn,earthquake,roost|Impish|252,,12,,244,||,,,,,30|||',

				'Mienshao||choiceband|H|highjumpkick,uturn,poisonjab,knockoff|Jolly|,252,,,4,252|||||]Swampert||swampertite|H|raindance,waterfall,earthquake,icepunch|Adamant|,252,,,4,252|||||]Hydreigon||lifeorb||dracometeor,darkpulse,roost,flashcannon|Timid|,,,252,4,252||,0,,,,|||]Whimsicott||leftovers||encore,stunspore,moonblast,uturn|Bold|248,,252,,,8|||S||]Crobat||skyplate|H|bravebird,uturn,defog,taunt|Jolly|,252,,,4,252|||||]Empoleon||shucaberry||stealthrock,scald,icebeam,grassknot|Modest|212,,,252,,44||,0,,,,|||',

				'Crawdaunt||lifeorb|H|crabhammer,knockoff,aquajet,swordsdance|Jolly|,252,,,4,252|||||]Entei||choiceband||sacredfire,stoneedge,flareblitz,extremespeed|Adamant|,252,,,4,252|||S||]Aerodactyl||aerodactylite||stoneedge,aerialace,earthquake,honeclaws|Jolly|,252,,,4,252|||||]Sylveon||leftovers|H|hypervoice,wish,protect,healbell|Bold|248,,244,,,16||,0,,,,|||]Tentacruel||blacksludge||scald,toxicspikes,icebeam,rapidspin|Timid|240,,76,,,192||,0,,,,|||]Cobalion||shucaberry||stealthrock,ironhead,closecombat,swordsdance|Jolly|,252,,,4,252|||||',

				'Beedrill||beedrillite||protect,uturn,poisonjab,drillrun|Jolly|,252,,,4,252|||||]Entei||choiceband||sacredfire,extremespeed,stoneedge,flareblitz|Adamant|,252,4,,,252|||S||]Gligar||eviolite|H|stealthrock,earthquake,uturn,roost|Impish|240,,24,,244,|||||]Empoleon||leftovers||stealthrock,scald,defog,knockoff|Calm|248,,76,,184,|||||]Rotom-Mow||choicescarf||leafstorm,thunderbolt,voltswitch,trick|Timid|,,,252,4,252||,0,,,,|||]Cresselia||leftovers||calmmind,psyshock,moonblast,moonlight|Bold|232,,180,,,96||,0,,,,|||',

				'Forretress||leftovers||stealthrock,voltswitch,rapidspin,spikes|Calm|232,,72,,200,4|||||]Doublade||eviolite||shadowclaw,shadowsneak,gyroball,swordsdance|Brave|248,252,,,8,||,,,,,0|||]Hydreigon||lifeorb||darkpulse,dracometeor,roar,roost|Timid|,,,252,4,252|||||]Swampert||swampertite||waterfall,earthquake,icepunch,raindance|Adamant|,252,,,4,252|||||]Mienshao||choicescarf|H|highjumpkick,uturn,knockoff,stoneedge|Jolly|,252,,,4,252|||||]Venomoth||lumberry|1|bugbuzz,roost,quiverdance,substitute|Timid|112,,,144,,252|||||',

				'Empoleon||leftovers||scald,stealthrock,roar,defog|Calm|252,,,4,252,||,0,,,,|||]Arcanine||leftovers||flareblitz,extremespeed,willowisp,morningsun|Impish|248,,196,,,64|||||]Crobat||choiceband|H|bravebird,uturn,sleeptalk|Jolly|,252,,,4,252|||||]Conkeldurr||leftovers||drainpunch,knockoff,machpunch,bulkup|Careful|252,,,,212,44|||||]Hydreigon||choicespecs||darkpulse,dracometeor,flashcannon,uturn|Timid|,,,252,4,252|||||]Aggron||aggronite|sturdy|heavyslam,curse,rest,sleeptalk|Careful|252,,,,252,4|||||',

				'Tornadus||lifeorb||hurricane,heatwave,superpower,tailwind|Hasty|,4,,252,,252|||||]Krookodile||choiceband||knockoff,earthquake,pursuit,superpower|Jolly|,252,4,,,252|||||]Mienshao||choicescarf|H|knockoff,highjumpkick,uturn,stoneedge|Jolly|,252,,,4,252|||||]Blastoise||blastoisinite||scald,darkpulse,rapidspin,aurasphere|Modest|144,,,252,,112||,0,,,,|||]Roserade||lifeorb||gigadrain,sludgebomb,leafstorm,sleeppowder|Timid|,,,252,4,252||,0,,,,|||]Metagross||lifeorb||meteormash,explosion,bulletpunch,stealthrock|Adamant|,252,,,4,252|||S||',

				'Arcanine||leftovers||morningsun,flareblitz,willowisp,extremespeed|Impish|248,,244,,,16|||||]Xatu||leftovers|H|roost,haze,psyshock,nightshade|Calm|248,,,,244,16||,0,,,,|||]Forretress||leftovers|H|stealthrock,gyroball,rapidspin,painsplit|Relaxed|252,4,252,,,||,,,,,0|||]Blissey||leftovers||softboiled,toxic,aromatherapy,seismictoss|Calm|192,,252,,56,8||,0,,,,|||]Chesnaught||leftovers|H|synthesis,woodhammer,spikyshield,drainpunch|Impish|248,,252,,,8|||||]Swampert||swampertite||rest,sleeptalk,scald,earthquake|Sassy|248,,,,252,8|||||',

				'Cobalion||leftovers||closecombat,ironhead,voltswitch,stealthrock|Jolly|,252,,,4,252|||||]Escavalier||leftovers|H|ironhead,megahorn,drillrun,swordsdance|Adamant|248,56,,,204,|||||]Crobat||blacksludge|H|bravebird,defog,roost,taunt|Jolly|,252,,,4,252|||||]Milotic||leftovers||recover,scald,toxic,haze|Calm|240,,252,,16,||,0,,,,|||]Sceptile||sceptilite||dragonpulse,gigadrain,focusblast,leafstorm|Timid|,,,252,4,252||,0,,,,|||]Mamoswine||lifeorb|H|knockoff,earthquake,iceshard,iciclecrash|Adamant|,252,,,,252|||||',

				'Krookodile||rockyhelmet||stealthrock,knockoff,earthquake,taunt|Jolly|8,248,,,,252|||||]Entei||choiceband||sacredfire,flareblitz,extremespeed,stoneedge|Adamant|,252,,,4,252|||S||]Tentacruel||blacksludge||rapidspin,hydropump,icebeam,acidspray|Timid|116,,,200,,192||,0,,,,|||]Celebi||leftovers||nastyplot,gigadrain,psychic,dazzlinggleam|Timid|48,,,208,,252||,0,,,,|||]Cobalion||shucaberry||swordsdance,closecombat,ironhead,xscissor|Jolly|,252,,,4,252|||||]Aerodactyl||aerodactylite||honeclaws,stoneedge,wingattack,earthquake|Jolly|,252,,,4,252|||||',

				'Entei||choiceband||sacredfire,flareblitz,stoneedge,extremespeed|Adamant|,252,,,4,252|||S||]Conkeldurr||leftovers||knockoff,drainpunch,bulkup,machpunch|Adamant|252,16,,,240,|||||]Sceptile||sceptilite||gigadrain,dragonpulse,leafstorm,hiddenpowerbug|Modest|,,,252,4,252||,0,30,,30,|||]Swampert||leftovers||scald,earthquake,roar,stealthrock|Relaxed|248,,252,,,8|||||]Crobat|||H|taunt,acrobatics,roost,defog|Jolly|248,116,,,,144|||||]Sylveon||leftovers|H|wish,protect,healbell,hypervoice|Bold|248,,252,,,8||,0,,,,||||',


			],


			gen6ru: [

				'Alomomola||leftovers|H|wish,protect,scald,knockoff|Bold|120,,136,,252,|||||]Registeel||leftovers||seismictoss,stealthrock,toxic,thunderwave|Calm|252,,,24,232,|||||]Flygon||leftovers||defog,roost,earthquake,uturn|Jolly|112,144,,,,252|||||]Braviary||leftovers|H|substitute,bulkup,bravebird,roost|Careful|248,,,,100,160|||||]Granbull||leftovers||playrough,earthquake,healbell,roar|Impish|248,8,252,,,|||||]Drapion||choicescarf|1|knockoff,poisonjab,pursuit,earthquake|Adamant|,252,4,,,252|||||',

				'Rotom||leftovers||thunderbolt,willowisp,hex,substitute|Timid|80,,,176,,252||,0,,,,|||]Weezing||blacksludge||taunt,toxicspikes,willowisp,sludgebomb|Bold|252,,32,,224,||,0,,,,|||]Steelix||leftovers|1|stealthrock,roar,heavyslam,earthquake|Careful|252,,,,252,4|||||]Delphox||lifeorb||calmmind,grassknot,psychic,fireblast|Timid|,,,252,4,252||29,0,,,,|||]Blastoise||leftovers||rapidspin,refresh,scald,toxic|Calm|248,,,,188,72||,0,,,,|||]Drapion||choicescarf||pursuit,knockoff,poisonjab,brickbreak|Adamant|,252,,,4,252|||||',

				'Gallade||lifeorb|H|swordsdance,closecombat,zenheadbutt,knockoff|Jolly|,252,4,,,252|||||]Scrafty||lifeorb||dragondance,highjumpkick,knockoff,ironhead|Jolly|,252,4,,,252|||||]Bronzong||leftovers||stealthrock,gyroball,toxic,earthquake|Sassy|252,,72,,184,||,,,,,0|||]Qwilfish||blacksludge|H|spikes,taunt,scald,thunderwave|Timid|252,,200,,,56|||||]Malamar||leftovers||superpower,knockoff,rest,sleeptalk|Jolly|248,,,,108,152|||||]Flygon||choicescarf||earthquake,uturn,outrage,aerialace|Jolly|,252,4,,,252|||||',

				'Banette||banettite||knockoff,willowisp,shadowclaw,destinybond|Adamant|228,252,,,,28|||||]Meloetta||choicespecs||hypervoice,psychic,focusblast,uturn|Timid|,,4,252,,252|||||]Poliwrath||leftovers||circlethrow,scald,rest,sleeptalk|Relaxed|252,,252,,4,|||||]Registeel||leftovers||seismictoss,stealthrock,toxic,protect|Calm|252,,,24,232,|||||]Garbodor||rockyhelmet|H|spikes,toxicspikes,gunkshot,toxic|Impish|252,,164,,92,|||||]Virizion||lumberry||swordsdance,closecombat,leafblade,stoneedge|Jolly|,252,4,,,252|||||',

				'Venusaur||blacksludge||gigadrain,sludgebomb,synthesis,hiddenpowerfire|Modest|248,,,92,,168|F|,2,,30,,30|||]Diancie||leftovers||stealthrock,moonblast,diamondstorm,healbell|Sassy|252,,40,,216,|||||]Alomomola||leftovers|H|wish,scald,toxic,protect|Bold|120,,136,,252,|F|,0,,,,|||]Flygon||leftovers||defog,uturn,earthquake,roost|Jolly|248,8,,,,252|M||||]Scrafty||choiceband|H|highjumpkick,knockoff,ironhead,drainpunch|Adamant|156,252,,,,100|M||||]Fletchinder|||H|willowisp,roost,acrobatics,swordsdance|Adamant|152,248,76,,28,4|F||||',

				'Virizion||lumberry||swordsdance,closecombat,leafblade,zenheadbutt|Jolly|,252,4,,,252|||||]Houndoom||lifeorb|1|pursuit,suckerpunch,fireblast,crunch|Hasty|,220,,36,,252|||||]Escavalier||choiceband|H|megahorn,ironhead,knockoff,drillrun|Adamant|172,252,,,,84|||||]Uxie||colburberry||stealthrock,psychic,grassknot,thunderwave|Modest|,,112,252,144,||,0,,,,|||]Qwilfish||blacksludge|H|spikes,taunt,scald,thunderwave|Timid|252,,200,,,56|||||]Flygon||choicescarf||outrage,earthquake,uturn,defog|Adamant|,252,4,,,252|||||',

				'Flygon||leftovers||defog,roost,earthquake,uturn|Careful|252,,40,,108,108|||||]Magneton||choicespecs|H|hiddenpowerwater,thunderbolt,voltswitch,flashcannon|Modest|,,,252,4,252||,0,30,30,,|||]Diancie||leftovers||stealthrock,moonblast,healbell,diamondstorm|Sassy|232,4,20,,252,|||||]Slowking||leftovers|H|scald,slackoff,dragontail,thunderwave|Bold|252,,252,,,4|||||]Venusaur||blacksludge||leechseed,gigadrain,sludgebomb,synthesis|Bold|252,,240,,12,4||,0,,,,|||]Scyther||choiceband|1|uturn,pursuit,knockoff,aerialace|Jolly|,252,,,4,252|||S||',

				'Escavalier||leftovers|H|protect,megahorn,drillrun,swordsdance|Adamant|248,16,12,,232,|M||||]Diancie||leftovers||stealthrock,moonblast,healbell,diamondstorm|Relaxed|248,,164,,96,|||S||]Sigilyph||flameorb|1|airslash,roost,psychoshift,calmmind|Timid|252,,4,,,252|M||||]Poliwrath||leftovers||substitute,focuspunch,waterfall,toxic|Adamant|248,172,,,20,68|M||||]Fletchinder|||H|swordsdance,acrobatics,willowisp,roost|Adamant|152,244,76,,28,8|M||||]Flygon||leftovers||uturn,earthquake,roost,defog|Careful|168,,28,,204,108|M||S||',


				'Abomasnow||lifeorb||blizzard,gigadrain,iceshard,focusblast|Mild|,4,,252,,252|||||]Slowking||leftovers|H|scald,slackoff,calmmind,psyshock|Bold|248,,252,,,8|||||]Flygon||leftovers||earthquake,uturn,defog,roost|Jolly|222,,70,,,216|||||]Meloetta||choicespecs||hypervoice,psychic,focusblast,uturn|Timid|,,4,252,,252|||||]Emboar||choicescarf|H|flareblitz,superpower,wildcharge,sleeptalk|Jolly|,252,4,,,252|||||]Diancie||leftovers||stealthrock,moonblast,diamondstorm,healbell|Sassy|252,,40,,216,|||||',

				'Absol||lifeorb|H|irontail,suckerpunch,knockoff,superpower|Adamant|4,252,,,,252|M||||]Uxie||colburberry||thunderwave,psyshock,healbell,stealthrock|Timid|252,,120,,,136||,0,,,,|||]Emboar||choicescarf|H|wildcharge,superpower,suckerpunch,flareblitz|Jolly|,252,4,,,252|||||]Flygon||leftovers||roost,defog,earthquake,uturn|Jolly|252,4,,,,252|||||]Golbat||eviolite||roost,bravebird,taunt,uturn|Impish|252,,176,,80,|M||||]Slowking||rockyhelmet|H|scald,slackoff,toxic,psyshock|Bold|252,,168,,88,||,0,,,,|||',

				'Rhyperior||choiceband|1|stoneedge,megahorn,earthquake,icepunch|Adamant|36,252,,,,220|||||]Uxie||leftovers||stealthrock,uturn,psyshock,knockoff|Calm|252,,,,64,192|||||]Drapion||shucaberry|1|swordsdance,knockoff,poisonjab,aquatail|Jolly|,252,4,,,252|||||]Blastoise||leftovers||rapidspin,scald,refresh,toxic|Bold|252,,204,,,52||,0,,,,|||]Jolteon||choicespecs||thunderbolt,voltswitch,shadowball,hiddenpowerice|Timid|,,,252,4,252||,0,30,,,|||]Venusaur||blacksludge||leechseed,gigadrain,sludgebomb,synthesis|Bold|252,,196,,,60||,0,,,,|||',


			],


			gen6nu: [
				'Bronzor||eviolite||stealthrock,toxic,rest,psywave|Calm|252,,4,,252,||,0,,,,|||]Audino||audinite|1|wish,protect,dazzlinggleam,healbell|Calm|252,,,48,208,|||||]Gourgeist-Super||colburberry|1|willowisp,foulplay,leechseed,synthesis|Careful|248,,180,,80,|||S||]Skuntank||blacksludge|1|fireblast,darkpulse,defog,hiddenpowergrass|Modest|,,,252,112,144||,0,,30,,|S||]Weezing||blacksludge||toxicspikes,sludgebomb,willowisp,taunt|Bold|252,,148,,,108|||||]Sliggoo||eviolite||dragonbreath,rest,sleeptalk,icebeam|Calm|248,,168,,92,||,0,,,,|S||',

				'Samurott||rindoberry||swordsdance,waterfall,megahorn,aquajet|Adamant|4,252,,,,252|||||]Garbodor||rockyhelmet|H|gunkshot,spikes,toxicspikes,drainpunch|Impish|252,,200,,,56||,0,,,,|||]Rotom||colburberry||willowisp,painsplit,hex,voltswitch|Timid|252,,4,,,252||,0,,,,|||]Xatu||rockyhelmet|H|psyshock,calmmind,signalbeam,roost|Timid|252,,240,,,16|||||]Clefairy||eviolite|1|softboiled,stealthrock,knockoff,moonblast|Calm|252,,,4,252,|||||]Hariyama||assaultvest||closecombat,knockoff,fakeout,bulletpunch|Adamant|,252,,,156,100|||||',

				'Vivillon||focussash|1|quiverdance,hurricane,sleeppowder,energyball|Timid|,,4,252,,252||,0,,,,|||]Jynx||focussash|H|nastyplot,icebeam,psyshock,lovelykiss|Timid|,,,252,4,252||,0,,,,|||]Xatu||rockyhelmet|H|psyshock,grassknot,roost,uturn|Timid|252,,200,,,56|||||]Tauros||lifeorb|H|rockclimb,earthquake,pursuit,fireblast|Naive|,252,,4,,252|||||]Steelix||custapberry|1|stealthrock,heavyslam,earthquake,stoneedge|Adamant|172,252,,,,84|||||]Samurott||wacanberry||swordsdance,waterfall,megahorn,aquajet|Adamant|4,252,,,,252|||||',

				'Omastar||choicespecs||scald,icebeam,hydropump,earthpower|Modest|,,4,252,,252|||||]Ludicolo||lifeorb||hydropump,icebeam,gigadrain,raindance|Modest|,,,252,4,252|||||]Mesprit||damprock||stealthrock,raindance,uturn,psychic|Bold|248,,240,,,20|||||]Liepard||damprock|H|raindance,uturn,encore,knockoff|Jolly|252,4,,,,252|||||]Poliwrath||sitrusberry|H|brickbreak,icepunch,waterfall,bellydrum|Adamant|96,252,,,,160|||||]Rotom-Fan||choicescarf||voltswitch,airslash,trick,willowisp|Timid|,,,252,4,252|||||',

				'Tauros||lifeorb|H|rockclimb,earthquake,fireblast,workup|Naive|,252,,4,,252|||||]Mesprit||choicespecs||psychic,icebeam,signalbeam,healingwish|Modest|,,4,252,,252||,0,,,,|||]Steelix||leftovers|1|stealthrock,heavyslam,earthquake,toxic|Adamant|244,96,,,164,|||||]Pelipper||leftovers||scald,hurricane,defog,roost|Bold|248,,156,,104,||,0,,,,|||]Magmortar||assaultvest|H|fireblast,thunderbolt,hiddenpowergrass,earthquake|Modest|96,,,252,,160||,30,,30,,|||]Hariyama||assaultvest|1|closecombat,knockoff,bulletpunch,stoneedge|Adamant|,252,,,204,52|||||',

				'Tauros||lifeorb|H|rockclimb,earthquake,fireblast,pursuit|Naive|,252,,4,,252|||||]Mesprit||choicespecs||psychic,icebeam,shadowball,uturn|Timid|,,,252,4,252||,0,,,,|||]Rhydon||eviolite||earthquake,rockblast,megahorn,stealthrock|Adamant|252,16,,,240,|||||]Lilligant||lifeorb||gigadrain,naturepower,sleeppowder,quiverdance|Timid|,,,252,4,252||,0,,,,|||]Skuntank||lumberry|1|explosion,suckerpunch,pursuit,poisonjab|Adamant|4,252,,,168,84|||||]Hariyama||assaultvest||closecombat,knockoff,earthquake,bulletpunch|Adamant|,252,,,172,84|||||',

				'Vileplume||blacksludge|H|sludgebomb,gigadrain,hiddenpowerfire,synthesis|Modest|204,,,248,,56||,0,,30,,30|||]Tauros||lifeorb|H|rockclimb,earthquake,fireblast,pursuit|Naive|,252,,4,,252|||||]Rhydon||eviolite||rockblast,earthquake,stealthrock,megahorn|Adamant|248,16,,,244,|||||]Lanturn||assaultvest||scald,voltswitch,hiddenpowerfire,icebeam|Modest|,,,252,132,124||,0,,30,,30|||]Mesprit||choicescarf||psychic,uturn,healingwish,icebeam|Timid|,,,252,4,252|||||]Gurdurr||eviolite||knockoff,drainpunch,machpunch,bulkup|Adamant|252,192,64,,,|||||',

				'Mesprit||choicespecs||psychic,icebeam,signalbeam,healingwish|Modest|,,4,252,,252||,0,,,,|||]Pelipper||leftovers||scald,roost,uturn,defog|Bold|248,,156,,104,|||||]Regirock||leftovers||stealthrock,stoneedge,thunderwave,earthquake|Impish|252,184,16,,56,|||||]Skuntank||lumberry|1|suckerpunch,pursuit,poisonjab,taunt|Adamant|,232,,,132,144|||||]Tauros||lifeorb|H|rockclimb,fireblast,zenheadbutt,earthquake|Naive|,252,,4,,252|||||]Hariyama||assaultvest|1|closecombat,knockoff,bulletpunch,earthquake|Adamant|,252,,,184,72|||||',

				'Tauros||lifeorb|H|rockclimb,irontail,earthquake,fireblast|Naive|,252,,4,,252|||||]Lanturn||leftovers||scald,toxic,voltswitch,healbell|Calm|40,,152,,208,108||,0,,,,|||]Scyther||eviolite|1|uturn,aerialace,swordsdance,roost|Jolly|248,8,,,,252|||||]Claydol||colburberry||earthpower,rapidspin,psyshock,shadowball|Timid|,,4,252,,252||,0,,,,|||]Regirock||leftovers||stealthrock,rockslide,counter,thunderwave|Impish|240,,16,,252,|||||]Vileplume||blacksludge|H|gigadrain,hiddenpowerfire,sludgebomb,synthesis|Bold|252,,252,,4,||,30,,30,,30|||',

				'Lilligant||choicescarf|1|leafstorm,gigadrain,healingwish,hiddenpowerrock|Timid|,,,252,4,252||,1,30,,30,30|||]Pelipper||leftovers||defog,scald,uturn,roost|Impish|248,,252,,8,|||||]Steelix||leftovers|1|stealthrock,earthquake,heavyslam,toxic|Adamant|248,88,,,172,|||||]Tauros||lifeorb|H|rockclimb,earthquake,pursuit,fireblast|Naive|,252,,4,,252|||||]Malamar||leftovers||superpower,knockoff,rest,sleeptalk|Careful|248,,,,244,16|||||]Clefairy||eviolite|1|calmmind,thunderwave,moonblast,softboiled|Calm|252,,8,,248,||,0,,,,|S||',

				'Tauros||lifeorb|H|rockclimb,irontail,fireblast,earthquake|Naive|,252,,4,,252|||||]Grumpig||colburberry||calmmind,psyshock,signalbeam,focusblast|Modest|,,,252,4,252||,0,,,,|||]Steelix||leftovers|1|stealthrock,heavyslam,earthquake,toxic|Adamant|244,128,,,128,8|||||]Hitmonchan||lifeorb|1|drainpunch,machpunch,icepunch,rapidspin|Adamant|,252,4,,,252|||||]Vileplume||blacksludge|H|gigadrain,sludgebomb,moonlight,hiddenpowerfire|Bold|248,,252,,8,||,0,,30,,30|||]Lanturn||leftovers||scald,voltswitch,signalbeam,healbell|Calm|40,,,152,208,108||,0,,,,|||',

				'Hitmonchan||lifeorb|1|drainpunch,machpunch,rapidspin,icepunch|Jolly|,252,,,4,252|||||]Jynx||leftovers|H|icebeam,lovelykiss,nastyplot,substitute|Timid|,,,252,4,252||,0,,,,|||]Garbodor||rockyhelmet|H|drainpunch,gunkshot,toxicspikes,spikes|Impish|200,,252,,,56|||||]Rhydon||eviolite||earthquake,megahorn,stealthrock,stoneedge|Adamant|252,16,,,240,|||||]Swellow||choicespecs|H|boomburst,heatwave,uturn,sleeptalk|Timid|,,,252,4,252|||||]Lanturn||assaultvest||scald,voltswitch,icebeam,signalbeam|Modest|,,,240,144,124||,0,,,,|||',

				'Omastar||shucaberry|1|shellsmash,icebeam,hydropump,earthpower|Modest|,,4,252,,252|||||]Shiftry||lifeorb||defog,leafstorm,suckerpunch,knockoff|Lonely|,252,,4,,252|||||]Mismagius||colburberry||taunt,hex,willowisp,memento|Timid|252,,4,,,252|||||]Mesprit||colburberry||stealthrock,icebeam,psychic,signalbeam|Timid|,,4,252,,252|||||]Magmortar||assaultvest|H|fireblast,thunderbolt,hiddenpowergrass,earthquake|Mild|64,,,252,,192||,30,,30,,|||]Tauros||lifeorb|H|rockclimb,earthquake,fireblast,irontail|Naive|,252,,4,,252|||||',

				'Archeops||focussash||stealthrock,headsmash,endeavor,taunt|Jolly|,252,4,,,252|||||]Garbodor||normalgem|1|gunkshot,explosion,spikes,toxicspikes|Jolly|,252,4,,,252|||||]Kangaskhan||silkscarf|1|fakeout,doubleedge,earthquake,suckerpunch|Adamant|,252,4,,,252|||||]Samurott||lumberry||waterfall,megahorn,aquajet,swordsdance|Adamant|,252,4,,,252|||||]Rotom||choicescarf||voltswitch,thunderbolt,trick,shadowball|Timid|,,,252,4,252||,0,,,,|||]Lilligant||miracleseed||quiverdance,hiddenpowerfire,sleeppowder,gigadrain|Timid|,,,252,4,252||,0,,30,,30|||',


				'Mesprit||colburberry||psychic,uturn,stealthrock,healingwish|Bold|252,,240,,,16|||||]Rotom||spelltag||hex,shadowball,voltswitch,willowisp|Timid|,,4,252,,252||,0,,,,|||]Garbodor||rockyhelmet|H|gunkshot,drainpunch,spikes,toxicspikes|Impish|252,,200,,,56|||||]Combusken||lifeorb|H|fireblast,focusblast,hiddenpowerelectric,protect|Timid|,,,252,4,252||,1,,30,,|||]Lanturn||leftovers||scald,voltswitch,healbell,thunderwave|Calm|40,,136,16,208,108||,0,,,,|||]Shiftry||lifeorb||knockoff,seedbomb,suckerpunch,swordsdance|Adamant|,252,,,4,252|||||',

				'Torterra||lumberry||rockpolish,stoneedge,woodhammer,earthquake|Adamant|,252,4,,,252|||||]Mesprit||choicespecs||shadowball,icebeam,signalbeam,psychic|Timid|,,,252,4,252||,0,,,,|||]Regirock||chopleberry||thunderwave,stealthrock,stoneedge,counter|Impish|252,184,16,,56,|||||]Hariyama||assaultvest||bulletpunch,closecombat,knockoff,earthquake|Adamant|,252,,,232,24|||||]Weezing||rockyhelmet||taunt,painsplit,willowisp,sludgebomb|Bold|252,,148,,,108||,0,,,,|||]Shiftry||choicescarf|1|leafblade,knockoff,rockslide,defog|Adamant|,252,,,4,252|||||',


				'Liepard||damprock|H|raindance,knockoff,uturn,encore|Jolly|252,,4,,,252|||||]Mesprit||damprock||raindance,psychic,uturn,stealthrock|Bold|252,,240,,,16|||||]Ludicolo||lifeorb||hydropump,gigadrain,icebeam,raindance|Timid|,,,252,4,252||29,0,,,,|||]Omastar||lifeorb||shellsmash,surf,icebeam,hiddenpowergrass|Timid|,,4,252,,252||,0,,30,,|||]Kabutops||lifeorb||superpower,waterfall,aquajet,stoneedge|Adamant|,252,4,,,252||29,,,,,|||]Garbodor||rockyhelmet|H|spikes,gunkshot,toxicspikes,drainpunch|Jolly|56,200,,,,252|||||',


			],


			gen6pu: [

				'Articuno||leftovers||icebeam,hurricane,substitute,roost|Timid|,,4,252,,252||,0,,,,|S||]Muk||blacksludge|1|poisonjab,curse,sleeptalk,rest|Careful|252,,8,,236,12|||||]Probopass||airballoon|1|flashcannon,earthpower,voltswitch,stealthrock|Modest|80,,,252,,176||,0,,,,|||]Lumineon||leftovers|1|scald,uturn,toxic,defog|Bold|244,,188,,,76|||||]Grumpig||choicescarf||psychic,focusblast,shadowball,trick|Timid|,,4,252,,252||,0,,,,|||]Leafeon||yacheberry||leafblade,knockoff,swordsdance,synthesis|Jolly|,252,4,,,252|||||',

				'Muk||blacksludge|1|curse,rest,sleeptalk,poisonjab|Careful|252,,12,,244,|||||]Probopass||airballoon|1|taunt,flashcannon,earthpower,voltswitch|Modest|172,,,252,,84||,0,,,,|||]Leafeon||yacheberry|H|swordsdance,leafblade,knockoff,synthesis|Jolly|,252,,,4,252|||||]Vullaby||eviolite|1|roost,defog,foulplay,uturn|Impish|248,,252,,8,|||||]Clefairy||eviolite|1|stealthrock,softboiled,moonblast,thunderwave|Calm|252,,,4,252,||,0,,,,|||]Mr. Mime||choicescarf||dazzlinggleam,psychic,focusblast,healingwish|Timid|,,,252,4,252||,0,,,,|||',

				'Stoutland||choiceband|H|frustration,facade,pursuit,superpower|Jolly|4,252,,,,252|||||0]Mr. Mime||twistedspoon||psyshock,nastyplot,dazzlinggleam,focusblast|Timid|,,,252,4,252||,0,,,,|||]Muk||blacksludge|1|rest,sleeptalk,poisonjab,curse|Careful|252,,,,252,4|||||]Zebstrika||lifeorb||voltswitch,thunderbolt,overheat,hiddenpowergrass|Timid|,,,252,4,252||,0,,30,,|||]Probopass||airballoon|1|flashcannon,earthpower,voltswitch,stealthrock|Modest|168,,,252,,88||,0,,,,|||]Prinplup||eviolite||defog,scald,signalbeam,yawn|Bold|248,,252,,,8||,0,,,,|||',

				'Rotom-Fan||leftovers||willowisp,voltswitch,airslash,painsplit|Bold|248,,208,,,52||,0,,,,|||]Prinplup||eviolite||scald,defog,stealthrock,signalbeam|Bold|248,,252,,8,||,0,,,,|||]Golem||choiceband|1|earthquake,stoneedge,suckerpunch,explosion|Adamant|,252,4,,,252|||||]Rapidash||leftovers|1|flareblitz,morningsun,drillrun,willowisp|Jolly|,252,,,4,252|||||]Bouffalant||leftovers|1|frustration,earthquake,swordsdance,substitute|Adamant|120,252,,,,136|||||0]Mr. Mime||choicescarf||psychic,dazzlinggleam,healingwish,trick|Timid|,,,252,4,252||,0,,,,|||',

				'Dodrio||choiceband|1|bravebird,return,knockoff,quickattack|Jolly|,252,4,,,252|||||]Cacturne||lifeorb|H|gigadrain,darkpulse,focusblast,suckerpunch|Rash|,40,,252,,216||29,,,,,|||]Mawile||lifeorb|H|swordsdance,suckerpunch,ironhead,playrough|Adamant|,252,4,,,252||29,,,,,|||]Mr. Mime||choicescarf||dazzlinggleam,psychic,focusblast,healingwish|Timid|,,4,252,,252||,0,,,,|||]Golem||weaknesspolicy|1|earthquake,stoneedge,suckerpunch,stealthrock|Adamant|,252,4,,,252|||||]Rotom-Fan||leftovers||thunderbolt,airslash,hiddenpowerwater,willowisp|Timid|,,4,252,,252||,0,30,30,,|||',

				'Monferno||eviolite|H|closecombat,firepunch,machpunch,swordsdance|Adamant|,252,4,,,252|||||]Grumpig||colburberry||psychic,focusblast,taunt,thunderwave|Timid|80,,,252,,176||,0,,,,|||]Rotom-Frost||leftovers||substitute,willowisp,thunderbolt,blizzard|Timid|,,,252,4,252||,0,,,,|||]Bouffalant||assaultvest|1|frustration,facade,earthquake,pursuit|Adamant|248,252,,,8,|||||0]Golem||weaknesspolicy|1|earthquake,rockblast,suckerpunch,stealthrock|Adamant|,252,4,,,252|||||]Floatzel||choicescarf|H|hydropump,icebeam,hiddenpowergrass,switcheroo|Modest|,,,252,4,252||,30,,30,,|||0',

				'Mr. Mime||lifeorb||futuresight,dazzlinggleam,healingwish,focusblast|Timid|,,,252,4,252||29,0,,,,|||]Dusknoir||lifeorb|H|pursuit,earthquake,shadowsneak,icepunch|Adamant|192,252,,,,64|||||]Monferno||eviolite|H|swordsdance,machpunch,closecombat,flareblitz|Adamant|,252,4,,,252|||||]Rotom-Frost||choicescarf||blizzard,thunderbolt,voltswitch,trick|Timid|,,4,252,,252||,0,,,,|||]Golem||weaknesspolicy|1|earthquake,stoneedge,stealthrock,suckerpunch|Adamant|,252,,,4,252|||||]Leafeon||yacheberry|H|synthesis,knockoff,leafblade,sunnyday|Jolly|,252,,,4,252|||||',

				'Leafeon||lumberry|H|swordsdance,aerialace,leafblade,knockoff|Jolly|,252,,,4,252||29,,,,,|||]Dodrio||choicescarf|1|knockoff,pursuit,frustration,bravebird|Jolly|,252,,,4,252|||||0]Grumpig||colburberry||shadowball,thunderwave,psychic,focusblast|Timid|80,,,252,,176||,0,,,,|||]Lumineon||leftovers|1|toxic,scald,uturn,defog|Bold|248,,248,,,12|||||]Zebstrika||lifeorb|H|overheat,thunderbolt,hiddenpowerice,voltswitch|Timid|,,,252,4,252||,0,30,,,|||]Golem||leftovers|1|stealthrock,toxic,stoneedge,earthquake|Impish|248,32,16,,208,4|||||',


				'Crustle||custapberry||stealthrock,spikes,knockoff,stoneedge|Jolly|,252,,,4,252|||||]Misdreavus||eviolite||taunt,nastyplot,dazzlinggleam,shadowball|Timid|,,,252,4,252|||||]Stoutland||choiceband|H|frustration,superpower,facade,crunch|Jolly|,252,,,4,252|||||0]Monferno||lifeorb|H|uturn,closecombat,firepunch,machpunch|Adamant|,252,,,4,252|||||]Electrode||lifeorb||voltswitch,thunderbolt,hiddenpowerice,signalbeam|Timid|,,,252,4,252||,30,30,,,|||]Floatzel||lifeorb|H|waterfall,icebeam,icepunch,aquajet|Naive|,252,,4,,252|||||',


			],

			gen6lc: [

				'Shellder||eviolite|1|shellsmash,iciclespear,rockblast,iceshard|Adamant|,236,,,76,196||||5|]Diglett||lifeorb|1|earthquake,suckerpunch,rockslide,substitute|Jolly|36,236,,,,236||||5|]Pawniard||eviolite||stealthrock,knockoff,ironhead,suckerpunch|Jolly|,156,36,,116,196||||5|]Croagunk||berryjuice|1|sludgewave,focusblast,vacuumwave,thief|Modest|,28,116,188,116,36||||5|]Fletchling|||H|acrobatics,overheat,uturn,swordsdance|Naughty|76,200,12,40,,180||||5|]Porygon||eviolite|1|agility,triattack,thunderbolt,psychic|Modest|,,36,236,,196||,0,,,,||5|',

				'Mienfoo||eviolite|1|drainpunch,knockoff,uturn,taunt|Jolly|,,196,,36,236|M|||5|]Ponyta||eviolite|H|sunnyday,fireblast,solarbeam,morningsun|Timid|,,,236,76,196||,0,,,,||5|]Pawniard||choicescarf||knockoff,ironhead,pursuit,brickbreak|Jolly|,236,36,,36,196|M|||5|]Fletchling|||H|acrobatics,overheat,uturn,hiddenpowergrass|Naughty|76,200,12,40,,180|M|,30,,30,,||5|]Drilbur||berryjuice|H|earthquake,rapidspin,rockslide,stealthrock|Jolly|36,76,36,,76,212|M|||5|]Abra||focussash|H|psychic,energyball,hiddenpowerfighting,protect|Timid|,,,240,,200|M|,1,30,30,30,30||5|',

				'Shellder||eviolite|1|shellsmash,iciclespear,rockblast,razorshell|Adamant|,236,,,76,196||||5|]Pawniard||choicescarf||pursuit,knockoff,brickbreak,ironhead|Jolly|,236,36,,36,196||||5|]Timburr||eviolite||bulkup,drainpunch,knockoff,machpunch|Careful|,116,156,,236,||||5|]Diglett||eviolite|1|stealthrock,earthquake,rockslide,memento|Jolly|36,236,,,,236||||5|]Cottonee||eviolite||memento,gigadrain,dazzlinggleam,knockoff|Bold|36,,196,60,196,||||5|]Zigzagoon||berryjuice||bellydrum,extremespeed,thief,protect|Adamant|132,196,108,,28,36||||5|',

				'Mienfoo||eviolite|1|swordsdance,batonpass,knockoff,drainpunch|Sassy|156,,196,,116,|M|,,,,,0|S|5|]Carvanha||lifeorb|H|waterfall,crunch,aquajet,protect|Adamant|,196,36,,36,236|M|9,,,,,||5|]Gothita||choicescarf|H|psychic,energyball,thunderbolt,trick|Timid|,,36,236,,236|F|||5|]Cottonee||eviolite||encore,dazzlinggleam,knockoff,memento|Bold|116,,196,,196,|M|||5|]Archen||eviolite||stealthrock,knockoff,rockslide,roost|Jolly|,,236,,76,196|M|||5|]Stunky||eviolite|1|pursuit,suckerpunch,fireblast,defog|Brave|12,92,60,108,188,4|M|||5|',

				'Omanyte||eviolite|1|shellsmash,hydropump,earthpower,icebeam|Modest|76,,,196,,236||||5|]Gothita||choicescarf|H|hiddenpowerfire,psychic,energyball,trick|Modest|,,28,240,,240||,30,,30,,30|S|5|]Pawniard||eviolite||knockoff,suckerpunch,ironhead,stealthrock|Jolly|,156,36,,116,196||||5|]Snubbull||berryjuice||thief,playrough,earthquake,thunderwave|Adamant|36,196,44,,116,116|||S|5|]Snivy||eviolite|H|leafstorm,synthesis,glare,hiddenpowerflying|Timid|,,,240,,252||30,30,30,30,30,||5|]Timburr||eviolite||bulkup,machpunch,drainpunch,knockoff|Careful|,116,156,,236,|||S|5|',

				'Mienfoo||eviolite|1|highjumpkick,knockoff,acrobatics,uturn|Sassy|76,76,196,,116,|||S|5|]Foongus||eviolite|H|spore,hiddenpowerfighting,gigadrain,sludgebomb|Bold|124,,160,,160,||,,30,30,30,30|S|5|]Slowpoke||eviolite|H|scald,fireblast,thunderwave,slackoff|Quiet|116,,236,36,116,||,0,,,,|S|5|]Ponyta||eviolite|H|willowisp,flamecharge,flareblitz,morningsun|Jolly|,76,156,,76,196|||S|5|]Pawniard||eviolite||swordsdance,ironhead,knockoff,suckerpunch|Jolly|,156,36,,116,196|||S|5|]Porygon||eviolite||triattack,psychic,thunderwave,recover|Calm|236,,196,,76,||,0,,,,|S|5|',

				'Dwebble||berryjuice||stealthrock,knockoff,rockblast,spikes|Jolly|,236,,,,236||||5|]Porygon||eviolite|1|hiddenpowerfire,triattack,recover,psychic|Modest|156,,36,240,,40||,30,,30,,30||5|]Pawniard||choicescarf||ironhead,knockoff,pursuit,brickbreak|Jolly|,236,36,,40,196||||5|]Scraggy||eviolite||dragondance,drainpunch,knockoff,poisonjab|Adamant|,236,60,,,212||||5|]Skrelp||eviolite|H|hydropump,scald,sludgebomb,hiddenpowerfire|Modest|36,,116,200,36,120||,30,,30,,30||5|]Fletchling|||H|acrobatics,uturn,overheat,roost|Naughty|,196,172,116,,20||||5|',

				'Diglett||lifeorb|1|substitute,rockslide,earthquake,memento|Jolly|36,236,,,,236||||5|]Archen||eviolite||roost,earthquake,stoneedge,defog|Jolly|76,20,76,,76,196||||5|]Pawniard||eviolite||knockoff,suckerpunch,ironhead,stealthrock|Jolly|,156,36,,116,196||||5|]Spritzee||eviolite|H|wish,protect,moonblast,calmmind|Bold|212,,196,12,76,12||||5|]Shellder||eviolite|1|iciclespear,rockblast,iceshard,shellsmash|Adamant|36,236,36,,,196||||5|]Mienfoo||eviolite|1|knockoff,poisonjab,drainpunch,uturn|Impish|156,,116,,196,||||5|',


				'Scraggy||choicescarf|1|highjumpkick,knockoff,zenheadbutt,drainpunch|Jolly|,236,,,36,212||||5|]Honedge||eviolite||pursuit,ironhead,swordsdance,shadowsneak|Adamant|,116,116,,140,132||||5|]Chinchou||berryjuice||scald,voltswitch,icebeam,thunderwave|Bold|76,,212,152,,60||||5|]Timburr||eviolite||drainpunch,machpunch,knockoff,bulkup|Careful|,116,156,,236,||||5|]Foongus||eviolite|H|spore,gigadrain,sludgebomb,clearsmog|Bold|124,,156,,156,||||5|]Archen||||acrobatics,stoneedge,roost,stealthrock|Jolly|76,20,76,,76,196||||5|',

				'Pawniard||choicescarf||knockoff,ironhead,pursuit,stealthrock|Adamant|,236,36,,36,196||||5|]Drilbur||choicescarf|H|earthquake,rockslide,poisonjab,rapidspin|Jolly|,236,36,,,212||||5|]Foongus||eviolite|H|gigadrain,sludgebomb,spore,hiddenpowerfighting|Bold|124,,160,,160,||,1,30,30,30,30||5|]Mienfoo||eviolite|1|knockoff,highjumpkick,uturn,acrobatics|Jolly|,,196,,36,236||||5|]Fletchling|||H|acrobatics,uturn,swordsdance,hiddenpowergrass|Naughty|76,200,92,120,,20||,30,,30,,||5|]Tirtouga||eviolite||waterfall,aquajet,zenheadbutt,shellsmash|Adamant|4,212,92,,76,100||||5|',


			],


		};
		let realFormat = this.format.realFormat;
		let noability = realFormat.indexOf('gen1') !== -1 || realFormat.indexOf('gen2') !== -1;
		let rawteam = this.prng.sample(teams[realFormat]);
		let team = Dex.fastUnpackTeam(rawteam, noability);
		if (team === null) {
			console.log(rawteam);
			rawteam = 'Ditto||choicescarf|H|transform||252,,,,,||,0,,,,|||]Ditto||choicescarf|H|transform||252,,,,,||,0,,,,|||]Ditto||choicescarf|H|transform||252,,,,,||,0,,,,|||]Ditto||choicescarf|H|transform||252,,,,,||,0,,,,|||]Ditto||choicescarf|H|transform||252,,,,,||,0,,,,|||]Ditto||choicescarf|H|transform||252,,,,,||,0,,,,|||';
			return Dex.fastUnpackTeam(rawteam, noability);
		}
		return team;
	}
	randomDurantsTeam() {
		const pokemon = [];
		let names = FS('config/durant-names.txt').readSync('utf8').split(',');
		while (pokemon.length < 6) {
			const species = this.dex.getSpecies('Durant');
			const set = {
				name: this.sample(names),
				species: species.name,
				gender: species.gender,
				item: this.random(2) < 1 ? 'Choice Scarf' : 'Leppa Berry',
				ability: 'Swarm',
				shiny: false,
				evs: {hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252},
				nature: 'Jolly',
				ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31},
				moves: ['Guillotine'],
			};
			if (this.random(48) < 1) {
				set.item = 'Watmel Berry';
				set.moves.push('Natural Gift');
				set.shiny = true;
			} else if (this.random(96) < 1) {
				set.moves.push('Superpower');
				set.shiny = true;
			} else if (this.random(144) < 1) {
				set.item = 'Focus Sash';
				set.shiny = true;
			} else if (this.random(192) < 1) {
				set.item = 'Leppa Berry';
				set.moves.push('Imprison');
				set.shiny = true;
			}
			pokemon.push(set);
		}
		return pokemon;
	}
	randomCAP1v1Sets: AnyObject = require('./cap-1v1-sets.json');

	randomCAP1v1Team() {
		const pokemon = [];
		const pokemonPool = Object.keys(this.randomCAP1v1Sets);

		while (pokemonPool.length && pokemon.length < 3) {
			const species = this.dex.getSpecies(this.sampleNoReplace(pokemonPool));
			if (!species.exists) throw new Error(`Invalid Pokemon "${species}" in ${this.format}`);

			const setData: AnyObject = this.sample(this.randomCAP1v1Sets[species.name]);
			const set = {
				name: species.baseSpecies,
				species: species.name,
				gender: species.gender,
				item: (Array.isArray(setData.item) ? this.sample(setData.item) : setData.item) || '',
				ability: (Array.isArray(setData.ability) ? this.sample(setData.ability) : setData.ability),
				shiny: this.randomChance(1, 1024),
				evs: Object.assign({hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}, setData.evs),
				nature: setData.nature,
				ivs: Object.assign({hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31}, setData.ivs || {}),
				moves: setData.moves.map((move: any) => Array.isArray(move) ? this.sample(move) : move),
			};
			pokemon.push(set);
		}
		return pokemon;
	}
}

export default RandomTeams;
