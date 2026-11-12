// poker.js - Motor y Evaluador de Texas Hold'em para "Operación Bóveda" (El Golpe)

const SUITS = [
    { id: 'S', symbol: '♠', name: 'Picas', color: 'black' },
    { id: 'H', symbol: '♥', name: 'Corazones', color: 'red' },
    { id: 'D', symbol: '♦', name: 'Diamantes', color: 'red' },
    { id: 'C', symbol: '♣', name: 'Tréboles', color: 'black' }
];

const RANKS = [
    { value: 2, label: '2', name: 'Dos' },
    { value: 3, label: '3', name: 'Tres' },
    { value: 4, label: '4', name: 'Cuatro' },
    { value: 5, label: '5', name: 'Cinco' },
    { value: 6, label: '6', name: 'Seis' },
    { value: 7, label: '7', name: 'Siete' },
    { value: 8, label: '8', name: 'Ocho' },
    { value: 9, label: '9', name: 'Nueve' },
    { value: 10, label: '10', name: 'Diez' },
    { value: 11, label: 'J', name: 'Jota' },
    { value: 12, label: 'Q', name: 'Reina' },
    { value: 13, label: 'K', name: 'Rey' },
    { value: 14, label: 'A', name: 'As' }
];

const HAND_CATEGORIES = {
    HIGH_CARD: 1,
    ONE_PAIR: 2,
    TWO_PAIR: 3,
    THREE_OF_A_KIND: 4,
    STRAIGHT: 5,
    FLUSH: 6,
    FULL_HOUSE: 7,
    FOUR_OF_A_KIND: 8,
    STRAIGHT_FLUSH: 9,
    ROYAL_FLUSH: 10
};

const HAND_NAMES = {
    1: 'Carta Alta',
    2: 'Pareja',
    3: 'Doble Pareja',
    4: 'Trío',
    5: 'Escalera',
    6: 'Color',
    7: 'Full House',
    8: 'Póker (Cuarteto)',
    9: 'Escalera de Color',
    10: 'Escalera Real'
};

class Card {
    constructor(rankValue, suitId) {
        this.rank = rankValue;
        this.suit = suitId;
        const rankObj = RANKS.find(r => r.value === rankValue);
        const suitObj = SUITS.find(s => s.id === suitId);
        this.label = rankObj ? rankObj.label : String(rankValue);
        this.rankName = rankObj ? rankObj.name : String(rankValue);
        this.suitSymbol = suitObj ? suitObj.symbol : suitId;
        this.symbol = suitObj ? suitObj.symbol : suitId;
        this.suitName = suitObj ? suitObj.name : suitId;
        this.color = suitObj ? suitObj.color : 'black';
        this.id = `${this.label}${this.suit}`;
    }

    toString() {
        return `${this.label}${this.suitSymbol}`;
    }
}

class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        for (const s of SUITS) {
            for (const r of RANKS) {
                this.cards.push(new Card(r.value, s.id));
            }
        }
        this.shuffle();
    }

    shuffle() {
        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal() {
        return this.cards.pop();
    }
}

