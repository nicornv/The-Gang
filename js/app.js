// app.js - Controlador de Interfaz de Casino para "Operación Bóveda"

let network = null;
let currentGameState = null;
let myPlayerId = null;
let myName = 'Cerebro';
let myAvatar = '🕵️';
let chatUnreadCount = 0;
let isShowdownRunning = false;
let peerShowdownFailed = false;
let currentSpotlightPlayerId = null;
let pendingSwapRequest = null;
let isLocalAfk = false;

document.addEventListener('DOMContentLoaded', () => {
    initLobby();
    initModals();
    initSoundToggle();
    initLeaveButton();
    initCheatSheet();
    initChat();
    initSwapModal();
    initQuickTools();
    checkUrlForRoom();
});

// Garantizar salida limpia si el usuario cierra o recarga la pestaña
window.addEventListener('beforeunload', () => {
    if (network) {
        network.leaveRoom();
    }
});

window.addEventListener('pagehide', () => {
    if (network) {
        network.leaveRoom();
    }
});

function checkUrlForRoom() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        document.getElementById('input-join-code').value = roomParam.toUpperCase();
        document.getElementById('tab-join').click();
    }
}

// ==========================================
// 1. INICIALIZACIÓN DE LOBBY Y AVATARES
// ==========================================
function initLobby() {
    const avatarBtns = document.querySelectorAll('.avatar-btn:not(.avatar-upload-label)');
    avatarBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            myAvatar = btn.dataset.avatar;
            soundManager.playClick();
        });
    });

    // Subir foto propia como avatar
    const fileInput = document.getElementById('input-avatar-file');
    const uploadLabel = document.getElementById('btn-upload-avatar');
    const uploadIcon = document.getElementById('avatar-upload-icon');

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 96;
                canvas.height = 96;
                const ctx = canvas.getContext('2d');
                const minDim = Math.min(img.width, img.height);
                const sx = (img.width - minDim) / 2;
                const sy = (img.height - minDim) / 2;
                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 96, 96);

                myAvatar = canvas.toDataURL('image/jpeg', 0.85);

                document.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('selected'));
                uploadLabel.classList.add('selected');
                if (uploadIcon) {
                    uploadIcon.innerHTML = `<img src="${myAvatar}" class="avatar-custom-img" alt="avatar">`;
                }
                const previewAvatar = document.getElementById('lobby-preview-avatar');
                if (previewAvatar) {
                    previewAvatar.innerHTML = `<img src="${myAvatar}" class="avatar-custom-img" alt="avatar">`;
                }
                soundManager.playClick();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Botón copiar enlace rápido en lobby inicial
    const btnCopyAppLink = document.getElementById('btn-copy-app-link');
    if (btnCopyAppLink) {
        btnCopyAppLink.addEventListener('click', () => {
            soundManager.playClick();
            navigator.clipboard.writeText(window.location.href).then(() => {
                showToast('🔗 ¡Enlace copiado al portapapeles!');
            }).catch(() => {
                prompt('Copia este enlace:', window.location.href);
            });
        });
    }

    // Pestañas de modo
    const tabs = document.querySelectorAll('.lobby-tab');
    const sections = {
        'tab-create': document.getElementById('section-create'),
        'tab-join': document.getElementById('section-join'),
        'tab-solo': document.getElementById('section-solo')
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            Object.values(sections).forEach(s => s.classList.add('hidden'));
            sections[tab.id].classList.remove('hidden');
            soundManager.playClick();
        });
    });

    // Botón Jugar Solo (con Bots)
    document.getElementById('btn-start-solo').addEventListener('click', () => {
        soundManager.playClick();
        myName = document.getElementById('input-player-name').value.trim() || 'Agente';
        const numBots = parseInt(document.getElementById('select-bot-count').value, 10);

        setupNetwork();
        network.startLocalGame(myName, myAvatar);

        for (let i = 0; i < numBots; i++) {
            network.addBot();
        }

        setTimeout(() => {
            network.startNewGame();
        }, 150);
    });

    // Botón Crear Sala Online
    document.getElementById('btn-create-room').addEventListener('click', () => {
        soundManager.playClick();
        myName = document.getElementById('input-player-name').value.trim() || 'Líder del Golpe';
        setupNetwork();
        network.createOnlineRoom(myName, myAvatar);
    });

    // Botón Unirse a Sala Online
    document.getElementById('btn-join-room').addEventListener('click', () => {
        soundManager.playClick();
        myName = document.getElementById('input-player-name').value.trim() || 'Agente Invitado';
        const code = document.getElementById('input-join-code').value.trim();
        if (!code) {
            alert('Por favor ingresa un código de sala.');
            return;
        }
        setupNetwork();
        network.joinOnlineRoom(code, myName, myAvatar);
    });
}

// ==========================================
// 2. CONFIGURACIÓN DE RED Y MULTIJUGADOR
// ==========================================
function setupNetwork() {
    network = new GameNetwork({
        onConnected: ({ roomCode, isHost }) => {
            document.getElementById('header-room-info').classList.remove('hidden');
            document.getElementById('room-code-display').textContent = roomCode;
            const btnLeave = document.getElementById('btn-leave-game');
            if (btnLeave) btnLeave.classList.remove('hidden');

            const waitingCodeEl = document.getElementById('lobby-waiting-code');
            if (waitingCodeEl) waitingCodeEl.textContent = roomCode;

            if (roomCode === 'LOCAL') {
                document.getElementById('btn-copy-invite').classList.add('hidden');
                document.getElementById('lobby-screen').classList.add('hidden');
                document.getElementById('game-screen').classList.remove('hidden');
            } else {
                document.getElementById('btn-copy-invite').classList.remove('hidden');
                // En sala online, mostrar la vista de sala de espera en el lobby de 2 paneles
                const setupView = document.getElementById('lobby-setup-view');
                const waitingView = document.getElementById('lobby-waiting-view');
                const configSection = document.getElementById('lobby-config-section');
                if (setupView) setupView.classList.add('hidden');
                if (waitingView) waitingView.classList.remove('hidden');
                if (configSection) configSection.classList.add('hidden');

                const btnLobbyCopy = document.getElementById('btn-lobby-copy-invite');
                if (btnLobbyCopy) {
                    btnLobbyCopy.onclick = () => copyRoomInviteLink(roomCode);
                }
            }
        },
        onStateUpdate: (state, localPid) => {
            currentGameState = state;
            if (localPid) myPlayerId = localPid;
            renderGame(state);
        },
        onError: (err) => {
            showToast(`⚠️ ${err}`);
            if (err && (err.includes('anfitrión') || err.includes('conexión'))) {
                leaveGameToLobby(false);
            }
        },
        onPlayerLeft: (player) => {
            const pName = (player && player.name) ? player.name : 'Un jugador';
            showToast(`🚪 ${pName} abandonó la partida. La mesa se reacomodó.`);
        },
        onEmote: (playerId, emote) => {
            showFloatingEmote(playerId, emote);
        },
        onChatMessage: (chatData) => {
            appendChatMessage(chatData);
        },
        onSwapRequest: (req) => {
            handleIncomingSwapRequest(req);
        },
        onSwapResponse: (resp) => {
            if (!resp.accepted) {
                showToast(`❌ ${resp.targetName} rechazó el intercambio de ficha.`);
            } else {
                showToast(`✅ Intercambio de ficha aceptado.`);
            }
        },
        onShowdownStep: async (stepResult) => {
            if (network.isHost) return; // El anfitrión ya lo ejecuta en startAutomaticShowdown
            if (!isShowdownRunning) {
                isShowdownRunning = true;
                peerShowdownFailed = false;
                initShowdownModal(currentGameState);
            }
            const total = (currentGameState && currentGameState.players) ? currentGameState.players.length : stepResult.total;
            await renderShowdownStepAnimation(stepResult, stepResult.step - 1, total, peerShowdownFailed);
            if (!stepResult.passed) {
                peerShowdownFailed = true;
            }
            if (stepResult.step >= total) {
                finishShowdownModal(peerShowdownFailed);
                isShowdownRunning = false;
                peerShowdownFailed = false;
            }
        }
    });

    document.getElementById('btn-copy-invite').onclick = () => {
        const code = document.getElementById('room-code-display').textContent;
        copyRoomInviteLink(code);
    };
}

