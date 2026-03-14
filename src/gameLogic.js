export const Ingredient = {
    FIRE: 'fire',
    POISON: 'poison',
    HEAL: 'heal',
    CHAOS: 'chaos'
};

export const Phase = {
    PASS_TO_ACTIVE: 0,
    CRAFT: 1,
    PASS_TO_CHOOSER: 2,
    CHOOSE: 3,
    GAME_OVER: 4
};

const STARTING_DECK = [
    ...Array(4).fill(Ingredient.FIRE),
    ...Array(4).fill(Ingredient.POISON),
    ...Array(6).fill(Ingredient.HEAL),
    ...Array(10).fill(Ingredient.CHAOS)
];

const DEFAULT_POTION = [Ingredient.CHAOS, Ingredient.CHAOS];

export class GameState {
    constructor() {
        this.MAX_HP = 10;
        this.resetMatch();
    }

    resetMatch() {
        this.players = [
            { name: "Player 1", hp: this.MAX_HP, isAi: false, hand: [...STARTING_DECK] },
            { name: "Player 2", hp: this.MAX_HP, isAi: true, hand: [...STARTING_DECK] }
        ];
        this.activePlayerIndex = 0;
        this.turnNumber = 1;
        this.phase = Phase.PASS_TO_ACTIVE;
        
        this.selectedCards = []; // Up to 4 ingredients selected from hand
        this.brewedPotions = []; 
        this.winner = null;
        
        // Match Python's round tracking
        this.roundLifeLost = [0, 0];
    }

    getAvailableHand() {
        const hand = [...this.players[this.activePlayerIndex].hand];
        // Remove currently selected cards so they aren't double-counted
        this.selectedCards.forEach(card => {
            const idx = hand.indexOf(card);
            if (idx > -1) hand.splice(idx, 1);
        });
        return hand;
    }

    selectIngredient(type) {
        if (this.phase !== Phase.CRAFT) return false;
        if (this.selectedCards.length >= 4) return false;
        
        const available = this.getAvailableHand();
        if (available.includes(type)) {
            this.selectedCards.push(type);
            return true;
        }
        return false;
    }

    deselectIngredient(index) {
        if (this.phase !== Phase.CRAFT) return false;
        this.selectedCards.splice(index, 1);
        return true;
    }

    lockPotions() {
        if (this.selectedCards.length !== 4) return false;
        
        // Remove cards from actual hand
        const player = this.players[this.activePlayerIndex];
        this.selectedCards.forEach(card => {
            const idx = player.hand.indexOf(card);
            if (idx > -1) player.hand.splice(idx, 1);
        });

        this.brewedPotions = [
            [this.selectedCards[0], this.selectedCards[1]],
            [this.selectedCards[2], this.selectedCards[3]]
        ];
        
        this.phase = Phase.PASS_TO_CHOOSER;
        return true;
    }

    resolvePotion(chosenIndex) {
        this.roundLifeLost = [0, 0]; // Reset round tracking

        const brewerIndex = this.activePlayerIndex;
        const drinkerIndex = 1 - this.activePlayerIndex;
        
        const chosenPotion = this.brewedPotions[chosenIndex];
        const otherPotion = this.brewedPotions[1 - chosenIndex];
        
        let effect1 = this.evaluatePotion(chosenPotion);
        let effect2 = this.evaluatePotion(otherPotion);

        const synergy = this.checkSynergy(effect1, effect2);
        if (synergy) {
            effect1 = synergy.drinkerEffect;
            effect2 = synergy.brewerEffect;
        }

        const results = [
            { target: drinkerIndex, potion: chosenPotion, effect: effect1 },
            { target: brewerIndex, potion: otherPotion, effect: effect2 }
        ];

        return results; // main.js processes UI and then calls applyResolution
    }

    checkSynergy(effectA, effectB) {
        const typeA = effectA.kind;
        const typeB = effectB.kind;
        
        // Toxic Blast: Both are raw damage. Combines and hits both players.
        if (typeA === 'damage' && typeB === 'damage') {
             const totalDamage = effectA.amount + effectB.amount;
             const synergyEffect = { kind: 'damage', amount: totalDamage, label: "Toxic Blast Synergy!" };
             return { drinkerEffect: synergyEffect, brewerEffect: synergyEffect };
        }
        
        // Pure Miracle: Both are raw heals. Amplifies the heal for both.
        if (typeA === 'heal' && typeB === 'heal') {
             const totalHeal = effectA.amount + effectB.amount + 2;
             const synergyEffect = { kind: 'heal', amount: totalHeal, label: "Pure Miracle Synergy!" };
             return { drinkerEffect: synergyEffect, brewerEffect: synergyEffect };
        }
        
        // Alchemical Equilibrium: Damage meets Heal. Neutralizes into a small heal for both.
        if ((typeA === 'damage' && typeB === 'heal') || (typeA === 'heal' && typeB === 'damage')) {
             const synergyEffect = { kind: 'heal', amount: 1, label: "Alchemical Equilibrium" };
             return { drinkerEffect: synergyEffect, brewerEffect: synergyEffect };
        }
        
        return null;
    }