// Combinations helper (n choose k)
function combinations(arr, k) {
    const results = [];
    function helper(start, combo) {
        if (combo.length === k) {
            results.push([...combo]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            helper(i + 1, combo);
            combo.pop();
        }
    }
    helper(0, []);
    return results;
}

// Evaluates EXACTLY 5 cards
function evaluate5Cards(cards5) {
    // Sort descending by rank
    const sorted = [...cards5].sort((a, b) => b.rank - a.rank);
    const ranks = sorted.map(c => c.rank);
    const suits = sorted.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);

    // Check straight
    let isStraight = false;
    let straightHigh = 0;

    // Normal straight (5 distinct ranks with difference 4)
    const uniqueRanks = [...new Set(ranks)];
    if (uniqueRanks.length === 5) {
        if (ranks[0] - ranks[4] === 4) {
            isStraight = true;
            straightHigh = ranks[0];
        } else if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
            // Ace-low straight (A-2-3-4-5) -> Wheel!
            isStraight = true;
            straightHigh = 5; // In wheel, high card is 5
        }
    }

    // Straight Flush & Royal Flush
    if (isFlush && isStraight) {
        if (straightHigh === 14) {
            return {
                category: HAND_CATEGORIES.ROYAL_FLUSH,
                score: [HAND_CATEGORIES.ROYAL_FLUSH, 14],
                name: 'Escalera Real',
                description: `Escalera Real de ${sorted[0].suitName}`,
                cards: sorted
            };
        }
        return {
            category: HAND_CATEGORIES.STRAIGHT_FLUSH,
            score: [HAND_CATEGORIES.STRAIGHT_FLUSH, straightHigh],
            name: 'Escalera de Color',
            description: `Escalera de Color al ${getRankName(straightHigh)} de ${sorted[0].suitName}`,
            cards: sorted
        };
    }

    // Count rank frequencies
    const rankCounts = {};
    for (const r of ranks) {
        rankCounts[r] = (rankCounts[r] || 0) + 1;
    }

    const counts = Object.entries(rankCounts)
        .map(([rankStr, count]) => ({ rank: parseInt(rankStr, 10), count }))
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return b.rank - a.rank;
        });

    // Four of a kind
    if (counts[0].count === 4) {
        const sym = getRankSymbol(counts[0].rank);
        return {
            category: HAND_CATEGORIES.FOUR_OF_A_KIND,
            score: [HAND_CATEGORIES.FOUR_OF_A_KIND, counts[0].rank, counts[1].rank],
            name: `Póker de ${sym}`,
            description: `Póker de ${sym} (${getRankName(counts[0].rank, true)})`,
            cards: sorted
        };
    }

    // Full House (3 + 2)
    if (counts[0].count === 3 && counts[1].count === 2) {
        const sym1 = getRankSymbol(counts[0].rank);
        const sym2 = getRankSymbol(counts[1].rank);
        return {
            category: HAND_CATEGORIES.FULL_HOUSE,
            score: [HAND_CATEGORIES.FULL_HOUSE, counts[0].rank, counts[1].rank],
            name: `Full de ${sym1} y ${sym2}`,
            description: `Full de ${sym1} (${getRankName(counts[0].rank, true)}) y ${sym2} (${getRankName(counts[1].rank, true)})`,
            cards: sorted
        };
    }

    // Flush
    if (isFlush) {
        const highSym = getRankSymbol(ranks[0]);
        return {
            category: HAND_CATEGORIES.FLUSH,
            score: [HAND_CATEGORIES.FLUSH, ...ranks],
            name: `Color al ${highSym} (${sorted[0].suitSymbol})`,
            description: `Color de ${sorted[0].suitName} al ${highSym}`,
            cards: sorted
        };
    }

    // Straight
    if (isStraight) {
        const highSym = getRankSymbol(straightHigh);
        return {
            category: HAND_CATEGORIES.STRAIGHT,
            score: [HAND_CATEGORIES.STRAIGHT, straightHigh],
            name: `Escalera al ${highSym}`,
            description: `Escalera al ${highSym}`,
            cards: sorted
        };
    }

    // Three of a kind
    if (counts[0].count === 3) {
        const sym = getRankSymbol(counts[0].rank);
        return {
            category: HAND_CATEGORIES.THREE_OF_A_KIND,
            score: [HAND_CATEGORIES.THREE_OF_A_KIND, counts[0].rank, counts[1].rank, counts[2].rank],
            name: `Trío de ${sym}`,
            description: `Trío de ${sym} (${getRankName(counts[0].rank, true)})`,
            cards: sorted
        };
    }

    // Two Pair
    if (counts[0].count === 2 && counts[1].count === 2) {
        const sym1 = getRankSymbol(counts[0].rank);
        const sym2 = getRankSymbol(counts[1].rank);
        return {
            category: HAND_CATEGORIES.TWO_PAIR,
            score: [HAND_CATEGORIES.TWO_PAIR, counts[0].rank, counts[1].rank, counts[2].rank],
            name: `Doble Pareja de ${sym1} y ${sym2}`,
            description: `Doble Pareja de ${sym1} y ${sym2}`,
            cards: sorted
        };
    }

    // One Pair
    if (counts[0].count === 2) {
        const sym = getRankSymbol(counts[0].rank);
        return {
            category: HAND_CATEGORIES.ONE_PAIR,
            score: [HAND_CATEGORIES.ONE_PAIR, counts[0].rank, counts[1].rank, counts[2].rank, counts[3].rank],
            name: `Pareja de ${sym}`,
            description: `Pareja de ${sym} (${getRankName(counts[0].rank, true)})`,
            cards: sorted
        };
    }

    // High Card
    const highSym = getRankSymbol(ranks[0]);
    return {
        category: HAND_CATEGORIES.HIGH_CARD,
        score: [HAND_CATEGORIES.HIGH_CARD, ...ranks],
        name: `Carta Alta ${highSym}`,
        description: `Carta Alta ${highSym} (kicker ${getRankSymbol(ranks[1])})`,
        cards: sorted
    };
}

