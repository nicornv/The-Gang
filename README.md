# 🏦 Abrimela si podés (El Gran Golpe Cooperativo)

Juego de mesa cooperativo virtual de **3 a 6 jugadores** inspirado en las mecánicas de *The Gang*, adaptado con temática original de atraco a bancos sin infringir derechos de autor ni marcas registradas.

---

## 🎯 Objetivo del Juego
El equipo de cómplices debe lograr **3 golpes exitosos** (abrir 3 bóvedas acorazadas 🏦) antes de que suenen **3 alarmas de seguridad 🚨**.
¡Todos ganan o pierden juntos!

---

## 🤫 La Regla de Oro
**Está prohibido hablar sobre las cartas propias, mostrarlas o insinuar la combinación que se tiene.**
La comunicación durante el golpe se realiza única y exclusivamente mediante la toma de **fichas de estrellas ⭐**:
* **⭐ 1:** Mano más débil del equipo en esta fase.
* **⭐ Máxima:** Mano más fuerte del equipo en esta fase.

---

## 🃏 Fases de Cada Golpe (Ronda)
Cada jugador recibe **2 cartas privadas**. Se juegan 4 fases con cartas comunitarias en el centro (estilo Texas Hold'em):

1. **Preflop (⚪ Fichas Blancas):**
   * Se evalúan las 2 cartas privadas de cada jugador.
   * Cada jugador toma una ficha blanca de 1 a N estrellas.
2. **Flop (🟡 Fichas Amarillas):**
   * Se revelan 3 cartas comunitarias en el tapete.
   * Los jugadores reevalúan su mano combinando sus 2 cartas privadas con el Flop y toman fichas amarillas.
3. **Turn (🟠 Fichas Naranjas):**
   * Se añade una 4.ª carta comunitaria al centro.
   * Se toman fichas naranjas.
4. **River (🔴 Fichas Rojas - Decisivas):**
   * Se revela la 5.ª y última carta comunitaria.
   * Se toman las fichas rojas. **¡Estas fichas definirán el orden final de revelación!**

---

## ⚔️ Resolución (Showdown)
Las cartas de todos los jugadores se revelan una a una siguiendo estrictamente el orden de las fichas rojas tomadas en el River (empezando por la ficha de **1 estrella** hasta la máxima).

* **Éxito 🏦:** Si cada jugador revela una combinación **igual o más fuerte** que la del jugador anterior, el orden fue impecable, la seguridad fue burlada y se abre **1 Bóveda**.
* **Fallo 🚨:** Si un jugador revela una combinación **más débil** que la del jugador anterior, la coordinación falló, salta una **Alarma de Seguridad**.

* **Victoria:** Abrir 3 Bóvedas.
* **Derrota:** Acumular 3 Alarmas.

---

## 🚀 Cómo Jugar

### 1. Jugar en tu PC / Localmente
* Haz doble clic en [`Abrir_Juego.bat`](Abrir_Juego.bat) o ejecuta `npm start` (o `node server.js`) y abre `http://localhost:3000`. Si no tienes Node instalado, puedes abrir directamente [`index.html`](index.html) en tu navegador.
* Puedes seleccionar la pestaña **"Solo (Bots)"** para probar el juego de inmediato con bots inteligentes de póker.

### 2. Jugar Online con Amigos (Multijugador P2P WebRTC)
* Uno de los jugadores hace clic en **"Crear Sala"** (o "Crear Sala Multijugador Online").
* Aparecerá el código de sala y el botón **📋 (Copiar Enlace de Invitación)**.
* **Nota sobre enlaces de invitación:** Si juegas vía `file://` o en `localhost`, el enlace copiado te avisará que tus amigos en otras máquinas necesitan que el juego esté en una URL pública (o bien que les pases solo el código de sala de 5 caracteres).
* Si el anfitrión original abandona la partida en mitad del juego, el sistema migra automáticamente el anfitrión al siguiente jugador conectado; en ese momento el botón de invitación se deshabilita porque el código original de sala ya no admite nuevos participantes externos.

### 3. Configuración del Servidor PeerJS
Por defecto el juego utiliza la nube pública de PeerJS (`0.peerjs.com`). Si deseas desplegar tu propio servidor PeerServer privado para mayor control o privacidad, edita la constante `PEERJS_BROKER_CONFIG` en [`js/network.js`](js/network.js):
```javascript
const PEERJS_BROKER_CONFIG = {
    host: 'tu-servidor-peerjs.com',
    port: 443,
    path: '/peerjs',
    secure: true
};
```

### 4. Pruebas Automatizadas
Ejecuta la suite de pruebas unitarias nativas con:
```bash
npm test
```
