// network.js - Capa de comunicación PeerJS (WebRTC P2P) y modo Local

class GameNetwork {
    constructor(callbacks = {}) {
        this.callbacks = Object.assign({
            onStateUpdate: () => {},
            onConnected: () => {},
            onError: () => {},
            onPlayerJoined: () => {},
            onPlayerLeft: () => {},
            onEmote: () => {},
            onChatMessage: () => {},
            onSwapRequest: () => {},
            onSwapResponse: () => {},
            onShowdownStep: () => {}
        }, callbacks);

        this.peer = null;
        this.isHost = false;
        this.isLocal = false;
        this.localPlayerId = null;
        this.roomCode = null;
        this.connections = new Map(); // Para el Host: peerId -> conn
        this.hostConn = null; // Para el Guest: conn con el Host
        this.game = null; // Instancia authoritative si es Host o Local

        // Seguridad y Robustez de Red
        this.rejoinTokens = new Map(); // Host-only: playerId -> secretToken
        this.rejoinToken = null; // Guest secret token
        this.pendingSwapRequests = new Map(); // targetPlayerId -> { requesterId, requestedChip, offeredChip, timestamp }
        this.chatRateLimits = new Map(); // playerId -> [timestamps]
        this.maxConnections = 8; // maxPlayers (6) + margen
    }

