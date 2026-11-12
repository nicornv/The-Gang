// bot.js - Lógica y comportamiento de cómplices IA para pruebas o partidas con pocos jugadores

const BOT_NAMES = [
    { name: 'El Cerebro', avatar: '🧠' },
    { name: 'La Sombra', avatar: '🕶️' },
    { name: 'El Cerrajero', avatar: '🔑' },
    { name: 'La Hacker', avatar: '💻' },
    { name: 'El Piloto', avatar: '🏎️' },
    { name: 'El Demoledor', avatar: '🧨' }
];

class BotPlayer {
    static estimatePreflopStrength(c1, c2) {
        const sorted = [c1, c2].sort((a, b) => b.rank - a.rank);
        const isPair = sorted[0].rank === sorted[1].rank;
        const isSuited = sorted[0].suit === sorted[1].suit;
        const diff = sorted[0].rank - sorted[1].rank;
        const high = sorted[0].rank;
        const low = sorted[1].rank;

        // Chen Formula aproximada para fuerza preflop (escala 0 - 20)
        let score = 0;
        if (high === 14) score = 10;
        else if (high === 13) score = 8;
        else if (high === 12) score = 7;
        else if (high === 11) score = 6;
        else score = high / 2;

        if (isPair) {
            score = Math.max(score * 2, 5);
        }
        if (isSuited) {
            score += 2;
        }
        if (!isPair) {
            if (diff === 1) score += 1;
            else if (diff === 2) score += 0;
            else if (diff >= 4) score -= (diff - 3);
        }
        return Math.max(1, score);
    }

    static estimateHandPercentile(bestHand, phase) {
        // Devuelve un valor aproximado de percentil entre 0.0 (peor mano) y 1.0 (mano invencible)
        const cat = bestHand.category;

        // HIGH_CARD (1): 0.05 a 0.25 según cartas altas
        if (cat === HAND_CATEGORIES.HIGH_CARD) {
            const highRank = bestHand.score[1] || 10;
            return 0.05 + (highRank - 7) * 0.02;
        }
        // ONE_PAIR (2): 0.25 a 0.55
        if (cat === HAND_CATEGORIES.ONE_PAIR) {
            const pairRank = bestHand.score[1] || 8;
            return 0.28 + (pairRank - 2) * 0.02;
        }
        // TWO_PAIR (3): 0.55 a 0.75
        if (cat === HAND_CATEGORIES.TWO_PAIR) {
            const highPair = bestHand.score[1] || 10;
            return 0.58 + (highPair - 4) * 0.015;
        }
        // THREE_OF_A_KIND (4): 0.75 a 0.85
        if (cat === HAND_CATEGORIES.THREE_OF_A_KIND) {
            const r = bestHand.score[1] || 8;
            return 0.76 + (r - 2) * 0.007;
        }
        // STRAIGHT (5): 0.85 a 0.90
        if (cat === HAND_CATEGORIES.STRAIGHT) {
            return 0.86;
        }
        // FLUSH (6): 0.90 a 0.94
        if (cat === HAND_CATEGORIES.FLUSH) {
            return 0.91;
        }
        // FULL_HOUSE (7): 0.94 a 0.98
        if (cat === HAND_CATEGORIES.FULL_HOUSE) {
            return 0.95;
        }
        // FOUR_OF_A_KIND o superior (8..10)
        return 0.99;
    }

    // Decide qué ficha (1..totalPlayers) debería tomar el bot
    static chooseChip(botCards, communityCards, phase, totalPlayers, availableChips) {
        if (!availableChips || availableChips.length === 0) return 1;

        let targetPercentile = 0.5;

        if (phase === 'preflop') {
            const chen = BotPlayer.estimatePreflopStrength(botCards[0], botCards[1]);
            // Chen suele ir de ~ -1 a 20
            targetPercentile = Math.max(0.05, Math.min(0.95, chen / 18));
        } else {
            const allCards = [...botCards, ...communityCards];
            const best = getBestHand(allCards);
            targetPercentile = BotPlayer.estimateHandPercentile(best, phase);
        }

        // Mapear el percentil al rango de estrellas 1..totalPlayers
        const idealStar = Math.round(1 + targetPercentile * (totalPlayers - 1));
        const clampedStar = Math.max(1, Math.min(totalPlayers, idealStar));

        // Si la ficha ideal está disponible en la mesa, tomarla
        if (availableChips.includes(clampedStar)) {
            return clampedStar;
        }

        // Si no está disponible, buscar la más cercana disponible
        let bestDist = 999;
        let chosen = availableChips[0];
        for (const chip of availableChips) {
            const dist = Math.abs(chip - clampedStar);
            if (dist < bestDist) {
                bestDist = dist;
                chosen = chip;
            }
        }
        return chosen;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BotPlayer, BOT_NAMES };
}
