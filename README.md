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

### 1. Jugar en tu PC / Localmente (Inmediato)
* Haz doble clic en el archivo [`Abrir_Juego.bat`](file:///d:/TheGang/Abrir_Juego.bat) o abre directamente [`index.html`](file:///d:/TheGang/index.html) con Google Chrome, Edge o Brave.
* Puedes seleccionar la pestaña **"Solo (Bots)"** para probar el juego de inmediato con bots inteligentes de póker.

### 2. Jugar Online con Amigos (Multijugador P2P WebRTC)
* Uno de los jugadores hace clic en **"Crear Sala"**.
* Aparecerá el código de sala y el botón **📋 (Copiar Enlace de Invitación)**.
* Comparte el enlace con tus amigos por WhatsApp, Discord o Telegram.
* Al hacer clic en el enlace, tus amigos ingresan directamente a la sala desde su PC o celular, **sin necesidad de instalar nada**.

### 3. Publicarlo en Internet Gratis (GitHub Pages o Vercel)
Como el juego está construido con HTML5, CSS3, JavaScript puro y WebRTC (PeerJS):
* **GitHub Pages:** Sube estos archivos a un repositorio de GitHub, activa *Pages* en la configuración y tendrás un enlace `https://tuusuario.github.io/operacion-boveda` funcionando 24/7 gratis.
* **Vercel / Netlify:** Arrastra la carpeta del proyecto a la web de Vercel o Netlify para tenerlo online en 10 segundos.