function getRankSymbol(value) {
    const r = RANKS.find(x => x.value === value);
    return r ? r.label : String(value);
}

function getRankName(value, plural = false) {
    const r = RANKS.find(x => x.value === value);
    if (!r) return String(value);
    if (!plural) return r.name;
    if (r.label === 'A') return 'Ases';
    if (r.label === 'K') return 'Reyes';
    if (r.label === 'Q') return 'Reinas';
    if (r.label === 'J') return 'Jotas';
    if (r.label === '10') return 'Dieces';
    return `${r.name}s`;
}

// Compares two hand evaluation scores:
// returns > 0 if handA is stronger than handB
// returns 0 if handA == handB (tie)
// returns < 0 if handA is weaker than handB
function compareHandScores(scoreA, scoreB) {
    const len = Math.max(scoreA.length, scoreB.length);
    for (let i = 0; i < len; i++) {
        const valA = scoreA[i] || 0;
        const valB = scoreB[i] || 0;
        if (valA > valB) return 1;
        if (valA < valB) return -1;
    }
    return 0;
}

// Best 5-card hand from an arbitrary pool of 5, 6, or 7 cards
function getBestHand(cards) {
    if (cards.length < 5) {
        // Less than 5 cards (e.g. preflop 2 cards)
        return evaluatePartialHand(cards);
    }
    if (cards.length === 5) {
        return evaluate5Cards(cards);
    }

    const all5Combos = combinations(cards, 5);
    let best = null;

    for (const combo of all5Combos) {
        const evaluated = evaluate5Cards(combo);
        if (!best || compareHandScores(evaluated.score, best.score) > 0) {
            best = evaluated;
        }
    }
    return best;
}

// Quick evaluator for 2 pocket cards (Preflop estimation)
function evaluatePartialHand(cards) {
    if (cards.length === 2) {
        const [c1, c2] = [...cards].sort((a, b) => b.rank - a.rank);
        const isPair = c1.rank === c2.rank;
        const isSuited = c1.suit === c2.suit;
        const diff = Math.abs(c1.rank - c2.rank);
        const isConnector = diff === 1;

        let strengthScore = 0;
        let desc = '';

        if (isPair) {
            strengthScore = 50 + c1.rank * 3;
            desc = `Pareja de mano: ${getRankName(c1.rank, true)}`;
        } else {
            strengthScore = c1.rank * 2 + c2.rank + (isSuited ? 4 : 0) + (isConnector ? 3 : 0);
            desc = `${c1.label}-${c2.label} ${isSuited ? 'del mismo palo' : 'distinto palo'}`;
        }

        return {
            category: isPair ? HAND_CATEGORIES.ONE_PAIR : HAND_CATEGORIES.HIGH_CARD,
            score: [isPair ? 2 : 1, c1.rank, c2.rank],
            name: isPair ? 'Pareja en Mano' : 'Cartas Privadas',
            description: desc,
            relativeStrength: strengthScore,
            cards: [c1, c2]
        };
    }
    return {
        category: 1,
        score: [1],
        name: 'Evaluando...',
        description: 'Esperando cartas',
        cards
    };
}

// Export for browser & node
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SUITS,
        RANKS,
        HAND_CATEGORIES,
        HAND_NAMES,
        Card,
        Deck,
        evaluate5Cards,
        compareHandScores,
        getBestHand,
        evaluatePartialHand
    };
}
