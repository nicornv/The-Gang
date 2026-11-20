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

document.addEventListener('DOMContentLoaded', () => {
    initLobby();
    initModals();
    initSoundToggle();
    initLeaveGameButton();
    initEditProfileModal();
    initCheatSheet();
    initChat();
    initSwapModal();
    init3DCameraControls();
    checkUrlForRoom();
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
    const uploadLabel = document.getElementById('btn-upload-avatar');

    function attachLobbyFileInput() {
        const fileInput = document.getElementById('input-avatar-file');
        if (!fileInput) return;

        fileInput.onchange = (e) => {
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

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    const safe = (typeof sanitizeAvatar === 'function') ? sanitizeAvatar(dataUrl) : dataUrl;
                    if (!safe.startsWith('data:image/')) {
                        alert('La imagen no es válida o excede el tamaño permitido.');
                        return;
                    }
                    myAvatar = safe;

                    document.querySelectorAll('.lobby-card .avatar-btn').forEach(b => b.classList.remove('selected'));
                    uploadLabel.classList.add('selected');
                    uploadLabel.replaceChildren();

                    const imgPreview = document.createElement('img');
                    imgPreview.src = myAvatar;
                    imgPreview.className = 'avatar-custom-img';
                    uploadLabel.appendChild(imgPreview);

                    const fileIn = document.createElement('input');
                    fileIn.type = 'file';
                    fileIn.id = 'input-avatar-file';
                    fileIn.accept = 'image/*';
                    fileIn.style.display = 'none';
                    uploadLabel.appendChild(fileIn);

                    attachLobbyFileInput();
                    soundManager.playClick();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        };
    }

    attachLobbyFileInput();

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
            document.getElementById('lobby-screen').classList.add('hidden');
            document.getElementById('game-screen').classList.remove('hidden');
            document.getElementById('header-room-info').classList.remove('hidden');
            document.getElementById('room-code-display').textContent = roomCode;

            const btnLeave = document.getElementById('btn-leave-game');
            if (btnLeave) {
                btnLeave.classList.remove('hidden');
                btnLeave.innerHTML = '🚪 Abandonar';
                btnLeave.title = 'Abandonar la partida actual';
            }

            const btnEditProfile = document.getElementById('btn-edit-profile');
            if (btnEditProfile) {
                btnEditProfile.classList.remove('hidden');
            }

            const chatDock = document.getElementById('chat-dock-container');
            if (chatDock) {
                chatDock.classList.remove('hidden');
            }
            const chatWin = document.getElementById('chat-window');
            if (chatWin) chatWin.classList.add('hidden');
            const chatList = document.getElementById('chat-messages-list');
            if (chatList) chatList.innerHTML = '';
            chatUnreadCount = 0;
            const chatBadge = document.getElementById('chat-unread-badge');
            if (chatBadge) chatBadge.classList.add('hidden');

            if (roomCode === 'LOCAL') {
                document.getElementById('btn-copy-invite').classList.add('hidden');
            } else {
                document.getElementById('btn-copy-invite').classList.remove('hidden');
            }
        },
        onStateUpdate: (state, localPid) => {
            currentGameState = state;
            if (localPid) myPlayerId = localPid;
            renderGame(state);
        },
        onPlayerLeft: (playerId, playerName, remainingCount) => {
            if (playerId === myPlayerId) {
                showToast(`🚪 Abandonaste tu asiento. La partida se acomodó a los ${remainingCount} jugadores restantes.`);
            } else {
                showToast(`🚪 ${playerName || 'Un agente'} abandonó la partida. La mesa se acomodó a ${remainingCount} jugadores.`);
            }
        },
        onError: (err) => {
            alert(err);
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
        },
        onHostMigrated: () => {
            const btnCopy = document.getElementById('btn-copy-invite');
            if (btnCopy) {
                btnCopy.disabled = true;
                btnCopy.style.opacity = '0.5';
                btnCopy.style.cursor = 'not-allowed';
                btnCopy.title = 'El anfitrión original abandonó la partida. Nuevos jugadores no pueden unirse con el código anterior.';
            }
        }
    });

    document.getElementById('btn-copy-invite').onclick = () => {
        soundManager.playClick();
        if (network && network.isMigrated) {
            showToast('⚠️ El anfitrión original abandonó la partida. Nuevos jugadores no pueden unirse con el código anterior.');
            return;
        }

        const code = document.getElementById('room-code-display').textContent;
        // Construir URL desde location.href sin query ni hash
        const baseUrl = window.location.href.split('?')[0].split('#')[0];
        const inviteUrl = `${baseUrl}?room=${code}`;

        const isLocalHost = window.location.hostname === 'localhost' ||
                            window.location.hostname === '127.0.0.1' ||
                            window.location.hostname.startsWith('192.168.') ||
                            window.location.hostname.startsWith('10.');
        const isFileProtocol = window.location.protocol === 'file:';

        navigator.clipboard.writeText(inviteUrl).then(() => {
            if (isFileProtocol || isLocalHost) {
                showToast(`📋 Enlace copiado. ⚠️ Nota: Para unirse desde otra PC, comparte solo el código "${code}" o aloja el juego en un servidor público.`);
            } else {
                showToast('📋 ¡Enlace copiado! Pégalo en Discord.');
            }
        }).catch(() => {
            prompt(`Copia el enlace o código (${code}) para tus amigos:`, inviteUrl);
        });
    };
}

