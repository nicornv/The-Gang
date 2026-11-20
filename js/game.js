// game.js - Máquina de estado y lógica principal de "Operación Bóveda"

if (typeof module !== 'undefined' && typeof require !== 'undefined') {
    if (typeof Deck === 'undefined') {
        const poker = require('./poker.js');
        global.Deck = poker.Deck;
        global.Card = poker.Card;
        global.getBestHand = poker.getBestHand;
        global.evaluate5Cards = poker.evaluate5Cards;
        global.compareHandScores = poker.compareHandScores;
        global.HAND_CATEGORIES = poker.HAND_CATEGORIES;
    }
}

// Sanitizadores y Constantes de Seguridad
const VALID_AVATAR_EMOJIS = ['🕵️', '🧠', '🕶️', '💻', '🔑', '🧨', '🏎️', '🤖'];
const DEFAULT_AVATAR = '🕵️';
const VALID_EMOTES = ['👀', '🤔', '😅', '😱', '🤞', '💰', '🚨'];

// Validador estricto de Avatares (Emoji permitido o Data URL imagen <= 40KB)
function sanitizeAvatar(avatar) {
    if (!avatar || typeof avatar !== 'string') return DEFAULT_AVATAR;
    const trimmed = avatar.trim();
    if (VALID_AVATAR_EMOJIS.includes(trimmed)) {
        return trimmed;
    }
    // Strict Data URL regex: data:image/(jpeg|png|webp);base64,... (cap at ~55,000 chars ≈ 40KB)
    const dataUrlRegex = /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;
    if (trimmed.length <= 55000 && dataUrlRegex.test(trimmed)) {
        return trimmed;
    }
    return DEFAULT_AVATAR;
}