function copyRoomInviteLink(code) {
    soundManager.playClick();
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('📋 ¡Enlace de sala copiado! Pégalo en Discord.');
    }).catch(() => {
        prompt('Copia este enlace para tus amigos:', url);
    });
}

function renderLobbyWaitingRoom(state) {
    const listEl = document.getElementById('lobby-players-list');
    const countEl = document.getElementById('lobby-player-count');
    const statusEl = document.getElementById('lobby-waiting-status');
    const actionsEl = document.getElementById('lobby-waiting-actions');

    const players = state.players || [];
    const maxPlayers = 6;
    if (countEl) countEl.textContent = `${players.length} / ${maxPlayers}`;

    if (listEl) {
        let html = '';
        players.forEach((p, idx) => {
            const isMe = p.id === myPlayerId;
            const isHostPlayer = idx === 0 && !p.isBot;
            const tags = [
                isMe ? '<span class="lobby-role-tag tag-you">Tú</span>' : '',
                isHostPlayer ? '<span class="lobby-role-tag tag-host">Anfitrión</span>' : '',
                p.isBot ? '<span class="lobby-role-tag tag-bot">Bot</span>' : ''
            ].join('');

            html += `
                <div class="lobby-player-row ${isMe ? 'lobby-player-you' : ''}">
                    <div class="lobby-player-avatar">${renderAvatarHtml(p.avatar)}</div>
                    <div class="lobby-player-info">
                        <div class="lobby-player-name-row">
                            <span class="lobby-player-name">${p.name}</span>
                            ${tags}
                        </div>
                        <div class="lobby-player-status online">● ${p.isBot ? 'Cómplice IA listo' : 'Conectado'}</div>
                    </div>
                </div>
            `;
        });

        const emptyCount = Math.max(0, maxPlayers - players.length);
        if (emptyCount > 0) {
            html += '<div class="lobby-empty-slots">';
            for (let i = 0; i < emptyCount; i++) {
                html += '<div class="lobby-slot-empty">— Espacio disponible —</div>';
            }
            html += '</div>';
        }
        listEl.innerHTML = html;
    }

    const isHost = network && network.isHost;
    if (statusEl) {
        if (players.length < 3) {
            statusEl.textContent = `Faltan al menos ${3 - players.length} jugador(es) para iniciar (mínimo 3).`;
        } else {
            statusEl.textContent = isHost
                ? '✅ ¡Equipo listo! Ya podés iniciar el golpe.'
                : '✅ ¡Equipo listo! Esperando a que el anfitrión inicie el golpe...';
        }
    }

    if (actionsEl) {
        actionsEl.innerHTML = '';
        if (isHost) {
            const btnAddBot = document.createElement('button');
            btnAddBot.type = 'button';
            btnAddBot.className = 'btn btn-secondary';
            btnAddBot.innerHTML = '🤖 Añadir Cómplice Bot';
            btnAddBot.disabled = players.length >= maxPlayers;
            btnAddBot.onclick = () => {
                soundManager.playClick();
                network.addBot();
            };
            actionsEl.appendChild(btnAddBot);

            const btnStart = document.createElement('button');
            btnStart.type = 'button';
            btnStart.className = 'btn btn-primary btn-play-main';
            btnStart.innerHTML = '🚀 Iniciar Golpe';
            btnStart.disabled = players.length < 3;
            btnStart.onclick = () => {
                soundManager.playVaultSuccess();
                network.startNewGame();
            };
            actionsEl.appendChild(btnStart);
        }
    }
}

// ==========================================
// 3. RENDERIZADO PRINCIPAL DEL JUEGO
// ==========================================
function renderGame(state) {
    if (!state) return;

    const lobbyScreen = document.getElementById('lobby-screen');
    const gameScreen = document.getElementById('game-screen');

    // Mientras la sala online siga en fase 'lobby', actualizar el Lobby de 2 paneles
    if (state.phase === 'lobby' && document.getElementById('room-code-display').textContent !== 'LOCAL') {
        if (lobbyScreen) lobbyScreen.classList.remove('hidden');
        if (gameScreen) gameScreen.classList.add('hidden');
        renderLobbyWaitingRoom(state);
        return;
    }

    // Al comenzar la partida, ocultar el lobby y mostrar la mesa de juego
    if (lobbyScreen) lobbyScreen.classList.add('hidden');
    if (gameScreen) gameScreen.classList.remove('hidden');

    // Si estamos en fases de juego normales, cerrar el modal de recuento si estuviera abierto
    if (['preflop', 'flop', 'turn', 'river'].includes(state.phase)) {
        isShowdownRunning = false;
        const recuentoModal = document.getElementById('modal-recuento');
        if (recuentoModal) recuentoModal.classList.remove('active');
    }

    // Detectar inicio de nueva ronda (preflop) para disparar el reparto inicial una sola vez
    const roundKey = `${state.roundNumber ?? state.round ?? (state.vaultsCracked + state.alarmsTriggered)}`;
    const isFreshPreflopDeal = state.phase === 'preflop' && (
        lastPhaseSeen !== 'preflop' || lastRoundNumber !== roundKey
    );
    if (isFreshPreflopDeal) {
        prevCommunityCount = 0;
        lastCommunitySignature = '';
        lastRoundNumber = roundKey;
    }
    lastPhaseSeen = state.phase;

    renderVaultsAndAlarms(state);
    renderPhaseIndicator(state);
    renderCommunityCards(state.communityCards);
    renderChipsRack(state);
    renderPokerStarsSeats(state, isFreshPreflopDeal);
    renderActionControls(state);

    if (isFreshPreflopDeal) {
        playCasinoDealAnimation(state);
    }

    // Auto-showdown en River
    if (state.phase === 'showdown' && !isShowdownRunning && network.isHost) {
        startAutomaticShowdown(state);
    }

    if (state.phase === 'game_over') {
        showGameOverModal(state.gameResult);
    }
}

function renderVaultsAndAlarms(state) {
    const vaultSlots = document.querySelectorAll('.vault-slot');
    vaultSlots.forEach((slot, idx) => {
        if (idx < state.vaultsCracked) {
            slot.classList.add('cracked');
            slot.innerHTML = '🏦';
            slot.title = 'Bóveda Desbloqueada';
        } else {
            slot.classList.remove('cracked');
            slot.innerHTML = '🔒';
            slot.title = 'Bóveda Cerrada';
        }
    });

    const alarmSlots = document.querySelectorAll('.alarm-slot');
    alarmSlots.forEach((slot, idx) => {
        if (idx < state.alarmsTriggered) {
            slot.classList.add('triggered');
            slot.innerHTML = '🚨';
            slot.title = '¡Alarma Activada!';
        } else {
            slot.classList.remove('triggered');
            slot.innerHTML = '🛡️';
            slot.title = 'Seguridad Normal';
        }
    });
}

