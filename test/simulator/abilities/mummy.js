'use strict';

const assert = require('./../../assert');
const common = require('./../../common');

let battle;

describe('Mummy', function () {
	afterEach(function () {
		battle.destroy();
	});

	it("should set the attacker's ability to Mummy when the user is hit by a contact move", function () {
		battle = common.createBattle();
		battle.join('p1', 'Guest 1', 1, [{species: 'Cofagrigus', ability: 'mummy', moves: ['calmmind']}]);
		battle.join('p2', 'Guest 2', 1, [{species: 'Mew', ability: 'synchronize', moves: ['aerialace']}]);
		battle.makeChoices('move calmmind', 'move aerialace');
		assert.strictEqual(battle.p2.active[0].ability, 'mummy');
	});

	it("should not change certain abilities", function () {
		battle = common.createBattle();
		battle.join('p1', 'Guest 1', 1, [{species: 'Cofagrigus', ability: 'mummy', moves: ['calmmind']}]);
		battle.join('p2', 'Guest 2', 1, [{species: 'Greninja', ability: 'battlebond', moves: ['aerialace']}]);
		battle.makeChoices('move calmmind', 'move aerialace');
		assert.strictEqual(battle.p2.active[0].ability, 'battlebond');
	});

	it(`should not activate before all damage calculation is complete`, function () {
		battle = common.createBattle({gameType: 'doubles'});
		battle.join('p1', 'Guest 1', 1, [
			{species: 'Sableye', ability: 'toughclaws', moves: ['brutalswing']},
			{species: 'Golisopod', ability: 'emergencyexit', moves: ['sleeptalk']},
		]);
		battle.join('p2', 'Guest 2', 1, [
			{species: 'Cofagrigus', ability: 'mummy', moves: ['sleeptalk']},
			{species: 'Hoopa', ability: 'shellarmor', moves: ['sleeptalk']},
		]);
		battle.makeChoices('move brutalswing, move sleeptalk', 'move sleeptalk, move sleeptalk');
		assert.fainted(battle.p2.active[1]);
	});
});
