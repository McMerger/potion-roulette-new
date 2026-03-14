import * as THREE from 'three';
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

        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x9933cc, 2, 10);
        pointLight.position.set(0, 2, 2);
        this.scene.add(pointLight);

        const tableGeometry = new THREE.BoxGeometry(4, 0.2, 3);
        const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
        this.table = new THREE.Mesh(tableGeometry, tableMaterial);
        this.table.position.y = -1;
        this.scene.add(this.table);

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
    }

    initUI() {
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
                    this.flashScreen('red');
                    this.shakeCamera();
                    this.spawnParticles('fire', target);
                } else if (effect.kind === 'heal') {
                    this.audio.playHeal();
                    this.log(`${this.game.players[target].name} heals ${effect.amount} from ${effect.label}.`, 'heal');
                    this.flashScreen('cyan');
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
                this.flashScreen('red');
                this.shakeCamera();
                this.spawnParticles('fire', target);
            } else if (effect.kind === 'heal') {
                this.audio.playHeal();
                this.log(`${this.game.players[target].name} heals ${effect.amount} from ${effect.label}.`, 'heal');
                this.flashScreen('cyan');
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
            const fill = document.getElementById(`p${i+1}-hp-fill`);
            const text = document.getElementById(`p${i+1}-hp-text`);
            const nameEl = document.querySelector(`#player${i+1}-hud .player-name`);
            
            fill.style.width = `${(p.hp / 10) * 100}%`;
            text.textContent = `${p.hp} / 10`;
            
            // Show card count
            nameEl.textContent = `${p.name.toUpperCase()} (CARDS: ${p.hand.length})`;
            
            if (p.hp > 6) fill.style.backgroundColor = 'var(--heal-color)';
            else if (p.hp > 3) fill.style.backgroundColor = '#ccaa33';
            else fill.style.backgroundColor = 'var(--fire-color)';
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

    flashScreen(color) {
        const flash = document.getElementById('screen-flash');
        flash.style.backgroundColor = color === 'red' ? 'rgba(204, 0, 0, 0.4)' : 
                                     color === 'cyan' ? 'rgba(51, 204, 204, 0.4)' : 
                                     color === 'gold' ? 'rgba(204, 170, 51, 0.4)' : 'rgba(153, 51, 204, 0.4)';
        flash.style.opacity = 1;
        setTimeout(() => flash.style.opacity = 0, 300);
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
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

new GameUI();