function renderPhaseIndicator(state) {
    const badge = document.getElementById('phase-badge');
    const subtext = document.getElementById('phase-subtext');

    const phaseNames = {
        lobby: 'SALA DE ESPERA',
        preflop: 'PREFLOP (Cartas Privadas)',
        flop: 'FLOP (3 Comunitarias)',
        turn: 'TURN (4.ª Comunitaria)',
        river: 'RIVER (5.ª Comunitaria)',
        showdown: 'RESOLUCIÓN EN VIVO',
        round_end: 'FIN DEL GOLPE',
        game_over: 'PARTIDA FINALIZADA'
    };

    badge.textContent = phaseNames[state.phase] || state.phase.toUpperCase();
    badge.style.backgroundColor = state.phaseColor.hex;
    badge.style.color = state.phaseColor.textColor;

    if (state.phase === 'preflop') {
        subtext.textContent = 'Fichas BLANCAS según tus 2 cartas de mano.';
    } else if (state.phase === 'flop') {
        subtext.textContent = 'Fichas AMARILLAS combinando con el Flop.';
    } else if (state.phase === 'turn') {
        subtext.textContent = 'Fichas NARANJAS con 4 cartas en mesa.';
    } else if (state.phase === 'river') {
        subtext.textContent = 'Fichas ROJAS (definirán el orden final de revelación).';
    } else if (state.phase === 'showdown') {
        subtext.textContent = 'Revelando una mano a la vez en orden ascendente.';
    } else {
        subtext.textContent = '';
    }
}

let prevCommunityCount = 0;
let lastCommunitySignature = '';
let lastRoundNumber = null;
let lastPhaseSeen = null;

function renderCommunityCards(cards) {
    const container = document.getElementById('community-cards-container');
    const safeCards = cards || [];
    const signature = safeCards.map(c => `${c.rank ?? c.label}${c.suit ?? c.symbol}`).join('|');

    // No destruir el DOM si las cartas comunitarias no cambiaron (evita cortar el flip 3D)
    if (signature === lastCommunitySignature && container.children.length === 5) {
        return;
    }

    container.innerHTML = '';

    if (safeCards.length < prevCommunityCount) {
        prevCommunityCount = 0;
    }

    const isNewDeal = safeCards.length > prevCommunityCount;
    const totalSlots = 5;

    for (let i = 0; i < totalSlots; i++) {
        if (i < safeCards.length) {
            const card = safeCards[i];
            const isFreshlyDealt = isNewDeal && i >= prevCommunityCount;
            const el = createCardElement(card, {
                extraClass: isFreshlyDealt ? 'card-anim-flip' : ''
            });
            if (isFreshlyDealt) {
                el.style.animationDelay = `${(i - prevCommunityCount) * 0.16}s`;
            }
            container.appendChild(el);
        } else {
            const slot = document.createElement('div');
            slot.className = 'card-placeholder';
            const slotLabels = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];
            slot.innerHTML = `<span>${slotLabels[i]}</span><span style="font-size:1.1rem;margin-top:2px;">🂠</span>`;
            container.appendChild(slot);
        }
    }

    if (isNewDeal && safeCards.length > 0) {
        soundManager.playCardDeal();
    }
    prevCommunityCount = safeCards.length;
    lastCommunitySignature = signature;
}

// Generador de cartas comunes de póker reales (baraja francesa clásica limpia)
function createCardElement(card, options = {}) {
    const el = document.createElement('div');

    if (!card || card.hidden) {
        el.className = `poker-card back ${options.extraClass || ''}`;
        el.innerHTML = `
            <div class="card-back-pattern">
                <div class="card-back-inner">
                    <span class="card-back-emblem">♠</span>
                </div>
            </div>
        `;
        return el;
    }

    // Normalizar valores para evitar 'undefined' bajo cualquier circunstancia
    const rankLabel = card.label || (typeof RANKS !== 'undefined' ? (RANKS.find(r => r.value === card.rank)?.label) : '') || String(card.rank || '');
    const suitSymbol = card.symbol || card.suitSymbol || (typeof SUITS !== 'undefined' ? (SUITS.find(s => s.id === card.suit)?.symbol) : '') || (card.suit === 'H' ? '♥' : card.suit === 'D' ? '♦' : card.suit === 'C' ? '♣' : '♠');
    const isRed = (card.color === 'red') || ['H', 'D'].includes(card.suit) || ['♥', '♦'].includes(suitSymbol);
    const colorClass = isRed ? 'red' : 'black';

    el.className = `poker-card ${colorClass} ${options.extraClass || ''}`;
    el.setAttribute('data-rank', rankLabel);
    el.setAttribute('data-suit', suitSymbol);

    el.innerHTML = `
        <div class="card-corner card-corner-top">
            <span class="card-rank">${rankLabel}</span>
            <span class="card-suit">${suitSymbol}</span>
        </div>
        <div class="card-pip-center">
            <span class="card-main-symbol">${suitSymbol}</span>
        </div>
        <div class="card-corner card-corner-bottom">
            <span class="card-rank">${rankLabel}</span>
            <span class="card-suit">${suitSymbol}</span>
        </div>
    `;
    return el;
}

// Fichas de casino reales: número grande, diseño circular clay, sin estrellas
function renderChipsRack(state) {
    const rackSection = document.getElementById('chips-rack-section');
    const container = document.getElementById('chips-container');
    container.innerHTML = '';

    const isChipPhase = ['preflop', 'flop', 'turn', 'river'].includes(state.phase);
    if (!isChipPhase) {
        rackSection.classList.add('hidden');
        return;
    }

    rackSection.classList.remove('hidden');

    const totalPlayers = state.players.length;
    const me = state.players.find(p => p.id === myPlayerId);
    const myCurrentChip = me ? me.currentChip : null;

    const colorKey = (state.phaseColor && state.phaseColor.key) || 'white';
    const colorClass = `chip-${colorKey}`;

    for (let num = 1; num <= totalPlayers; num++) {
        const chip = document.createElement('div');
        chip.className = `star-chip ${colorClass}`;

        const holder = state.players.find(p => p.currentChip === num);
        const isMyChip = (myCurrentChip === num);

        if (isMyChip) {
            chip.classList.add('selected');
        } else if (holder) {
            chip.classList.add('claimed-by-other');
        }

        chip.innerHTML = `
            <div class="chip-inner-disc">${num}</div>
            ${holder ? `<div class="chip-holder-tag">${renderAvatarMini(holder.avatar)} ${holder.name.split(' ')[0]}</div>` : ''}
        `;

        chip.onclick = () => {
            soundManager.playChipClink();
            network.selectChip(num);
        };

        container.appendChild(chip);
    }
}

function renderAvatarHtml(avatar) {
    if (avatar && (avatar.startsWith('data:') || avatar.startsWith('http'))) {
        return `<img src="${avatar}" class="player-avatar-img" alt="avatar">`;
    }
    return `<span>${avatar || '🕵️'}</span>`;
}

