import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { GameState, Phase, Ingredient } from './gameLogic.js';

class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playClick() { this.playTone(800, 'sine', 0.1, 0.05); }
    playSelect() { this.playTone(400, 'square', 0.15, 0.05); }
    playDamage() { this.playTone(100, 'sawtooth', 0.5, 0.2); }
    playHeal() { this.playTone(1200, 'sine', 0.6, 0.1); }
    playTick() { this.playTone(2000, 'triangle', 0.05, 0.02); }
    playChaos() { this.playTone(200, 'triangle', 1.0, 0.3); }
}

class GameUI {
    constructor() {
        this.game = new GameState();
        this.audio = new AudioManager();
        this.setupThreeJS();
        this.initUI();
        this.animate();
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupThreeJS() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('bg-canvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Stark, Moody PS1 Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.05); // Near black void
        this.scene.add(ambientLight);

        this.spotLight = new THREE.SpotLight(0xffddaa, 100);
        this.spotLight.position.set(0, 8, 0);
        this.spotLight.angle = Math.PI / 4;
        this.spotLight.penumbra = 0.5;
        this.spotLight.decay = 2;
        this.spotLight.distance = 20;
        this.scene.add(this.spotLight);
        
        // Opponent Manifestation (Floating Entity)
        this.opponentGroup = new THREE.Group();
        this.opponentGroup.position.set(0, 1.5, -4);
        
        const maskGeo = new THREE.IcosahedronGeometry(0.8, 1);
        const maskMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
        this.opponentMask = new THREE.Mesh(maskGeo, maskMat);
        
        const eyeGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.rotation.x = Math.PI / 2;
        leftEye.position.set(-0.35, 0.1, 0.75);
        const rightEye = leftEye.clone();
        rightEye.position.set(0.35, 0.1, 0.75);
        
        this.opponentMask.add(leftEye);
        this.opponentMask.add(rightEye);
        this.opponentGroup.add(this.opponentMask);
        
        // Mechanical Hands
        const handGeo = new THREE.CylinderGeometry(0.1, 0.2, 0.6, 8);
        const handMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8, metalness: 0.5 });
        
        this.leftHand = new THREE.Mesh(handGeo, handMat);
        this.leftHand.position.set(-1.5, -0.5, 0.5);
        this.leftHand.rotation.z = -Math.PI / 4;
        this.leftHand.rotation.x = Math.PI / 6;
        
        this.rightHand = new THREE.Mesh(handGeo, handMat);
        this.rightHand.position.set(1.5, -0.5, 0.5);
        this.rightHand.rotation.z = Math.PI / 4;
        this.rightHand.rotation.x = Math.PI / 6;
        
        this.opponentGroup.add(this.leftHand);
        this.opponentGroup.add(this.rightHand);
        
        this.scene.add(this.opponentGroup);

        // Hover animation logic for opponent
        this.oppHoverTime = 0;

        // Complex Ritual Table Geometry
        this.tableGroup = new THREE.Group();
        this.tableGroup.position.y = -1;