    generateSecureToken() {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const arr = new Uint8Array(16);
            crypto.getRandomValues(arr);
            return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
        }
        return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }

    // Modo 1: Jugar solo o con bots (100% local, sin red externa)
    startLocalGame(playerName, avatar) {
        this.isLocal = true;
        this.isHost = true;
        this.localPlayerId = 'p_local_me';
        this.roomCode = 'LOCAL';

        this.game = new OperacionBovedaGame({
            onStateChange: () => this.broadcastLocalState()
        });
        this.game.addPlayer(this.localPlayerId, playerName, avatar, false);

        // Notificar estado
        this.broadcastLocalState();
        this.callbacks.onConnected({ roomCode: 'LOCAL', isHost: true });
    }

    // Modo 2: Crear Sala Online como Anfitrión (Host)
    createOnlineRoom(playerName, avatar, customCode = null) {
        this.isLocal = false;
        this.isHost = true;
        this.localPlayerId = 'p_host_' + Math.random().toString(36).substr(2, 6);

        const code = customCode || Math.random().toString(36).substr(2, 5).toUpperCase();
        this.roomCode = code;
        const peerId = `opboveda-${code.toLowerCase()}`;

        if (typeof Peer === 'undefined') {
            this.callbacks.onError('La librería PeerJS no está cargada en el navegador.');
            return;
        }

        try {
            this.peer = new Peer(peerId, {
                debug: 1
            });
        } catch (err) {
            this.callbacks.onError(`Error al inicializar PeerJS: ${err.message}`);
            return;
        }

        this.game = new OperacionBovedaGame({
            onStateChange: () => this.broadcastState()
        });
        this.game.addPlayer(this.localPlayerId, playerName, avatar, false);

        // Host generates its own rejoin token in case of future migration
        this.rejoinToken = this.generateSecureToken();
        this.rejoinTokens.set(this.localPlayerId, this.rejoinToken);

        this.peer.on('open', (id) => {
            console.log('Sala creada con ID:', id, 'Código:', code);
            this.callbacks.onConnected({ roomCode: code, isHost: true });
            this.broadcastState();
        });

        this.peer.on('connection', (conn) => {
            this.handleIncomingConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (err.type === 'unavailable-id') {
                this.callbacks.onError(`El código de sala "${code}" ya está en uso. Intenta con otro.`);
            } else {
                this.callbacks.onError(`Error de red: ${err.type}`);
            }
        });
    }

    // Maneja nuevo jugador que se conecta al Host
    handleIncomingConnection(conn) {
        if (this.connections.size >= this.maxConnections) {
            conn.on('open', () => {
                conn.send({ type: 'JOIN_REJECTED', message: 'La sala está completa (máximo de conexiones alcanzado).' });
                conn.close();
            });
            return;
        }

        conn.on('open', () => {
            conn.on('data', (data) => {
                this.handleHostReceivedData(conn, data);
            });
        });

        conn.on('close', () => {
            const playerId = conn.metadata && conn.metadata.playerId;
            if (playerId && this.connections.has(playerId)) {
                const res = this.game.removePlayer(playerId);
                this.connections.delete(playerId);
                this.rejoinTokens.delete(playerId);
                this.chatRateLimits.delete(playerId);
                const leftName = res && res.player ? res.player.name : 'Un agente';
                this.notifyPlayerLeftToAll(playerId, leftName);
                this.broadcastState();
            }
        });
    }

    handleHostReceivedData(conn, msg) {
        // Validación de forma y tipo de mensaje
        if (!msg || typeof msg !== 'object') return;
        if (typeof msg.type !== 'string') return;

        // Limitar tamaño de mensaje a ~64KB
        try {
            const str = JSON.stringify(msg);
            if (str.length > 65536) return;
        } catch (e) {
            return;
        }

        const ALLOWED_HOST_MSG_TYPES = new Set([
            'JOIN_ROOM', 'SELECT_CHIP', 'SWAP_RESPONSE', 'SET_READY',
            'EMOTE', 'CHAT_MESSAGE', 'LEAVE_ROOM', 'REJOIN_MIGRATED_HOST',
            'UPDATE_PROFILE'
        ]);

        if (!ALLOWED_HOST_MSG_TYPES.has(msg.type)) return;

        // Requiere haber completado JOIN_ROOM o REJOIN_MIGRATED_HOST para cualquier otra acción
        if (msg.type !== 'JOIN_ROOM' && msg.type !== 'REJOIN_MIGRATED_HOST') {
            if (!conn.metadata || !conn.metadata.joined || !conn.metadata.playerId) {
                return;
            }
        }

        switch (msg.type) {
            case 'JOIN_ROOM': {
                if (conn.metadata && conn.metadata.joined) {
                    // Permitir JOIN_ROOM solo una vez por conexión
                    return;
                }

                if (this.connections.size >= this.maxConnections) {
                    conn.send({ type: 'JOIN_REJECTED', message: 'La sala está completa.' });
                    conn.close();
                    return;
                }

                const playerId = 'p_guest_' + Math.random().toString(36).substr(2, 6);
                const rejoinToken = this.generateSecureToken();
                conn.metadata = { playerId, joined: true };
                this.connections.set(playerId, conn);
                this.rejoinTokens.set(playerId, rejoinToken);

                const cleanName = (typeof sanitizePlayerName === 'function') ? sanitizePlayerName(msg.name) : msg.name;
                const cleanAvatar = (typeof sanitizeAvatar === 'function') ? sanitizeAvatar(msg.avatar) : msg.avatar;

                const res = this.game.addPlayer(playerId, cleanName, cleanAvatar, false);
                if (!res.success) {
                    this.connections.delete(playerId);
                    this.rejoinTokens.delete(playerId);
                    conn.send({ type: 'JOIN_REJECTED', message: res.message });
                    conn.close();
                    return;
                }

                // El token secreto se entrega ÚNICAMENTE a este cliente
                conn.send({
                    type: 'JOIN_ACCEPTED',
                    playerId,
                    rejoinToken,
                    roomCode: this.roomCode
                });
                this.callbacks.onPlayerJoined(res.player);
                this.broadcastState();
                break;
            }

            case 'SELECT_CHIP': {
                const pid = conn.metadata.playerId;
                if (!Number.isInteger(msg.chip) || msg.chip < 1 || msg.chip > this.game.players.length) {
                    return;
                }

                const res = this.game.selectChip(pid, msg.chip);
                if (res && res.needsRequest) {
                    const requester = this.game.players.find(p => p.id === pid);
                    const swapPayload = {
                        type: 'SWAP_REQUEST',
                        requesterId: pid,
                        requesterName: requester ? requester.name : 'Un jugador',
                        requesterAvatar: requester ? requester.avatar : '🕵️',
                        requestedChip: res.requestedChip,
                        offeredChip: res.offeredChip
                    };

                    // Registrar petición pendiente para verificar la respuesta posteriormente
                    this.pendingSwapRequests.set(res.targetPlayerId, {
                        requesterId: pid,
                        requestedChip: res.requestedChip,
                        offeredChip: res.offeredChip,
                        timestamp: Date.now()
                    });

                    if (res.targetPlayerId === this.localPlayerId) {
                        this.callbacks.onSwapRequest(swapPayload);
                    } else {
                        const targetConn = this.connections.get(res.targetPlayerId);
                        if (targetConn && targetConn.open) {
                            targetConn.send(swapPayload);
                        }
                    }
                } else {
                    this.broadcastState();
                }
                break;
            }

            case 'SWAP_RESPONSE': {
                const pid = conn.metadata.playerId;
                const pending = this.pendingSwapRequests.get(pid);
                if (!pending || pending.requesterId !== msg.requesterId || pending.requestedChip !== msg.requestedChip) {
                    // Respuesta no solicitada o datos incongruentes, descartar
                    return;
                }
                this.pendingSwapRequests.delete(pid);

                if (msg.accepted === true) {
                    this.game.executeSwap(pending.requesterId, pid, pending.requestedChip, pending.offeredChip);
                    this.broadcastState();
                } else {
                    const responder = this.game.players.find(p => p.id === pid);
                    const targetName = responder ? responder.name : 'El jugador';
                    if (pending.requesterId === this.localPlayerId) {
                        this.callbacks.onSwapResponse({ accepted: false, targetName });
                    } else {
                        const reqConn = this.connections.get(pending.requesterId);
                        if (reqConn && reqConn.open) {
                            reqConn.send({ type: 'SWAP_REJECTED', targetName });
                        }
                    }
                }
                break;
            }

            case 'SET_READY': {
                const pid = conn.metadata.playerId;
                if (typeof msg.ready === 'boolean') {
                    this.game.setPlayerReady(pid, msg.ready);
                    this.broadcastState();
                }
                break;
            }

            case 'EMOTE': {
                const pid = conn.metadata.playerId;
                if (typeof msg.emote === 'string') {
                    const isValid = (typeof isValidEmote === 'function') ? isValidEmote(msg.emote) : ['👀', '🤔', '😅', '😱', '🤞', '💰', '🚨'].includes(msg.emote.trim());
                    if (isValid) {
                        this.broadcastEmote(pid, msg.emote.trim());
                    }
                }
                break;
            }

            case 'CHAT_MESSAGE': {
                const pid = conn.metadata.playerId;
                const cleanText = (typeof sanitizeChatMessage === 'function') ? sanitizeChatMessage(msg.text) : (msg.text ? String(msg.text).trim().slice(0, 120) : '');
                if (!cleanText) return;

                // Rate limiting: máximo 5 mensajes en 3 segundos por conexión
                const now = Date.now();
                const timestamps = this.chatRateLimits.get(pid) || [];
                const recent = timestamps.filter(t => now - t < 3000);
                if (recent.length >= 5) {
                    return;
                }
                recent.push(now);
                this.chatRateLimits.set(pid, recent);

                const player = this.game.players.find(p => p.id === pid);
                const name = player ? player.name : 'Agente';
                const avatar = player ? player.avatar : '🕵️';

                // Siempre se construye el payload con los datos autoritativos del Host
                this.broadcastChatMessage(pid, name, avatar, cleanText);
                break;
            }

            case 'LEAVE_ROOM': {
                const pid = conn.metadata.playerId;
                this.connections.delete(pid);
                this.rejoinTokens.delete(pid);
                this.chatRateLimits.delete(pid);
                const res = this.game.removePlayer(pid);
                if (res && res.success) {
                    const leftName = res.player ? res.player.name : 'Un agente';
                    this.notifyPlayerLeftToAll(pid, leftName);
                    this.broadcastState();
                }
                break;
            }

            case 'REJOIN_MIGRATED_HOST': {
                const pid = msg.playerId;
                const token = msg.rejoinToken;
                if (!pid || typeof pid !== 'string' || !token || typeof token !== 'string') {
                    conn.send({ type: 'JOIN_REJECTED', message: 'Autenticación de sesión fallida.' });
                    conn.close();
                    return;
                }
                if (!this.rejoinTokens.has(pid) || this.rejoinTokens.get(pid) !== token) {
                    conn.send({ type: 'JOIN_REJECTED', message: 'Token de sesión inválido.' });
                    conn.close();
                    return;
                }

                conn.metadata = { playerId: pid, joined: true };
                this.connections.set(pid, conn);
                this.broadcastState();
                break;
            }

            case 'UPDATE_PROFILE': {
                const pid = conn.metadata.playerId;
                if (this.game) {
                    this.game.updatePlayerProfile(pid, msg.name, msg.avatar);
                    this.broadcastState();
                }
                break;
            }
        }
    }

    notifyPlayerLeftToAll(playerId, playerName) {
        const remainingCount = this.game ? this.game.players.length : 0;
        this.callbacks.onPlayerLeft(playerId, playerName, remainingCount);
        for (const conn of this.connections.values()) {
            if (conn.open) {
                conn.send({
                    type: 'PLAYER_LEFT_NOTICE',
                    playerId,
                    playerName,
                    remainingCount
                });
            }
        }
    }

    // Modo 3: Unirse a Sala Online como Invitado (Guest)
    joinOnlineRoom(code, playerName, avatar) {
        this.isLocal = false;
        this.isHost = false;
        this.roomCode = code.toUpperCase();
        const hostPeerId = `opboveda-${this.roomCode.toLowerCase()}`;

        if (typeof Peer === 'undefined') {
            this.callbacks.onError('La librería PeerJS no está disponible.');
            return;
        }

        try {
            this.peer = new Peer({ debug: 1 });
        } catch (err) {
            this.callbacks.onError(`Error al inicializar conexión: ${err.message}`);
            return;
        }

        this.peer.on('open', () => {
            console.log('Conectando con Host:', hostPeerId);
            const conn = this.peer.connect(hostPeerId, { reliable: true });
            this.hostConn = conn;

            conn.on('open', () => {
                conn.send({
                    type: 'JOIN_ROOM',
                    name: playerName,
                    avatar: avatar
                });
            });

            conn.on('data', (data) => {
                this.handleGuestReceivedData(data);
            });

            conn.on('close', () => {
                if (this.isMigratingHost || this.isExiting) return;
                this.callbacks.onError('Se perdió la conexión con el anfitrión de la sala.');
            });

            conn.on('error', (err) => {
                this.callbacks.onError(`Error de conexión con el anfitrión: ${err}`);
            });
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            this.callbacks.onError(`No se pudo conectar a la sala "${this.roomCode}". Comprueba que el código sea correcto.`);
        });
    }

    handleGuestReceivedData(msg) {
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'JOIN_ACCEPTED':
                this.localPlayerId = msg.playerId;
                this.rejoinToken = msg.rejoinToken || null;
                this.callbacks.onConnected({ roomCode: msg.roomCode, isHost: false });
                break;

            case 'JOIN_REJECTED':
                this.callbacks.onError(msg.message || 'No se pudo ingresar a la sala.');
                break;

            case 'STATE_UPDATE':
                this.callbacks.onStateUpdate(msg.state, this.localPlayerId);
                break;

            case 'EMOTE':
                this.callbacks.onEmote(msg.playerId, msg.emote);
                break;

            case 'CHAT_MESSAGE':
                this.callbacks.onChatMessage({
                    playerId: msg.playerId,
                    name: msg.name,
                    avatar: msg.avatar,
                    text: msg.text,
                    time: msg.time
                });
                break;

            case 'SWAP_REQUEST':
                this.callbacks.onSwapRequest(msg);
                break;

            case 'SWAP_REJECTED':
                this.callbacks.onSwapResponse({ accepted: false, targetName: msg.targetName });
                break;

            case 'SHOWDOWN_STEP':
                this.callbacks.onShowdownStep(msg.stepResult);
                break;

            case 'PLAYER_LEFT_NOTICE':
                this.callbacks.onPlayerLeft(msg.playerId, msg.playerName, msg.remainingCount);
                break;

            case 'HOST_MIGRATION':
                this.handleHostMigration(msg);
                break;
        }
    }

    handleHostMigration(msg) {
        this.isMigratingHost = true;
        this.callbacks.onPlayerLeft(msg.leftPlayerId, msg.leftPlayerName);

        if (this.localPlayerId === msg.newHostId || msg.isNewHost) {
            // Este invitado asume automáticamente como nuevo Host de la partida
            const tempGame = new OperacionBovedaGame({
                onStateChange: () => this.broadcastState()
            });
            tempGame.restoreFromSerialized(msg.fullGameData);

            this.isHost = true;
            this.game = tempGame;
            this.connections = new Map();
            this.rejoinTokens = new Map(Object.entries(msg.rejoinTokens || {}));
            this.pendingSwapRequests = new Map();
            this.chatRateLimits = new Map();
            this.hostConn = null;

            // Actualizar de inmediato la pantalla del nuevo Host con la mesa reacomodada
            this.broadcastState();

            if (this.peer) {
                try { this.peer.destroy(); } catch (e) {}
            }
            try {
                this.peer = new Peer(msg.newHostPeerId, { debug: 1 });
                this.peer.on('connection', (conn) => {
                    this.handleIncomingConnection(conn);
                });
            } catch (e) {
                console.error('Error al migrar Host:', e);
            }
            this.isMigratingHost = false;
        } else {
            // Los demás invitados actualizan su mesa con su estado sanitizado (sin ver cartas ajenas)
            if (msg.sanitizedState) {
                this.callbacks.onStateUpdate(msg.sanitizedState, this.localPlayerId);
            }

            setTimeout(() => {
                if (!this.peer || this.isExiting) return;
                const conn = this.peer.connect(msg.newHostPeerId, { reliable: true });
                this.hostConn = conn;
                conn.on('open', () => {
                    this.isMigratingHost = false;
                    conn.send({
                        type: 'REJOIN_MIGRATED_HOST',
                        playerId: this.localPlayerId,
                        rejoinToken: this.rejoinToken
                    });
                });
                conn.on('data', (data) => {
                    this.handleGuestReceivedData(data);
                });
                conn.on('close', () => {
                    if (this.isMigratingHost || this.isExiting) return;
                    this.callbacks.onError('Se perdió la conexión con el anfitrión de la sala.');
                });
            }, 350);
        }
    }

    // Acciones del jugador local (ya sea Host o Guest)
    selectChip(chipValue) {
        if (this.isHost) {
            const res = this.game.selectChip(this.localPlayerId, chipValue);
            if (res && res.needsRequest) {
                const requester = this.game.players.find(p => p.id === this.localPlayerId);
                const swapPayload = {
                    type: 'SWAP_REQUEST',
                    requesterId: this.localPlayerId,
                    requesterName: requester ? requester.name : 'Tú',
                    requesterAvatar: requester ? requester.avatar : '🕵️',
                    requestedChip: res.requestedChip,
                    offeredChip: res.offeredChip
                };
                const targetConn = this.connections.get(res.targetPlayerId);
                if (targetConn && targetConn.open) {
                    targetConn.send(swapPayload);
                }
            } else {
                if (this.isLocal) {
                    this.broadcastLocalState();
                } else {
                    this.broadcastState();
                }
            }
        } else if (this.hostConn && this.hostConn.open) {
            this.hostConn.send({ type: 'SELECT_CHIP', chip: chipValue });
        }
    }

    respondToSwap(requesterId, requestedChip, offeredChip, accepted) {
        const myName = (this.game && this.game.players) ? 
            (this.game.players.find(p => p.id === this.localPlayerId)?.name || 'Jugador') : 'Jugador';

        if (this.isHost) {
            if (accepted) {
                this.game.executeSwap(requesterId, this.localPlayerId, requestedChip, offeredChip);
                this.broadcastState();
            } else {
                const reqConn = this.connections.get(requesterId);
                if (reqConn && reqConn.open) {
                    reqConn.send({ type: 'SWAP_REJECTED', targetName: myName });
                }
            }
        } else if (this.hostConn && this.hostConn.open) {
            this.hostConn.send({
                type: 'SWAP_RESPONSE',
                requesterId,
                requestedChip,
                offeredChip,
                accepted,
                targetName: myName
            });
        }
    }

    setReady(ready = true) {
        if (this.isHost) {
            this.game.setPlayerReady(this.localPlayerId, ready);
            this.broadcastState();
        } else if (this.hostConn && this.hostConn.open) {
            this.hostConn.send({ type: 'SET_READY', ready });
        }
    }

    advancePhase() {
        if (!this.isHost) return;
        const res = this.game.advancePhase();
        this.broadcastState();
        return res;
    }

    stepShowdown() {
        if (!this.isHost) return;
        const res = this.game.stepShowdown();
        if (res && res.stepResult) {
            for (const conn of this.connections.values()) {
                if (conn.open) {
                    conn.send({ type: 'SHOWDOWN_STEP', stepResult: res.stepResult });
                }
            }
        }
        this.broadcastState();
        return res;
    }

    startNewRound() {
        if (!this.isHost) return;
        this.game.startNewRound();
        this.broadcastState();
    }

    startNewGame() {
        if (!this.isHost) return;
        const res = this.game.startNewGame();
        this.broadcastState();
        return res;
    }

    addBot() {
        if (!this.isHost) return;
        const res = this.game.addBot();
        this.broadcastState();
        return res;
    }

    removeBots() {
        if (!this.isHost) return;
        this.game.removeBots();
        this.broadcastState();
    }

    sendChatMessage(text, playerName, playerAvatar) {
        if (!text || !text.trim()) return;
        const cleanText = (typeof sanitizeChatMessage === 'function') ? sanitizeChatMessage(text) : text.trim().slice(0, 120);
        if (!cleanText) return;

        if (this.isHost) {
            this.broadcastChatMessage(this.localPlayerId, playerName, playerAvatar, cleanText);
        } else if (this.hostConn && this.hostConn.open) {
            this.hostConn.send({ type: 'CHAT_MESSAGE', text: cleanText });
        }
    }

    broadcastChatMessage(playerId, name, avatar, text) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const chatData = { playerId, name, avatar, text, time };
        this.callbacks.onChatMessage(chatData);

        for (const conn of this.connections.values()) {
            if (conn.open) {
                conn.send({ type: 'CHAT_MESSAGE', ...chatData });
            }
        }
    }

    sendEmote(emoji) {
        if (this.isHost) {
            this.broadcastEmote(this.localPlayerId, emoji);
        } else if (this.hostConn && this.hostConn.open) {
            this.hostConn.send({ type: 'EMOTE', emote: emoji });
        }
    }

    updateProfile(newName, newAvatar) {
        if (this.isHost) {
            if (!this.game) return;
            this.game.updatePlayerProfile(this.localPlayerId, newName, newAvatar);
            if (this.isLocal) {
                this.broadcastLocalState();
            } else {
                this.broadcastState();
            }
        } else if (this.hostConn && this.hostConn.open) {
            this.hostConn.send({
                type: 'UPDATE_PROFILE',
                name: newName,
                avatar: newAvatar
            });
        }
    }

    broadcastEmote(playerId, emote) {
        this.callbacks.onEmote(playerId, emote);
        for (const conn of this.connections.values()) {
            if (conn.open) {
                conn.send({ type: 'EMOTE', playerId, emote });
            }
        }
    }

    // El Host difunde el estado a todos los clientes (cada uno ve sus cartas privadas, no las ajenas)
    broadcastState() {
        if (!this.game) return;

        // Estado para el Host local
        const hostState = this.game.getStateForPlayer(this.localPlayerId);
        this.callbacks.onStateUpdate(hostState, this.localPlayerId);

        // Estado personalizado para cada cliente remoto
        for (const [playerId, conn] of this.connections.entries()) {
            if (conn.open) {
                const clientState = this.game.getStateForPlayer(playerId);
                conn.send({ type: 'STATE_UPDATE', state: clientState });
            }
        }
    }

    broadcastLocalState() {
        if (!this.game) return;
        const state = this.game.getStateForPlayer(this.localPlayerId);
        this.callbacks.onStateUpdate(state, this.localPlayerId);
    }

    // Cierra conexiones por completo para regresar al menú principal (Lobby) o al cerrar el navegador,
    // reacomodando automáticamente la partida para los jugadores que quedan
    disconnectAndExit() {
        if (this.isExiting) return;
        this.isExiting = true;

        if (!this.isHost && this.hostConn && this.hostConn.open) {
            try {
                this.hostConn.send({ type: 'LEAVE_ROOM' });
                this.hostConn.close();
            } catch (e) {}
        } else if (this.isHost && !this.isLocal && this.connections && this.connections.size > 0 && this.game) {
            // Si el Host abandona o cierra su navegador y quedan invitados conectados,
            // se retira al Host de la mesa, se reacomoda la partida y se migra el Host al primer invitado activo
            try {
                const res = this.game.removePlayer(this.localPlayerId);
                const leftName = (res && res.player) ? res.player.name : 'El anfitrión';
                let newHostId = null;

                for (const [pid, conn] of this.connections.entries()) {
                    if (conn && conn.open) {
                        newHostId = pid;
                        break;
                    }
                }

                if (newHostId) {
                    const newHostPeerId = `opboveda-${(this.roomCode || 'room').toLowerCase()}-h${Math.random().toString(36).substr(2, 4)}`;
                    const fullGameData = this.game.serializeFullGame();
                    const tokensObj = Object.fromEntries(this.rejoinTokens);

                    // 1. Enviar estado completo y tokens ÚNICAMENTE al nuevo Host
                    const newHostConn = this.connections.get(newHostId);
                    if (newHostConn && newHostConn.open) {
                        try {
                            newHostConn.send({
                                type: 'HOST_MIGRATION',
                                isNewHost: true,
                                newHostId,
                                newHostPeerId,
                                leftPlayerId: this.localPlayerId,
                                leftPlayerName: leftName,
                                fullGameData,
                                rejoinTokens: tokensObj
                            });
                        } catch (e) {}
                    }

                    // 2. A todos los demás invitados enviar ÚNICAMENTE su propio estado sanitizado
                    for (const [pid, conn] of this.connections.entries()) {
                        if (pid !== newHostId && conn && conn.open) {
                            try {
                                conn.send({
                                    type: 'HOST_MIGRATION',
                                    isNewHost: false,
                                    newHostId,
                                    newHostPeerId,
                                    leftPlayerId: this.localPlayerId,
                                    leftPlayerName: leftName,
                                    sanitizedState: this.game.getStateForPlayer(pid)
                                });
                            } catch (e) {}
                        }
                    }
                }
            } catch (e) {}
        }

        if (this.isHost && this.connections) {
            for (const conn of this.connections.values()) {
                try { conn.close(); } catch (e) {}
            }
            this.connections.clear();
        }
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
        }
        this.game = null;
        this.hostConn = null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameNetwork };
}