function renderAvatarMini(avatar) {
    if (avatar && (avatar.startsWith('data:') || avatar.startsWith('http'))) {
        return `<img src="${avatar}" style="width:14px;height:14px;border-radius:50%;vertical-align:middle;object-fit:cover;">`;
    }
    return avatar || '🕵️';
}

// ========================================================
// 4. ASIENTOS EN ARCO ALREDEDOR DE LA MESA (POKERSTARS)
// ========================================================
const ARC_SEAT_LAYOUTS = {
    1: [
        { left: 50, top: 86, dir: 'dir-bottom' }
    ],
    2: [
        { left: 50, top: 86, dir: 'dir-bottom' },
        { left: 50, top: 14, dir: 'dir-top' }
    ],
    3: [
        { left: 50, top: 86, dir: 'dir-bottom' },
        { left: 26, top: 16, dir: 'dir-left' },
        { left: 74, top: 16, dir: 'dir-right' }
    ],
    4: [
        { left: 50, top: 86, dir: 'dir-bottom' },
        { left: 11, top: 48, dir: 'dir-left' },
        { left: 50, top: 14, dir: 'dir-top' },
        { left: 89, top: 48, dir: 'dir-right' }
    ],
    5: [
        { left: 50, top: 86, dir: 'dir-bottom' },
        { left: 10, top: 53, dir: 'dir-left' },
        { left: 27, top: 15, dir: 'dir-left' },
        { left: 73, top: 15, dir: 'dir-right' },
        { left: 90, top: 53, dir: 'dir-right' }
    ],
    6: [
        { left: 50, top: 86, dir: 'dir-bottom' },
        { left: 10, top: 55, dir: 'dir-left' },
        { left: 23, top: 18, dir: 'dir-left' },
        { left: 50, top: 13, dir: 'dir-top' },
        { left: 77, top: 18, dir: 'dir-right' },
        { left: 90, top: 55, dir: 'dir-right' }
    ]
};

function playCasinoDealAnimation(state) {
    const layer = document.getElementById('casino-deal-layer');
    if (!layer || !state || !state.players || state.players.length === 0) return;

    layer.innerHTML = '';
    const total = state.players.length;
    const layout = ARC_SEAT_LAYOUTS[total] || ARC_SEAT_LAYOUTS[6];

    // 2 rondas de reparto (primera carta a cada jugador, luego segunda carta) como en casino real
    for (let roundIdx = 0; roundIdx < 2; roundIdx++) {
        for (let seatIdx = 0; seatIdx < total; seatIdx++) {
            const pos = layout[seatIdx] || { left: 50, top: 14 };
            const stepIdx = roundIdx * total + seatIdx;
            const delayMs = stepIdx * 95;

            const cardEl = createCardElement({ hidden: true }, { extraClass: 'flying-deal-card' });
            const offsetLeft = pos.dir === 'dir-right' ? -4 : (pos.dir === 'dir-left' ? 4 : 3);
            cardEl.style.setProperty('--fly-rot', roundIdx === 0 ? '-6deg' : '6deg');
            layer.appendChild(cardEl);

            setTimeout(() => {
                if (typeof soundManager !== 'undefined' && soundManager.playCardDeal && seatIdx % 2 === 0) {
                    soundManager.playCardDeal();
                }
                // Forzar reflow antes de animar destino
                void cardEl.offsetWidth;
                cardEl.classList.add('is-flying');
                cardEl.style.left = `${pos.left + offsetLeft}%`;
                cardEl.style.top = `${pos.top}%`;

                setTimeout(() => {
                    cardEl.classList.add('is-landed');
                    setTimeout(() => cardEl.remove(), 220);
                }, 440);
            }, delayMs);
        }
    }
}

function renderPokerStarsSeats(state, animateInitialDeal = false) {
    const seatsContainer = document.getElementById('poker-seats-container');
    seatsContainer.innerHTML = '';

    const me = state.players.find(p => p.id === myPlayerId);

    const assistant = document.getElementById('hand-assistant-content');
    if (me && me.bestHand) {
        assistant.innerHTML = `<strong>${me.bestHand.name}:</strong> ${me.bestHand.description}`;
    } else {
        assistant.innerHTML = `Esperando cartas...`;
    }

    const total = state.players.length;
    if (total === 0) return;

    // Jugador local siempre abajo al centro; rivales distribuidos en arco simétrico
    const myIndex = state.players.findIndex(p => p.id === myPlayerId);
    const sortedPlayers = [];

    for (let i = 0; i < total; i++) {
        const idx = (myIndex >= 0) ? (myIndex + i) % total : i;
        sortedPlayers.push(state.players[idx]);
    }

    const layout = ARC_SEAT_LAYOUTS[total] || ARC_SEAT_LAYOUTS[6];

    sortedPlayers.forEach((player, seatIndex) => {
        const isMe = (player.id === myPlayerId);
        const pod = document.createElement('div');
        pod.id = `player-pod-${player.id}`;

        const isSpotlight = (currentSpotlightPlayerId === player.id);
        const isAfk = isMe && isLocalAfk;
        const pos = layout[seatIndex] || { left: 50, top: 12, dir: 'dir-top' };

        pod.className = `poker-seat-pod ${pos.dir} ${isMe ? 'is-me' : ''} ${player.ready ? 'is-ready' : ''} ${isSpotlight ? 'spotlight-active' : ''} ${isAfk ? 'is-afk' : ''}`;
        pod.style.left = `${pos.left}%`;
        pod.style.top = `${pos.top}%`;

        // Cartas: si no le tocó en la resolución y no es el jugador local, se muestran dadas vuelta
        let cardsHtml = '';
        if (player.cards && player.cards.length === 2) {
            const dealClass = animateInitialDeal ? 'card-deal-in' : '';
            const card0 = createCardElement(player.cards[0], { extraClass: dealClass });
            const card1 = createCardElement(player.cards[1], { extraClass: dealClass });

            if (animateInitialDeal) {
                const dealX = Math.round((50 - pos.left) * 5.2);
                const dealY = Math.round((50 - pos.top) * 3.6);
                const baseDelay = seatIndex * 0.14;

                card0.style.setProperty('--deal-x', `${dealX}px`);
                card0.style.setProperty('--deal-y', `${dealY}px`);
                card0.style.setProperty('--deal-start-rot', '-24deg');
                card0.style.setProperty('--deal-end-rot', '-3.5deg');
                card0.style.animationDelay = `${baseDelay.toFixed(2)}s`;

                card1.style.setProperty('--deal-x', `${dealX}px`);
                card1.style.setProperty('--deal-y', `${dealY}px`);
                card1.style.setProperty('--deal-start-rot', '24deg');
                card1.style.setProperty('--deal-end-rot', '3.5deg');
                card1.style.animationDelay = `${(baseDelay + 0.08).toFixed(2)}s`;
            }

            cardsHtml = `
                <div class="seat-cards-row">
                    ${card0.outerHTML}
                    ${card1.outerHTML}
                </div>
            `;
        }

        // Ficha actual
        let currentChipHtml = '';
        if (player.currentChip !== null) {
            const colorClass = `chip-${(state.phaseColor && state.phaseColor.key) || 'white'}`;
            currentChipHtml = `<div class="mini-chip-badge ${colorClass}">${player.currentChip}</div>`;
        }

        // Historial completo de las 4 fases (Preflop, Flop, Turn, River)
        const hist = player.chipsHistory || {};
        const historyHtml = `
            <div class="seat-chips-history">
                <span class="mini-chip-slot chip-white" title="Preflop">${hist.preflop || '-'}</span>
                <span class="mini-chip-slot chip-yellow" title="Flop">${hist.flop || '-'}</span>
                <span class="mini-chip-slot chip-orange" title="Turn">${hist.turn || '-'}</span>
                <span class="mini-chip-slot chip-red" title="River">${hist.river || '-'}</span>
            </div>
        `;

        // Puesto final alcanzado tras revelar
        let rankBadgeHtml = '';
        if (player.finalRank) {
            rankBadgeHtml = `<div class="seat-rank-badge" title="Puesto de fuerza final">#${player.finalRank}</div>`;
        }

        pod.innerHTML = `
            ${player.bestHand && (isSpotlight || ['round_end', 'game_over'].includes(state.phase)) ? `
                <div class="seat-hand-tag">${player.bestHand.name}</div>
            ` : ''}
            ${cardsHtml}
            <div class="seat-main-card">
                ${rankBadgeHtml}
                ${isAfk ? '<div class="seat-afk-badge">Ausente</div>' : ''}
                <div class="seat-avatar-wrap">
                    ${renderAvatarHtml(player.avatar)}
                </div>
                <div class="seat-nameplate">
                    <div class="seat-info-col">
                        <div class="seat-player-name">${player.name} ${isMe ? '(Tú)' : ''}</div>
                        <div class="seat-status-badge">
                            ${player.ready ? '✅ Listo' : '⏳ Eligiendo'}
                        </div>
                    </div>
                    ${currentChipHtml}
                </div>
                ${historyHtml}
            </div>
        `;

        seatsContainer.appendChild(pod);
    });
}

