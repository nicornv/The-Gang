// sound.js - Generador de efectos de sonido con Web Audio API (cero dependencias de archivos de audio)

class SoundFX {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    // Sonido al repartir una carta (fricción de naipe contra el paño + snap nítido)
    playCardDeal() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        try {
            // Capa 1: Fricción / deslizamiento (ruido blanco filtrado)
            const bufferSize = Math.floor(this.ctx.sampleRate * 0.08);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const noiseFilter = this.ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(1600, now);
            noiseFilter.Q.setValueAtTime(1.8, now);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.24, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.ctx.destination);
            noise.start(now);

            // Capa 2: Snap sutil del naipe apoyándose en el paño
            const snapOsc = this.ctx.createOscillator();
            const snapGain = this.ctx.createGain();
            snapOsc.type = 'sine';
            snapOsc.frequency.setValueAtTime(360, now + 0.02);
            snapOsc.frequency.exponentialRampToValueAtTime(95, now + 0.06);

            snapGain.gain.setValueAtTime(0.15, now + 0.02);
            snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

            snapOsc.connect(snapGain);
            snapGain.connect(this.ctx.destination);
            snapOsc.start(now + 0.02);
            snapOsc.stop(now + 0.07);
        } catch (e) {
            // Fallback silencioso en caso de bloqueo de audio
        }
    }

    // Sonido al tomar o soltar ficha de estrella (clink de ficha de póker)
    playChipClink() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.04);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.06);

        // Segundo toque metálico armónico leve
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(3400, now + 0.015);
        gain2.gain.setValueAtTime(0.12, now + 0.015);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);
        osc2.start(now + 0.015);
        osc2.stop(now + 0.07);
    }

    // Sonido de bóveda abierta / caja fuerte desbloqueada (éxito en showdown)
    playVaultSuccess() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // Tríada mayor ascendente brillante (C5 - E5 - G5 - C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);

            gain.gain.setValueAtTime(0.22, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.4);
        });
    }

    // Sonido de Alarma de seguridad (sirena policial / fallo)
    playAlarmBuzzer() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // Sirena de dos tonos descendente/estridente
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.linearRampToValueAtTime(440, now + 0.2);
        osc.frequency.linearRampToValueAtTime(880, now + 0.4);
        osc.frequency.linearRampToValueAtTime(440, now + 0.6);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.7);
    }

    // Sonido de Victoria Total (Fanfarria del gran golpe)
    playVictory() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const chords = [
            { f: 523.25, t: 0.0, d: 0.2 }, // C
            { f: 659.25, t: 0.2, d: 0.2 }, // E
            { f: 783.99, t: 0.4, d: 0.2 }, // G
            { f: 1046.50, t: 0.6, d: 0.6 } // High C
        ];

        chords.forEach(c => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(c.f, now + c.t);
            gain.gain.setValueAtTime(0.3, now + c.t);
            gain.gain.exponentialRampToValueAtTime(0.001, now + c.t + c.d);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + c.t);
            osc.stop(now + c.t + c.d + 0.05);
        });
    }

    // Sonido de Derrota Total (Prisión / Atrapados)
    playDefeat() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [300, 260, 220, 160];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + idx * 0.25);
            gain.gain.setValueAtTime(0.2, now + idx * 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.25 + 0.35);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.25);
            osc.stop(now + idx * 0.25 + 0.4);
        });
    }

    // Sonido sutil al recibir mensaje en el chat
    playChatBeep() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    // Click sutil de botón
    playClick() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.02);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.025);
    }
}

const soundManager = new SoundFX();

