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
                const leftName = res && res.player ? res.player.name : 'Un agente';
                this.notifyPlayerLeftToAll(playerId, leftName);
                this.broadcastState();
            }
        });
    }

    handleHostReceivedData(conn, msg) {
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'JOIN_ROOM': {
                const playerId = 'p_guest_' + Math.random().toString(36).substr(2, 6);
                conn.metadata = { playerId };
                this.connections.set(playerId, conn);

                const res = this.game.addPlayer(playerId, msg.name, msg.avatar, false);
                if (!res.success) {
                    conn.send({ type: 'JOIN_REJECTED', message: res.message });
                    conn.close();
                    return;
                }

                conn.send({ type: 'JOIN_ACCEPTED', playerId, roomCode: this.roomCode });
                this.callbacks.onPlayerJoined(res.player);
                this.broadcastState();
                break;
            }

            case 'SELECT_CHIP': {
                const pid = conn.metadata ? conn.metadata.playerId : null;
                if (pid) {
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
                }
                break;
            }

            case 'SWAP_RESPONSE': {
                const pid = conn.metadata ? conn.metadata.playerId : null;
                if (pid && msg.accepted) {
                    this.game.executeSwap(msg.requesterId, pid, msg.requestedChip, msg.offeredChip);
                    this.broadcastState();
                } else if (pid && !msg.accepted) {
                    // Notificar al solicitante que fue rechazado
                    if (msg.requesterId === this.localPlayerId) {
                        this.callbacks.onSwapResponse({ accepted: false, targetName: msg.targetName });
                    } else {
                        const reqConn = this.connections.get(msg.requesterId);
                        if (reqConn && reqConn.open) {
                            reqConn.send({ type: 'SWAP_REJECTED', targetName: msg.targetName });
                        }
                    }
                }
                break;
            }

            case 'SET_READY': {
                const pid = conn.metadata ? conn.metadata.playerId : null;
                if (pid) {
                    this.game.setPlayerReady(pid, msg.ready);
                    this.broadcastState();
                }
                break;
            }

            case 'EMOTE': {
                const pid = conn.metadata ? conn.metadata.playerId : null;
                if (pid) {
                    this.broadcastEmote(pid, msg.emote);
                }
                break;
            }

            case 'CHAT_MESSAGE': {
                const pid = conn.metadata ? conn.metadata.playerId : null;
                if (pid) {
                    const player = this.game.players.find(p => p.id === pid);
                    const name = player ? player.name : 'Agente';
                    const avatar = player ? player.avatar : '🕵️';
                    this.broadcastChatMessage(pid, name, avatar, msg.text);
                }
                break;
            }

            case 'LEAVE_ROOM': {
                const pid = conn.metadata ? conn.metadata.playerId : null;
                if (pid) {
                    this.connections.delete(pid);
                    const res = this.game.removePlayer(pid);
                    if (res && res.success) {
                        const leftName = res.player ? res.player.name : 'Un agente';
                        this.notifyPlayerLeftToAll(pid, leftName);
                        this.broadcastState();
                    }
                }
                break;
            }

            case 'REJOIN_MIGRATED_HOST': {
                const pid = msg.playerId;
                if (pid) {
                    conn.metadata = { playerId: pid };
                    this.connections.set(pid, conn);
                    this.broadcastState();
                }
                break;
            }

            case 'UPDATE_PROFILE': {
                const pid = conn.metadata ? conn.metadata.playerId : null;
                if (pid && this.game) {
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
        const remainingCount = (msg.fullGameData && msg.fullGameData.players) ? msg.fullGameData.players.length : 0;
        this.callbacks.onPlayerLeft(msg.leftPlayerId, msg.leftPlayerName, remainingCount);

        const tempGame = new OperacionBovedaGame({
            onStateChange: () => this.broadcastState()
        });
        tempGame.restoreFromSerialized(msg.fullGameData);

        if (this.localPlayerId === msg.newHostId) {
            // Este invitado asume automáticamente como nuevo Host de la partida
            this.isHost = true;
            this.game = tempGame;
            this.connections = new Map();
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
            // Los demás invitados actualizan su mesa de inmediato y se reconectan al nuevo Host
            const myState = tempGame.getStateForPlayer(this.localPlayerId);
            this.callbacks.onStateUpdate(myState, this.localPlayerId);

            setTimeout(() => {
                if (!this.peer || this.isExiting) return;
                const conn = this.peer.connect(msg.newHostPeerId, { reliable: true });
                this.hostConn = conn;
                conn.on('open', () => {
                    this.isMigratingHost = false;
                    conn.send({
                        type: 'REJOIN_MIGRATED_HOST',
                        playerId: this.localPlayerId
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
        const cleanText = text.trim();
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
                    const migrationPayload = {
                        type: 'HOST_MIGRATION',
                        newHostId,
                        newHostPeerId,
                        leftPlayerId: this.localPlayerId,
                        leftPlayerName: leftName,
                        fullGameData: this.game.serializeFullGame()
                    };
                    for (const conn of this.connections.values()) {
                        if (conn && conn.open) {
                            try { conn.send(migrationPayload); } catch (e) {}
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