// ========================================================
// 5. RECUENTO DEL GOLPE (SHOWDOWN NEÓN ANIMADO)
// ========================================================
function initShowdownModal(state) {
    const modal = document.getElementById('modal-recuento');
    const slotsRow = document.getElementById('recuento-slots-row');
    const subtitle = document.getElementById('recuento-subtitle');
    const vaultCount = document.getElementById('recuento-vault-count');
    const alarmCount = document.getElementById('recuento-alarm-count');
    const btnNext = document.getElementById('btn-recuento-next');
    const btnRetry = document.getElementById('btn-recuento-retry');
    const btnLobby = document.getElementById('btn-recuento-lobby');

    btnNext.classList.add('hidden');
    btnRetry.classList.add('hidden');
    btnLobby.classList.add('hidden');

    vaultCount.textContent = state.vaultsCracked;
    alarmCount.textContent = state.alarmsTriggered;
    subtitle.textContent = 'Evaluando el orden de las apuestas...';

    // Ordenar jugadores estrictamente por la ficha del River tomada (1 a N)
    const ordered = [...state.players].sort((a, b) => (a.chipsHistory.river || 0) - (b.chipsHistory.river || 0));
    const total = ordered.length;

    slotsRow.innerHTML = '';
    ordered.forEach((p, idx) => {
        const slotEl = document.createElement('div');
        slotEl.id = `recuento-slot-${idx}`;
        slotEl.className = 'recuento-slot';

        const chipVal = (p.chipsHistory && p.chipsHistory.river) || (idx + 1);

        const connectorHtml = (idx < total - 1) ? `
            <div class="recuento-slot-connector">
                <div class="connector-beam" id="laser-beam-${idx}"></div>
            </div>
        ` : '';

        slotEl.innerHTML = `
            ${connectorHtml}
            <div class="slot-cards-container" id="slot-cards-${idx}">
                ${createCardElement({ hidden: true }).outerHTML}
                ${createCardElement({ hidden: true }).outerHTML}
            </div>
            <div class="slot-hand-badge-wrap">
                <div class="slot-hand-badge" id="slot-badge-${idx}">...</div>
                <div class="slot-chip-rank">${chipVal} ★</div>
            </div>
            <div class="slot-player-info" id="slot-player-${idx}">
                <div class="slot-player-avatar">${renderAvatarHtml(p.avatar)}</div>
                <div class="slot-player-name">${p.name}</div>
            </div>
            <div class="slot-chip-bottom chip-red">
                <span>${chipVal}★</span>
            </div>
            <div class="slot-error-box hidden" id="slot-error-${idx}"></div>
        `;
        slotsRow.appendChild(slotEl);
    });

    modal.classList.add('active');
}