        const tableMat = new THREE.MeshStandardMaterial({ 
            color: 0x222222, 
            roughness: 0.9, 
            metalness: 0.6 
        });
        
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.7,
            metalness: 0.8
        });

        // Main Base Platter
        const baseGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.4, 16);
        const base = new THREE.Mesh(baseGeo, tableMat);
        
        // Outer Raised Rim
        const rimGeo = new THREE.CylinderGeometry(3.6, 3.6, 0.5, 16);
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.y = 0.05;
        
        // Inner Rotating Section (Simulated)
        const innerGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.45, 12);
        const inner = new THREE.Mesh(innerGeo, tableMat);
        inner.position.y = 0.02;

        this.tableGroup.add(base);
        this.tableGroup.add(rim);
        this.tableGroup.add(inner);
        this.scene.add(this.tableGroup);

        // Atmospheric Props: Hanging Cables
        const cableMat = new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 3 });
        for (let i = 0; i < 8; i++) {
            const points = [];
            const startX = (Math.random() - 0.5) * 10;
            const startZ = -4 + (Math.random() - 0.5) * 8;
            
            points.push(new THREE.Vector3(startX, 6, startZ)); // Ceiling
            points.push(new THREE.Vector3(startX + (Math.random()-0.5)*2, 2, startZ + (Math.random()-0.5)*2)); // Mid-hang
            points.push(new THREE.Vector3(startX + (Math.random()-0.5)*4, -2, startZ + (Math.random()-0.5)*4)); // Floor
            
            const curve = new THREE.CatmullRomCurve3(points);
            const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.05, 8, false);
            const cableMesh = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({color: 0x222222, roughness: 1}));
            this.scene.add(cableMesh);
        }

        // Atmospheric Props: Abandoned CRT Monitors
        const crtGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const crtMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        const screenMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        
        for (let i = 0; i < 4; i++) {
            const crt = new THREE.Group();
            const casing = new THREE.Mesh(crtGeo, crtMat);
            const screenGeo = new THREE.PlaneGeometry(0.7, 0.7);
            const screen = new THREE.Mesh(screenGeo, screenMat);
            screen.position.z = 0.41;
            
            crt.add(casing);
            crt.add(screen);
            
            const angle = (Math.PI * 2 / 4) * i + Math.PI/4;
            crt.position.set(Math.cos(angle) * 5, -0.6, Math.sin(angle) * 5 - 2);
            crt.lookAt(0, -0.6, 0);
            
            // Randomly tilt monitors
            crt.rotation.x += (Math.random() - 0.5) * 0.5;
            crt.rotation.z += (Math.random() - 0.5) * 0.2;
            
            this.scene.add(crt);
        }

        // Atmospheric Props: Speakers in the background
        const speakerGeo = new THREE.BoxGeometry(0.8, 1.5, 0.6);
        const speakerMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
        const coneGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12);
        const coneMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        
        for (let i = 0; i < 2; i++) {
            const speaker = new THREE.Group();
            const box = new THREE.Mesh(speakerGeo, speakerMat);
            speaker.add(box);
            
            const lowerCone = new THREE.Mesh(coneGeo, coneMat);
            lowerCone.rotation.x = Math.PI/2;
            lowerCone.position.set(0, -0.3, 0.31);
            speaker.add(lowerCone);
            
            const upperCone = lowerCone.clone();
            upperCone.scale.set(0.6, 0.6, 1);
            upperCone.position.set(0, 0.3, 0.31);
            speaker.add(upperCone);
            
            speaker.position.set(i === 0 ? -4 : 4, -0.25, -3.5);
            speaker.rotation.y = i === 0 ? Math.PI/6 : -Math.PI/6;
            this.scene.add(speaker);
        }

        // Atmospheric Props: Flickering Candles on the rim
        this.candles = [];
        const candleGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6);
        const candleMat = new THREE.MeshStandardMaterial({ color: 0xddddcc, emissive: 0x221100 });
        
        for (let i = 0; i < 6; i++) {
            const candle = new THREE.Group();
            const wax = new THREE.Mesh(candleGeo, candleMat);
            candle.add(wax);
            
            const flameGeo = new THREE.SphereGeometry(0.04, 4, 4);
            const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.y = 0.2;
            candle.add(flame);
            
            const light = new THREE.PointLight(0xff6600, 1, 3);
            light.position.y = 0.2;
            candle.add(light);
            
            const angle = (Math.PI * 2 / 6) * i;
            candle.position.set(Math.cos(angle) * 3.3, -0.65, Math.sin(angle) * 3.3);
            this.scene.add(candle);
            this.candles.push({ group: candle, light: light, flame: flame, offset: Math.random() * 10 });
        }

        // 3D Spatial Labels for Player Names
        this.playerLabels = [];
        this.createPlayerLabel(0, "PLAYER 1", new THREE.Vector3(-3, 0.8, 0));
        this.createPlayerLabel(1, "PLAYER 2", new THREE.Vector3(3, 0.8, 0));

        // 3D Spatial HP Indicators (Battery lights on the table)
        this.hpIndicators = [[], []];
        this.createHPIndicators(0, new THREE.Vector3(-2.5, -0.55, 1));
        this.createHPIndicators(1, new THREE.Vector3(2.5, -0.55, 1));

        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 500;
        const posArray = new Float32Array(particlesCount * 3);
        for(let i=0; i < particlesCount * 3; i++) {
            posArray[i] = (Math.random() - 0.5) * 10;
        }
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const particlesMaterial = new THREE.PointsMaterial({ size: 0.02, color: 0x44cc44, transparent: true, opacity: 0.5 });
        this.particles = new THREE.Points(particlesGeometry, particlesMaterial);
        this.scene.add(this.particles);

        this.camera.position.z = 5;

        // Post-Processing Pipeline
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);
        
        // Crunched PS1 resolution factor (e.g. 6)
        const renderPixelatedPass = new RenderPixelatedPass(6, this.scene, this.camera);
        this.composer.addPass(renderPixelatedPass);
        this.primaryBtn = document.getElementById('primary-btn');
        this.onlineBtn = document.getElementById('online-btn');
        this.secondaryBtn = document.getElementById('secondary-btn');
        this.instructions = document.getElementById('instructions');
        this.logContent = document.getElementById('log-content');
        
        this.primaryBtn.addEventListener('click', () => { this.audio.playClick(); this.handlePrimaryAction(); });
        this.onlineBtn.addEventListener('click', () => { this.audio.playSelect(); this.startOnlineMatch(); });
        this.secondaryBtn.addEventListener('click', () => {
             this.audio.playClick();
             this.game.selectedCards = [];
             this.updateUI();
        });
        
        this.updateHUD();
    }

    handlePrimaryAction() {
        if (!this.isOfflineInit) {
            this.isOfflineInit = true; // Started local mode
            this.onlineBtn.classList.add('hidden');
        }

        if (this.game.players[this.game.activePlayerIndex].isAi && this.game.phase !== Phase.CHOOSE) return;
        
        switch(this.game.phase) {
            case Phase.PASS_TO_ACTIVE:
                this.startTurn();
                break;
            case Phase.CRAFT:
                if (this.game.lockPotions()) {
                    this.log(`${this.game.players[this.game.activePlayerIndex].name} brewed two concoctions.`);
                    
                    if (this.isOnline && this.ws) {
                        this.ws.send(JSON.stringify({ type: 'action', action: 'LOCK_POTION', playerId: this.localPlayerId, payload: this.game.brewedPotions }));
                        this.instructions.textContent = "WAITING ON OPPONENT";
                        this.primaryBtn.classList.add('hidden');
                        this.secondaryBtn.classList.add('hidden');
                        document.getElementById('ingredient-shelf').classList.add('hidden');
                        return; // Halt local UI progression until network replies
                    }
                    this.updateUI();
                }
                break;
            case Phase.PASS_TO_CHOOSER:
                this.game.phase = Phase.CHOOSE;
                this.updateUI();
                break;
            case Phase.GAME_OVER:
                this.game.resetMatch();
                this.updateUI();
                if (this.isOnline) this.onlineBtn.classList.remove('hidden');
                break;
        }
    }

    async startOnlineMatch() {
        this.isOnline = true;
        this.onlineBtn.classList.add('hidden');
        this.primaryBtn.classList.add('hidden');
        this.instructions.textContent = "FINDING MATCH...";
        
        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const response = await fetch('/api/matchmake');
            if (!response.ok) throw new Error("Matchmaking failed");
            
            const data = await response.json();
            const wsUrl = `${wsProtocol}//${window.location.host}/api/room/${data.roomId}`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.log(`Connected to Edge Node [${data.roomId}]`, "heal");
                this.instructions.textContent = "WAITING FOR P2...";
            };
            
            this.ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                this.handleNetworkMessage(msg);
            };
            
            this.ws.onclose = () => this.log(`Disconnected from Edge server.`, "fire");
            this.ws.onerror = () => this.log(`Network error occurred.`, "fire");
            
        } catch(e) {
            // Local fallback simulation (for dev without running Wrangler)
            this.log(`Cloudflare unreachable. Simulating edge match...`);
            setTimeout(() => {
                this.log(`Local Dev Match found! You are P1 against Network P2.`, "heal");
                this.game.players[1].isAi = false;
                this.game.players[1].name = "Network P2";
                this.localPlayerId = 0;
                this.startTurn();
            }, 1000);
        }
    }

    handleNetworkMessage(msg) {
        if(msg.type === 'connected') {
            this.localPlayerId = msg.playerId;
            this.log(`Joined as Player ${this.localPlayerId + 1}`, "heal");
            if (msg.playerId === 1) { // P2 joined
                this.game.players[1].isAi = false;
                this.startTurn();
            }
        }
        else if(msg.type === 'action') {
            if (msg.action === 'LOCK_POTION' && msg.playerId !== this.localPlayerId) {
                this.log(`Opponent locked their potions.`);
            }
        }
        else if (msg.type === 'resolution') {
            this.log(`Potions sealed! Resolving round...`, "chaos");
            this.game.brewedPotions = msg.brewedPotions;
            
            const results = msg.results;
            const chooserResult = results[0];
            const brewerResult = results[1];
            
            let delayedResolution = 1500;
            
            const applyEffectVisuals = (effect, target) => {
                if (effect.kind === 'damage') {
                    this.audio.playDamage();
                    this.log(`${this.game.players[target].name} takes ${effect.amount} damage from ${effect.label}!`, 'fire');
                    this.flashScreen('red', target);
                    this.shakeCamera();
                    this.spawnParticles('fire', target);
                } else if (effect.kind === 'heal') {
                    this.audio.playHeal();
                    this.log(`${this.game.players[target].name} heals ${effect.amount} from ${effect.label}.`, 'heal');
                    this.flashScreen('cyan', target);
                    this.spawnParticles('heal', target);
                } else if (effect.kind === 'random_heal') {
                    this.audio.playHeal();
                    this.log(`Random heal from ${effect.label} triggers!`, 'chaos');
                } else if (effect.kind === 'random_damage') {
                    this.audio.playDamage();
                    this.log(`Random damage from ${effect.label} triggers!`, 'chaos');
                    this.shakeCamera();
                } else if (effect.kind === 'chaos_chaos') {
                    this.triggerChaos();
                    delayedResolution += 5500; 
                } else {
                    this.log(`${effect.label} fizzles out.`);
                }
            };

            applyEffectVisuals(chooserResult.effect, chooserResult.target);
            applyEffectVisuals(brewerResult.effect, brewerResult.target);
            
            setTimeout(() => {
                 this.game.players[0].hp = msg.newState.p1_hp;
                 this.game.players[1].hp = msg.newState.p2_hp;
                 this.game.players[0].hand = msg.newState.p1_hand;
                 this.game.players[1].hand = msg.newState.p2_hand;
                 this.game.winner = msg.newState.winner;
                 
                 if (msg.simultaneousDeath) {
                     this.audio.playHeal();
                     this.log("MUTUAL DESTRUCTION PREVENTED! Both players collapsed, but recover their lost life.", 'shield');
                     this.flashScreen('gold');
                 }
                 
                 if (this.game.winner) {
                     this.game.phase = Phase.GAME_OVER;
                 } else {
                     this.game.phase = Phase.PASS_TO_ACTIVE;
                     this.game.selectedCards = [];
                 }
                 this.updateUI();
            }, delayedResolution);
        }
    }

    startTurn() {
        this.game.phase = Phase.CRAFT;
        this.log(`--- Turn ${this.game.turnNumber} : ${this.game.players[this.game.activePlayerIndex].name} ---`, 'chaos');
        this.updateUI();
        
        if (this.game.players[this.game.activePlayerIndex].isAi) {
            setTimeout(() => {
                this.game.aiCraft();
                this.log(`AI ${this.game.players[this.game.activePlayerIndex].name} finished crafting.`);
                this.updateUI();
            }, 1000);
        }
    }

    updateUI() {
        const phase = this.game.phase;
        const activePlayer = this.game.players[this.game.activePlayerIndex];
        const opponent = this.game.players[1 - this.game.activePlayerIndex];

        this.primaryBtn.classList.remove('hidden');
        this.secondaryBtn.classList.add('hidden');
        
        document.getElementById('ingredient-shelf').classList.add('hidden');
        document.getElementById('potion-choices').classList.add('hidden');

        switch(phase) {
            case Phase.PASS_TO_ACTIVE:
                this.instructions.textContent = `PASS TO ${activePlayer.name.toUpperCase()}`;
                this.primaryBtn.textContent = "I AM READY";
                break;
            case Phase.CRAFT:
                this.instructions.textContent = `BREW YOUR FATE [${this.game.selectedCards.length}/4]`;
                this.primaryBtn.textContent = "SEAL POTIONS";
                this.primaryBtn.disabled = this.game.selectedCards.length < 4;
                this.secondaryBtn.classList.remove('hidden');
                this.secondaryBtn.textContent = "CLEAR";
                this.renderIngredients();
                break;
            case Phase.PASS_TO_CHOOSER:
                this.instructions.textContent = `Vials are ready. Pass back to ${opponent.name}.`;
                this.primaryBtn.textContent = "REVEAL CHOICES";
                if (opponent.isAi) {
                    setTimeout(() => this.handlePrimaryAction(), 1000);
                }
                break;
            case Phase.CHOOSE:
                this.instructions.textContent = `${opponent.name.toUpperCase()}: CHOOSE YOUR POISON`;
                this.primaryBtn.classList.add('hidden');
                this.renderPotions();
                if (opponent.isAi) {
                    setTimeout(() => this.choosePotion(this.game.aiChoose()), 1500);
                }
                break;
            case Phase.GAME_OVER:
                this.instructions.textContent = this.game.winner;
                this.primaryBtn.textContent = "REMATCH";
                break;
        }
        this.updateHUD();
    }

    renderIngredients() {
        const shelf = document.getElementById('ingredient-shelf');
        shelf.classList.remove('hidden');
        shelf.innerHTML = '';
        
        const available = this.game.getAvailableHand();
        const counts = {};
        available.forEach(type => { counts[type] = (counts[type] || 0) + 1; });
        
        Object.values(Ingredient).forEach(type => {
            if (counts[type] > 0) {
                const btn = document.createElement('button');
                btn.className = 'ingredient-card';
                btn.textContent = `${type.toUpperCase()} x${counts[type]}`;
                btn.style.borderColor = this.getIngredientColor(type);
                
                if (!this.game.players[this.game.activePlayerIndex].isAi) {
                    btn.onclick = () => {
                        this.audio.playSelect();
                        if (this.game.selectIngredient(type)) this.updateUI();
                    };
                }
                shelf.appendChild(btn);
            }
        });
        
        if (this.game.selectedCards.length > 0) {
             const selectedContainer = document.createElement('div');
             selectedContainer.style.width = '100%';
             selectedContainer.style.marginTop = '20px';
             selectedContainer.style.color = 'var(--text-muted)';
             selectedContainer.textContent = `Selected: ${this.game.selectedCards.map(c => c.toUpperCase()).join(' + ')}`;
             shelf.appendChild(selectedContainer);
        }
    }

    renderPotions() {
        const choices = document.getElementById('potion-choices');
        choices.classList.remove('hidden');
        choices.innerHTML = '';
        
        [0, 1].forEach(idx => {
            const btn = document.createElement('button');
            btn.className = 'potion-card';
            btn.textContent = `POTION ${idx === 0 ? 'A' : 'B'}\n???`;
            
            const opponent = this.game.players[1 - this.game.activePlayerIndex];
            if (!opponent.isAi) {
                btn.onclick = () => {
                    this.audio.playClick();
                    this.choosePotion(idx);
                };
            }
            choices.appendChild(btn);
        });
    }

    choosePotion(index) {
        const results = this.game.resolvePotion(index);
        const chooserResult = results[0];
        const brewerResult = results[1];
        
        const chooserName = this.game.players[chooserResult.target].name;
        const brewerName = this.game.players[brewerResult.target].name;
        
        this.log(`${chooserName} drinks Potion ${index === 0 ? 'A' : 'B'}.`);
        this.log(`Revealed: Potion A (${this.game.brewedPotions[0].join('+')}), Potion B (${this.game.brewedPotions[1].join('+')})`);
        
        let delayedResolution = 1500;
        
        const applyEffectVisuals = (effect, target) => {
            if (effect.kind === 'damage') {
                this.audio.playDamage();
                this.log(`${this.game.players[target].name} takes ${effect.amount} damage from ${effect.label}!`, 'fire');
                this.flashScreen('red', target);
                this.shakeCamera();
                this.spawnParticles('fire', target);
            } else if (effect.kind === 'heal') {
                this.audio.playHeal();
                this.log(`${this.game.players[target].name} heals ${effect.amount} from ${effect.label}.`, 'heal');
                this.flashScreen('cyan', target);
                this.spawnParticles('heal', target);
            } else if (effect.kind === 'random_heal') {
                this.audio.playHeal();
                this.log(`Random heal from ${effect.label} triggers!`, 'chaos');
            } else if (effect.kind === 'random_damage') {
                this.audio.playDamage();
                this.log(`Random damage from ${effect.label} triggers!`, 'chaos');
                this.shakeCamera();
            } else if (effect.kind === 'chaos_chaos') {
                this.triggerChaos();
                delayedResolution += 5500; // Wait for wheel spin
            } else {
                this.log(`${effect.label} fizzles out.`);
            }
        };

        applyEffectVisuals(chooserResult.effect, chooserResult.target);
        applyEffectVisuals(brewerResult.effect, brewerResult.target);

        setTimeout(() => {
             const simultaneousDeath = this.game.applyResolution(results);
             if (simultaneousDeath) {
                 this.audio.playHeal();
                 this.log("MUTUAL DESTRUCTION PREVENTED! Both players collapsed, but recover their lost life.", 'shield');
                 this.flashScreen('gold');
             } else {
                 this.log(`Round ended. ${brewerName} refilled 2 random cards.`);
             }
             this.updateUI();
        }, delayedResolution);
    }

    triggerChaos() {
        this.audio.playChaos();
        const overlay = document.getElementById('chaos-wheel-overlay');
        overlay.classList.remove('hidden');
        
        const canvas = document.getElementById('wheel-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 500;
        canvas.height = 500;
        
        // 8 Outcomes matching Python logic (Target: Player 1 or 2. Effect: -1, +1, -2, 0)
        // 0: P1 -1, 1: P2 -1, 2: P1 +1, 3: P2 +1, 4: P1 -2, 5: P2 -2, 6: Sparkles, 7: Sparkles
        const outcomes = ["P1 DMG 1", "P2 DMG 1", "P1 HEAL 1", "P2 HEAL 1", "P1 DMG 2", "P2 DMG 2", "SPARKLE", "SPARKLE"];
        const colors = ["#cc0000", "#cc0000", "#33cccc", "#33cccc", "#880000", "#880000", "#d4d4d4", "#d4d4d4"];
        
        const finalOutcome = Math.floor(Math.random() * 8);
        document.getElementById('chaos-status').textContent = "CHAOS MANIFESTS";
        
        let rotation = 0;
        const totalSpins = 4 + Math.random() * 2;
        const targetRotation = totalSpins * Math.PI * 2 + (finalOutcome * (Math.PI * 2 / 8));
        
        // Execute the mathematical result preemptively locally without resolving (will be drawn next updateHUD)
        const isPlayer1 = (finalOutcome % 2 === 0);
        const target = isPlayer1 ? 0 : 1;
        
        if (finalOutcome <= 1) this.game.dealDamage(target, 1);
        else if (finalOutcome <= 3) this.game.healPlayer(target, 1);
        else if (finalOutcome <= 5) this.game.dealDamage(target, 2);
        
        const drawWheel = (angle) => {
            ctx.clearRect(0, 0, 500, 500);
            const sliceAngle = (Math.PI * 2) / 8;
            
            ctx.save();
            ctx.translate(250, 250);
            ctx.rotate(angle);
            
            for (let i = 0; i < 8; i++) {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, 240, i * sliceAngle, (i + 1) * sliceAngle);
                ctx.fillStyle = colors[i];
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.5)";
                ctx.lineWidth = 2;
                ctx.stroke();
                
                ctx.fillStyle = "white";
                ctx.font = "bold 14px Inter";
                ctx.rotate(i * sliceAngle + sliceAngle/2);
                ctx.fillText(outcomes[i], 120, 5);
                ctx.rotate(-(i * sliceAngle + sliceAngle/2));
            }
            ctx.restore();
        };

        let lastTick = 0;
        const animate = () => {
            if (rotation < targetRotation) {
                const diff = targetRotation - rotation;
                const speed = Math.max(0.005, diff * 0.05);
                rotation += speed;
                drawWheel(-rotation - Math.PI/2);
                
                if (Math.floor(rotation / (Math.PI/4)) > lastTick) {
                    this.audio.playTick();
                    lastTick = Math.floor(rotation / (Math.PI/4));
                }
                
                requestAnimationFrame(animate);
            } else {
                this.flashScreen(colors[finalOutcome]);
                document.getElementById('chaos-status').textContent = outcomes[finalOutcome];
                if (finalOutcome <= 1 || (finalOutcome >= 4 && finalOutcome <= 5)) {
                    this.audio.playDamage();
                    this.shakeCamera();
                } else if (finalOutcome <= 3) {
                    this.audio.playHeal();
                }
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    this.log(`Chaos resolves: ${outcomes[finalOutcome]}`, 'chaos');
                    this.updateHUD(); // Sync newly taken chaos rules
                }, 2000);
            }
        };
        
        animate();
    }

    createPlayerLabel(index, name, position) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2, 0.5, 1);
        sprite.position.copy(position);
        
        this.scene.add(sprite);
        this.playerLabels[index] = { sprite, texture, canvas, ctx };
        this.updatePlayerLabel(index, name);
    }

    updatePlayerLabel(index, text) {
        const label = this.playerLabels[index];
        if (!label) return;
        
        const { ctx, canvas, texture } = label;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Pixelated PS1 Font Style
        ctx.fillStyle = index === 0 ? '#33cccc' : '#cc0000';
        ctx.font = 'bold 64px Courier New'; // Monospace fits the retro vibe
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Inner glow/shadow
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 10;
        ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
        
        texture.needsUpdate = true;
    }

    createHPIndicators(playerIndex, startPos) {
        const segmentGeo = new THREE.BoxGeometry(0.15, 0.05, 0.4);
        const segmentMatBase = new THREE.MeshStandardMaterial({ 
            color: 0x111111, 
            roughness: 0.8,
            metalness: 0.5
        });

        for (let i = 0; i < 10; i++) {
            const segment = new THREE.Mesh(segmentGeo, segmentMatBase.clone());
            segment.position.copy(startPos);
            segment.position.x += i * 0.2 * (playerIndex === 0 ? 1 : -1);
            
            // Add light cap
            const capGeo = new THREE.PlaneGeometry(0.12, 0.35);
            const capMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.1 });
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.rotation.x = -Math.PI / 2;
            cap.position.y = 0.026;
            segment.add(cap);

            this.scene.add(segment);
            this.hpIndicators[playerIndex].push({ mesh: segment, cap: cap });
        }
    }

    updateHPIndicators(playerIndex, hp) {
        const indicators = this.hpIndicators[playerIndex];
        if (!indicators) return;

        indicators.forEach((ind, i) => {
            const isActive = i < hp;
            if (isActive) {
                const color = hp > 6 ? 0x00ff66 : (hp > 3 ? 0xffaa00 : 0xff3300);
                ind.cap.material.color.setHex(color);
                ind.cap.material.opacity = 0.8;
                ind.isCritical = hp <= 3;
            } else {
                ind.cap.material.opacity = 0.05;
                ind.cap.material.color.setHex(0x333333);
                ind.isCritical = false;
            }
        });
    }

    spawnParticles(type, playerIndex) {
        const colors = { fire: 0xff4400, heal: 0x00ffff, poison: 0x44ff44, shield: 0xffaa00 };
        const color = colors[type] || 0x9933cc;
        
        const count = 30;
        const geometry = new THREE.BufferGeometry();
        const posArray = new Float32Array(count * 3);
        const velArray = new Float32Array(count * 3);
        const baseX = (playerIndex === 0 ? -2 : 2);
        
        for(let i=0; i<count; i++) {
            posArray[i*3] = baseX + (Math.random() - 0.5) * 0.5;
            posArray[i*3+1] = -0.5 + Math.random() * 0.5;
            posArray[i*3+2] = 0;
            velArray[i*3] = (Math.random() - 0.5) * 0.05;
            velArray[i*3+1] = Math.random() * 0.05;
            velArray[i*3+2] = (Math.random() - 0.5) * 0.05;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const material = new THREE.PointsMaterial({ size: 0.1, color: color, transparent: true, opacity: 1 });
        const points = new THREE.Points(geometry, material);
        this.scene.add(points);
        
        const starTime = Date.now();
        const duration = 1000;
        
        const update = () => {
             const elapsed = Date.now() - starTime;
             if (elapsed < duration) {
                 const pos = points.geometry.attributes.position.array;
                 for(let i=0; i<count; i++) {
                     pos[i*3] += velArray[i*3];
                     pos[i*3+1] += velArray[i*3+1];
                     pos[i*3+2] += velArray[i*3+2];
                 }
                 points.geometry.attributes.position.needsUpdate = true;
                 material.opacity = 1 - (elapsed / duration);
                 requestAnimationFrame(update);
             } else {
                 this.scene.remove(points);
                 geometry.dispose();
                 material.dispose();
             }
        };
        update();
    }

    updateHUD() {
        this.game.players.forEach((p, i) => {
            // Sync with 3D Spatial label
            const labelText = `${p.name} (${p.hand.length})`;
            this.updatePlayerLabel(i, labelText);
            
            // Sync with 3D HP Indicators
            this.updateHPIndicators(i, p.hp);
        });
    }

    log(msg, type = '') {
        const div = document.createElement('div');
        div.textContent = msg;
        if (type) div.style.color = `var(--${type}-color)`;
        this.logContent.prepend(div);
    }

    getIngredientColor(ing) {
        if (ing === Ingredient.FIRE) return '#cc0000';
        if (ing === Ingredient.POISON) return '#44cc44';
        if (ing === Ingredient.HEAL) return '#33cccc';
        if (ing === Ingredient.CHAOS) return '#9933cc';
        return 'white';
    }

    flashScreen(color, target = null) {
        const flash = document.getElementById('screen-flash');
        flash.style.backgroundColor = color === 'red' ? 'rgba(204, 0, 0, 0.4)' : 
                                     color === 'cyan' ? 'rgba(51, 204, 204, 0.4)' : 
                                     color === 'gold' ? 'rgba(204, 170, 51, 0.4)' : 'rgba(153, 51, 204, 0.4)';
        flash.style.opacity = 1;
        setTimeout(() => flash.style.opacity = 0, 300);
        
        // If opponent took damage, flash their 3D entity
        if (target === 1 && this.opponentMask) {
            const originalColor = this.opponentMask.material.color.getHex();
            this.opponentMask.material.color.setHex(color === 'red' ? 0xcc0000 : color === 'cyan' ? 0x33cccc : 0xcc0000);
            setTimeout(() => {
                if(this.opponentMask) this.opponentMask.material.color.setHex(originalColor);
            }, 300);
        }
    }

    shakeCamera() {
        const startPos = this.camera.position.clone();
        const duration = 500;
        const start = Date.now();
        
        const shake = () => {
            const elapsed = Date.now() - start;
            if (elapsed < duration) {
                this.camera.position.x = startPos.x + (Math.random() - 0.5) * 0.2;
                this.camera.position.y = startPos.y + (Math.random() - 0.5) * 0.2;
                requestAnimationFrame(shake);
            } else {
                this.camera.position.copy(startPos);
            }
        };
        shake();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.particles.rotation.y += 0.001;
        
        // Hover opponent
        if (this.opponentGroup) {
            this.oppHoverTime += 0.02;
            this.opponentGroup.position.y = 1.5 + Math.sin(this.oppHoverTime) * 0.1;
            this.opponentMask.rotation.y = Math.sin(this.oppHoverTime * 0.5) * 0.2;
            this.opponentMask.rotation.z = Math.cos(this.oppHoverTime * 0.3) * 0.05;
            
            // Independent hand bobbing
            if (this.leftHand && this.rightHand) {
                this.leftHand.position.y = -0.5 + Math.sin(this.oppHoverTime * 1.2) * 0.15;
                this.leftHand.rotation.x = Math.PI / 6 + Math.cos(this.oppHoverTime * 0.8) * 0.1;
                
                this.rightHand.position.y = -0.5 + Math.cos(this.oppHoverTime * 1.1) * 0.15;
                this.rightHand.rotation.x = Math.PI / 6 + Math.sin(this.oppHoverTime * 0.9) * 0.1;
            }
        }

        // Candle Flickering
        this.candles.forEach(c => {
            const time = Date.now() * 0.005 + c.offset;
            const flicker = Math.sin(time * 10) * 0.2 + Math.sin(time * 7) * 0.1;
            c.light.intensity = 1.0 + flicker;
            c.flame.scale.setScalar(1.0 + flicker * 0.5);
        });

        // HP Indicator Flickering (Critical HP)
        this.hpIndicators.forEach(playerInds => {
            playerInds.forEach(ind => {
                if (ind.isCritical && ind.cap.material.opacity > 0.1) {
                    ind.cap.material.opacity = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
                }
            });
        });
        
        this.composer.render();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }
}

new GameUI();
