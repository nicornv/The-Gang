// test/bot.test.js
const test = require('node:test');
const assert = require('node:assert');
const { BotPlayer } = require('../js/bot.js');
const { Card } = require('../js/poker.js');

test('BotPlayer - chooseChip respects availableChips', () => {
    const botCards = [new Card(14, 'S'), new Card(14, 'H')]; // Pocket Aces
    const community = [new Card(14, 'D'), new Card(2, 'C'), new Card(3, 'S')];

    // Only chips 1 and 2 are available
    const chosen = BotPlayer.chooseChip(botCards, community, 'flop', 4, [1, 2]);
    assert.strictEqual([1, 2].includes(chosen), true);
    // Pocket aces + ace on flop is strong -> chooses closest available high chip
    assert.strictEqual(chosen, 2);
});

test('BotPlayer - shouldAcceptSwap truth table', () => {
    const botCards = [new Card(14, 'S'), new Card(14, 'H')]; // High cards (ideal chip ~ 4)
    const community = [];
    const totalPlayers = 4;
    const ideal = BotPlayer.getIdealStar(botCards, community, 'preflop', totalPlayers);

    // Rule: Accepts only if offeredChip is strictly closer to ideal than currentChip
    // Case 1: offered is closer
    assert.strictEqual(
        BotPlayer.shouldAcceptSwap(botCards, community, 'preflop', totalPlayers, 1, 4),
        true
    );

    // Case 2: offered is further away
    assert.strictEqual(
        BotPlayer.shouldAcceptSwap(botCards, community, 'preflop', totalPlayers, 4, 1),
        false
    );

    // Case 3: offered distance equals current distance
    const cardsMid = [new Card(10, 'S'), new Card(9, 'H')];
    // Test with same chip (distance equal)
    assert.strictEqual(
        BotPlayer.shouldAcceptSwap(cardsMid, community, 'preflop', totalPlayers, 2, 2),
        false,
        'Same chip is not strictly closer'
    );

    // Case 4: Invalid/null offered chip
    assert.strictEqual(
        BotPlayer.shouldAcceptSwap(botCards, community, 'preflop', totalPlayers, 2, null),
        false
    );
    assert.strictEqual(
        BotPlayer.shouldAcceptSwap(botCards, community, 'preflop', totalPlayers, 2, undefined),
        false
    );

    // Case 5: Bot has no chip (null), offered a chip
    assert.strictEqual(
        BotPlayer.shouldAcceptSwap(botCards, community, 'preflop', totalPlayers, null, 3),
        true
    );
});