// Sanitizador de Nombres de Jugador: strip control/bidi chars, collapse whitespace, max 15 chars
function sanitizePlayerName(name) {
    if (!name || typeof name !== 'string') return 'Agente';
    // Strip control characters and bidirectional overrides
    const cleaned = name.replace(/[\x00-\x1F\x7F-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .slice(0, 15);
    return cleaned || 'Agente';
}

// Sanitizador de Mensajes de Chat: strip control chars, max 120 chars, drop empty
function sanitizeChatMessage(text) {
    if (!text || typeof text !== 'string') return '';
    const cleaned = text.replace(/[\x00-\x1F\x7F-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
                        .trim()
                        .slice(0, 120);
    return cleaned;
}

function isValidEmote(emote) {
    return typeof emote === 'string' && VALID_EMOTES.includes(emote.trim());
}

class OperacionBovedaGame {
    constructor(options = {}) {
        this.options = Object.assign({
            maxVaults: 3,
            maxAlarms: 3,
            minPlayers: 3,
            maxPlayers: 6,
            onStateChange: null
        }, options);

        this.onStateChange = this.options.onStateChange;
        this.players = [];
        this.communityCards = [];
        this.deck = new Deck();
        this.phase = 'lobby'; // lobby, preflop, flop, turn, river, showdown, round_end, game_over
        this.round = 1;
        this.vaultsCracked = 0;
        this.alarmsTriggered = 0;
        this.availableChips = [];
        this.showdownStep = 0;
        this.showdownResults = [];
        this.roundSuccess = null;
        this.failureReason = null;
        this.log = [];
    }

    notifyChange() {
        if (typeof this.onStateChange === 'function') {
            this.onStateChange();
        }
    }

    addPlayer(id, name, avatar, isBot = false) {
        if (this.players.length >= this.options.maxPlayers) {
            return { success: false, message: 'La sala está llena (máximo 6 jugadores).' };
        }
        if (this.players.some(p => p.id === id)) {
            return { success: false, message: 'El jugador ya está en la sala.' };
        }

        const safeName = sanitizePlayerName(name || `Agente ${this.players.length + 1}`);
        const safeAvatar = sanitizeAvatar(avatar || DEFAULT_AVATAR);

        const player = {
            id,
            name: safeName,
            avatar: safeAvatar,
            isBot,
            cards: [],
            currentChip: null,
            chipsHistory: {
                preflop: null,
                flop: null,
                turn: null,
                river: null
            },
            bestHand: null,
            ready: false
        };

        this.players.push(player);
        this.addLog(`El agente ${player.name} (${player.avatar}) se unió al equipo.`);
        this.notifyChange();
        return { success: true, player };
    }

    updatePlayerProfile(id, newName, newAvatar) {
        const player = this.players.find(p => p.id === id);
        if (!player) return { success: false };

        if (newName !== undefined && newName !== null) {
            player.name = sanitizePlayerName(newName);
        }
        if (newAvatar !== undefined && newAvatar !== null) {
            player.avatar = sanitizeAvatar(newAvatar);
        }

        this.notifyChange();
        return { success: true, player };
    }

    removePlayer(id) {
        const idx = this.players.findIndex(p => p.id === id);
        if (idx !== -1) {
            const removed = this.players.splice(idx, 1)[0];
            this.addLog(`El agente ${removed.name} abandonó el equipo.`);

            // Acomodar la partida en curso a los jugadores que quedan (1..total)
            const total = this.players.length;
            if (total > 0 && ['preflop', 'flop', 'turn', 'river'].includes(this.phase)) {
                // Reordenar y compactar fichas actuales dentro del rango 1..total preservando el orden relativo
                const withChip = this.players
                    .filter(p => p.currentChip !== null)
                    .sort((a, b) => a.currentChip - b.currentChip);

                // Si alguna ficha excede el nuevo total (o para evitar huecos fuera de rango), reindexar
                if (withChip.some(p => p.currentChip > total)) {
                    const used = new Set();
                    withChip.forEach(p => {
                        if (p.currentChip <= total && !used.has(p.currentChip)) {
                            used.add(p.currentChip);
                        } else {
                            // Buscar la ficha libre más alta disponible <= total
                            for (let c = total; c >= 1; c--) {
                                if (!used.has(c)) {
                                    p.currentChip = c;
                                    p.chipsHistory[this.phase] = c;
                                    used.add(c);
                                    break;
                                }
                            }
                        }
                    });
                }

                // Compactar historial de fases anteriores para que estén dentro de 1..total
                ['preflop', 'flop', 'turn', 'river'].forEach(ph => {
                    const holders = this.players
                        .filter(p => p.chipsHistory && p.chipsHistory[ph] !== null)
                        .sort((a, b) => a.chipsHistory[ph] - b.chipsHistory[ph]);
                    if (holders.some(p => p.chipsHistory[ph] > total)) {
                        holders.forEach((p, rankIdx) => {
                            p.chipsHistory[ph] = Math.min(total, rankIdx + 1);
                        });
                    }
                });

                this.updateAvailableChips();
                this.reassignOrphanBots();
                this.checkAllReadyCondition();
            }

            this.notifyChange();
            return { success: true, player: removed };
        }
        return { success: false };
    }

    addBot() {
        if (this.players.length >= this.options.maxPlayers) return false;
        // Evitar nombres o avatares repetidos con cualquier jugador actual
        const availableBots = BOT_NAMES.filter(b => 
            !this.players.some(p => p.name.toLowerCase().includes(b.name.toLowerCase()) || p.avatar === b.avatar)
        );
        const botData = availableBots[0] || BOT_NAMES[this.players.length % BOT_NAMES.length] || { name: `Bot ${this.players.length + 1}`, avatar: '🤖' };
        const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        return this.addPlayer(botId, botData.name, botData.avatar, true);
    }

    removeBots() {
        this.players = this.players.filter(p => !p.isBot);
    }

    startNewGame() {
        if (this.players.length < this.options.minPlayers) {
            return { success: false, message: `Se necesitan mínimo ${this.options.minPlayers} jugadores (puedes agregar cómplices bots).` };
        }

        this.vaultsCracked = 0;
        this.alarmsTriggered = 0;
        this.round = 1;
        this.addLog(`--- ¡COMIENZA EL GOLPE! Objetivo: 3 Bóvedas sin activar 3 Alarmas ---`);
        this.startNewRound();
        return { success: true };
    }

    startNewRound() {
        this.deck.reset();
        this.communityCards = [];
        this.showdownStep = 0;
        this.showdownResults = [];
        this.roundSuccess = null;
        this.failureReason = null;

        // Resetear cartas y fichas de cada jugador
        for (const p of this.players) {
            p.cards = [this.deck.deal(), this.deck.deal()];
            p.currentChip = null;
            p.chipsHistory = { preflop: null, flop: null, turn: null, river: null };
            p.bestHand = evaluatePartialHand(p.cards);
            p.ready = false;
            p.finalRank = null;
        }

        this.setPhase('preflop');
        this.addLog(`Ronda ${this.round}: Fase PREFLOP. Se evalúan las 2 cartas privadas.`);
    }

    getPhaseColor() {
        switch (this.phase) {
            case 'preflop': return { key: 'white', name: 'Blancas', hex: '#ffffff', textColor: '#111827' };
            case 'flop': return { key: 'yellow', name: 'Amarillas', hex: '#facc15', textColor: '#1f2937' };
            case 'turn': return { key: 'orange', name: 'Naranjas', hex: '#fb923c', textColor: '#ffffff' };
            case 'river': return { key: 'red', name: 'Rojas', hex: '#ef4444', textColor: '#ffffff' };
            default: return { key: 'white', name: 'Mesa', hex: '#3b82f6', textColor: '#ffffff' };
        }
    }

    setPhase(newPhase) {
        this.phase = newPhase;
        const total = this.players.length;
        // Todas las fichas de 1 a N disponibles
        this.availableChips = [];
        for (let i = 1; i <= total; i++) {
            this.availableChips.push(i);
        }

        for (const p of this.players) {
            p.currentChip = null;
            p.ready = false;
            // Actualizar mejor mano con las cartas comunitarias actuales
            if (this.communityCards.length > 0) {
                p.bestHand = getBestHand([...p.cards, ...this.communityCards]);
            } else {
                p.bestHand = evaluatePartialHand(p.cards);
            }
        }

        // Si hay bots, hacer que tomen fichas con un leve retraso para naturalidad
        this.triggerBots();
    }

    // Un jugador selecciona o pide cambiar una ficha
    selectChip(playerId, chipValue) {
        if (!['preflop', 'flop', 'turn', 'river'].includes(this.phase)) {
            return { success: false, message: 'No es momento de elegir fichas.' };
        }

        const player = this.players.find(p => p.id === playerId);
        if (!player) return { success: false, message: 'Jugador no encontrado.' };

        // Si el jugador ya tiene esta ficha, no hace nada
        if (player.currentChip === chipValue) {
            return { success: true };
        }

        // Comprobar si otro jugador ya tiene esta ficha
        const otherPlayer = this.players.find(p => p.id !== playerId && p.currentChip === chipValue);

        // Si la ficha está libre en la mesa, tomarla directamente
        if (!otherPlayer) {
            player.currentChip = chipValue;
            player.chipsHistory[this.phase] = chipValue;
            player.ready = true;
            this.updateAvailableChips();
            this.checkAllReadyCondition();
            this.notifyChange();
            return { success: true, swapped: false };
        }

        // Si otro jugador la tiene, se genera una solicitud de intercambio
        const previousChip = player.currentChip;

        // Si el otro jugador es un bot, evalúa el intercambio de forma automática
        if (otherPlayer.isBot) {
            // El bot acepta e intercambia
            otherPlayer.currentChip = previousChip || null;
            otherPlayer.chipsHistory[this.phase] = otherPlayer.currentChip;
            otherPlayer.ready = otherPlayer.currentChip !== null;

            player.currentChip = chipValue;
            player.chipsHistory[this.phase] = chipValue;
            player.ready = true;

            this.updateAvailableChips();
            this.reassignOrphanBots();
            this.checkAllReadyCondition();
            this.notifyChange();
            return { success: true, swapped: true, targetPlayer: otherPlayer.name };
        }

        // Si el otro jugador es un humano, requiere confirmación
        return { 
            success: false, 
            needsRequest: true, 
            targetPlayerId: otherPlayer.id, 
            targetPlayerName: otherPlayer.name,
            requestedChip: chipValue,
            offeredChip: previousChip 
        };
    }

    // Ejecuta el intercambio aceptado entre dos jugadores
    executeSwap(requesterId, targetId, requestedChip, offeredChip) {
        const requester = this.players.find(p => p.id === requesterId);
        const target = this.players.find(p => p.id === targetId);

        if (!requester || !target) return false;

        requester.currentChip = requestedChip;
        requester.chipsHistory[this.phase] = requestedChip;
        requester.ready = true;

        target.currentChip = offeredChip || null;
        target.chipsHistory[this.phase] = target.currentChip;
        target.ready = target.currentChip !== null;

        this.updateAvailableChips();
        this.reassignOrphanBots();
        this.checkAllReadyCondition();
        this.notifyChange();
        return true;
    }

    updateAvailableChips() {
        const total = this.players.length;
        const taken = this.players.map(p => p.currentChip).filter(c => c !== null);
        this.availableChips = [];
        for (let i = 1; i <= total; i++) {
            if (!taken.includes(i)) {
                this.availableChips.push(i);
            }
        }
    }

    // Reasigna fichas a bots que no tengan ninguna asignada
    reassignOrphanBots() {
        const orphanBots = this.players.filter(p => p.isBot && p.currentChip === null);
        for (const bot of orphanBots) {
            this.updateAvailableChips();
            if (this.availableChips.length > 0) {
                const chosen = BotPlayer.chooseChip(
                    bot.cards,
                    this.communityCards,
                    this.phase,
                    this.players.length,
                    this.availableChips
                );
                bot.currentChip = chosen;
                bot.chipsHistory[this.phase] = chosen;
                bot.ready = true;
                this.updateAvailableChips();
            }
        }
    }

    triggerBots() {
        const bots = this.players.filter(p => p.isBot);
        if (bots.length === 0) return;

        // Asignar fichas a todos los bots para la fase actual
        for (const bot of bots) {
            this.updateAvailableChips();
            if (this.availableChips.length > 0) {
                const chosen = BotPlayer.chooseChip(
                    bot.cards,
                    this.communityCards,
                    this.phase,
                    this.players.length,
                    this.availableChips
                );
                bot.currentChip = chosen;
                bot.chipsHistory[this.phase] = chosen;
                bot.ready = true;
                this.updateAvailableChips();
            }
        }

        this.checkAllReadyCondition();
        this.notifyChange();
    }

    setPlayerReady(playerId, ready = true) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return { success: false };
        if (player.currentChip === null) {
            return { success: false, message: 'Debes elegir una ficha antes de confirmar.' };
        }
        player.ready = ready;
        this.checkAllReadyCondition();
        this.notifyChange();
        return { success: true };
    }

    // Comprueba si todos los jugadores tienen fichas únicas y están listos para avanzar
    canAdvancePhase() {
        // Asegurar que ningún bot haya quedado sin ficha
        this.reassignOrphanBots();

        const total = this.players.length;
        const chips = this.players.map(p => p.currentChip);
        if (chips.some(c => c === null)) return false;

        // Deben ser todos únicos
        const unique = new Set(chips);
        if (unique.size !== total) return false;

        // Todos listos
        return this.players.every(p => p.ready);
    }

    checkAllReadyCondition() {
        // Reasignar bots huérfanos si los hay
        this.reassignOrphanBots();

        // En partidas con bots, marcarlos listos si tienen ficha
        for (const p of this.players) {
            if (p.isBot && p.currentChip !== null) {
                p.ready = true;
            }
        }
    }

    advancePhase() {
        if (!this.canAdvancePhase()) {
            return { success: false, message: 'Todos los jugadores deben tener una ficha única y estar listos.' };
        }

        switch (this.phase) {
            case 'preflop':
                // Entregar Flop (3 cartas comunitarias)
                this.communityCards = [this.deck.deal(), this.deck.deal(), this.deck.deal()];
                this.addLog(`FLOP revelado: [${this.communityCards.map(c => c.toString()).join(' ')}]. Fichas Amarillas.`);
                this.setPhase('flop');
                break;

            case 'flop':
                // Entregar Turn (1 carta comunitaria, total 4)
                this.communityCards.push(this.deck.deal());
                this.addLog(`TURN revelado: [${this.communityCards.map(c => c.toString()).join(' ')}]. Fichas Naranjas.`);
                this.setPhase('turn');
                break;

            case 'turn':
                // Entregar River (1 carta comunitaria, total 5)
                this.communityCards.push(this.deck.deal());
                this.addLog(`RIVER revelado: [${this.communityCards.map(c => c.toString()).join(' ')}]. Fichas Rojas (Orden Final).`);
                this.setPhase('river');
                break;

            case 'river':
                // Iniciar Resolución (Showdown)
                this.startShowdown();
                break;
        }

        return { success: true, phase: this.phase };
    }

    startShowdown() {
        this.phase = 'showdown';
        this.showdownStep = 0;
        this.showdownResults = [];
        this.roundSuccess = null;
        this.failureReason = null;

        // Ordenar jugadores según su ficha del River (de menor a mayor estrella: 1, 2, ..., N)
        this.orderedShowdownPlayers = [...this.players].sort((a, b) => {
            const chipA = a.chipsHistory.river || 0;
            const chipB = b.chipsHistory.river || 0;
            return chipA - chipB;
        });

        this.addLog(`--- INICIA LA RESOLUCIÓN ---`);
        this.addLog(`Se revelarán las cartas estrictamente del orden ⭐ 1 al ⭐ ${this.players.length}.`);
    }

    // Avanza un paso en la resolución: revela al siguiente jugador y evalúa
    stepShowdown() {
        if (this.phase !== 'showdown') return null;

        if (this.showdownStep >= this.orderedShowdownPlayers.length) {
            // Ya se revelaron todos
            this.concludeRound();
            return { done: true, success: this.roundSuccess };
        }

        const player = this.orderedShowdownPlayers[this.showdownStep];
        const allCards = [...player.cards, ...this.communityCards];
        const bestHand = getBestHand(allCards);
        player.bestHand = bestHand;

        let passed = true;
        let comparisonText = '';

        if (this.showdownStep === 0) {
            comparisonText = `⭐ ${player.chipsHistory.river}: Mano base inicial.`;
        } else {
            const prevPlayer = this.orderedShowdownPlayers[this.showdownStep - 1];
            const cmp = compareHandScores(bestHand.score, prevPlayer.bestHand.score);

            if (cmp >= 0) {
                // Igual o superior -> Éxito!
                passed = true;
                if (cmp === 0) {
                    comparisonText = `⭐ ${player.chipsHistory.river}: ¡Mano de igual fuerza que ${prevPlayer.name}! Cumple la regla.`;
                } else {
                    comparisonText = `⭐ ${player.chipsHistory.river}: Más fuerte que ${prevPlayer.name}. ¡Correcto!`;
                }
            } else {
                // Inferior -> Falló la secuencia!
                passed = false;
                comparisonText = `🚨 ¡FALLO! La mano de ${player.name} (${bestHand.name}) es MÁS DÉBIL que la de ${prevPlayer.name} (${prevPlayer.bestHand.name}).`;
                this.roundSuccess = false;
                this.failureReason = `${player.name} tenía una combinación inferior a ${prevPlayer.name}.`;
            }
        }

        const prevPlayerObj = (this.showdownStep > 0) ? this.orderedShowdownPlayers[this.showdownStep - 1] : null;

        const cleanPlayerCards = player.cards.map(c => ({
            id: c.id,
            rank: c.rank,
            suit: c.suit,
            label: c.label,
            symbol: c.symbol || c.suitSymbol,
            suitSymbol: c.suitSymbol || c.symbol,
            color: c.color,
            suitName: c.suitName
        }));

        const stepResult = {
            player: {
                ...player,
                cards: cleanPlayerCards
            },
            step: this.showdownStep + 1,
            total: this.orderedShowdownPlayers.length,
            bestHand,
            passed,
            comparisonText,
            prevPlayer: prevPlayerObj ? {
                id: prevPlayerObj.id,
                name: prevPlayerObj.name,
                bestHand: prevPlayerObj.bestHand
            } : null
        };

        this.showdownResults.push(stepResult);
        this.addLog(`[Showdown] ${player.name} revela: ${bestHand.description}. ${comparisonText}`);

        this.showdownStep++;

        // Si falló el orden, se marca fallo del golpe pero se siguen revelando todas las cartas
        if (!passed) {
            this.roundSuccess = false;
            if (!this.failureReason) {
                this.failureReason = comparisonText;
            }
        }

        // Al terminar de revelar a todos los jugadores, se concluye la ronda
        if (this.showdownStep >= this.orderedShowdownPlayers.length) {
            if (this.roundSuccess === null) {
                this.roundSuccess = true;
            }
            this.concludeRound();
            return { done: true, stepResult };
        }

        return { done: false, stepResult };
    }

    concludeRound() {
        this.phase = 'round_end';

        // Calcular puesto de fuerza real de cada jugador (1 = mano más débil, N = más fuerte)
        const sortedByStrength = [...this.players].sort((a, b) => {
            const handA = a.bestHand ? a.bestHand.score : [];
            const handB = b.bestHand ? b.bestHand.score : [];
            return compareHandScores(handA, handB);
        });

        sortedByStrength.forEach((p, idx) => {
            p.finalRank = idx + 1;
        });

        if (this.roundSuccess) {
            this.vaultsCracked++;
            this.addLog(`🏦 ¡ÉXITO ROTUNDO! Bóveda ${this.vaultsCracked}/3 abierta.`);
        } else {
            this.alarmsTriggered++;
            this.addLog(`🚨 ¡ALARMA DISPARADA! Nivel de alarma: ${this.alarmsTriggered}/3.`);
        }

        // Comprobar condiciones de victoria / derrota
        if (this.vaultsCracked >= this.options.maxVaults) {
            this.phase = 'game_over';
            this.gameResult = 'victory';
            this.addLog(`🎉 ¡¡VICTORIA DEL EQUIPO!! Lograron los 3 golpes maestros y escaparon con el botín.`);
        } else if (this.alarmsTriggered >= this.options.maxAlarms) {
            this.phase = 'game_over';
            this.gameResult = 'defeat';
            this.addLog(`💥 ¡¡DERROTA!! Sonaron 3 alarmas y la policía rodeó el lugar. Fin de la partida.`);
        } else {
            this.round++;
        }
    }

    addLog(msg) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.log.unshift(`[${time}] ${msg}`);
        if (this.log.length > 50) this.log.pop();
    }

    // Exportar estado sanitizado para red / UI
    getStateForPlayer(playerId) {
        const isRoundOver = ['round_end', 'game_over'].includes(this.phase);

        return {
            phase: this.phase,
            round: this.round,
            vaultsCracked: this.vaultsCracked,
            alarmsTriggered: this.alarmsTriggered,
            maxVaults: this.options.maxVaults,
            maxAlarms: this.options.maxAlarms,
            phaseColor: this.getPhaseColor(),
            communityCards: this.communityCards.map(c => ({
                id: c.id,
                rank: c.rank,
                suit: c.suit,
                label: c.label,
                symbol: c.suitSymbol,
                color: c.color,
                suitName: c.suitName
            })),
            availableChips: this.availableChips,
            canAdvance: this.canAdvancePhase(),
            roundSuccess: this.roundSuccess,
            failureReason: this.failureReason,
            gameResult: this.gameResult || null,
            showdownStep: this.showdownStep,
            showdownResults: this.showdownResults.map(r => ({
                playerId: r.player.id,
                name: r.player.name,
                avatar: r.player.avatar,
                chip: r.player.chipsHistory.river,
                passed: r.passed,
                handName: r.bestHand.name,
                handDesc: r.bestHand.description,
                comparisonText: r.comparisonText
            })),
            players: this.players.map(p => {
                const isMe = p.id === playerId;
                const isRevealedInShowdown = this.showdownResults.some(r => r.player.id === p.id);
                const showCards = isMe || isRoundOver || isRevealedInShowdown;

                return {
                    id: p.id,
                    name: p.name,
                    avatar: p.avatar,
                    isBot: p.isBot,
                    currentChip: p.currentChip,
                    chipsHistory: p.chipsHistory,
                    ready: p.ready,
                    finalRank: isRoundOver ? p.finalRank : null,
                    // Solo reveladas si ya le tocó en la resolución o terminó la ronda
                    cards: showCards ? p.cards.map(c => ({
                        id: c.id,
                        rank: c.rank,
                        suit: c.suit,
                        label: c.label,
                        symbol: c.suitSymbol,
                        color: c.color,
                        suitName: c.suitName
                    })) : [{ hidden: true }, { hidden: true }],
                    bestHand: (isMe || isRoundOver || isRevealedInShowdown) && p.bestHand ? {
                        name: p.bestHand.name,
                        description: p.bestHand.description,
                        category: p.bestHand.category
                    } : null
                };
            }),
            log: this.log
        };
    }

    // Serializar estado completo autoritativo para migración de anfitrión si el Host abandona
    serializeFullGame() {
        return {
            phase: this.phase,
            round: this.round,
            vaultsCracked: this.vaultsCracked,
            alarmsTriggered: this.alarmsTriggered,
            availableChips: this.availableChips,
            roundSuccess: this.roundSuccess,
            failureReason: this.failureReason,
            gameResult: this.gameResult || null,
            showdownStep: this.showdownStep,
            communityCards: this.communityCards.map(c => ({ rank: c.rank, suit: c.suit })),
            deckCards: this.deck.cards.map(c => ({ rank: c.rank, suit: c.suit })),
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                isBot: p.isBot,
                cards: (p.cards || []).map(c => ({ rank: c.rank, suit: c.suit })),
                currentChip: p.currentChip,
                chipsHistory: Object.assign({}, p.chipsHistory),
                ready: p.ready,
                finalRank: p.finalRank || null
            })),
            log: this.log
        };
    }

    restoreFromSerialized(data) {
        if (!data) return;
        this.phase = data.phase || 'lobby';
        this.round = data.round || 1;
        this.vaultsCracked = data.vaultsCracked || 0;
        this.alarmsTriggered = data.alarmsTriggered || 0;
        this.availableChips = data.availableChips || [];
        this.roundSuccess = data.roundSuccess;
        this.failureReason = data.failureReason;
        this.gameResult = data.gameResult || null;
        this.showdownStep = data.showdownStep || 0;
        this.communityCards = (data.communityCards || []).map(c => new Card(c.rank, c.suit));
        this.deck.cards = (data.deckCards || []).map(c => new Card(c.rank, c.suit));
        this.players = (data.players || []).map(p => {
            const restoredCards = (p.cards || []).map(c => new Card(c.rank, c.suit));
            let bestHand = null;
            if (restoredCards.length === 2) {
                bestHand = this.communityCards.length > 0
                    ? getBestHand([...restoredCards, ...this.communityCards])
                    : evaluatePartialHand(restoredCards);
            }
            return {
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                isBot: !!p.isBot,
                cards: restoredCards,
                currentChip: p.currentChip,
                chipsHistory: Object.assign({ preflop: null, flop: null, turn: null, river: null }, p.chipsHistory),
                bestHand,
                ready: !!p.ready,
                finalRank: p.finalRank || null
            };
        });
        this.log = data.log || [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OperacionBovedaGame,
        sanitizeAvatar,
        sanitizePlayerName,
        sanitizeChatMessage,
        isValidEmote,
        VALID_AVATAR_EMOJIS,
        DEFAULT_AVATAR,
        VALID_EMOTES
    };
}
