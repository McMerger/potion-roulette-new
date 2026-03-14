import * as THREE from 'three';
import { GameState, Phase, Ingredient, ChaosOutcome } from './gameLogic.js';

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

        // Alchemy Table (Placeholder)
        const tableGeometry = new THREE.BoxGeometry(4, 0.2, 3);
        const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
        this.table = new THREE.Mesh(tableGeometry, tableMaterial);
        this.table.position.y = -1;
        this.scene.add(this.table);

        // Floating particles for atmosphere
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
        this.secondaryBtn.addEventListener('click', () => this.handleSecondaryAction());
        
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
        this.game.turnNumber++;
        this.game.rollIngredients();
        this.game.phase = Phase.CRAFT;
        this.log(`--- Turn ${this.game.turnNumber} : ${this.game.players[this.game.activePlayerIndex].name} ---`, 'chaos');
        
        // Every 3 turns, roll for an ability
        if (this.game.turnNumber % this.game.TURNS_FOR_ABILITY === 0) {
            const ability = this.game.rollAbility();
            this.log(`${this.game.players[this.game.activePlayerIndex].name} gained ${ability}!`, 'shield');
        }

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
                this.instructions.textContent = `${activePlayer.name.toUpperCase()}: BREW YOUR FATE`;
                this.primaryBtn.textContent = "SEAL POTIONS";
                this.primaryBtn.disabled = this.game.selectedIndexes.length < 4;
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
                this.primaryBtn.textContent = "REAWAKEN";
                break;
        }
        this.updateHUD();
        this.renderAbilities();
    }

    renderAbilities() {
        // Find or create ability container
        let container = document.getElementById('ability-bar');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ability-bar';
            document.getElementById('interaction-area').appendChild(container);
        }
        
        container.innerHTML = '';
        const activePlayer = this.game.players[this.game.activePlayerIndex];
        const opponent = this.game.players[1 - this.game.activePlayerIndex];
        
        // Show abilities for the current CHOOSER if in choose phase, or CRAFTER if in craft phase
        const showingPlayer = (this.game.phase === Phase.CHOOSE) ? opponent : (this.game.phase === Phase.CRAFT ? activePlayer : null);
        
        if (showingPlayer && !showingPlayer.isAi) {
            showingPlayer.abilities.forEach(ability => {
                const btn = document.createElement('button');
                btn.className = 'btn-secondary ability-btn';
                btn.textContent = `USE ${ability}`;
                btn.onclick = () => this.useAbility(ability);
                container.appendChild(btn);
            });
        }
    }

    useAbility(ability) {
        const res = this.game.useAbility(ability);
        if (res.success) {
            this.log(`${this.game.players[this.activePlayerIndex]?.name || 'You'} used ${ability}!`, 'shield');
            if (ability === "PEEK") {
                this.log(`Peek revealed Potion ${res.peekedIndex === 0 ? 'A' : 'B'} contains ${res.content.map(i => this.getIngredientName(i)).join(' + ')}`);
            }
            this.updateUI();
        }
    }

    renderIngredients() {
        const shelf = document.getElementById('ingredient-shelf');
        shelf.classList.remove('hidden');
        shelf.innerHTML = '';
        
        this.game.currentIngredients.forEach((ing, idx) => {
            const btn = document.createElement('button');
            const isSelected = this.game.selectedIndexes.includes(idx);
            btn.className = `ingredient-card ${isSelected ? 'selected' : ''}`;
            btn.textContent = this.getIngredientName(ing);
            btn.style.borderColor = this.getIngredientColor(ing);
            
            if (!isSelected && this.game.phase === Phase.CRAFT && !this.game.players[this.game.activePlayerIndex].isAi) {
                btn.onclick = () => {
                    if (this.game.selectIngredient(idx)) this.updateUI();
                };
            }
            shelf.appendChild(btn);
        });
    }

    renderPotions() {
        const choices = document.getElementById('potion-choices');
        choices.classList.remove('hidden');
        choices.innerHTML = '';
        
        [0, 1].forEach(idx => {
            const btn = document.createElement('button');
            btn.className = 'potion-card';
            
            let display = `POTION ${idx === 0 ? 'A' : 'B'}`;
            if (this.game.peekedIndex === idx) {
                const content = this.game.brewedPotions[idx];
                display += `\n(${this.getIngredientName(content[0])} + ${this.getIngredientName(content[1])})`;
                btn.style.borderColor = 'white';
            } else {
                display += `\n???`;
            }
            
            btn.textContent = display;
            
            const opponent = this.game.players[1 - this.game.activePlayerIndex];
            if (!opponent.isAi) {
                btn.onclick = () => this.choosePotion(idx);
            }
            choices.appendChild(btn);
        });
    }

    choosePotion(index) {
        const drinkerIndex = 1 - this.game.activePlayerIndex;
        const result = this.game.resolvePotion(index);
        this.log(`${this.game.players[drinkerIndex].name} uncorks Potion ${index === 0 ? 'A' : 'B'}...`);
        
        if (result.type === 'chaos') {
            this.triggerChaos();
        } else {
            this.applyResult(result);
            this.finishTurn();
        }
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
        let speed = 20;
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
                
                // Label
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
                drawWheel(-rotation - Math.PI/2); // Offset to match pointer at top
                requestAnimationFrame(animate);
            } else {
                this.flashScreen(colors[finalOutcome]);
                document.getElementById('chaos-status').textContent = outcomes[finalOutcome];
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    this.applyChaosResult(finalOutcome);
                    this.finishTurn();
                }, 2000);
            }
        };
        
        animate();
    }

    applyChaosResult(outcome) {
        const brewer = this.game.activePlayerIndex;
        const drinker = 1 - brewer;

        switch(outcome) {
            case 0: // HP SWAP
                const temp = this.game.players[0].hp;
                this.game.players[0].hp = this.game.players[1].hp;
                this.game.players[1].hp = temp;
                this.log("SOULS SWAPPED! Life totals exchanged!", 'fire');
                break;
            case 1: // TEAM DMG 2
                this.applyResult({ type: 'damage', target: drinker, value: 2, source: 'Chaos' });
                break;
            case 2: // TEAM TOXIC
                this.applyResult({ type: 'damage', target: 0, value: 1, source: 'Toxic Cloud' });
                this.applyResult({ type: 'damage', target: 1, value: 1, source: 'Toxic Cloud' });
                break;
            case 3: // ALCHEMIST GIFT
                this.applyResult({ type: 'heal', target: brewer, value: 1, source: 'Alchemist Boon' });
                break;
            case 4: // STEAL CARD
                this.log("Card stolen from opponent's hand!", 'chaos');
                break;
            case 5: // MIRACLE
                this.applyResult({ type: 'heal', target: drinker, value: 3, source: 'Miraculous Recovery' });
                break;
        }
    }

    applyResult(result) {
        if (result.type === 'damage') {
            const res = this.game.applyDamage(result.target, result.value);
            if (res.blocked) {
                this.log(`${this.game.players[result.target].name}'s Shield absorbed the blow!`, 'shield');
                this.flashScreen('gold');
                this.spawnParticles('shield', result.target);
            } else {
                this.log(`${this.game.players[result.target].name} suffers ${result.value} damage from ${result.source}!`, 'fire');
                this.flashScreen('red');
                this.shakeCamera();
                this.spawnParticles('fire', result.target);
            }
        } else if (result.type === 'heal') {
            const res = this.game.applyHeal(result.target, result.value);
            this.log(`${this.game.players[result.target].name} recovers ${res.recovered} HP.`, 'heal');
            if (res.hasShield) this.log(`${this.game.players[result.target].name} is shielded!`, 'shield');
            this.flashScreen('cyan');
            this.spawnParticles('heal', result.target);
        } else if (result.type === 'poison') {
             this.game.applyDamage(result.target, 1);
             this.game.players[result.target].pendingPoison += 1;
             this.log(`${this.game.players[result.target].name} is afflicted with Venomous Dread!`, 'poison');
             this.flashScreen('green');
             this.spawnParticles('poison', result.target);
        }
    }

    finishTurn() {
        if (this.game.checkGameOver()) {
            this.updateUI();
            return;
        }
        
        // Before passing turn, process lingering poison for the *next* player
        const nextPlayerIndex = 1 - this.game.activePlayerIndex;
        const nextPlayer = this.game.players[nextPlayerIndex];
        if (nextPlayer.pendingPoison > 0) {
            this.log(`Lingering Toxin burns ${nextPlayer.name}...`, 'poison');
            this.game.applyDamage(nextPlayerIndex, nextPlayer.pendingPoison);
            nextPlayer.pendingPoison = 0;
            this.updateHUD();
            this.flashScreen('green');
            this.spawnParticles('poison', nextPlayerIndex);
        }

        this.game.activePlayerIndex = nextPlayerIndex;
        this.game.phase = Phase.PASS_TO_ACTIVE;
        this.updateUI();
    }

    spawnParticles(type, playerIndex) {
        const colors = { fire: 0xff4400, heal: 0x00ffff, poison: 0x44ff44, shield: 0xffaa00 };
        const color = colors[type];
        
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
            const hud = document.getElementById(`player${i+1}-hud`);
            
            fill.style.width = `${(p.hp / 10) * 100}%`;
            text.textContent = `${p.hp} / 10`;
            
            // Color logic
            if (p.hp > 6) fill.style.backgroundColor = 'var(--heal-color)';
            else if (p.hp > 3) fill.style.backgroundColor = '#ccaa33';
            else fill.style.backgroundColor = 'var(--fire-color)';

            // Shield visual
            hud.style.boxShadow = p.hasShield ? '0 0 15px var(--shield-color)' : 'none';
            hud.style.borderColor = p.hasShield ? 'var(--shield-color)' : 'var(--text-muted)';
            
            // Poison visual
            if (p.pendingPoison > 0) {
                text.style.color = 'var(--poison-color)';
                text.classList.add('shake');
                hud.classList.add('pulsing-poison');
            } else {
                text.style.color = 'white';
                text.classList.remove('shake');
                hud.classList.remove('pulsing-poison');
            }
        });

        // Vignette logic for active player
        const activePlayer = this.game.players[this.game.activePlayerIndex];
        const flash = document.getElementById('screen-flash');
        if (activePlayer.pendingPoison > 0) {
            flash.classList.add('pulsing-vignette-poison');
        } else {
            flash.classList.remove('pulsing-vignette-poison');
        }
    }

    log(msg, type = '') {
        const div = document.createElement('div');
        div.textContent = msg;
        if (type) div.style.color = `var(--${type}-color)`;
        this.logContent.prepend(div);
    }

    getIngredientName(ing) {
        return Object.keys(Ingredient).find(key => Ingredient[key] === ing);
    }

    getIngredientColor(ing) {
        const colors = ['#cc0000', '#44cc44', '#33cccc', '#9933cc'];
        return colors[ing];
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
