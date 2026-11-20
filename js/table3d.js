// table3d.js - Escena 3D Interactiva con Three.js (WebGL) para "Abrimela si podés"

class PokerTable3D {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2(-999, -999);

        this.isInitialized = false;
        this.is3DEnabled = true;
        this.animationFrameId = null;
        this.isPageVisible = true;

        // Shared geometries y materials para reutilización
        this.sharedGeometries = {
            cardBox: null,
            pedestalToken: null,
            seatHalo: null,
            textPlane: null,
            medallionCylinder: null,
            medallionTorus: null
        };
        this.sharedMaterials = {
            cardSide: null
        };

        // Cache signatures para evitar reconstruir grupos si no cambiaron
        this.signatures = {
            community: '',
            chipsRack: '',
            seats: ''
        };

        // Grupos dinámicos de la escena
        this.tableGroup = null;
        this.communityGroup = null;
        this.chipsRackGroup = null;
        this.seats3DGroup = null;
        this.emotes3DGroup = null;

        // Listas para interacción y animación
        this.interactiveChips = []; // Meshes de fichas clickeables en el rack central
        this.animatedCards = [];    // Cartas con animación de reparto
        this.floatingSeats = [];    // { playerId, group, baseY, phaseOffset, spinChip, seatPos }
        this.activeEmotes3D = [];   // Emotes flotando en 3D

        // Caches de texturas e imágenes
        this.cardTextureCache = new Map();
        this.chipTextureCache = new Map();
        this.labelTextureCache = new Map();
        this.avatarTextureCache = new Map();
        this.avatarImageCache = new Map();
        this.text3DTextureCache = new Map();
        this.cardBackTexture = null;

        // Control de transición suave de cámara
        this.cameraTransition = null;