    applyResolution(results) {
        results.forEach(res => {
            this.applyResult(res.effect, res.target);
        });
        
        this.players[0].hp = Math.max(0, Math.min(this.MAX_HP, this.players[0].hp));
        this.players[1].hp = Math.max(0, Math.min(this.MAX_HP, this.players[1].hp));

        let simultaneousDeath = false;
        if (this.players[0].hp <= 0 && this.players[1].hp <= 0) {
            simultaneousDeath = true;
            this.players[0].hp = Math.min(this.MAX_HP, this.players[0].hp + this.roundLifeLost[0]);
            this.players[1].hp = Math.min(this.MAX_HP, this.players[1].hp + this.roundLifeLost[1]);
            this.grantRandomCards(this.activePlayerIndex, 2);
        } else {
            this.grantRandomCards(this.activePlayerIndex, 2);
        }

        if (!simultaneousDeath) {
            this.checkGameOver();
        }

        if (!this.winner) {
            this.activePlayerIndex = 1 - this.activePlayerIndex;
            this.turnNumber++;
            this.phase = Phase.PASS_TO_ACTIVE;
            this.selectedCards = [];
        }
        
        return simultaneousDeath;
    }

    evaluatePotion(potion) {
        const sorted = [...potion].sort((a,b) => a.localeCompare(b));
        const str = JSON.stringify(sorted);
        
        if (str === JSON.stringify(['fire', 'fire'])) return { kind: 'damage', amount: 2, label: "Fire + Fire" };
        if (str === JSON.stringify(['poison', 'poison'])) return { kind: 'damage', amount: 2, label: "Poison + Poison" };
        if (str === JSON.stringify(['fire', 'poison'])) return { kind: 'damage', amount: 3, label: "Explosive Blight" };
        if (str === JSON.stringify(['heal', 'heal'])) return { kind: 'heal', amount: 2, label: "Pure Essence" };
        if (str === JSON.stringify(['chaos', 'heal'])) return { kind: 'random_heal', amount: 1, label: "Chaotic Relief" };
        if (str === JSON.stringify(['chaos', 'fire'])) return { kind: 'random_damage', amount: 1, label: "Wildfire" };
        if (str === JSON.stringify(['chaos', 'chaos'])) return { kind: 'chaos_chaos', label: "Chaos Manifest" };
        
        return { kind: 'nothing', label: "Fizzles" };
    }

    applyResult(effect, target) {
        if (effect.kind === 'damage') {
            this.dealDamage(target, effect.amount);
        } else if (effect.kind === 'heal') {
            this.healPlayer(target, effect.amount);
        } else if (effect.kind === 'random_heal') {
            const rngTarget = Math.random() > 0.5 ? 0 : 1;
            this.healPlayer(rngTarget, effect.amount);
        } else if (effect.kind === 'random_damage') {
            const rngTarget = Math.random() > 0.5 ? 0 : 1;
            this.dealDamage(rngTarget, effect.amount);
        }
        // chaos_chaos is handled in main.js
    }

    dealDamage(target, amount) {
        const p = this.players[target];
        const lost = Math.min(amount, p.hp);
        p.hp -= lost;
        this.roundLifeLost[target] += lost;
        return lost;
    }

    healPlayer(target, amount) {
        const p = this.players[target];
        const gained = Math.min(amount, this.MAX_HP - p.hp);
        p.hp += gained;
        return gained;
    }

    grantRandomCards(target, amount) {
        const available = Object.values(Ingredient);
        for(let i=0; i<amount; i++) {
            this.players[target].hand.push(available[Math.floor(Math.random() * available.length)]);
        }
    }