async function renderShowdownStepAnimation(stepResult, stepIndex, total, isSequenceAlreadyBroken = false) {
    const { player, bestHand, passed, prevPlayer } = stepResult;
    const slotEl = document.getElementById(`recuento-slot-${stepIndex}`);
    const cardsCont = document.getElementById(`slot-cards-${stepIndex}`);
    const badgeEl = document.getElementById(`slot-badge-${stepIndex}`);

    if (!slotEl || !cardsCont || !badgeEl) return;

    // Giro de 180° y revelación de cartas auténticas
    cardsCont.classList.add('cards-revealing');
    cardsCont.innerHTML = `
        ${createCardElement(player.cards[0]).outerHTML}
        ${createCardElement(player.cards[1]).outerHTML}
    `;
    soundManager.playCardDeal();

    badgeEl.textContent = bestHand.name;

    if (passed && !isSequenceAlreadyBroken) {
        // Fase de Éxito - Flotación:
        slotEl.classList.add('state-success');
        soundManager.playVaultSuccess();

        // Conexión: línea de luz verde se dibuja progresivamente (0.5s)
        if (stepIndex < total - 1) {
            const beam = document.getElementById(`laser-beam-${stepIndex}`);
            if (beam) {
                await new Promise(r => setTimeout(r, 100));
                beam.style.width = '100%';
                await new Promise(r => setTimeout(r, 500));
            }
        } else {
            await new Promise(r => setTimeout(r, 600));
        }
    } else if (!passed) {
        // Fase de Error:
        if (stepIndex > 0) {
            const prevBeam = document.getElementById(`laser-beam-${stepIndex - 1}`);
            if (prevBeam) prevBeam.classList.add('beam-error');
        }

        slotEl.classList.add('state-error');

        const prevHandName = prevPlayer && prevPlayer.bestHand ? prevPlayer.bestHand.name : 'la mano anterior';
        const errBox = document.getElementById(`slot-error-${stepIndex}`);
        if (errBox) {
            errBox.innerHTML = `
                <div class="error-cross">✖</div>
                <div class="error-title">¡DESALINEADO!</div>
                <div class="error-desc">${bestHand.name}<br><small style="color:#fca5a5;font-weight:400;">inferior a ${prevHandName}</small></div>
            `;
            errBox.classList.remove('hidden');
        }

        soundManager.playAlarmBuzzer();
        await new Promise(r => setTimeout(r, 1600));
    } else {
        // Revelación posterior a un error (se muestran las cartas que faltan)
        slotEl.classList.add('state-revealed');
        if (stepIndex < total - 1) {
            const beam = document.getElementById(`laser-beam-${stepIndex}`);
            if (beam) {
                beam.classList.add('beam-error');
                beam.style.width = '100%';
                await new Promise(r => setTimeout(r, 400));
            }
        } else {
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

async function startAutomaticShowdown(state) {
    if (isShowdownRunning) return;
    isShowdownRunning = true;

    initShowdownModal(state);
    const total = state.players.length;

    await new Promise(r => setTimeout(r, 600));

    let roundFailed = false;

    for (let step = 0; step < total; step++) {
        let stepResult = null;
        if (network.isHost) {
            const res = network.stepShowdown();
            // res puede ser { done: true, stepResult } o { done: false, stepResult }
            stepResult = res ? res.stepResult : null;
        }

        // Si no hay stepResult, el showdown ya terminó (concludeRound se llamó internamente)
        if (!stepResult) break;

        await renderShowdownStepAnimation(stepResult, step, total, roundFailed);

        if (!stepResult.passed) {
            roundFailed = true;
        }
    }

    finishShowdownModal(roundFailed);
    isShowdownRunning = false;
}

function finishShowdownModal(roundFailed) {
    const modal = document.getElementById('modal-recuento');
    const subtitle = document.getElementById('recuento-subtitle');
    const vaultCount = document.getElementById('recuento-vault-count');
    const alarmCount = document.getElementById('recuento-alarm-count');
    const btnNext = document.getElementById('btn-recuento-next');
    const btnRetry = document.getElementById('btn-recuento-retry');
    const btnLobby = document.getElementById('btn-recuento-lobby');

    if (currentGameState) {
        vaultCount.textContent = currentGameState.vaultsCracked;
        alarmCount.textContent = currentGameState.alarmsTriggered;
    }

    if (!roundFailed && currentGameState && currentGameState.roundSuccess) {
        soundManager.playVictory();
        subtitle.innerHTML = '🏦 <strong>¡ÉXITO ROTUNDO!</strong> El orden fue impecable y abrieron la bóveda.';
    } else {
        soundManager.playDefeat();
        subtitle.innerHTML = '🚨 <strong>¡GOLPE FALLIDO!</strong> Se disparó la alarma de seguridad.';
    }

    if (network.isHost) {
        if (currentGameState && currentGameState.phase === 'game_over') {
            btnLobby.classList.remove('hidden');
            btnLobby.onclick = () => {
                modal.classList.remove('active');
                isShowdownRunning = false;
                showGameOverModal(currentGameState.gameResult);
            };
        } else {
            if (currentGameState && currentGameState.roundSuccess) {
                btnNext.classList.remove('hidden');
                btnNext.onclick = () => {
                    soundManager.playCardDeal();
                    modal.classList.remove('active');
                    isShowdownRunning = false;
                    network.startNewRound();
                };
            } else {
                btnRetry.classList.remove('hidden');
                btnRetry.onclick = () => {
                    soundManager.playCardDeal();
                    modal.classList.remove('active');
                    isShowdownRunning = false;
                    network.startNewRound();
                };
            }
        }
    } else {
        subtitle.innerHTML += '<br><span style="font-size:0.8rem;color:var(--text-muted);">Esperando que el anfitrión avance...</span>';
    }
}

// ==========================================
// 6. CONTROLES Y BOTONES DE FASE
// ==========================================
function renderActionControls(state) {
    const container = document.getElementById('action-buttons-container');
    container.innerHTML = '';

    const me = state.players.find(p => p.id === myPlayerId);
    const isHost = network.isHost;

    if (state.phase === 'lobby') {
        if (isHost) {
            const btnAddBot = document.createElement('button');
            btnAddBot.className = 'btn btn-secondary';
            btnAddBot.innerHTML = '🤖 Añadir Bot';
            btnAddBot.onclick = () => { soundManager.playClick(); network.addBot(); };
            container.appendChild(btnAddBot);

            const btnStart = document.createElement('button');
            btnStart.className = 'btn btn-primary';
            btnStart.innerHTML = '🚀 Iniciar Golpe';
            btnStart.disabled = state.players.length < 3;
            btnStart.onclick = () => {
                soundManager.playVaultSuccess();
                network.startNewGame();
            };
            container.appendChild(btnStart);
        } else {
            const waitingText = document.createElement('div');
            waitingText.style.color = 'var(--text-muted)';
            waitingText.innerHTML = 'Esperando al anfitrión...';
            container.appendChild(waitingText);
        }
        return;
    }

    if (['preflop', 'flop', 'turn', 'river'].includes(state.phase)) {
        if (me) {
            const btnReady = document.createElement('button');
            btnReady.className = `btn ${me.ready ? 'btn-danger' : 'btn-primary'}`;
            btnReady.innerHTML = me.ready ? '❌ Cambiar Ficha' : '✅ Confirmar Ficha';
            btnReady.disabled = me.currentChip === null;
            btnReady.onclick = () => {
                soundManager.playClick();
                network.setReady(!me.ready);
            };
            container.appendChild(btnReady);
        }

        if (isHost) {
            const btnAdvance = document.createElement('button');
            btnAdvance.className = 'btn btn-primary';
            const nextLabel = state.phase === 'river' ? '⚔️ Iniciar Resolución' : '⏩ Siguiente Fase';
            btnAdvance.innerHTML = nextLabel;
            btnAdvance.disabled = !state.canAdvance;
            btnAdvance.onclick = () => {
                soundManager.playCardDeal();
                network.advancePhase();
            };
            container.appendChild(btnAdvance);
        }
    }

    if (state.phase === 'round_end' && isHost) {
        const btnNextRound = document.createElement('button');
        btnNextRound.className = 'btn btn-primary';
        btnNextRound.innerHTML = '🃏 Siguiente Ronda';
        btnNextRound.onclick = () => {
            soundManager.playCardDeal();
            document.getElementById('showdown-live-banner').classList.add('hidden');
            network.startNewRound();
        };
        container.appendChild(btnNextRound);
    }
}

// ==========================================
// 7. SOLICITUDES DE INTERCAMBIO DE FICHAS
// ==========================================
function initSwapModal() {
    const modal = document.getElementById('modal-swap-request');
    const btnAccept = document.getElementById('btn-swap-accept');
    const btnReject = document.getElementById('btn-swap-reject');

    btnAccept.onclick = () => {
        soundManager.playClick();
        modal.classList.remove('active');
        if (pendingSwapRequest && network) {
            network.respondToSwap(
                pendingSwapRequest.requesterId,
                pendingSwapRequest.requestedChip,
                pendingSwapRequest.offeredChip,
                true
            );
            pendingSwapRequest = null;
        }
    };

    btnReject.onclick = () => {
        soundManager.playClick();
        modal.classList.remove('active');
        if (pendingSwapRequest && network) {
            network.respondToSwap(
                pendingSwapRequest.requesterId,
                pendingSwapRequest.requestedChip,
                pendingSwapRequest.offeredChip,
                false
            );
            pendingSwapRequest = null;
        }
    };
}

function handleIncomingSwapRequest(req) {
    pendingSwapRequest = req;
    const modal = document.getElementById('modal-swap-request');
    const content = document.getElementById('swap-request-content');

    const offeredText = req.offeredChip ? `su ficha [${req.offeredChip}]` : 'quedarse sin ficha momentáneamente';
    content.innerHTML = `<strong>${req.requesterName}</strong> quiere tomar tu ficha <strong>[${req.requestedChip}]</strong> y te ofrece a cambio ${offeredText}. ¿Aceptas el intercambio?`;

    soundManager.playChatBeep();
    modal.classList.add('active');
}

function showToast(msg) {
    const toast = document.getElementById('toast-notification');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 2800);
}

// ==========================================
// 8. WIDGET DE MANOS DE PÓKER (HOVER & PIN)
// ==========================================
function initCheatSheet() {
    const widget = document.getElementById('poker-cheatsheet-widget');
    const triggerBtn = document.getElementById('cheatsheet-trigger-btn');
    const pinBtn = document.getElementById('btn-pin-cheatsheet');

    triggerBtn.addEventListener('click', () => {
        widget.classList.toggle('is-pinned');
        soundManager.playClick();
    });

    pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        widget.classList.toggle('is-pinned');
        soundManager.playClick();
    });
}