        // Control de drag vs click
        this.pointerDownPos = { x: 0, y: 0 };
        this.lastState = null;
        this.myPlayerId = null;
        this.lastCommunityCount = 0;
        this.lastW = 0;
        this.lastH = 0;
        this.clock = new THREE.Clock();
    }

    init() {
        if (this.isInitialized) return;
        this.container = document.getElementById(this.containerId);
        if (!this.container || typeof THREE === 'undefined') {
            console.warn('Three.js o contenedor 3D no disponible.');
            return;
        }

        const width = this.container.clientWidth || 960;
        const height = this.container.clientHeight || 540;

        // 1. Escena y Atmósfera Clandestina
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x040508, 0.019);

        // 2. Cámara en Perspectiva desde el asiento del jugador (encuadre amplio y cercano)
        this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 180);
        this.camera.position.set(0, 8.2, 11.8);
        this.camera.lookAt(0, 0.2, 0.0);

        // 3. Renderer WebGL con sombras suaves
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        if (THREE.ACESFilmicToneMapping) {
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.18;
        }

        // Limpiar canvas previo si existiera
        const oldCanvas = this.container.querySelector('canvas');
        if (oldCanvas) oldCanvas.remove();
        this.container.appendChild(this.renderer.domElement);

        // 4. OrbitControls para rotar libremente con el mouse
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.target.set(0, 0.3, -0.2);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.07;
            this.controls.rotateSpeed = 0.75;
            this.controls.zoomSpeed = 0.9;
            this.controls.minDistance = 6.5;
            this.controls.maxDistance = 26;
            this.controls.minPolarAngle = 0.15;
            this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
            this.controls.enablePan = true;
            this.controls.update();
        }

        // 5. Iluminación de Casino Subterráneo
        this.setupLights();

        // 6. Construir Mesa 3D y Grupos
        this.tableGroup = new THREE.Group();
        this.communityGroup = new THREE.Group();
        this.chipsRackGroup = new THREE.Group();
        this.seats3DGroup = new THREE.Group();
        this.emotes3DGroup = new THREE.Group();

        this.scene.add(this.tableGroup);
        this.scene.add(this.communityGroup);
        this.scene.add(this.chipsRackGroup);
        this.scene.add(this.seats3DGroup);
        this.scene.add(this.emotes3DGroup);

        this.cardBackTexture = this.createCardBackTexture();
        this.initSharedResources();
        this.buildCasinoTable();

        // 7. Eventos de Mouse (Raycasting para fichas 3D)
        this.setupInteractionEvents();

        // 8. Resize Observer y Page Visibility
        this.setupResizeHandler();
        this.setupVisibilityHandler();

        this.isInitialized = true;
        this.startLoop();
    }

    initSharedResources() {
        if (!this.sharedGeometries.cardBox) {
            this.sharedGeometries.cardBox = new THREE.BoxGeometry(1.24, 0.028, 1.76);
        }
        if (!this.sharedGeometries.pedestalToken) {
            this.sharedGeometries.pedestalToken = new THREE.CylinderGeometry(0.58, 0.72, 0.18, 32);
        }
        if (!this.sharedGeometries.seatHalo) {
            const hGeo = new THREE.RingGeometry(0.68, 0.84, 36);
            hGeo.rotateX(-Math.PI / 2);
            this.sharedGeometries.seatHalo = hGeo;
        }
        if (!this.sharedGeometries.textPlane) {
            this.sharedGeometries.textPlane = new THREE.PlaneGeometry(3.6, 1.26);
        }
        if (!this.sharedGeometries.medallionCylinder) {
            const mGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.14, 48);
            mGeo.rotateY(Math.PI / 2);
            mGeo.rotateX(Math.PI / 2);
            this.sharedGeometries.medallionCylinder = mGeo;
        }
        if (!this.sharedGeometries.medallionTorus) {
            this.sharedGeometries.medallionTorus = new THREE.TorusGeometry(0.68 + 0.03, 0.055, 16, 48);
        }
        if (!this.sharedMaterials.cardSide) {
            this.sharedMaterials.cardSide = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
        }
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xe2e8f0, 0.62);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xfef3c7, 0x064e3b, 0.5);
        hemiLight.position.set(0, 16, 0);
        this.scene.add(hemiLight);

        // Foco principal cenital de lámpara de casino sobre la mesa
        const mainSpot = new THREE.SpotLight(0xfffbeb, 1.7);
        mainSpot.position.set(0, 15, 1.5);
        mainSpot.angle = Math.PI / 2.4;
        mainSpot.penumbra = 0.65;
        mainSpot.decay = 1.2;
        mainSpot.distance = 48;
        mainSpot.castShadow = true;
        mainSpot.shadow.mapSize.width = 2048;
        mainSpot.shadow.mapSize.height = 2048;
        mainSpot.shadow.camera.near = 3;
        mainSpot.shadow.camera.far = 28;
        mainSpot.shadow.bias = -0.0005;
        this.scene.add(mainSpot);

        // Luz cálida frontal desde la posición del jugador
        const playerLight = new THREE.PointLight(0xfef08a, 0.7, 18);
        playerLight.position.set(0, 5.0, 8.5);
        this.scene.add(playerLight);

        // Acentos laterales para resaltar medallas y texto 3D
        const rimLightLeft = new THREE.PointLight(0x10b981, 0.55, 24);
        rimLightLeft.position.set(-11, 5, 0);
        this.scene.add(rimLightLeft);

        const rimLightRight = new THREE.PointLight(0xef4444, 0.5, 24);
        rimLightRight.position.set(11, 5, 0);
        this.scene.add(rimLightRight);
    }

    createStadiumShape(straightLen, radius) {
        const shape = new THREE.Shape();
        const halfL = straightLen / 2;
        shape.moveTo(-halfL, -radius);
        shape.lineTo(halfL, -radius);
        shape.absarc(halfL, 0, radius, -Math.PI / 2, Math.PI / 2, false);
        shape.lineTo(-halfL, radius);
        shape.absarc(-halfL, 0, radius, Math.PI / 2, (3 * Math.PI) / 2, false);
        return shape;
    }

    buildCasinoTable() {
        const straightLen = 6.2;
        const feltRadius = 4.1;
        const railOuterRadius = 4.78;

        // 1. Paño Esmeralda
        const feltShape = this.createStadiumShape(straightLen, feltRadius);
        const feltGeo = new THREE.ExtrudeGeometry(feltShape, {
            depth: 0.25,
            bevelEnabled: false,
            curveSegments: 48
        });
        feltGeo.rotateX(Math.PI / 2);

        feltGeo.computeBoundingBox();
        const bb = feltGeo.boundingBox;
        const sizeX = bb.max.x - bb.min.x;
        const sizeZ = bb.max.z - bb.min.z;
        const posAttr = feltGeo.attributes.position;
        const uvAttr = feltGeo.attributes.uv;
        for (let i = 0; i < posAttr.count; i++) {
            const vx = posAttr.getX(i);
            const vz = posAttr.getZ(i);
            const u = (vx - bb.min.x) / sizeX;
            const v = 1.0 - (vz - bb.min.z) / sizeZ;
            uvAttr.setXY(i, u, v);
        }
        uvAttr.needsUpdate = true;

        const feltTexture = this.createFeltTexture();
        const feltMat = new THREE.MeshStandardMaterial({
            map: feltTexture,
            roughness: 0.82,
            metalness: 0.05
        });

        const feltMesh = new THREE.Mesh(feltGeo, feltMat);
        feltMesh.position.y = 0;
        feltMesh.receiveShadow = true;
        this.tableGroup.add(feltMesh);

        // 2. Borde Acolchado 3D de Cuero Caoba/Carmesí
        const railShape = this.createStadiumShape(straightLen, railOuterRadius);
        const holePath = this.createStadiumShape(straightLen, feltRadius - 0.05);
        railShape.holes.push(holePath);

        const railGeo = new THREE.ExtrudeGeometry(railShape, {
            depth: 0.34,
            bevelEnabled: true,
            bevelThickness: 0.16,
            bevelSize: 0.15,
            bevelSegments: 8,
            curveSegments: 48
        });
        railGeo.rotateX(Math.PI / 2);

        const railMat = new THREE.MeshStandardMaterial({
            color: 0x24070a,
            roughness: 0.32,
            metalness: 0.18
        });
        const railMesh = new THREE.Mesh(railGeo, railMat);
        railMesh.position.y = 0.22;
        railMesh.castShadow = true;
        railMesh.receiveShadow = true;
        this.tableGroup.add(railMesh);

        // 3. Moldura Interior Dorada
        const trimShape = this.createStadiumShape(straightLen, feltRadius + 0.04);
        const trimHole = this.createStadiumShape(straightLen, feltRadius - 0.06);
        trimShape.holes.push(trimHole);
        const trimGeo = new THREE.ExtrudeGeometry(trimShape, {
            depth: 0.08,
            bevelEnabled: true,
            bevelThickness: 0.03,
            bevelSize: 0.03,
            bevelSegments: 3,
            curveSegments: 48
        });
        trimGeo.rotateX(Math.PI / 2);

        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xeab308,
            roughness: 0.25,
            metalness: 0.85
        });
        const trimMesh = new THREE.Mesh(trimGeo, goldMat);
        trimMesh.position.y = 0.05;
        this.tableGroup.add(trimMesh);

        // 4. Estructura Inferior y Pedestales
        const underShape = this.createStadiumShape(straightLen - 0.6, feltRadius - 0.4);
        const underGeo = new THREE.ExtrudeGeometry(underShape, {
            depth: 0.45,
            bevelEnabled: false,
            curveSegments: 32
        });
        underGeo.rotateX(Math.PI / 2);
        const darkWoodMat = new THREE.MeshStandardMaterial({
            color: 0x120305,
            roughness: 0.5,
            metalness: 0.15
        });
        const underMesh = new THREE.Mesh(underGeo, darkWoodMat);
        underMesh.position.y = -0.25;
        this.tableGroup.add(underMesh);

        [-2.4, 2.4].forEach(px => {
            const pillarGeo = new THREE.CylinderGeometry(0.95, 1.35, 3.0, 28);
            const pillarMesh = new THREE.Mesh(pillarGeo, darkWoodMat);
            pillarMesh.position.set(px, -1.9, 0);
            pillarMesh.castShadow = true;
            this.tableGroup.add(pillarMesh);

            const ringGeo = new THREE.TorusGeometry(1.18, 0.07, 12, 32);
            ringGeo.rotateX(Math.PI / 2);
            const ringMesh = new THREE.Mesh(ringGeo, goldMat);
            ringMesh.position.set(px, -3.25, 0);
            this.tableGroup.add(ringMesh);
        });

        // 5. Piso de la Bóveda Subterránea expandido a pantalla completa
        const floorGeo = new THREE.CircleGeometry(65, 64);
        floorGeo.rotateX(-Math.PI / 2);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x05070b,
            roughness: 0.72,
            metalness: 0.22
        });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.position.y = -3.4;
        floorMesh.receiveShadow = true;
        this.tableGroup.add(floorMesh);

        // Anillos concéntricos sutiles en el suelo del casino para llenar el espacio panorámico
        [10.5, 15.5, 22.0].forEach((r, idx) => {
            const floorRingGeo = new THREE.RingGeometry(r, r + 0.08, 64);
            floorRingGeo.rotateX(-Math.PI / 2);
            const floorRingMat = new THREE.MeshBasicMaterial({
                color: idx === 0 ? 0xeab308 : 0x10b981,
                transparent: true,
                opacity: 0.12 - idx * 0.03,
                side: THREE.DoubleSide
            });
            const floorRingMesh = new THREE.Mesh(floorRingGeo, floorRingMat);
            floorRingMesh.position.y = -3.38;
            this.tableGroup.add(floorRingMesh);
        });
    }

    createFeltTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1120;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createRadialGradient(1024, 560, 80, 1024, 560, 1050);
        grad.addColorStop(0, '#093820');
        grad.addColorStop(0.55, '#042213');
        grad.addColorStop(0.88, '#02120a');
        grad.addColorStop(1, '#010804');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
        for (let i = 0; i < 6500; i++) {
            ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
        }

        ctx.save();
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.22)';
        ctx.lineWidth = 6;
        this.strokeStadiumCanvas(ctx, 1024, 560, 740, 340);

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.16)';
        ctx.lineWidth = 2;
        this.strokeStadiumCanvas(ctx, 1024, 560, 718, 322);
        ctx.restore();

        // Grabado central
        ctx.save();
        ctx.font = '900 54px "Cinzel", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
        ctx.fillText('L A   M E S A   D E L   G O R D O', 1024, 255);
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.12)';
        ctx.lineWidth = 1.5;
        ctx.strokeText('L A   M E S A   D E L   G O R D O', 1024, 255);
        ctx.restore();

        // Marcos de las 5 Cartas Comunitarias
        const labels = ['FLOP 1', 'FLOP 2', 'FLOP 3', 'TURN', 'RIVER'];
        const slotW = 140;
        const slotH = 198;
        const spacing = 188;
        const startX = 1024 - 2 * spacing;
        const centerY = 445;

        labels.forEach((lbl, idx) => {
            const cx = startX + idx * spacing;
            ctx.save();
            ctx.strokeStyle = 'rgba(234, 179, 8, 0.28)';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 8]);
            this.roundRectCanvas(ctx, cx - slotW / 2, centerY - slotH / 2, slotW, slotH, 14);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.fill();

            ctx.font = '800 20px "Montserrat", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(lbl, cx, centerY - 12);

            ctx.font = '28px sans-serif';
            ctx.fillStyle = 'rgba(234, 179, 8, 0.22)';
            ctx.fillText('♠', cx, centerY + 26);
            ctx.restore();
        });

        ctx.save();
        ctx.font = '800 20px "Montserrat", sans-serif';
        ctx.fillStyle = 'rgba(234, 179, 8, 0.38)';
        ctx.textAlign = 'center';
        ctx.fillText('FICHAS DE MANO (CLIC EN LA FICHA 3D PARA TOMAR O CAMBIAR)', 1024, 620);
        ctx.restore();

        const tex = new THREE.CanvasTexture(canvas);
        if (this.renderer) tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        return tex;
    }

    strokeStadiumCanvas(ctx, cx, cy, straightLen, radius) {
        const halfL = straightLen / 2;
        ctx.beginPath();
        ctx.moveTo(cx - halfL, cy - radius);
        ctx.lineTo(cx + halfL, cy - radius);
        ctx.arc(cx + halfL, cy, radius, -Math.PI / 2, Math.PI / 2, false);
        ctx.lineTo(cx - halfL, cy + radius);
        ctx.arc(cx - halfL, cy, radius, Math.PI / 2, (3 * Math.PI) / 2, false);
        ctx.closePath();
        ctx.stroke();
    }

    roundRectCanvas(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    createCardBackTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 728;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#140305';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#2e080d';
        for (let i = -canvas.height; i < canvas.width + canvas.height; i += 28) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + 14, 0);
            ctx.lineTo(i + 14 - canvas.height, canvas.height);
            ctx.lineTo(i - canvas.height, canvas.height);
            ctx.closePath();
            ctx.fill();
        }

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 8;
        this.roundRectCanvas(ctx, 24, 24, canvas.width - 48, canvas.height - 48, 22);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(234, 179, 8, 0.65)';
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 8]);
        this.roundRectCanvas(ctx, 44, 44, canvas.width - 88, canvas.height - 88, 16);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(256, 364, 78, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 3, 5, 0.9)';
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ef4444';
        ctx.stroke();

        ctx.font = 'bold 92px serif';
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♠', 256, 368);

        const tex = new THREE.CanvasTexture(canvas);
        if (this.renderer) tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        return tex;
    }

    getCardFrontTexture(card) {
        const rankLabel = card.label || (typeof RANKS !== 'undefined' ? (RANKS.find(r => r.value === card.rank)?.label) : '') || String(card.rank || '');
        const suitSymbol = card.symbol || card.suitSymbol || (typeof SUITS !== 'undefined' ? (SUITS.find(s => s.id === card.suit)?.symbol) : '') || (card.suit === 'H' ? '♥' : card.suit === 'D' ? '♦' : card.suit === 'C' ? '♣' : '♠');
        const isRed = (card.color === 'red') || ['H', 'D'].includes(card.suit) || ['♥', '♦'].includes(suitSymbol);

        const cacheKey = `${rankLabel}_${suitSymbol}`;
        if (this.cardTextureCache.has(cacheKey)) {
            return this.cardTextureCache.get(cacheKey);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 728;
        const ctx = canvas.getContext('2d');

        const bgGrad = ctx.createLinearGradient(0, 0, 512, 728);
        bgGrad.addColorStop(0, '#ffffff');
        bgGrad.addColorStop(1, '#f1f5f9');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 512, 728);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 10;
        this.roundRectCanvas(ctx, 8, 8, 496, 712, 24);
        ctx.stroke();

        const mainColor = isRed ? '#c9182b' : '#0f172a';
        ctx.fillStyle = mainColor;

        ctx.font = '900 96px "Cinzel", "Montserrat", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(rankLabel, 82, 34);

        ctx.font = '82px serif';
        ctx.fillText(suitSymbol, 82, 132);

        ctx.save();
        ctx.translate(512 - 82, 728 - 34);
        ctx.rotate(Math.PI);
        ctx.font = '900 96px "Cinzel", "Montserrat", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(rankLabel, 0, 0);
        ctx.font = '82px serif';
        ctx.fillText(suitSymbol, 0, 98);
        ctx.restore();

        ctx.strokeStyle = isRed ? 'rgba(201, 24, 43, 0.16)' : 'rgba(15, 23, 42, 0.14)';
        ctx.lineWidth = 3;
        this.roundRectCanvas(ctx, 118, 150, 276, 428, 16);
        ctx.stroke();

        ctx.font = '230px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(suitSymbol, 256, 368);

        const tex = new THREE.CanvasTexture(canvas);
        if (this.renderer) tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.putTextureInCache(this.cardTextureCache, cacheKey, tex);
        return tex;
    }

    createCardMesh(card, isHidden = false) {
        const geo = this.sharedGeometries.cardBox || new THREE.BoxGeometry(1.24, 0.028, 1.76);
        const sideMat = this.sharedMaterials.cardSide || new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
        const backMat = new THREE.MeshStandardMaterial({
            map: this.cardBackTexture,
            roughness: 0.42,
            metalness: 0.08
        });

        let frontMat = backMat;
        if (card && !card.hidden && !isHidden) {
            frontMat = new THREE.MeshStandardMaterial({
                map: this.getCardFrontTexture(card),
                roughness: 0.35,
                metalness: 0.05
            });
        }

        const materials = [sideMat, sideMat, frontMat, backMat, sideMat, sideMat];
        const mesh = new THREE.Mesh(geo, materials);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    getChipTexture(num, colorKey) {
        const cacheKey = `${num}_${colorKey}`;
        if (this.chipTextureCache.has(cacheKey)) {
            return this.chipTextureCache.get(cacheKey);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        const palettes = {
            white:  { main: '#f8fafc', edge: '#475569', stripe: '#334155', text: '#0f172a', ring: '#94a3b8' },
            yellow: { main: '#facc15', edge: '#a16207', stripe: '#422006', text: '#1c1917', ring: '#fef08a' },
            orange: { main: '#f97316', edge: '#9a3412', stripe: '#ffffff', text: '#ffffff', ring: '#ffedd5' },
            red:    { main: '#ef4444', edge: '#991b1b', stripe: '#fef08a', text: '#ffffff', ring: '#fecaca' }
        };
        const pal = palettes[colorKey] || palettes.white;

        ctx.beginPath();
        ctx.arc(256, 256, 250, 0, Math.PI * 2);
        ctx.fillStyle = pal.main;
        ctx.fill();

        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            ctx.save();
            ctx.translate(256, 256);
            ctx.rotate(angle);
            ctx.fillStyle = pal.stripe;
            ctx.fillRect(-26, -252, 52, 46);
            ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(256, 256, 182, 0, Math.PI * 2);
        ctx.fillStyle = pal.main;
        ctx.fill();
        ctx.lineWidth = 12;
        ctx.strokeStyle = pal.edge;
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.arc(256, 256, 158, 0, Math.PI * 2);
        ctx.setLineDash([18, 14]);
        ctx.lineWidth = 6;
        ctx.strokeStyle = pal.ring;
        ctx.stroke();
        ctx.restore();

        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = pal.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let s = 0; s < num; s++) {
            const a = -Math.PI / 2 + (s - (num - 1) / 2) * 0.34;
            ctx.fillText('★', 256 + Math.cos(a) * 124, 256 + Math.sin(a) * 124);
        }

        ctx.font = '900 185px "Montserrat", sans-serif';
        ctx.fillStyle = pal.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(num), 256, 268);

        const tex = new THREE.CanvasTexture(canvas);
        if (this.renderer) tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.putTextureInCache(this.chipTextureCache, cacheKey, tex);
        return tex;
    }

    createChipMesh(num, colorKey, scale = 1.0) {
        const radius = 0.62 * scale;
        const height = 0.16 * scale;
        const geo = new THREE.CylinderGeometry(radius, radius, height, 40);
        geo.rotateY(Math.PI / 2);

        const topTex = this.getChipTexture(num, colorKey);
        const sideColors = {
            white: 0xcbd5e1,
            yellow: 0xeab308,
            orange: 0xea580c,
            red: 0xdc2626
        };

        const sideMat = new THREE.MeshStandardMaterial({
            color: sideColors[colorKey] || 0xcbd5e1,
            roughness: 0.4,
            metalness: 0.15
        });
        const faceMat = new THREE.MeshStandardMaterial({
            map: topTex,
            roughness: 0.32,
            metalness: 0.1
        });

        const mesh = new THREE.Mesh(geo, [sideMat, faceMat, faceMat]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    // =========================================================================
    // MEDALLÓN DE FOTO / AVATAR 3D + TEXTO 3D VOLUMÉTRICO FLOTANTE
    // =========================================================================

    // Genera la textura circular para el Medallón 3D del Avatar (Foto subida o Emoji)
    getAvatarMedallionTexture(avatarStr, isMe, isReady) {
        const validAvatar = (typeof sanitizeAvatar === 'function') ? sanitizeAvatar(avatarStr) : (avatarStr || '🕵️');
        const isImage = validAvatar.startsWith('data:image/');
        const cacheKey = `${validAvatar}_${isMe}_${isReady}`;

        if (this.avatarTextureCache.has(cacheKey)) {
            return this.avatarTextureCache.get(cacheKey);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        const drawMedallion = (imgObj) => {
            ctx.clearRect(0, 0, 512, 512);

            // Fondo metálico oscuro radial
            const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 250);
            grad.addColorStop(0, isMe ? '#064e3b' : '#1e293b');
            grad.addColorStop(0.75, '#090d16');
            grad.addColorStop(1, '#020408');

            ctx.beginPath();
            ctx.arc(256, 256, 248, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            if (imgObj) {
                // Si el usuario subió su foto propia, recortarla en círculo de alta nitidez
                ctx.save();
                ctx.beginPath();
                ctx.arc(256, 256, 224, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(imgObj, 28, 28, 456, 456);
                ctx.restore();
            } else {
                // Dibujar Emoji de Agente en gran tamaño con sombra 3D
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
                ctx.shadowBlur = 18;
                ctx.shadowOffsetY = 8;
                ctx.font = '250px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(validAvatar, 256, 272);
                ctx.restore();
            }

            // Anillo biselado interior brillante
            ctx.beginPath();
            ctx.arc(256, 256, 232, 0, Math.PI * 2);
            ctx.lineWidth = 18;
            ctx.strokeStyle = isReady ? '#10b981' : (isMe ? '#eab308' : '#64748b');
            ctx.stroke();

            // Reflejo cristalino superior (efecto lente 3D)
            const gloss = ctx.createLinearGradient(0, 0, 0, 240);
            gloss.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
            gloss.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
            ctx.beginPath();
            ctx.arc(256, 230, 210, Math.PI, Math.PI * 2);
            ctx.fillStyle = gloss;
            ctx.fill();
        };

        const tex = new THREE.CanvasTexture(canvas);
        if (this.renderer) tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

        if (isImage) {
            if (this.avatarImageCache.has(validAvatar)) {
                drawMedallion(this.avatarImageCache.get(validAvatar));
                tex.needsUpdate = true;
            } else {
                drawMedallion(null);
                const img = new Image();
                img.onload = () => {
                    this.avatarImageCache.set(validAvatar, img);
                    drawMedallion(img);
                    tex.needsUpdate = true;
                };
                img.src = validAvatar;
            }
        } else {
            drawMedallion(null);
        }

        this.putTextureInCache(this.avatarTextureCache, cacheKey, tex);
        return tex;
    }

    // Construye el Medallón 3D vertical con la foto/avatar del jugador
    createAvatarMedallion3D(player, isMe) {
        const group = new THREE.Group();

        const cylGeo = this.sharedGeometries.medallionCylinder || (() => {
            const g = new THREE.CylinderGeometry(0.68, 0.68, 0.14, 48);
            g.rotateY(Math.PI / 2);
            g.rotateX(Math.PI / 2);
            return g;
        })();

        const faceTex = this.getAvatarMedallionTexture(player.avatar, isMe, player.ready);
        const rimColor = player.ready ? 0x10b981 : (isMe ? 0xeab308 : 0x475569);

        const rimMat = new THREE.MeshStandardMaterial({
            color: rimColor,
            roughness: 0.25,
            metalness: 0.85
        });
        // MeshBasicMaterial en la cara de la foto evita que el foco cenital queme o encandile la imagen desde arriba
        const faceMat = new THREE.MeshBasicMaterial({
            map: faceTex
        });

        const coinMesh = new THREE.Mesh(cylGeo, [rimMat, faceMat, faceMat]);
        coinMesh.castShadow = true;
        group.add(coinMesh);

        // Aro metálico 3D exterior (Torus) que envuelve la foto
        const torusGeo = this.sharedGeometries.medallionTorus || new THREE.TorusGeometry(0.68 + 0.03, 0.055, 16, 48);
        const torusMat = new THREE.MeshStandardMaterial({
            color: rimColor,
            roughness: 0.2,
            metalness: 0.9,
            emissive: player.ready ? 0x064e3b : 0x000000,
            emissiveIntensity: 0.6
        });
        const torusMesh = new THREE.Mesh(torusGeo, torusMat);
        group.add(torusMesh);

        return group;
    }

    // Construye Texto 3D Volumétrico Flotante (SIN caja negra de fondo, letras puras flotando con relieve 3D)
    createFloating3DTextMesh(player, isMe, state) {
        const displayName = `${player.name.toUpperCase()}${isMe ? ' (TÚ)' : ''}`;
        const statusText = player.ready ? '✔ LISTO' : '⏳ ELIGIENDO';
        const handTag = (player.bestHand && ['round_end', 'game_over', 'showdown'].includes(state.phase))
            ? player.bestHand.name.toUpperCase()
            : '';

        const cacheKey = `${displayName}_${statusText}_${handTag}_${player.finalRank || ''}`;
        let texPair = this.text3DTextureCache.get(cacheKey);

        if (!texPair) {
            const w = 1024;
            const h = 360;

            // 1. Canvas Frontal (Cara brillante de las letras 3D)
            const frontCanvas = document.createElement('canvas');
            frontCanvas.width = w;
            frontCanvas.height = h;
            const fCtx = frontCanvas.getContext('2d');

            // 2. Canvas de Extrusión / Sombra 3D (Capas traseras que dan volumen 3D al rotar)
            const depthCanvas = document.createElement('canvas');
            depthCanvas.width = w;
            depthCanvas.height = h;
            const dCtx = depthCanvas.getContext('2d');

            const drawLetters = (ctx, isDepthLayer) => {
                ctx.clearRect(0, 0, w, h);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Si hay etiqueta de mano final revelada (ej: FULL HOUSE / PAREJA)
                if (handTag) {
                    ctx.font = '900 52px "Cinzel", "Montserrat", sans-serif';
                    ctx.lineWidth = isDepthLayer ? 16 : 10;
                    ctx.strokeStyle = isDepthLayer ? '#020617' : '#450a0a';
                    ctx.strokeText(handTag, w / 2, 54);
                    ctx.fillStyle = isDepthLayer ? '#78350f' : '#facc15';
                    ctx.fillText(handTag, w / 2, 54);
                }

                // NOMBRE DEL JUGADOR EN TEXTO 3D GRANDE
                const nameY = 155;
                ctx.font = '900 84px "Cinzel", "Montserrat", sans-serif';
                ctx.lineJoin = 'round';

                if (isDepthLayer) {
                    ctx.lineWidth = 22;
                    ctx.strokeStyle = '#020409';
                    ctx.strokeText(displayName, w / 2, nameY);
                    ctx.fillStyle = isMe ? '#064e3b' : '#1e293b';
                    ctx.fillText(displayName, w / 2, nameY);
                } else {
                    // Contorno oscuro grueso para contraste total sin necesitar caja
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
                    ctx.shadowBlur = 14;
                    ctx.shadowOffsetY = 6;
                    ctx.lineWidth = 16;
                    ctx.strokeStyle = '#050811';
                    ctx.strokeText(displayName, w / 2, nameY);

                    // Gradiente metálico de las letras frontales
                    const nameGrad = ctx.createLinearGradient(0, nameY - 45, 0, nameY + 45);
                    if (isMe) {
                        nameGrad.addColorStop(0, '#ffffff');
                        nameGrad.addColorStop(0.5, '#a7f3d0');
                        nameGrad.addColorStop(1, '#10b981');
                    } else {
                        nameGrad.addColorStop(0, '#ffffff');
                        nameGrad.addColorStop(0.6, '#f8fafc');
                        nameGrad.addColorStop(1, '#94a3b8');
                    }
                    ctx.fillStyle = nameGrad;
                    ctx.fillText(displayName, w / 2, nameY);
                }

                // ESTADO FLOTANTE EN 3D (✔ LISTO / ⏳ ELIGIENDO)
                const statusY = 258;
                ctx.font = '900 54px "Montserrat", sans-serif';
                if (isDepthLayer) {
                    ctx.lineWidth = 18;
                    ctx.strokeStyle = '#020409';
                    ctx.strokeText(statusText, w / 2, statusY);
                    ctx.fillStyle = '#020409';
                    ctx.fillText(statusText, w / 2, statusY);
                } else {
                    ctx.lineWidth = 13;
                    ctx.strokeStyle = '#050811';
                    ctx.strokeText(statusText, w / 2, statusY);
                    ctx.fillStyle = player.ready ? '#34d399' : '#fbbf24';
                    ctx.fillText(statusText, w / 2, statusY);
                }
            };

            drawLetters(fCtx, false);
            drawLetters(dCtx, true);

            const frontTex = new THREE.CanvasTexture(frontCanvas);
            const depthTex = new THREE.CanvasTexture(depthCanvas);
            if (this.renderer) {
                frontTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                depthTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            }

            texPair = { frontTex, depthTex };
            this.putTexturePairInCache(this.text3DTextureCache, cacheKey, texPair);
        }

        // Crear grupo 3D con capas apiladas en Z para dar verdadero grosor/extrusión 3D a las letras
        const textGroup = new THREE.Group();
        const planeGeo = this.sharedGeometries.textPlane || new THREE.PlaneGeometry(3.6, 1.26);

        // Capas de extrusión traseras (volumen 3D real al mirar de costado)
        const depthMat = new THREE.MeshBasicMaterial({
            map: texPair.depthTex,
            transparent: true,
            alphaTest: 0.08,
            side: THREE.DoubleSide
        });

        const numSlices = 5;
        for (let s = 1; s <= numSlices; s++) {
            const sliceMesh = new THREE.Mesh(planeGeo, depthMat);
            sliceMesh.position.z = -s * 0.024;
            textGroup.add(sliceMesh);
        }

        // Cara frontal iluminada de las letras 3D
        const frontMat = new THREE.MeshBasicMaterial({
            map: texPair.frontTex,
            transparent: true,
            alphaTest: 0.05,
            side: THREE.DoubleSide
        });
        const frontMesh = new THREE.Mesh(planeGeo, frontMat);
        frontMesh.position.z = 0.01;
        textGroup.add(frontMesh);

        return textGroup;
    }

    // Etiqueta flotante 3D con el nombre completo del jugador para las fichas del rack central
    createOwnerSprite(text, isMe) {
        const cacheKey = `${text}_${isMe}`;
        let tex = this.labelTextureCache.get(cacheKey);
        if (!tex) {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 120;
            const ctx = canvas.getContext('2d');

            // Auto-ajustar tamaño de fuente para que el nombre completo entre siempre sin cortarse ni amontonarse
            let fontSize = 42;
            ctx.font = `900 ${fontSize}px "Montserrat", sans-serif`;
            const maxTextWidth = 456;
            while (ctx.measureText(text).width > maxTextWidth && fontSize > 22) {
                fontSize -= 2;
                ctx.font = `900 ${fontSize}px "Montserrat", sans-serif`;
            }

            const textW = Math.min(maxTextWidth, ctx.measureText(text).width);
            const pillW = Math.max(220, textW + 48);
            const pillH = 74;
            const pillX = (512 - pillW) / 2;
            const pillY = (120 - pillH) / 2;

            // Cápsula oscura traslúcida con borde neón para lectura limpia sin solaparse
            ctx.fillStyle = isMe ? 'rgba(6, 78, 59, 0.94)' : 'rgba(9, 13, 22, 0.94)';
            this.roundRectCanvas(ctx, pillX, pillY, pillW, pillH, 37);
            ctx.fill();

            ctx.lineWidth = 4;
            ctx.strokeStyle = isMe ? '#34d399' : '#eab308';
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 8;
            ctx.strokeStyle = '#020617';
            ctx.strokeText(text, 256, 61);

            ctx.fillStyle = isMe ? '#a7f3d0' : '#fef08a';
            ctx.fillText(text, 256, 61);

            tex = new THREE.CanvasTexture(canvas);
            if (this.renderer) tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            this.putTextureInCache(this.labelTextureCache, cacheKey, tex);
        }

        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        // Ancho 1.52 es menor que el espaciado entre fichas (1.68), garantizando que nunca se pisen
        sprite.scale.set(1.52, 0.36, 1);
        return sprite;
    }

    // Helper para poner texturas en caché con límite LRU (64 elementos)
    putTextureInCache(cache, key, texture) {
        if (cache.has(key)) {
            cache.delete(key);
        } else if (cache.size >= 64) {
            const oldestKey = cache.keys().next().value;
            const oldestTex = cache.get(oldestKey);
            if (oldestTex && typeof oldestTex.dispose === 'function') {
                oldestTex.dispose();
            }
            cache.delete(oldestKey);
        }
        cache.set(key, texture);
    }

    putTexturePairInCache(cache, key, pair) {
        if (cache.has(key)) {
            cache.delete(key);
        } else if (cache.size >= 64) {
            const oldestKey = cache.keys().next().value;
            const oldestPair = cache.get(oldestKey);
            if (oldestPair) {
                if (oldestPair.frontTex && typeof oldestPair.frontTex.dispose === 'function') oldestPair.frontTex.dispose();
                if (oldestPair.depthTex && typeof oldestPair.depthTex.dispose === 'function') oldestPair.depthTex.dispose();
            }
            cache.delete(oldestKey);
        }
        cache.set(key, pair);
    }

    // Comprueba si una textura está en algún caché compartido para NO liberarla
    isSharedTexture(tex) {
        if (!tex) return false;
        if (tex === this.cardBackTexture) return true;
        for (const t of this.cardTextureCache.values()) {
            if (t === tex) return true;
        }
        for (const t of this.chipTextureCache.values()) {
            if (t === tex) return true;
        }
        for (const t of this.labelTextureCache.values()) {
            if (t === tex) return true;
        }
        for (const t of this.avatarTextureCache.values()) {
            if (t === tex) return true;
        }
        for (const pair of this.text3DTextureCache.values()) {
            if (pair && (pair.frontTex === tex || pair.depthTex === tex)) return true;
        }
        return false;
    }

    // Dispositor recursivo seguro para liberar VRAM en geometrías y materiales
    disposeObject(obj) {
        if (!obj) return;

        // Si es una geometría compartida permanente, no disponerla
        const isSharedGeo = Object.values(this.sharedGeometries).includes(obj.geometry);
        if (obj.geometry && !isSharedGeo) {
            obj.geometry.dispose();
        }

        if (obj.material) {
            const isSharedMat = Object.values(this.sharedMaterials).includes(obj.material);
            if (!isSharedMat) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const m of mats) {
                    if (!m) continue;
                    // Solo disponemos mapas si no son de la caché
                    if (m.map && !this.isSharedTexture(m.map)) {
                        m.map.dispose();
                    }
                    m.dispose();
                }
            }
        }

        if (obj.children && obj.children.length > 0) {
            for (let i = obj.children.length - 1; i >= 0; i--) {
                this.disposeObject(obj.children[i]);
            }
        }
    }

    clearGroup(group) {
        if (!group) return;
        while (group.children.length > 0) {
            const child = group.children[0];
            group.remove(child);
            this.disposeObject(child);
        }
    }

    // ==========================================
    // ACTUALIZACIÓN COMPLETA DEL ESTADO EN 3D
    // ==========================================
    updateState(state, myPlayerId) {
        this.lastState = state;
        this.myPlayerId = myPlayerId;

        if (!this.isInitialized) {
            this.init();
        }
        if (!this.isInitialized || !state) return;

        this.renderCommunity3D(state.communityCards || []);
        this.renderChipsRack3D(state, myPlayerId);
        this.renderSeatsAndPlayerCards3D(state, myPlayerId);
    }

    renderCommunity3D(cards) {
        // Firma barata para saber si las cartas comunitarias cambiaron
        const sig = cards.map(c => `${c.rank}-${c.suit}`).join('|');
        if (this.signatures.community === sig && cards.length === this.lastCommunityCount) {
            return;
        }
        this.signatures.community = sig;

        this.clearGroup(this.communityGroup);
        this.animatedCards = [];

        if (cards.length < this.lastCommunityCount) {
            this.lastCommunityCount = 0;
        }

        const isNewDeal = cards.length > this.lastCommunityCount;
        const spacing = 1.48;
        const startX = -2 * spacing;
        const zPos = -0.82;

        for (let i = 0; i < cards.length; i++) {
            const cardMesh = this.createCardMesh(cards[i], false);
            const targetX = startX + i * spacing;

            if (isNewDeal && i >= this.lastCommunityCount) {
                cardMesh.position.set(targetX, 1.4, zPos - 1.5);
                cardMesh.rotation.x = Math.PI * 0.65;
                this.animatedCards.push({
                    mesh: cardMesh,
                    targetPos: new THREE.Vector3(targetX, 0.025, zPos),
                    targetRot: new THREE.Euler(0, 0, 0),
                    progress: 0,
                    delay: (i - this.lastCommunityCount) * 0.12
                });
            } else {
                cardMesh.position.set(targetX, 0.025, zPos);
            }

            this.communityGroup.add(cardMesh);
        }

        this.lastCommunityCount = cards.length;
    }

    renderChipsRack3D(state, myPlayerId) {
        const isChipPhase = ['preflop', 'flop', 'turn', 'river'].includes(state.phase);
        const colorKey = (state.phaseColor && state.phaseColor.key) || 'white';
        const totalPlayers = state.players.length;

        // Firma barata para el rack de fichas
        const holdersSig = state.players.map(p => `${p.name}:${p.currentChip}`).join(',');
        const sig = `${state.phase}_${colorKey}_${totalPlayers}_${myPlayerId}_${holdersSig}`;

        if (this.signatures.chipsRack === sig) {
            return;
        }
        this.signatures.chipsRack = sig;

        this.clearGroup(this.chipsRackGroup);
        this.interactiveChips = [];

        if (!isChipPhase) return;

        const me = state.players.find(p => p.id === myPlayerId);
        const myCurrentChip = me ? me.currentChip : null;

        const spacing = 1.68;
        const startX = -((totalPlayers - 1) * spacing) / 2;
        const rackZ = 1.15;

        const trayWidth = totalPlayers * spacing + 0.6;
        const trayGeo = new THREE.BoxGeometry(trayWidth, 0.06, 1.7);
        const trayMat = new THREE.MeshStandardMaterial({
            color: 0x090d14,
            roughness: 0.4,
            metalness: 0.3
        });
        const trayMesh = new THREE.Mesh(trayGeo, trayMat);
        trayMesh.position.set(0, 0.03, rackZ);
        trayMesh.receiveShadow = true;
        this.chipsRackGroup.add(trayMesh);

        for (let num = 1; num <= totalPlayers; num++) {
            const xPos = startX + (num - 1) * spacing;
            const holder = state.players.find(p => p.currentChip === num);
            const isMyChip = (myCurrentChip === num);

            const chipHolderGroup = new THREE.Group();
            chipHolderGroup.position.set(xPos, 0.16, rackZ);

            const chipMesh = this.createChipMesh(num, colorKey, 1.0);
            chipMesh.rotation.x = 0.24;
            chipMesh.userData = {
                isChip: true,
                chipNum: num,
                baseY: 0,
                holderGroup: chipHolderGroup
            };
            chipHolderGroup.add(chipMesh);
            this.interactiveChips.push(chipMesh);

            const ringGeo = new THREE.RingGeometry(0.66, 0.78, 36);
            ringGeo.rotateX(-Math.PI / 2);
            let ringColor = 0xffffff;
            let ringOpacity = 0.18;

            if (isMyChip) {
                ringColor = 0x10b981;
                ringOpacity = 0.95;
                chipHolderGroup.position.y = 0.28;
            } else if (holder) {
                ringColor = 0xeab308;
                ringOpacity = 0.75;
            }

            const ringMat = new THREE.MeshBasicMaterial({
                color: ringColor,
                transparent: true,
                opacity: ringOpacity,
                side: THREE.DoubleSide
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.position.y = -0.06;
            chipHolderGroup.add(ringMesh);
            chipMesh.userData.ringMesh = ringMesh;
            chipMesh.userData.defaultRingOpacity = ringOpacity;
            chipMesh.userData.defaultRingColor = ringColor;

            if (holder) {
                const fullName = holder.name.trim().toUpperCase();
                const labelText = isMyChip ? `★ ${fullName}` : fullName;
                const sprite = this.createOwnerSprite(labelText, isMyChip);
                sprite.position.set(0, -0.04, 0.96);
                chipHolderGroup.add(sprite);
            }

            this.chipsRackGroup.add(chipHolderGroup);
        }
    }

    renderSeatsAndPlayerCards3D(state, myPlayerId) {
        // Firma barata para los asientos de jugadores
        const seatsSig = state.players.map(p => {
            const h = p.chipsHistory || {};
            const cardsStr = (p.cards || []).map(c => c ? `${c.rank}${c.suit}${c.hidden ? 'h' : ''}` : '').join('-');
            const handTag = (state.phase === 'showdown' || state.phase === 'game_over') ? (p.bestHand ? p.bestHand.name : '') : '';
            return `${p.id}:${p.name}:${p.avatar}:${p.ready}:${p.currentChip}:${h.preflop}-${h.flop}-${h.turn}-${h.river}:${cardsStr}:${handTag}`;
        }).join(';');
        const sig = `${myPlayerId}_${state.phase}_${seatsSig}`;

        if (this.signatures.seats === sig) {
            return;
        }
        this.signatures.seats = sig;

        this.clearGroup(this.seats3DGroup);
        this.floatingSeats = [];

        const total = state.players.length;
        if (total === 0) return;

        const myIndex = state.players.findIndex(p => p.id === myPlayerId);
        const sortedPlayers = [];
        for (let i = 0; i < total; i++) {
            const idx = (myIndex >= 0) ? (myIndex + i) % total : i;
            sortedPlayers.push(state.players[idx]);
        }

        const seatRadiusX = 7.75;
        const seatRadiusZ = 4.8;

        const cardsRadiusX = 5.4;
        const cardsRadiusZ = 3.15;

        const currentPhaseColor = (state.phaseColor && state.phaseColor.key) || 'white';

        sortedPlayers.forEach((player, clockIndex) => {
            const isMe = (player.id === myPlayerId);
            const angleDeg = 90 + clockIndex * (360 / total);
            const rad = (angleDeg * Math.PI) / 180;

            const seatX = seatRadiusX * Math.cos(rad);
            const seatZ = seatRadiusZ * Math.sin(rad);

            const cardCenterX = cardsRadiusX * Math.cos(rad);
            const cardCenterZ = cardsRadiusZ * Math.sin(rad);

            const lookAngle = Math.atan2(cardCenterX, cardCenterZ);

            // 1. Pedestal 3D de base en el borde de la mesa
            const tokenGeo = this.sharedGeometries.pedestalToken || new THREE.CylinderGeometry(0.58, 0.72, 0.18, 32);
            const tokenColor = isMe ? 0x10b981 : (player.ready ? 0x059669 : 0x1e293b);
            const tokenMat = new THREE.MeshStandardMaterial({
                color: tokenColor,
                roughness: 0.3,
                metalness: 0.65
            });
            const tokenMesh = new THREE.Mesh(tokenGeo, tokenMat);
            tokenMesh.position.set(seatX, 0.32, seatZ);
            this.seats3DGroup.add(tokenMesh);

            const haloGeo = this.sharedGeometries.seatHalo || (() => {
                const h = new THREE.RingGeometry(0.68, 0.84, 36);
                h.rotateX(-Math.PI / 2);
                return h;
            })();
            const haloMat = new THREE.MeshBasicMaterial({
                color: player.ready ? 0x10b981 : 0xeab308,
                transparent: true,
                opacity: player.ready ? 0.9 : 0.4,
                side: THREE.DoubleSide
            });
            const haloMesh = new THREE.Mesh(haloGeo, haloMat);
            haloMesh.position.set(seatX, 0.42, seatZ);
            this.seats3DGroup.add(haloMesh);

            // 2. ENSAMBLAJE 3D FLOTANTE DEL JUGADOR (Foto Medallón 3D + Texto 3D Flotante + Ficha Actual 3D)
            const floatingGroup = new THREE.Group();
            const baseY = isMe ? 1.0 : 1.58;
            const floatX = isMe ? (seatX - 4.15) : seatX;
            const floatZ = isMe ? (seatZ + 0.15) : seatZ;
            floatingGroup.position.set(floatX, baseY, floatZ);

            // 2a. Medallón 3D con la Foto o Avatar del jugador
            const medallion3D = this.createAvatarMedallion3D(player, isMe);
            medallion3D.position.set(-1.15, 0, 0);
            floatingGroup.add(medallion3D);

            // 2b. Texto 3D Volumétrico Flotante (Nombre + Estado)
            const text3DMesh = this.createFloating3DTextMesh(player, isMe, state);
            text3DMesh.position.set(0.75, 0.04, 0);
            floatingGroup.add(text3DMesh);

            // 2c. Ficha Actual Elegida flotando en 3D al lado del nombre
            let spinChip = null;
            if (player.currentChip !== null) {
                spinChip = this.createChipMesh(player.currentChip, currentPhaseColor, 0.68);
                spinChip.rotation.x = Math.PI / 2;
                spinChip.position.set(2.45, 0.05, 0.05);
                floatingGroup.add(spinChip);
            }

            this.seats3DGroup.add(floatingGroup);
            this.floatingSeats.push({
                playerId: player.id,
                group: floatingGroup,
                baseY,
                phaseOffset: clockIndex * 1.3,
                spinChip,
                seatPos: new THREE.Vector3(floatX, baseY, floatZ)
            });

            // 3. Cartas Privadas del Jugador + Historial de Fichas 3D en el paño
            const pairGroup = new THREE.Group();
            pairGroup.position.set(cardCenterX, 0.04, cardCenterZ);
            pairGroup.rotation.y = lookAngle;

            if (player.cards && player.cards.length === 2) {
                for (let c = 0; c < 2; c++) {
                    const cardData = player.cards[c];
                    const isHidden = !isMe && (!cardData || cardData.hidden);
                    const cMesh = this.createCardMesh(cardData, isHidden);

                    const offsetX = (c === 0) ? -0.66 : 0.66;
                    if (isMe) {
                        cMesh.position.set(offsetX, 0.56, 0.25);
                        cMesh.rotation.x = 0.68;
                        cMesh.rotation.y = (c === 0) ? 0.08 : -0.08;
                        cMesh.rotation.z = (c === 0) ? 0.04 : -0.04;
                    } else {
                        cMesh.position.set(offsetX * 0.82, 0.02, 0);
                        cMesh.rotation.y = (c === 0) ? 0.06 : -0.06;
                    }
                    pairGroup.add(cMesh);
                }
            }

            // 4. Rack 3D de Historial de las 4 Fases (Blanca, Amarilla, Naranja, Roja) sobre el paño
            const hist = player.chipsHistory || {};
            const phases = [
                { key: 'preflop', color: 'white',  hex: 0xf8fafc, val: hist.preflop },
                { key: 'flop',    color: 'yellow', hex: 0xfacc15, val: hist.flop },
                { key: 'turn',    color: 'orange', hex: 0xf97316, val: hist.turn },
                { key: 'river',   color: 'red',    hex: 0xef4444, val: hist.river }
            ];

            phases.forEach((ph, idx) => {
                const slotX = 1.48 + idx * 0.58;
                const slotZ = 0.15;

                // Anillo marcador de la fase en el paño
                const slotRingGeo = new THREE.RingGeometry(0.21, 0.26, 24);
                slotRingGeo.rotateX(-Math.PI / 2);
                const slotRingMat = new THREE.MeshBasicMaterial({
                    color: ph.hex,
                    transparent: true,
                    opacity: ph.val ? 0.85 : 0.28,
                    side: THREE.DoubleSide
                });
                const slotRing = new THREE.Mesh(slotRingGeo, slotRingMat);
                slotRing.position.set(slotX, 0.01, slotZ);
                pairGroup.add(slotRing);

                if (ph.val) {
                    const miniChip = this.createChipMesh(ph.val, ph.color, 0.42);
                    miniChip.position.set(slotX, 0.05, slotZ);
                    pairGroup.add(miniChip);
                }
            });

            this.seats3DGroup.add(pairGroup);
        });
    }

    // ====================================================
    // EMOTES FLOTANTES EN 3D SOBRE EL ASIENTO DEL JUGADOR
    // ====================================================
    spawnEmote3D(playerId, emoji) {
        if (!this.isInitialized || !this.emotes3DGroup) return;
        const seatInfo = this.floatingSeats.find(s => s.playerId === playerId);
        if (!seatInfo) return;

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.font = '180px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 128, 136);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(seatInfo.seatPos);
        sprite.position.y += 1.05;
        sprite.scale.set(0.2, 0.2, 1);

        this.emotes3DGroup.add(sprite);
        this.activeEmotes3D.push({
            sprite,
            age: 0,
            maxAge: 2.0
        });
    }

    // ====================================================
    // INTERACCIÓN CON FICHAS 3D (RAYCASTING + HOVER + CLIC)
    // ====================================================
    setupInteractionEvents() {
        const domEl = this.renderer.domElement;

        domEl.addEventListener('pointerdown', (e) => {
            this.pointerDownPos.x = e.clientX;
            this.pointerDownPos.y = e.clientY;
        });

        domEl.addEventListener('pointermove', (e) => {
            if (!this.is3DEnabled) return;
            const rect = domEl.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            this.checkChipHover();
        });

        domEl.addEventListener('pointerup', (e) => {
            if (!this.is3DEnabled) return;
            const dx = e.clientX - this.pointerDownPos.x;
            const dy = e.clientY - this.pointerDownPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 7) {
                const rect = domEl.getBoundingClientRect();
                this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.raycaster.setFromCamera(this.mouse, this.camera);
                const hits = this.raycaster.intersectObjects(this.interactiveChips, false);

                if (hits.length > 0) {
                    const hitMesh = hits[0].object;
                    if (hitMesh.userData && hitMesh.userData.isChip) {
                        const chipNum = hitMesh.userData.chipNum;
                        if (typeof soundManager !== 'undefined') soundManager.playChipClink();
                        if (typeof network !== 'undefined' && network) {
                            network.selectChip(chipNum);
                        }
                    }
                }
            }
        });
    }

    checkChipHover() {
        if (this.interactiveChips.length === 0) {
            this.renderer.domElement.style.cursor = 'grab';
            return;
        }

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.interactiveChips, false);

        this.interactiveChips.forEach(mesh => {
            const ring = mesh.userData.ringMesh;
            if (ring) {
                ring.material.opacity = mesh.userData.defaultRingOpacity;
                ring.material.color.setHex(mesh.userData.defaultRingColor);
            }
            mesh.scale.set(1, 1, 1);
        });

        if (hits.length > 0) {
            const hitMesh = hits[0].object;
            hitMesh.scale.set(1.16, 1.16, 1.16);
            if (hitMesh.userData.ringMesh) {
                hitMesh.userData.ringMesh.material.opacity = 1.0;
                hitMesh.userData.ringMesh.material.color.setHex(0x00f0ff);
            }
            this.renderer.domElement.style.cursor = 'pointer';
        } else {
            this.renderer.domElement.style.cursor = 'grab';
        }
    }

    setCameraPreset(presetName) {
        if (!this.camera || !this.controls) return;

        let targetPos = new THREE.Vector3(0, 8.2, 11.8);
        let targetLook = new THREE.Vector3(0, 0.2, 0.0);

        if (presetName === 'seat') {
            targetPos.set(0, 8.2, 11.8);
            targetLook.set(0, 0.2, 0.0);
        } else if (presetName === 'top') {
            targetPos.set(0, 16.5, 1.6);
            targetLook.set(0, 0, 0);
        } else if (presetName === 'angle') {
            targetPos.set(10.4, 9.6, 10.4);
            targetLook.set(0, 0.2, 0);
        }

        this.cameraTransition = {
            startPos: this.camera.position.clone(),
            endPos: targetPos,
            startLook: this.controls.target.clone(),
            endLook: targetLook,
            progress: 0
        };
    }

    setupResizeHandler() {
        const onResize = () => {
            if (!this.container || !this.renderer || !this.camera) return;
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            if (w === 0 || h === 0) return;

            this.lastW = w;
            this.lastH = h;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        };

        window.addEventListener('resize', onResize);
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(onResize);
            ro.observe(this.container);
        }
    }

    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            this.isPageVisible = !document.hidden;
            if (this.isPageVisible && this.is3DEnabled) {
                this.startLoop();
            } else {
                this.stopLoop();
            }
        });
    }

    setEnabled(enabled) {
        this.is3DEnabled = !!enabled;
        if (this.is3DEnabled && this.isPageVisible) {
            this.startLoop();
        } else {
            this.stopLoop();
        }
    }

    startLoop() {
        if (!this.animationFrameId && this.is3DEnabled && this.isPageVisible) {
            this.clock.start();
            this.animationFrameId = requestAnimationFrame(() => this.animate());
        }
    }

    stopLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    animate() {
        this.animationFrameId = null;

        if (!this.is3DEnabled || !this.isPageVisible || !this.renderer || !this.scene || !this.camera) {
            return;
        }

        this.animationFrameId = requestAnimationFrame(() => this.animate());

        const elapsed = this.clock.getElapsedTime();

        // Auto-ajustar tamaño si cambió el contenedor
        if (this.container) {
            const cw = this.container.clientWidth;
            const ch = this.container.clientHeight;
            if (cw > 0 && ch > 0 && (cw !== this.lastW || ch !== this.lastH)) {
                this.lastW = cw;
                this.lastH = ch;
                this.camera.aspect = cw / ch;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(cw, ch);
            }
        }

        // 1. Transición suave de cámara
        if (this.cameraTransition) {
            this.cameraTransition.progress += 0.06;
            const t = Math.min(1, this.cameraTransition.progress);
            const ease = 1 - Math.pow(1 - t, 3);

            this.camera.position.lerpVectors(this.cameraTransition.startPos, this.cameraTransition.endPos, ease);
            if (this.controls) {
                this.controls.target.lerpVectors(this.cameraTransition.startLook, this.cameraTransition.endLook, ease);
            }
            if (t >= 1) {
                this.cameraTransition = null;
            }
        }

        // 2. Animación de reparto de cartas comunitarias 3D
        for (let i = this.animatedCards.length - 1; i >= 0; i--) {
            const anim = this.animatedCards[i];
            if (anim.delay > 0) {
                anim.delay -= 0.016;
                continue;
            }
            anim.progress += 0.08;
            const t = Math.min(1, anim.progress);
            const ease = 1 - Math.pow(1 - t, 3);

            anim.mesh.position.lerp(anim.targetPos, ease);
            anim.mesh.rotation.x = anim.mesh.rotation.x * (1 - ease);
            if (t >= 1) {
                anim.mesh.position.copy(anim.targetPos);
                anim.mesh.rotation.set(0, 0, 0);
                this.animatedCards.splice(i, 1);
            }
        }

        // 3. Animación 3D Flotante de los Medallones de Foto y Texto 3D Volumétrico
        this.floatingSeats.forEach(item => {
            // Levitación suave en Y
            item.group.position.y = item.baseY + Math.sin(elapsed * 2.2 + item.phaseOffset) * 0.07;

            // Alinear con la orientación del lente de la cámara para que el texto y la foto
            // se mantengan siempre 100% horizontales y derechos (incluso en vista Cenital desde arriba)
            item.group.quaternion.copy(this.camera.quaternion);

            // Pequeña oscilación 3D de la ficha actual
            if (item.spinChip) {
                item.spinChip.rotation.z = Math.sin(elapsed * 2.8 + item.phaseOffset) * 0.22;
            }
        });

        // 4. Animación de Emotes 3D flotantes
        for (let i = this.activeEmotes3D.length - 1; i >= 0; i--) {
            const em = this.activeEmotes3D[i];
            em.age += 0.016;
            const p = em.age / em.maxAge;
            if (p >= 1) {
                this.emotes3DGroup.remove(em.sprite);
                this.activeEmotes3D.splice(i, 1);
                continue;
            }
            em.sprite.position.y += 0.018;
            const s = p < 0.2 ? (0.2 + (p / 0.2) * 0.9) : 1.1;
            em.sprite.scale.set(s, s, 1);
            em.sprite.material.opacity = p > 0.7 ? (1 - (p - 0.7) / 0.3) : 1;
        }

        if (this.controls) {
            this.controls.update();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Instancia global de la mesa 3D
const pokerTable3D = new PokerTable3D('table-3d-canvas-wrap');
