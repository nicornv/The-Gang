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
    initCheatSheet();
    initChat();
    initSwapModal();
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
// MODE SWITCHER (The Gang / Texas Hold'em)
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            document.body.classList.toggle('mode-thegang', modeSelect.value === 'thegang');
            document.body.classList.toggle('mode-holdem', modeSelect.value === 'holdem');
            soundManager.playClick();
        });
        // Initialise default mode
        document.body.classList.add('mode-thegang');
    }

    // EMOJI POPOVER
    const emojiBtn = document.createElement('button');
    emojiBtn.id = 'btn-emoji-popover';
    emojiBtn.className = 'btn-icon';
    emojiBtn.title = 'Emojis';
    emojiBtn.innerHTML = '😊';
    const headerControls = document.querySelector('.header-controls');
    if (headerControls) headerControls.appendChild(emojiBtn);

    const emojiPopover = document.createElement('div');
    emojiPopover.id = 'emoji-popover';
    const emojis = ['😀','😂','😎','🤔','😱','👍','👎','💰'];
    emojis.forEach(e => {
        const btn = document.createElement('button');
        btn.textContent = e;
        btn.addEventListener('click', () => {
            // placeholder: send emoji via network
            if (network) network.sendEmote(e);
            hideEmojiPopover();
        });
        emojiPopover.appendChild(btn);
    });
    document.body.appendChild(emojiPopover);
    function showEmojiPopover() { emojiPopover.classList.add('visible'); }
    function hideEmojiPopover() { emojiPopover.classList.remove('visible'); }
    emojiBtn.addEventListener('click', () => {
        if (emojiPopover.classList.contains('visible')) hideEmojiPopover(); else showEmojiPopover();
    });

    // AFK TOGGLE
    const afkBtn = document.createElement('button');
    afkBtn.id = 'btn-afk-toggle';
    afkBtn.className = 'btn btn-secondary';
    afkBtn.textContent = 'AFK';
    if (headerControls) headerControls.appendChild(afkBtn);
    let isAfk = false;
    afkBtn.addEventListener('click', () => {
        isAfk = !isAfk;
        const myPod = document.getElementById(`player-pod-${myPlayerId}`);
        if (myPod) myPod.classList.toggle('player-afk', isAfk);
        // Notify server (optional)
        if (network) network.sendAfk(isAfk);
        soundManager.playClick();
    });

    // ADVANTAGE/DISADVANTAGE MODAL
    const advModal = document.createElement('div');
    advModal.id = 'modal-advantage';
    advModal.innerHTML = `
        <div class="advantage-card">
            <h3 id="adv-title"></h3>
            <p id="adv-description"></p>
            <button id="adv-close" class="btn btn-primary">Cerrar</button>
        </div>
    `;
    document.body.appendChild(advModal);
    const advClose = document.getElementById('adv-close');
    advClose.addEventListener('click', () => advModal.classList.remove('active'));
    window.showAdvantageCard = function(type) {
        const title = document.getElementById('adv-title');
        const desc = document.getElementById('adv-description');
        if (type === 'advantage') {
            title.textContent = 'Ventaja';
            desc.textContent = 'Esta carta te otorga una ventaja estratégica para la siguiente fase.';
        } else {
            title.textContent = 'Desventaja';
            desc.textContent = 'Esta carta impone una penalización temporal en tu jugada.';
        }
        advModal.classList.add('active');
    };

    // Ensure Netlify badge does not overlap Jugar button
    const badge = document.querySelector('.room-badge');
    if (badge) badge.style.marginRight = '48px';

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
                uploadLabel.innerHTML = `<img src="${myAvatar}" class="avatar-custom-img"><input type="file" id="input-avatar-file" accept="image/*" style="display:none;">`;
                soundManager.playClick();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

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
        }
    });

    document.getElementById('btn-copy-invite').onclick = () => {
        soundManager.playClick();
        const code = document.getElementById('room-code-display').textContent;
        const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
        navigator.clipboard.writeText(url).then(() => {
            showToast('📋 ¡Enlace copiado! Pégalo en Discord.');
        }).catch(() => {
            prompt('Copia este enlace para tus amigos:', url);
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

        chip.innerHTML = `
            <div class="chip-inner-disc">${num}</div>
            ${holder ? `<div style="font-size:0.65rem;position:absolute;bottom:-18px;white-space:nowrap;font-weight:700;">${renderAvatarMini(holder.avatar)} ${holder.name.split(' ')[0]}</div>` : ''}
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
// 4. ASIENTOS EXTERIORES DE LA MESA (POKERSTARS CASINO)
// ========================================================
function renderPokerStarsSeats(state) {
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
            dirClass = 'dir-left'; // Izquierda: cartas a la derecha hacia la mesa (NO toca el borde izquierdo)
        } else {
            dirClass = 'dir-right'; // Derecha: cartas a la izquierda hacia la mesa (NO toca el borde derecho)
        }

        pod.className = `poker-seat-pod ${dirClass} ${isMe ? 'is-me' : ''} ${player.ready ? 'is-ready' : ''} ${isSpotlight ? 'spotlight-active' : ''}`;

        // Radios calibrados para que nunca toquen el borde ni barras superior/inferior
        const radiusX = 42; // %
        const radiusY = 36; // %

        const leftPct = 50 + radiusX * Math.cos(rad);
        const topPct = 50 + radiusY * Math.sin(rad);

        pod.style.left = `${leftPct}%`;
        pod.style.top = `${topPct}%`;

        // Cartas: si no le tocó en la resolución y no es el jugador local, se muestran dadas vuelta
        let cardsHtml = '';
        if (player.cards && player.cards.length === 2) {
            cardsHtml = `
                <div class="seat-cards-row">
                    ${createCardElement(player.cards[0]).outerHTML}
                    ${createCardElement(player.cards[1]).outerHTML}
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
                <div class="seat-avatar-wrap">
                    ${renderAvatarHtml(player.avatar)}
                </div>
                <div class="seat-info-col">
                    <div class="seat-player-name">${player.name} ${isMe ? '(Tú)' : ''}</div>
                    <div class="seat-status-badge">
                        ${player.ready ? '✅ Listo' : '⏳ Eligiendo'}
                    </div>
                </div>
                ${currentChipHtml}
            </div>
            ${historyHtml}
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