    checkGameOver() {
        const p1 = this.players[0].hp;
        const p2 = this.players[1].hp;
        const h1 = this.players[0].hand.length;
        const h2 = this.players[1].hand.length;
        
        if (p1 <= 0 && p2 <= 0) this.winner = "DRAW: MUTUAL DESTRUCTION";
        else if (p1 <= 0) this.winner = "PLAYER 2 SURVIVES";
        else if (p2 <= 0) this.winner = "PLAYER 1 SURVIVES";
        else if (h1 === 0 && h2 === 0) this.winner = "DRAW: NO INGREDIENTS LEFT";
        else if (h1 === 0) this.winner = "PLAYER 2 WINS: P1 DEPLETED";
        else if (h2 === 0) this.winner = "PLAYER 1 WINS: P2 DEPLETED";
        
        if (this.winner) this.phase = Phase.GAME_OVER;
        return this.winner !== null;
    }

    // --- AI LOGIC (PORTED DIRECTLY FROM PYTHON) ---

    aiCraft() {
        const hand = this.players[this.activePlayerIndex].hand;
        if (hand.length < 2) {
            this.selectedCards = [];
            this.brewedPotions = [DEFAULT_POTION, DEFAULT_POTION];
            this.phase = Phase.PASS_TO_CHOOSER;
            return;
        }
        if (hand.length < 4) {
            // Pick real potion + default
            const indices = this.getCombinations(Array.from(hand.keys()), 2);
            let bestScore = -Infinity;
            let bestPair = indices[0];
            
            indices.forEach(pair => {
                const potion = [hand[pair[0]], hand[pair[1]]];
                const score = this.scoreAiPair(potion, DEFAULT_POTION);
                if (score > bestScore) {
                    bestScore = score;
                    bestPair = pair;
                }
            });
            bestPair.sort((a,b)=>b-a).forEach(idx => hand.splice(idx,1));
            const realPotion = [hand[bestPair[0]], hand[bestPair[1]]];
            this.brewedPotions = Math.random() > 0.5 ? [realPotion, DEFAULT_POTION] : [DEFAULT_POTION, realPotion];
            this.phase = Phase.PASS_TO_CHOOSER;
            return;
        }

        // Full hand check
        const indices = Array.from(hand.keys());
        const quadIndices = this.getCombinations(indices, 4);
        
        let bestScore = -Infinity;
        let bestPlan = null;
        
        quadIndices.forEach(quad => {
            const cards = [hand[quad[0]], hand[quad[1]], hand[quad[2]], hand[quad[3]]];
            const pairings = [
                [[cards[0], cards[1]], [cards[2], cards[3]]],
                [[cards[0], cards[2]], [cards[1], cards[3]]],
                [[cards[0], cards[3]], [cards[1], cards[2]]]
            ];
            
            pairings.forEach(pair => {
                const score = this.scoreAiPair(pair[0], pair[1]);
                if (score > bestScore) {
                    bestScore = score;
                    bestPlan = { used: quad, pA: pair[0], pB: pair[1] };
                }
            });
        });

        // Apply plan
        bestPlan.used.sort((a,b)=>b-a).forEach(idx => hand.splice(idx,1));
        this.brewedPotions = Math.random() > 0.5 ? [bestPlan.pA, bestPlan.pB] : [bestPlan.pB, bestPlan.pA];
        this.phase = Phase.PASS_TO_CHOOSER;
    }

    scoreAiPair(potionA, potionB) {
        const evalA = this.evaluatePotion(potionA);
        const evalB = this.evaluatePotion(potionB);
        
        // Scenario A: Chooser picks A
        const a_targetPlayer = this.scoreResult(evalA, true);
        const a_targetAI = this.scoreResult(evalB, false);
        const choiceA = a_targetPlayer + a_targetAI;

        // Scenario B: Chooser picks B
        const b_targetPlayer = this.scoreResult(evalB, true);
        const b_targetAI = this.scoreResult(evalA, false);
        const choiceB = b_targetPlayer + b_targetAI;

        return Math.min(choiceA, choiceB) * 10 + choiceA + choiceB;
    }

    scoreResult(effect, targetIsPlayer) {
        if (effect.kind === "damage") return targetIsPlayer ? effect.amount : -effect.amount;
        if (effect.kind === "heal") return targetIsPlayer ? -effect.amount : effect.amount;
        return 0; // random/chaos handled generically as 0 for predictable AI
    }

    aiChoose() {
        return Math.floor(Math.random() * 2);
    }

    getCombinations(arr, size) {
        const result = [];
        const f = (prefix, arr) => {
            for (let i = 0; i < arr.length; i++) {
                const newPrefix = [...prefix, arr[i]];
                if (newPrefix.length === size) result.push(newPrefix);
                else f(newPrefix, arr.slice(i + 1));
            }
        }
        f([], arr);
        return result;
    }
}