// ==========================================
// 3. RENDERIZADO PRINCIPAL DEL JUEGO
// ==========================================
function renderGame(state) {
    if (!state) return;

    // Si estamos en fases de juego normales, cerrar el modal de recuento si estuviera abierto
    if (['preflop', 'flop', 'turn', 'river'].includes(state.phase)) {
        isShowdownRunning = false;
        const recuentoModal = document.getElementById('modal-recuento');
        if (recuentoModal) recuentoModal.classList.remove('active');
    }

    renderVaultsAndAlarms(state);
    renderPhaseIndicator(state);
    renderCommunityCards(state.communityCards);
    renderChipsRack(state);
    renderPokerStarsSeats(state);
    renderActionControls(state);

    // Actualizar escena 3D WebGL (Three.js)
    if (typeof pokerTable3D !== 'undefined' && pokerTable3D) {
        pokerTable3D.updateState(state, myPlayerId);
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
let lastRoundNumber = -1;

function renderCommunityCards(cards) {
    const container = document.getElementById('community-cards-container');
    container.innerHTML = '';

    const isNewDeal = cards.length > prevCommunityCount;
    const totalSlots = 5;

    for (let i = 0; i < totalSlots; i++) {
        if (i < cards.length) {
            const card = cards[i];
            const isFreshlyDealt = isNewDeal && i >= prevCommunityCount;
            const el = createCardElement(card, {
                extraClass: isFreshlyDealt ? 'card-anim-flip' : ''
            });
            if (isFreshlyDealt) {
                el.style.animationDelay = `${(i - prevCommunityCount) * 0.15}s`;
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

    if (isNewDeal && cards.length > 0) {
        soundManager.playCardDeal();
    }
    prevCommunityCount = cards.length;
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

        const innerDisc = document.createElement('div');
        innerDisc.className = 'chip-inner-disc';
        innerDisc.textContent = String(num);
        chip.appendChild(innerDisc);

        if (holder) {
            const holderLabel = document.createElement('div');
            holderLabel.style.fontSize = '0.65rem';
            holderLabel.style.position = 'absolute';
            holderLabel.style.bottom = '-18px';
            holderLabel.style.whiteSpace = 'nowrap';
            holderLabel.style.fontWeight = '700';

            holderLabel.appendChild(createAvatarMiniElement(holder.avatar));

            const nameSpan = document.createElement('span');
            nameSpan.style.marginLeft = '3px';
            nameSpan.textContent = holder.name.split(' ')[0];
            holderLabel.appendChild(nameSpan);

            chip.appendChild(holderLabel);
        }

        chip.onclick = () => {
            soundManager.playChipClink();
            network.selectChip(num);
        };

        container.appendChild(chip);
    }
}

// Helpers de construcción segura de Avatares mediante DOM
function createAvatarElement(avatar, className = 'player-avatar-img') {
    const valid = (typeof sanitizeAvatar === 'function') ? sanitizeAvatar(avatar) : (avatar || '🕵️');
    if (valid.startsWith('data:image/')) {
        const img = document.createElement('img');
        img.className = className;
        img.alt = 'avatar';
        img.src = valid;
        return img;
    }
    const span = document.createElement('span');
    span.textContent = valid;
    return span;
}

function createAvatarMiniElement(avatar) {
    const valid = (typeof sanitizeAvatar === 'function') ? sanitizeAvatar(avatar) : (avatar || '🕵️');
    if (valid.startsWith('data:image/')) {
        const img = document.createElement('img');
        img.style.width = '14px';
        img.style.height = '14px';
        img.style.borderRadius = '50%';
        img.style.verticalAlign = 'middle';
        img.style.objectFit = 'cover';
        img.alt = 'avatar';
        img.src = valid;
        return img;
    }
    const span = document.createElement('span');
    span.textContent = valid;
    return span;
}

function renderAvatarHtml(avatar) {
    const el = createAvatarElement(avatar);
    return el.outerHTML;
}

function renderAvatarMini(avatar) {
    const el = createAvatarMiniElement(avatar);
    return el.outerHTML;
}

// ========================================================
// 4. ASIENTOS EXTERIORES DE LA MESA (POKERSTARS CASINO)
// ========================================================
function renderPokerStarsSeats(state) {
    const seatsContainer = document.getElementById('poker-seats-container');
    seatsContainer.innerHTML = '';

    const me = state.players.find(p => p.id === myPlayerId);

    const assistant = document.getElementById('hand-assistant-content');
    if (assistant) {
        assistant.replaceChildren();
        if (me && me.bestHand) {
            const strong = document.createElement('strong');
            strong.textContent = `${me.bestHand.name}: `;
            assistant.appendChild(strong);
            assistant.appendChild(document.createTextNode(me.bestHand.description || ''));
        } else {
            assistant.textContent = 'Esperando cartas...';
        }
    }

    const total = state.players.length;
    if (total === 0) return;

    // Jugador local siempre abajo al centro (6 o'clock)
    const myIndex = state.players.findIndex(p => p.id === myPlayerId);
    const sortedPlayers = [];

    for (let i = 0; i < total; i++) {
        const idx = (myIndex >= 0) ? (myIndex + i) % total : i;
        sortedPlayers.push(state.players[idx]);
    }

    sortedPlayers.forEach((player, clockIndex) => {
        const isMe = (player.id === myPlayerId);
        const pod = document.createElement('div');
        pod.id = `player-pod-${player.id}`;

        const isSpotlight = (currentSpotlightPlayerId === player.id);

        // Ubicación por fuera del paño en el perímetro de la arena
        const angleDeg = 90 + clockIndex * (360 / total);
        const rad = (angleDeg * Math.PI) / 180;

        // Determinar dirección para que las cartas apunten siempre HACIA ADENTRO de la mesa
        const normAngle = ((angleDeg % 360) + 360) % 360;
        let dirClass = 'dir-bottom';
        if (normAngle >= 65 && normAngle <= 115) {
            dirClass = 'dir-bottom'; // Abajo: cartas arriba hacia la mesa
        } else if (normAngle >= 245 && normAngle <= 295) {
            dirClass = 'dir-top'; // Arriba: cartas abajo hacia la mesa
        } else if (normAngle > 115 && normAngle < 245) {
            dirClass = 'dir-left'; // Izquierda
        } else {
            dirClass = 'dir-right'; // Derecha
        }

        pod.className = `poker-seat-pod ${dirClass} ${isMe ? 'is-me' : ''} ${player.ready ? 'is-ready' : ''} ${isSpotlight ? 'spotlight-active' : ''}`;

        // Radios calibrados para que nunca toquen el borde ni barras superior/inferior
        const radiusX = 42; // %
        const radiusY = 36; // %

        const leftPct = 50 + radiusX * Math.cos(rad);
        const topPct = 50 + radiusY * Math.sin(rad);

        pod.style.left = `${leftPct}%`;
        pod.style.top = `${topPct}%`;

        // Hand tag
        if (player.bestHand && (isSpotlight || ['round_end', 'game_over'].includes(state.phase))) {
            const handTag = document.createElement('div');
            handTag.className = 'seat-hand-tag';
            handTag.textContent = player.bestHand.name;
            pod.appendChild(handTag);
        }

        // Cartas
        if (player.cards && player.cards.length === 2) {
            const cardsRow = document.createElement('div');
            cardsRow.className = 'seat-cards-row';
            cardsRow.appendChild(createCardElement(player.cards[0]));
            cardsRow.appendChild(createCardElement(player.cards[1]));
            pod.appendChild(cardsRow);
        }

        // Tarjeta principal del asiento
        const mainCard = document.createElement('div');
        mainCard.className = 'seat-main-card';

        if (player.finalRank) {
            const rankBadge = document.createElement('div');
            rankBadge.className = 'seat-rank-badge';
            rankBadge.title = 'Puesto de fuerza final';
            rankBadge.textContent = `#${player.finalRank}`;
            mainCard.appendChild(rankBadge);
        }

        const avatarWrap = document.createElement('div');
        avatarWrap.className = 'seat-avatar-wrap';
        avatarWrap.appendChild(createAvatarElement(player.avatar));
        mainCard.appendChild(avatarWrap);

        const infoCol = document.createElement('div');
        infoCol.className = 'seat-info-col';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'seat-player-name';
        nameDiv.textContent = `${player.name} ${isMe ? '(Tú)' : ''}`;
        infoCol.appendChild(nameDiv);

        const statusBadge = document.createElement('div');
        statusBadge.className = 'seat-status-badge';
        statusBadge.textContent = player.ready ? '✅ Listo' : '⏳ Eligiendo';
        infoCol.appendChild(statusBadge);

        mainCard.appendChild(infoCol);

        if (player.currentChip !== null) {
            const colorClass = `chip-${(state.phaseColor && state.phaseColor.key) || 'white'}`;
            const chipBadge = document.createElement('div');
            chipBadge.className = `mini-chip-badge ${colorClass}`;
            chipBadge.textContent = String(player.currentChip);
            mainCard.appendChild(chipBadge);
        }

        pod.appendChild(mainCard);

        // Historial de fases
        const hist = player.chipsHistory || {};
        const historyDiv = document.createElement('div');
        historyDiv.className = 'seat-chips-history';
        const phaseSlots = [
            { key: 'preflop', cls: 'chip-white', title: 'Preflop' },
            { key: 'flop', cls: 'chip-yellow', title: 'Flop' },
            { key: 'turn', cls: 'chip-orange', title: 'Turn' },
            { key: 'river', cls: 'chip-red', title: 'River' }
        ];
        phaseSlots.forEach(ph => {
            const slot = document.createElement('span');
            slot.className = `mini-chip-slot ${ph.cls}`;
            slot.title = ph.title;
            const val = hist[ph.key];
            slot.textContent = (val !== null && val !== undefined) ? String(val) : '-';
            historyDiv.appendChild(slot);
        });
        pod.appendChild(historyDiv);

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

        if (idx < total - 1) {
            const connDiv = document.createElement('div');
            connDiv.className = 'recuento-slot-connector';
            const beam = document.createElement('div');
            beam.className = 'connector-beam';
            beam.id = `laser-beam-${idx}`;
            connDiv.appendChild(beam);
            slotEl.appendChild(connDiv);
        }

        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'slot-cards-container';
        cardsContainer.id = `slot-cards-${idx}`;
        cardsContainer.appendChild(createCardElement({ hidden: true }));
        cardsContainer.appendChild(createCardElement({ hidden: true }));
        slotEl.appendChild(cardsContainer);

        const badgeWrap = document.createElement('div');
        badgeWrap.className = 'slot-hand-badge-wrap';
        const badge = document.createElement('div');
        badge.className = 'slot-hand-badge';
        badge.id = `slot-badge-${idx}`;
        badge.textContent = '...';
        badgeWrap.appendChild(badge);

        const chipRank = document.createElement('div');
        chipRank.className = 'slot-chip-rank';
        chipRank.textContent = `${chipVal} ★`;
        badgeWrap.appendChild(chipRank);
        slotEl.appendChild(badgeWrap);

        const playerInfo = document.createElement('div');
        playerInfo.className = 'slot-player-info';
        playerInfo.id = `slot-player-${idx}`;

        const playerAvatar = document.createElement('div');
        playerAvatar.className = 'slot-player-avatar';
        playerAvatar.appendChild(createAvatarElement(p.avatar));
        playerInfo.appendChild(playerAvatar);

        const playerName = document.createElement('div');
        playerName.className = 'slot-player-name';
        playerName.textContent = p.name;
        playerInfo.appendChild(playerName);
        slotEl.appendChild(playerInfo);

        const chipBottom = document.createElement('div');
        chipBottom.className = 'slot-chip-bottom chip-red';
        const chipSpan = document.createElement('span');
        chipSpan.textContent = `${chipVal}★`;
        chipBottom.appendChild(chipSpan);
        slotEl.appendChild(chipBottom);

        const errBox = document.createElement('div');
        errBox.className = 'slot-error-box hidden';
        errBox.id = `slot-error-${idx}`;
        slotEl.appendChild(errBox);

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
    cardsCont.replaceChildren(
        createCardElement(player.cards[0]),
        createCardElement(player.cards[1])
    );
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
            errBox.replaceChildren();
            const errCross = document.createElement('div');
            errCross.className = 'error-cross';
            errCross.textContent = '✖';
            errBox.appendChild(errCross);

            const errTitle = document.createElement('div');
            errTitle.className = 'error-title';
            errTitle.textContent = '¡DESALINEADO!';
            errBox.appendChild(errTitle);

            const errDesc = document.createElement('div');
            errDesc.className = 'error-desc';
            errDesc.appendChild(document.createTextNode(bestHand.name));
            errDesc.appendChild(document.createElement('br'));
            const small = document.createElement('small');
            small.style.color = '#fca5a5';
            small.style.fontWeight = '400';
            small.textContent = `inferior a ${prevHandName}`;
            errDesc.appendChild(small);
            errBox.appendChild(errDesc);

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
        } else {
            const btnBackLobby = document.createElement('button');
            btnBackLobby.className = 'btn btn-secondary';
            btnBackLobby.innerHTML = '🏠 Volver al Menú';
            btnBackLobby.onclick = () => {
                soundManager.playClick();
                returnToLobbyScreen();
            };
            container.appendChild(btnBackLobby);
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
    content.replaceChildren();

    const strongName = document.createElement('strong');
    strongName.textContent = req.requesterName;
    content.appendChild(strongName);

    content.appendChild(document.createTextNode(' quiere tomar tu ficha '));

    const strongChip = document.createElement('strong');
    strongChip.textContent = `[${req.requestedChip}]`;
    content.appendChild(strongChip);

    content.appendChild(document.createTextNode(` y te ofrece a cambio ${offeredText}. ¿Aceptas el intercambio?`));

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

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'chat-msg-avatar';
    avatarDiv.appendChild(createAvatarMiniElement(msg.avatar));
    el.appendChild(avatarDiv);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'chat-msg-body';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'chat-msg-header';

    const authorSpan = document.createElement('span');
    authorSpan.className = 'chat-msg-author';
    authorSpan.textContent = msg.name || 'Agente';
    headerDiv.appendChild(authorSpan);

    const timeSpan = document.createElement('span');
    timeSpan.textContent = msg.time || '';
    headerDiv.appendChild(timeSpan);

    bodyDiv.appendChild(headerDiv);

    const textDiv = document.createElement('div');
    textDiv.textContent = msg.text || '';
    bodyDiv.appendChild(textDiv);

    el.appendChild(bodyDiv);

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
    if (typeof pokerTable3D !== 'undefined' && pokerTable3D && pokerTable3D.is3DEnabled) {
        pokerTable3D.spawnEmote3D(playerId, emoji);
    }

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

document.querySelectorAll('.btn-emote').forEach(btn => {
    btn.addEventListener('click', () => {
        const emoji = btn.dataset.emote;
        soundManager.playClick();
        if (network) network.sendEmote(emoji);
    });
});

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

// ==========================================
// 8. ABANDONAR PARTIDA Y ACOMODAR JUGADORES
// ==========================================
function initLeaveGameButton() {
    const btnLeave = document.getElementById('btn-leave-game');
    if (btnLeave) {
        btnLeave.addEventListener('click', () => {
            soundManager.playClick();
            returnToLobbyScreen();
        });
    }

    // Si el jugador cierra la pestaña o ventana del navegador, salir y reacomodar la partida para los demás
    window.addEventListener('beforeunload', () => {
        if (network) {
            network.disconnectAndExit();
        }
    });

    window.addEventListener('pagehide', () => {
        if (network) {
            network.disconnectAndExit();
        }
    });
}

function returnToLobbyScreen() {
    if (network) {
        network.disconnectAndExit();
        network = null;
    }
    currentGameState = null;
    isShowdownRunning = false;

    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('header-room-info').classList.add('hidden');
    const btnLeave = document.getElementById('btn-leave-game');
    if (btnLeave) btnLeave.classList.add('hidden');
    const btnEditProfile = document.getElementById('btn-edit-profile');
    if (btnEditProfile) btnEditProfile.classList.add('hidden');
    const chatDock = document.getElementById('chat-dock-container');
    if (chatDock) chatDock.classList.add('hidden');
    const chatWin = document.getElementById('chat-window');
    if (chatWin) chatWin.classList.add('hidden');

    const editProfileModal = document.getElementById('modal-edit-profile');
    if (editProfileModal) editProfileModal.classList.remove('active');
    const recuentoModal = document.getElementById('modal-recuento');
    if (recuentoModal) recuentoModal.classList.remove('active');
    const gameoverModal = document.getElementById('modal-gameover');
    if (gameoverModal) gameoverModal.classList.remove('active');

    document.getElementById('lobby-screen').classList.remove('hidden');
}

// ==========================================
// 8b. CAMBIAR FOTO Y NOMBRE EN PARTIDA (✏️)
// ==========================================
function initEditProfileModal() {
    const btnOpen = document.getElementById('btn-edit-profile');
    const modal = document.getElementById('modal-edit-profile');
    const btnClose = document.getElementById('btn-close-edit-profile');
    const btnCancel = document.getElementById('btn-cancel-edit-profile');
    const btnSave = document.getElementById('btn-save-edit-profile');
    const nameInput = document.getElementById('input-edit-player-name');
    const avatarBtns = document.querySelectorAll('.edit-avatar-btn');
    const uploadLabel = document.getElementById('btn-edit-upload-avatar');

    if (!btnOpen || !modal) return;

    let tempEditAvatar = myAvatar;

    function attachFileInputHandler() {
        const fileInput = document.getElementById('input-edit-avatar-file');
        if (!fileInput) return;

        fileInput.onchange = (e) => {
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

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    const safe = (typeof sanitizeAvatar === 'function') ? sanitizeAvatar(dataUrl) : dataUrl;
                    if (!safe.startsWith('data:image/')) {
                        alert('La imagen no es válida o excede el tamaño permitido.');
                        return;
                    }
                    tempEditAvatar = safe;

                    document.querySelectorAll('#edit-avatar-selector .avatar-btn').forEach(b => b.classList.remove('selected'));
                    uploadLabel.classList.add('selected');
                    uploadLabel.replaceChildren();

                    const imgPreview = document.createElement('img');
                    imgPreview.src = tempEditAvatar;
                    imgPreview.className = 'avatar-custom-img';
                    uploadLabel.appendChild(imgPreview);

                    const fileIn = document.createElement('input');
                    fileIn.type = 'file';
                    fileIn.id = 'input-edit-avatar-file';
                    fileIn.accept = 'image/*';
                    fileIn.style.display = 'none';
                    uploadLabel.appendChild(fileIn);

                    attachFileInputHandler();
                    soundManager.playClick();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        };
    }

    attachFileInputHandler();

    avatarBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#edit-avatar-selector .avatar-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            tempEditAvatar = btn.dataset.avatar;
            soundManager.playClick();
        });
    });

    btnOpen.addEventListener('click', () => {
        soundManager.playClick();
        tempEditAvatar = myAvatar;
        if (nameInput) nameInput.value = myName;

        document.querySelectorAll('#edit-avatar-selector .avatar-btn').forEach(b => b.classList.remove('selected'));

        const validMyAvatar = (typeof sanitizeAvatar === 'function') ? sanitizeAvatar(myAvatar) : myAvatar;
        if (validMyAvatar && validMyAvatar.startsWith('data:image/')) {
            uploadLabel.classList.add('selected');
            uploadLabel.replaceChildren();

            const imgPreview = document.createElement('img');
            imgPreview.src = validMyAvatar;
            imgPreview.className = 'avatar-custom-img';
            uploadLabel.appendChild(imgPreview);

            const fileIn = document.createElement('input');
            fileIn.type = 'file';
            fileIn.id = 'input-edit-avatar-file';
            fileIn.accept = 'image/*';
            fileIn.style.display = 'none';
            uploadLabel.appendChild(fileIn);

            attachFileInputHandler();
        } else {
            const matchedBtn = Array.from(avatarBtns).find(b => b.dataset.avatar === myAvatar);
            if (matchedBtn) matchedBtn.classList.add('selected');
        }

        modal.classList.add('active');
        if (nameInput) nameInput.focus();
    });

    const closeModal = () => {
        soundManager.playClick();
        modal.classList.remove('active');
    };

    if (btnClose) btnClose.onclick = closeModal;
    if (btnCancel) btnCancel.onclick = closeModal;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    if (btnSave) {
        btnSave.addEventListener('click', () => {
            soundManager.playClick();
            const newName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim().slice(0, 15) : myName;
            myName = newName;
            myAvatar = tempEditAvatar || myAvatar;

            // Sincronizar también con el input del Lobby
            const lobbyNameInput = document.getElementById('input-player-name');
            if (lobbyNameInput) lobbyNameInput.value = myName;

            if (network) {
                network.updateProfile(myName, myAvatar);
            }

            modal.classList.remove('active');
            showToast('✏️ Perfil actualizado en la mesa.');
        });
    }
}

// ==========================================
// 9. CONTROLES DE CÁMARA Y MODO 3D / 2D
// ==========================================
function init3DCameraControls() {
    const arenaWrapper = document.getElementById('table-arena-wrapper');
    const btnToggleMode = document.getElementById('btn-toggle-3d-mode');
    const camBtns = document.querySelectorAll('.cam-3d-btn[data-cam]');

    camBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            soundManager.playClick();
            const preset = btn.dataset.cam;

            // Si estábamos en 2D y pulsan un botón de cámara 3D, activar 3D
            if (arenaWrapper && !arenaWrapper.classList.contains('mode-3d')) {
                set3DMode(true);
            }

            camBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (typeof pokerTable3D !== 'undefined' && pokerTable3D) {
                pokerTable3D.setCameraPreset(preset);
            }
        });
    });

    function set3DMode(enable3D) {
        if (!arenaWrapper) return;
        const toolbar = document.getElementById('camera-3d-toolbar');
        if (enable3D) {
            arenaWrapper.classList.add('mode-3d');
            arenaWrapper.classList.remove('mode-2d');
            if (toolbar) toolbar.classList.remove('mode-2d');
            if (btnToggleMode) btnToggleMode.innerHTML = '🃏 Vista 2D';
            if (typeof pokerTable3D !== 'undefined' && pokerTable3D) {
                if (typeof pokerTable3D.setEnabled === 'function') {
                    pokerTable3D.setEnabled(true);
                } else {
                    pokerTable3D.is3DEnabled = true;
                }
                if (currentGameState) {
                    renderPokerStarsSeats(currentGameState);
                    pokerTable3D.updateState(currentGameState, myPlayerId);
                }
            }
        } else {
            arenaWrapper.classList.remove('mode-3d');
            arenaWrapper.classList.add('mode-2d');
            if (toolbar) toolbar.classList.add('mode-2d');
            if (btnToggleMode) btnToggleMode.innerHTML = '🎲 Vista 3D';
            if (typeof pokerTable3D !== 'undefined' && pokerTable3D) {
                if (typeof pokerTable3D.setEnabled === 'function') {
                    pokerTable3D.setEnabled(false);
                } else {
                    pokerTable3D.is3DEnabled = false;
                }
            }
            if (currentGameState) {
                renderPokerStarsSeats(currentGameState);
            }
        }
    }

    if (btnToggleMode) {
        btnToggleMode.addEventListener('click', () => {
            soundManager.playClick();
            const isCurrently3D = arenaWrapper && arenaWrapper.classList.contains('mode-3d');
            set3DMode(!isCurrently3D);
        });
    }
}