// ==========================================
// 9. CHAT ESCRITO INTEGRADO
// ==========================================
function initChat() {
    const btnToggle = document.getElementById('btn-toggle-chat');
    const btnClose = document.getElementById('btn-close-chat');
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input-text');
    const badge = document.getElementById('chat-unread-badge');

    btnToggle.addEventListener('click', () => {
        chatWindow.classList.toggle('hidden');
        if (!chatWindow.classList.contains('hidden')) {
            chatUnreadCount = 0;
            badge.classList.add('hidden');
            chatInput.focus();
        }
        soundManager.playClick();
    });

    btnClose.addEventListener('click', () => {
        chatWindow.classList.add('hidden');
        soundManager.playClick();
    });

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        if (network) {
            network.sendChatMessage(text, myName, myAvatar);
        }
        chatInput.value = '';
    });
}

function appendChatMessage(msg) {
    const list = document.getElementById('chat-messages-list');
    const el = document.createElement('div');
    el.className = 'chat-msg';

    el.innerHTML = `
        <div class="chat-msg-avatar">${renderAvatarMini(msg.avatar)}</div>
        <div class="chat-msg-body">
            <div class="chat-msg-header">
                <span class="chat-msg-author">${msg.name}</span>
                <span>${msg.time || ''}</span>
            </div>
            <div>${msg.text}</div>
        </div>
    `;

    list.appendChild(el);
    list.scrollTop = list.scrollHeight;

    const chatWindow = document.getElementById('chat-window');
    if (chatWindow.classList.contains('hidden')) {
        chatUnreadCount++;
        const badge = document.getElementById('chat-unread-badge');
        badge.textContent = chatUnreadCount;
        badge.classList.remove('hidden');
        soundManager.playChatBeep();
    }
}

// ==========================================
// 10. EMOTES Y MODALES
// ==========================================
function showFloatingEmote(playerId, emoji) {
    const pod = document.getElementById(`player-pod-${playerId}`);
    if (!pod) return;

    const el = document.createElement('div');
    el.className = 'floating-emote';
    el.textContent = emoji;
    pod.appendChild(el);

    setTimeout(() => {
        el.remove();
    }, 2000);
}

function initQuickTools() {
    const emojiWrapper = document.getElementById('emoji-popover-wrapper');
    const btnEmojiToggle = document.getElementById('btn-emoji-popover-toggle');
    const emojiPopover = document.getElementById('emoji-popover');
    const btnAfkToggle = document.getElementById('btn-afk-toggle');
    const afkLabel = document.getElementById('afk-toggle-label');

    const closeEmojiPopover = () => {
        if (!emojiPopover || !btnEmojiToggle) return;
        emojiPopover.classList.add('hidden');
        btnEmojiToggle.setAttribute('aria-expanded', 'false');
    };

    if (btnEmojiToggle && emojiPopover) {
        btnEmojiToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = emojiPopover.classList.toggle('hidden');
            btnEmojiToggle.setAttribute('aria-expanded', String(!isHidden));
            soundManager.playClick();
        });

        document.addEventListener('click', (e) => {
            if (emojiWrapper && !emojiWrapper.contains(e.target)) {
                closeEmojiPopover();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeEmojiPopover();
        });
    }

    document.querySelectorAll('#emoji-popover .btn-emote').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emote;
            soundManager.playClick();
            if (network) network.sendEmote(emoji);
            closeEmojiPopover();
        });
    });

    if (btnAfkToggle) {
        btnAfkToggle.addEventListener('click', () => {
            isLocalAfk = !isLocalAfk;
            soundManager.playClick();

            btnAfkToggle.classList.toggle('is-afk', isLocalAfk);
            btnAfkToggle.setAttribute('aria-pressed', String(isLocalAfk));
            if (afkLabel) {
                afkLabel.textContent = isLocalAfk ? 'Volver' : 'Ausente';
            }

            if (currentGameState) {
                renderPokerStarsSeats(currentGameState);
            }
            showToast(isLocalAfk ? '⏸️ Modo Ausente activado (visual)' : '▶️ Has vuelto a la mesa');
        });
    }
}

function initModals() {
    const btnRules = document.getElementById('btn-rules');
    const modalRules = document.getElementById('modal-rules');
    const btnCloseRules = document.getElementById('btn-close-rules');

    btnRules.onclick = () => { soundManager.playClick(); modalRules.classList.add('active'); };
    btnCloseRules.onclick = () => { soundManager.playClick(); modalRules.classList.remove('active'); };
    modalRules.onclick = (e) => { if (e.target === modalRules) modalRules.classList.remove('active'); };

    document.getElementById('btn-restart-game').onclick = () => {
        soundManager.playClick();
        document.getElementById('modal-gameover').classList.remove('active');
        if (network && network.isHost) {
            network.startNewGame();
        }
    };
}

function showGameOverModal(result) {
    const modal = document.getElementById('modal-gameover');
    const title = document.getElementById('gameover-title');
    const msg = document.getElementById('gameover-message');

    if (result === 'victory') {
        soundManager.playVictory();
        title.innerHTML = '🎉 ¡VICTORIA ABSOLUTA! 🎉';
        title.style.color = 'var(--gold)';
        msg.innerHTML = '¡Completaron 3 golpes exitosos y abrieron las 3 bóvedas sin ser atrapados! El equipo escapa millonario.';
    } else {
        soundManager.playDefeat();
        title.innerHTML = '🚨 ¡ATRAPADOS POR LA POLICÍA! 🚨';
        title.style.color = 'var(--crimson)';
        msg.innerHTML = 'Se activaron 3 alarmas de seguridad. El recinto fue bloqueado y el golpe fracasó.';
    }

    modal.classList.add('active');
}

function initSoundToggle() {
    const btnSound = document.getElementById('btn-sound-toggle');
    btnSound.onclick = () => {
        const enabled = soundManager.toggle();
        btnSound.innerHTML = enabled ? '🔊' : '🔇';
    };
}

function initLeaveButton() {
    const btnLeave = document.getElementById('btn-leave-game');
    if (!btnLeave) return;
    btnLeave.addEventListener('click', () => {
        soundManager.playClick();
        leaveGameToLobby(true);
    });
}

