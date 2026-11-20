// test/game.test.js
const test = require('node:test');
const assert = require('node:assert');
const { OperacionBovedaGame } = require('../js/game.js');
const { Card } = require('../js/poker.js');

test('OperacionBovedaGame - Full round success path and 3 vaults victory', () => {
    const game = new OperacionBovedaGame({ minPlayers: 3, maxPlayers: 6 });
    game.addPlayer('p1', 'Alice', '🕵️');
    game.addPlayer('p2', 'Bob', '🧠');
    game.addPlayer('p3', 'Charlie', '🕶️');

    game.startNewGame();
    assert.strictEqual(game.phase, 'preflop');
    assert.strictEqual(game.vaultsCracked, 0);
    assert.strictEqual(game.alarmsTriggered, 0);

    // Override cards to guarantee success:
    // p1 has High Card (weakest), p2 has Pair, p3 has Trips (strongest)
    const p1 = game.players.find(p => p.id === 'p1');
    const p2 = game.players.find(p => p.id === 'p2');
    const p3 = game.players.find(p => p.id === 'p3');

    p1.cards = [new Card(2, 'S'), new Card(4, 'H')];
    p2.cards = [new Card(10, 'D'), new Card(10, 'C')];
    p3.cards = [new Card(14, 'S'), new Card(14, 'H')];
    game.communityCards = [new Card(14, 'D'), new Card(7, 'C'), new Card(3, 'S'), new Card(8, 'D'), new Card(9, 'C')];

    // Perfect red chips assignment (1, 2, 3)
    p1.chipsHistory.river = 1;
    p2.chipsHistory.river = 2;
    p3.chipsHistory.river = 3;

    // Run 3 winning rounds
    for (let round = 1; round <= 3; round++) {
        game.startShowdown();
        // Step through all 3 players
        game.stepShowdown(); // player 1 (done: false)
        game.stepShowdown(); // player 2 (done: false)
        const step3 = game.stepShowdown(); // player 3 (done: true)
        assert.strictEqual(step3.done, true);
        assert.strictEqual(game.roundSuccess, true);
        assert.strictEqual(game.vaultsCracked, round);
    }
    assert.strictEqual(game.phase, 'game_over');
    assert.strictEqual(game.gameResult, 'victory');
});

test('OperacionBovedaGame - Failure path and 3 alarms defeat', () => {
    const game = new OperacionBovedaGame({ minPlayers: 3, maxPlayers: 6 });
    game.addPlayer('p1', 'Alice', '🕵️');
    game.addPlayer('p2', 'Bob', '🧠');
    game.addPlayer('p3', 'Charlie', '🕶️');
    game.startNewGame();

    const p1 = game.players.find(p => p.id === 'p1');
    const p2 = game.players.find(p => p.id === 'p2');
    const p3 = game.players.find(p => p.id === 'p3');

    // p1 has strong trips, p2 has weak 2-4
    p1.cards = [new Card(14, 'S'), new Card(14, 'H')];
    p2.cards = [new Card(2, 'S'), new Card(4, 'H')];
    p3.cards = [new Card(5, 'D'), new Card(6, 'C')];
    game.communityCards = [new Card(14, 'D'), new Card(7, 'C'), new Card(3, 'S'), new Card(8, 'D'), new Card(9, 'C')];

    // Faulty assignment: p1 (strong) placed at chip 1, p2 (weak) placed at chip 2
    p1.chipsHistory.river = 1;
    p2.chipsHistory.river = 2;
    p3.chipsHistory.river = 3;

    for (let alarm = 1; alarm <= 3; alarm++) {
        game.startShowdown();
        game.stepShowdown();
        game.stepShowdown();
        const step3 = game.stepShowdown();
        assert.strictEqual(step3.done, true);
        assert.strictEqual(game.roundSuccess, false);
        assert.strictEqual(game.alarmsTriggered, alarm);
    }
    assert.strictEqual(game.phase, 'game_over');
    assert.strictEqual(game.gameResult, 'defeat');
});

test('OperacionBovedaGame - Join rejection outside lobby/game_over', () => {
    const game = new OperacionBovedaGame({ minPlayers: 3, maxPlayers: 6 });
    game.addPlayer('p1', 'Alice', '🕵️');
    game.addPlayer('p2', 'Bob', '🧠');
    game.addPlayer('p3', 'Charlie', '🕶️');
    game.startNewGame();

    assert.strictEqual(game.phase, 'preflop');
    const res = game.addPlayer('p4', 'LateDave', '💻');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.message, 'La partida ya está en curso.');
});

test('OperacionBovedaGame - removePlayer mid-phase chip compaction', () => {
    const game = new OperacionBovedaGame({ minPlayers: 3, maxPlayers: 6 });
    game.addPlayer('p1', 'Alice', '🕵️');
    game.addPlayer('p2', 'Bob', '🧠');
    game.addPlayer('p3', 'Charlie', '🕶️');
    game.addPlayer('p4', 'Dave', '💻');
    game.startNewGame();

    // Assign chips 1, 2, 3, 4
    game.selectChip('p1', 1);
    game.selectChip('p2', 2);
    game.selectChip('p3', 3);
    game.selectChip('p4', 4);

    // Remove player with chip 2
    game.removePlayer('p2');
    assert.strictEqual(game.players.length, 3);

    // Remaining chips must be compacted into 1..3
    const chips = game.players.map(p => p.currentChip).filter(c => c !== null);
    chips.sort((a, b) => a - b);
    assert.deepStrictEqual(chips, [1, 2, 3]);
});

test('OperacionBovedaGame - getStateForPlayer privacy check', () => {
    const game = new OperacionBovedaGame({ minPlayers: 3, maxPlayers: 6 });
    game.addPlayer('p1', 'Alice', '🕵️');
    game.addPlayer('p2', 'Bob', '🧠');
    game.addPlayer('p3', 'Charlie', '🕶️');
    game.startNewGame();

    const stateP1 = game.getStateForPlayer('p1');
    const playerP1 = stateP1.players.find(p => p.id === 'p1');
    const playerP2 = stateP1.players.find(p => p.id === 'p2');

    // Alice sees her own cards
    assert.strictEqual(playerP1.cards.length, 2);
    assert.strictEqual(playerP1.cards[0].rank > 0, true);

    // Alice does NOT see Bob's cards before showdown
    assert.strictEqual(playerP2.cards.length, 2);
    assert.strictEqual(playerP2.cards[0].hidden, true);
    assert.strictEqual(playerP2.cards[0].rank, undefined);
});

test('OperacionBovedaGame - serializeFullGame and restoreFromSerialized', () => {
    const game = new OperacionBovedaGame({ minPlayers: 3, maxPlayers: 6 });
    game.addPlayer('p1', 'Alice', '🕵️');
    game.addPlayer('p2', 'Bob', '🧠');
    game.addPlayer('p3', 'Charlie', '🕶️');
    game.startNewGame();
    game.vaultsCracked = 1;
    game.alarmsTriggered = 1;

    const serialized = game.serializeFullGame();
    assert.strictEqual(typeof serialized, 'object');

    const restoredGame = new OperacionBovedaGame();
    restoredGame.restoreFromSerialized(serialized);

    assert.strictEqual(restoredGame.vaultsCracked, 1);
    assert.strictEqual(restoredGame.alarmsTriggered, 1);
    assert.strictEqual(restoredGame.players.length, 3);
    assert.strictEqual(restoredGame.phase, game.phase);
    assert.deepStrictEqual(restoredGame.communityCards, game.communityCards);
});
