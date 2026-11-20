// test/poker.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
    Deck,
    Card,
    evaluate5Cards,
    getBestHand,
    compareHandScores,
    HAND_CATEGORIES
} = require('../js/poker.js');

test('Poker Evaluator - Categories', () => {
    // 1. High Card
    const highCard = evaluate5Cards([
        new Card(2, 'S'), new Card(5, 'H'), new Card(8, 'D'), new Card(10, 'C'), new Card(14, 'S')
    ]);
    assert.strictEqual(highCard.category, HAND_CATEGORIES.HIGH_CARD);

    // 2. One Pair
    const onePair = evaluate5Cards([
        new Card(10, 'S'), new Card(10, 'H'), new Card(4, 'D'), new Card(7, 'C'), new Card(14, 'S')
    ]);
    assert.strictEqual(onePair.category, HAND_CATEGORIES.ONE_PAIR);

    // 3. Two Pair
    const twoPair = evaluate5Cards([
        new Card(10, 'S'), new Card(10, 'H'), new Card(7, 'D'), new Card(7, 'C'), new Card(14, 'S')
    ]);
    assert.strictEqual(twoPair.category, HAND_CATEGORIES.TWO_PAIR);

    // 4. Three of a Kind
    const trips = evaluate5Cards([
        new Card(8, 'S'), new Card(8, 'H'), new Card(8, 'D'), new Card(2, 'C'), new Card(14, 'S')
    ]);
    assert.strictEqual(trips.category, HAND_CATEGORIES.THREE_OF_A_KIND);

    // 5. Straight (Regular)
    const straight = evaluate5Cards([
        new Card(9, 'S'), new Card(8, 'H'), new Card(7, 'D'), new Card(6, 'C'), new Card(5, 'S')
    ]);
    assert.strictEqual(straight.category, HAND_CATEGORIES.STRAIGHT);

    // 5b. Wheel Straight (A-2-3-4-5)
    const wheel = evaluate5Cards([
        new Card(14, 'S'), new Card(2, 'H'), new Card(3, 'D'), new Card(4, 'C'), new Card(5, 'S')
    ]);
    assert.strictEqual(wheel.category, HAND_CATEGORIES.STRAIGHT);
    assert.strictEqual(wheel.score[1], 5, 'Wheel highest rank is 5');

    // 6. Flush
    const flush = evaluate5Cards([
        new Card(2, 'S'), new Card(5, 'S'), new Card(8, 'S'), new Card(11, 'S'), new Card(14, 'S')
    ]);
    assert.strictEqual(flush.category, HAND_CATEGORIES.FLUSH);

    // 7. Full House
    const fullHouse = evaluate5Cards([
        new Card(9, 'S'), new Card(9, 'H'), new Card(9, 'D'), new Card(4, 'C'), new Card(4, 'S')
    ]);
    assert.strictEqual(fullHouse.category, HAND_CATEGORIES.FULL_HOUSE);

    // 8. Four of a kind
    const quads = evaluate5Cards([
        new Card(6, 'S'), new Card(6, 'H'), new Card(6, 'D'), new Card(6, 'C'), new Card(14, 'S')
    ]);
    assert.strictEqual(quads.category, HAND_CATEGORIES.FOUR_OF_A_KIND);

    // 9. Straight Flush
    const strFlush = evaluate5Cards([
        new Card(9, 'H'), new Card(8, 'H'), new Card(7, 'H'), new Card(6, 'H'), new Card(5, 'H')
    ]);
    assert.strictEqual(strFlush.category, HAND_CATEGORIES.STRAIGHT_FLUSH);

    // 10. Royal Flush
    const royalFlush = evaluate5Cards([
        new Card(14, 'D'), new Card(13, 'D'), new Card(12, 'D'), new Card(11, 'D'), new Card(10, 'D')
    ]);
    assert.strictEqual(royalFlush.category, HAND_CATEGORIES.ROYAL_FLUSH);
});

test('Poker Evaluator - Kicker and Tie Breaks', () => {
    // Two pairs with different kickers
    const tp1 = evaluate5Cards([
        new Card(10, 'S'), new Card(10, 'H'), new Card(7, 'D'), new Card(7, 'C'), new Card(14, 'S')
    ]);
    const tp2 = evaluate5Cards([
        new Card(10, 'S'), new Card(10, 'H'), new Card(7, 'D'), new Card(7, 'C'), new Card(13, 'S')
    ]);
    assert.strictEqual(compareHandScores(tp1.score, tp2.score) > 0, true);
    assert.strictEqual(compareHandScores(tp2.score, tp1.score) < 0, true);

    // Exact tie
    const tp3 = evaluate5Cards([
        new Card(10, 'C'), new Card(10, 'D'), new Card(7, 'H'), new Card(7, 'S'), new Card(14, 'H')
    ]);
    assert.strictEqual(compareHandScores(tp1.score, tp3.score), 0);
});

test('Poker Evaluator - Best of 7 selection', () => {
    const sevenCards = [
        new Card(14, 'S'), new Card(13, 'S'), // in hand
        new Card(12, 'S'), new Card(11, 'S'), new Card(10, 'S'), new Card(2, 'D'), new Card(3, 'C') // board
    ];
    const best = getBestHand(sevenCards);
    assert.strictEqual(best.category, HAND_CATEGORIES.ROYAL_FLUSH);
});