function leaveGameToLobby(showFeedback = true) {
    if (network) {
        network.leaveRoom();
        network = null;
    }

    // Resetear estado local de interfaz
    currentGameState = null;
    myPlayerId = null;
    isShowdownRunning = false;
    peerShowdownFailed = false;
    currentSpotlightPlayerId = null;
    pendingSwapRequest = null;
    isLocalAfk = false;
    prevCommunityCount = 0;
    lastCommunitySignature = '';
    lastRoundNumber = null;
    lastPhaseSeen = null;

    // Cerrar modales y overlays abiertos
    ['modal-recuento', 'modal-swap-request', 'modal-gameover', 'modal-rules'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    hideSpecialCard();

    // Restaurar controles de AFK y header
    const btnAfk = document.getElementById('btn-afk-toggle');
    const afkLabel = document.getElementById('afk-toggle-label');
    if (btnAfk) {
        btnAfk.classList.remove('is-afk');
        btnAfk.setAttribute('aria-pressed', 'false');
    }
    if (afkLabel) afkLabel.textContent = 'Ausente';

    const roomInfo = document.getElementById('header-room-info');
    const btnLeave = document.getElementById('btn-leave-game');
    if (roomInfo) roomInfo.classList.add('hidden');
    if (btnLeave) btnLeave.classList.add('hidden');

    // Volver al lobby inicial (vista de configuración)
    const lobbyScreen = document.getElementById('lobby-screen');
    const gameScreen = document.getElementById('game-screen');
    const setupView = document.getElementById('lobby-setup-view');
    const waitingView = document.getElementById('lobby-waiting-view');
    const configSection = document.getElementById('lobby-config-section');
    const listEl = document.getElementById('lobby-players-list');
    const countEl = document.getElementById('lobby-player-count');

    if (gameScreen) gameScreen.classList.add('hidden');
    if (lobbyScreen) lobbyScreen.classList.remove('hidden');
    if (setupView) setupView.classList.remove('hidden');
    if (waitingView) waitingView.classList.add('hidden');
    if (configSection) configSection.classList.remove('hidden');
    if (countEl) countEl.textContent = '1 / 6';

    if (listEl) {
        const currentName = (document.getElementById('input-player-name')?.value || myName || 'Cerebro').trim();
        listEl.innerHTML = `
            <div class="lobby-player-row lobby-player-you">
                <div class="lobby-player-avatar" id="lobby-preview-avatar">${renderAvatarHtml(myAvatar)}</div>
                <div class="lobby-player-info">
                    <div class="lobby-player-name-row">
                        <span class="lobby-player-name" id="lobby-preview-name">${currentName}</span>
                        <span class="lobby-role-tag tag-you">Tú</span>
                    </div>
                    <div class="lobby-player-status online">● Listo para entrar</div>
                </div>
            </div>
            <div class="lobby-empty-slots">
                <div class="lobby-slot-empty">— Espacio disponible —</div>
                <div class="lobby-slot-empty">— Espacio disponible —</div>
                <div class="lobby-slot-empty">— Espacio disponible —</div>
                <div class="lobby-slot-empty">— Espacio disponible —</div>
                <div class="lobby-slot-empty">— Espacio disponible —</div>
            </div>
        `;
    }

    // Limpiar parámetro ?room= de la URL si existía
    if (window.location.search.includes('room=')) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (showFeedback) {
        showToast('🚪 Abandonaste la partida.');
    }
}


// Sincronización live del preview de nombre y avatar en el lobby de 2 paneles
(function initLobbyPreview() {
    const nameInput = document.getElementById('input-player-name');
    const previewName = document.getElementById('lobby-preview-name');
    const previewAvatar = document.getElementById('lobby-preview-avatar');

    if (nameInput && previewName) {
        nameInput.addEventListener('input', () => {
            previewName.textContent = nameInput.value.trim() || 'Agente';
        });
    }

    // Actualizar preview de avatar al seleccionar
    document.querySelectorAll('.avatar-btn:not(.avatar-upload-label)').forEach(btn => {
        btn.addEventListener('click', () => {
            if (previewAvatar) previewAvatar.textContent = btn.dataset.avatar;
        });
    });
})();

// ========================================================
// 11. CARTAS ESPECIALES ENTRE RONDAS (VENTAJA / DESVENTAJA)
// ========================================================
let specialCardTimers = [];

function clearSpecialCardTimers() {
    specialCardTimers.forEach(t => clearTimeout(t));
    specialCardTimers = [];
}

function hideSpecialCard() {
    const overlay = document.getElementById('special-card-overlay');
    const body = document.getElementById('special-card-body');
    if (!overlay || overlay.classList.contains('hidden')) return;

    clearSpecialCardTimers();
    overlay.classList.add('is-fading-out');
    overlay.classList.remove('is-visible');

    const t = setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('is-fading-out', 'theme-advantage', 'theme-disadvantage');
        if (body) body.classList.remove('is-flipped');
    }, 360);
    specialCardTimers.push(t);
}

/**
 * Muestra una carta especial centrada con animación de entrada, volteo 3D y desvanecimiento.
 * @param {Object} opts
 * @param {'advantage'|'disadvantage'} opts.type
 * @param {string} opts.title
 * @param {string} opts.description
 * @param {string} [opts.illustration] Emoji o URL de imagen
 * @param {number} [opts.duration=3800] Duración visible en ms antes de desvanecerse
 */
function showSpecialCard({
    type = 'advantage',
    title = 'Carta Especial',
    description = '',
    illustration = '🃏',
    duration = 3800
} = {}) {
    const overlay = document.getElementById('special-card-overlay');
    const body = document.getElementById('special-card-body');
    const badgeEl = document.getElementById('special-card-badge');
    const illusEl = document.getElementById('special-card-illustration');
    const titleEl = document.getElementById('special-card-title');
    const descEl = document.getElementById('special-card-description');

    if (!overlay || !body) return;

    clearSpecialCardTimers();

    const isAdvantage = type !== 'disadvantage';
    overlay.classList.remove('hidden', 'is-visible', 'is-fading-out', 'theme-advantage', 'theme-disadvantage');
    overlay.classList.add(isAdvantage ? 'theme-advantage' : 'theme-disadvantage');
    body.classList.remove('is-flipped');

    if (badgeEl) badgeEl.textContent = isAdvantage ? '✦ VENTAJA' : '⚠ DESVENTAJA';
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;

    if (illusEl) {
        if (illustration && (illustration.startsWith('http') || illustration.startsWith('data:') || illustration.startsWith('assets/'))) {
            illusEl.innerHTML = `<img src="${illustration}" alt="${title}">`;
        } else {
            illusEl.textContent = illustration || (isAdvantage ? '🗝️' : '🚨');
        }
    }

    overlay.onclick = () => hideSpecialCard();

    // Forzar reflow para reiniciar transición limpiamente
    void overlay.offsetWidth;
    overlay.classList.add('is-visible');

    if (typeof soundManager !== 'undefined' && soundManager.playCardDeal) {
        soundManager.playCardDeal();
    }

    // Volteo suave de dorso a frente
    const flipTimer = setTimeout(() => {
        body.classList.add('is-flipped');
    }, 280);
    specialCardTimers.push(flipTimer);

    // Desvanecimiento automático
    if (duration > 0) {
        const hideTimer = setTimeout(() => {
            hideSpecialCard();
        }, duration);
        specialCardTimers.push(hideTimer);
    }
}

/**
 * Función de prueba visual rápida desde consola o futuros eventos entre rondas.
 * Uso: testSpecialCard('advantage') o testSpecialCard('disadvantage')
 */
function testSpecialCard(type = 'advantage') {
    if (type === 'disadvantage') {
        showSpecialCard({
            type: 'disadvantage',
            title: 'Cámaras Activas',
            description: 'La seguridad reforzó la bóveda: en esta ronda no podrán intercambiar fichas durante el Turn.',
            illustration: '📹',
            duration: 4200
        });
    } else {
        showSpecialCard({
            type: 'advantage',
            title: 'Planos Filtrados',
            description: 'Un informante infiltró los planos del banco: el equipo comienza la ronda con información privilegiada.',
            illustration: '🗝️',
            duration: 4200
        });
    }
}

window.showSpecialCard = showSpecialCard;
window.hideSpecialCard = hideSpecialCard;
window.testSpecialCard = testSpecialCard;
