import * as THREE from 'three';
import { GameState, Phase, Ingredient } from './gameLogic.js';

class GameUI {
    constructor() {
        this.game = new GameState();
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

        // Moody Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x9933cc, 2, 10);
        pointLight.position.set(0, 2, 2);
        this.scene.add(pointLight);

        // Alchemy Table
        const tableGeometry = new THREE.BoxGeometry(4, 0.2, 3);
        const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
        this.table = new THREE.Mesh(tableGeometry, tableMaterial);
        this.table.position.y = -1;
        this.scene.add(this.table);

        // Floating particles
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
        this.secondaryBtn = document.getElementById('secondary-btn');
        this.instructions = document.getElementById('instructions');
        this.logContent = document.getElementById('log-content');
        
        this.primaryBtn.addEventListener('click', () => this.handlePrimaryAction());
        this.secondaryBtn.addEventListener('click', () => {
             this.game.selectedCards = [];
             this.updateUI();
        });
        
        this.updateHUD();
    }

    handlePrimaryAction() {
        if (this.game.players[this.game.activePlayerIndex].isAi && this.game.phase !== Phase.CHOOSE) return;
        
        switch(this.game.phase) {
            case Phase.PASS_TO_ACTIVE:
                this.startTurn();
                break;
            case Phase.CRAFT:
                if (this.game.lockPotions()) {
                    this.log(`${this.game.players[this.game.activePlayerIndex].name} brewed two concoctions.`);
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
                break;
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
                        if (this.game.selectIngredient(type)) this.updateUI();
                    };
                }
                shelf.appendChild(btn);
            }
        });
        
        // Render selected cards below
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
                btn.onclick = () => this.choosePotion(idx);
            }
            choices.appendChild(btn);
        });
    }

    choosePotion(index) {
        const results = this.game.resolvePotion(index);
        
        // Results is array: [0] = chooser's effect, [1] = brewer's effect
        const chooserResult = results[0];
        const brewerResult = results[1];
        
        const chooserName = this.game.players[chooserResult.target].name;
        const brewerName = this.game.players[brewerResult.target].name;
        
        this.log(`${chooserName} drinks Potion ${index === 0 ? 'A' : 'B'}.`);
        this.log(`Revealed: Potion A (${this.game.brewedPotions[0].join('+')}), Potion B (${this.game.brewedPotions[1].join('+')})`);
        
        // Helper to process effect
        const applyEffectVisuals = (effect, target) => {
            if (effect.kind === 'damage') {
                this.log(`${this.game.players[target].name} suffers ${effect.amount} damage from ${effect.label}!`, 'fire');
                this.flashScreen('red');
                this.shakeCamera();
                this.spawnParticles('fire', target);
            } else if (effect.kind === 'heal') {
                this.log(`${this.game.players[target].name} heals ${effect.amount} from ${effect.label}.`, 'heal');
                this.flashScreen('cyan');
                this.spawnParticles('heal', target);
            } else if (effect.kind === 'random_heal') {
                this.log(`Random heal from ${effect.label} triggers!`, 'chaos');
            } else if (effect.kind === 'random_damage') {
                this.log(`Random damage from ${effect.label} triggers!`, 'chaos');
                this.shakeCamera();
            } else if (effect.kind === 'chaos_chaos') {
                this.triggerChaos();
            } else {
                this.log(`${effect.label} fizzles out.`);
            }
        };

        applyEffectVisuals(chooserResult.effect, chooserResult.target);
        applyEffectVisuals(brewerResult.effect, brewerResult.target);

        setTimeout(() => {
             const simultaneousDeath = this.game.applyResolution(results);
             if (simultaneousDeath) {
                 this.log("MUTUAL DESTRUCTION PREVENTED! Both players collapsed, but recover their lost life.", 'shield');
                 this.flashScreen('gold');
             } else {
                 this.log(`Round ended. ${brewerName} refilled 2 random cards.`);
             }
             this.updateUI();
        }, 1500);
    }

    triggerChaos() {
        const overlay = document.getElementById('chaos-wheel-overlay');
        overlay.classList.remove('hidden');
        
        const canvas = document.getElementById('wheel-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 500;
        canvas.height = 500;
        
        const outcomes = ["HP SWAP", "TEAM DMG 2", "TEAM TOXIC 1", "ALCHEMIST GIFT", "STEAL CARD", "MIRACLE 3"];
        const colors = ["#9933cc", "#cc0000", "#44cc44", "#d4d4d4", "#666666", "#33cccc"];
        
        const finalOutcome = Math.floor(Math.random() * 6);
        let rotation = 0;
        const totalSpins = 5 + Math.random() * 5;
        const targetRotation = totalSpins * Math.PI * 2 + (finalOutcome * (Math.PI * 2 / 6));
        
        const drawWheel = (angle) => {
            ctx.clearRect(0, 0, 500, 500);
            const sliceAngle = (Math.PI * 2) / 6;
            
            ctx.save();
            ctx.translate(250, 250);
            ctx.rotate(angle);
            
            for (let i = 0; i < 6; i++) {
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
                ctx.fillText(outcomes[i], 100, 5);
                ctx.rotate(-(i * sliceAngle + sliceAngle/2));
            }
            ctx.restore();
        };

        const animate = () => {
            if (rotation < targetRotation) {
                const diff = targetRotation - rotation;
                rotation += Math.max(0.01, diff * 0.05);
                drawWheel(-rotation - Math.PI/2);
                requestAnimationFrame(animate);
            } else {
                this.flashScreen(colors[finalOutcome]);
                document.getElementById('chaos-status').textContent = outcomes[finalOutcome];
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    this.log(`Chaos Wheel triggered: ${outcomes[finalOutcome]}`, 'chaos');
                    // Generic chaos applies 1 dmg locally just to show effect
                    this.game.dealDamage(0, 1);
                    this.game.dealDamage(1, 1);
                    this.shakeCamera();
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
