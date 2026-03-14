export const Ingredient = {
    FIRE: 0,
    POISON: 1,
    HEAL: 2,
    CHAOS: 3
};

export const Phase = {
    PASS_TO_ACTIVE: 0,
    CRAFT: 1,
    PASS_TO_CHOOSER: 2,
    CHOOSE: 3,
    GAME_OVER: 4
};

export const ChaosOutcome = {
    HP_SWAP: 0,
    FRIENDLY_FIRE: 1,
    TOXIC_CLOUD: 2,
    ALCHEMISTS_GIFT: 3,
    STEAL_CARD: 4,
    MIRACLE_HEAL: 5
};

export class GameState {
    constructor() {
        this.MAX_HP = 10;
        this.INGREDIENTS_PER_TURN = 4;
        this.TURNS_FOR_ABILITY = 3;
        this.resetMatch();
    }

    resetMatch() {
        this.players = [
            { name: "Player 1", hp: 10, pendingPoison: 0, hasShield: false, isAi: false, abilities: [] },
            { name: "Player 2", hp: 10, pendingPoison: 0, hasShield: false, isAi: true, abilities: [] }
        ];
        this.activePlayerIndex = 0;
        this.turnNumber = 0;
        this.phase = Phase.PASS_TO_ACTIVE;
        this.currentIngredients = [];
        this.selectedIndexes = [];
        this.brewedPotions = [];
        this.winner = null;
        this.peekedIndex = -1; // Index of the potion peeked this turn
    }

    rollIngredients() {
        this.currentIngredients = Array.from({ length: this.INGREDIENTS_PER_TURN }, () => 
            Math.floor(Math.random() * 4)
        );
        this.selectedIndexes = [];
        this.peekedIndex = -1;
    }

    aiCraft() {
        // AI selects all current ingredients in a semi-random order
        const indexes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        this.selectedIndexes = indexes;
        this.lockPotions();
    }

    aiChoose() {
        // AI simply picks one of the two potions
        // Future: Add strategy based on known cards if ability used
        return Math.floor(Math.random() * 2);
    }

    rollAbility() {
        const abilities = ["PEEK", "DOUBLE_DRAW", "SHIELD_BOOST"];
        const roll = abilities[Math.floor(Math.random() * abilities.length)];
        this.players[this.activePlayerIndex].abilities.push(roll);
        return roll;
    }

    useAbility(ability) {
        const player = this.players[this.activePlayerIndex];
        const idx = player.abilities.indexOf(ability);
        if (idx > -1) {
            player.abilities.splice(idx, 1);
            if (ability === "PEEK" && this.phase === Phase.CHOOSE) {
                this.peekedIndex = Math.floor(Math.random() * 2);
                return { success: true, peekedIndex: this.peekedIndex, content: this.brewedPotions[this.peekedIndex] };
            }
        }
        return { success: false };
    }

    selectIngredient(index) {
        if (this.phase !== Phase.CRAFT) return false;
        if (this.selectedIndexes.includes(index)) return false;
        if (this.selectedIndexes.length >= this.INGREDIENTS_PER_TURN) return false;
        
        this.selectedIndexes.push(index);
        return true;
    }

    lockPotions() {
        if (this.selectedIndexes.length !== this.INGREDIENTS_PER_TURN) return false;
        
        const first = [
            this.currentIngredients[this.selectedIndexes[0]],
            this.currentIngredients[this.selectedIndexes[1]]
        ];
        const second = [
            this.currentIngredients[this.selectedIndexes[2]],
            this.currentIngredients[this.selectedIndexes[3]]
        ];
        
        this.brewedPotions = [first, second];
        this.phase = Phase.PASS_TO_CHOOSER;
        return true;
    }

    resolvePotion(index) {
        const drinkerIndex = 1 - this.activePlayerIndex;
        const potion = this.brewedPotions[index];
        const sorted = [...potion].sort((a, b) => a - b);
        
        let result = {
            type: 'fizzle',
            value: 0,
            target: drinkerIndex,
            message: "The mixture fizzles into grey sludge."
        };

        // Simplified logic matching GDScript
        if (JSON.stringify(sorted) === JSON.stringify([Ingredient.FIRE, Ingredient.FIRE])) {
            result = { type: 'damage', value: 2, target: drinkerIndex, source: "Inferno" };
        } else if (JSON.stringify(sorted) === JSON.stringify([Ingredient.POISON, Ingredient.POISON])) {
            result = { type: 'damage', value: 2, target: drinkerIndex, source: "Lethal Toxin" };
        } else if (JSON.stringify(sorted) === JSON.stringify([Ingredient.FIRE, Ingredient.POISON])) {
            result = { type: 'damage', value: 3, target: drinkerIndex, source: "Explosive Blight" };
        } else if (JSON.stringify(sorted) === JSON.stringify([Ingredient.HEAL, Ingredient.HEAL])) {
            result = { type: 'heal', value: 2, target: drinkerIndex, source: "Pure Essence" };
        } else if (JSON.stringify(sorted) === JSON.stringify([Ingredient.CHAOS, Ingredient.HEAL])) {
            const target = Math.random() > 0.5 ? 0 : 1;
            result = { type: 'heal', value: 1, target: target, source: "Chaotic Relief" };
        } else if (JSON.stringify(sorted) === JSON.stringify([Ingredient.CHAOS, Ingredient.FIRE])) {
            const target = Math.random() > 0.5 ? 0 : 1;
            result = { type: 'damage', value: 1, target: target, source: "Wildfire" };
        } else if (JSON.stringify(sorted) === JSON.stringify([Ingredient.CHAOS, Ingredient.POISON])) {
            result = { type: 'poison', value: 1, target: drinkerIndex, source: "Venomous Dread" };
        } else if (JSON.stringify(sorted) === JSON.stringify([Ingredient.CHAOS, Ingredient.CHAOS])) {
            result = { type: 'chaos' };
        }

        return result;
    }

    applyDamage(playerIndex, amount) {
        const player = this.players[playerIndex];
        if (player.hasShield) {
            player.hasShield = false;
            return { blocked: true };
        }
        player.hp = Math.max(0, player.hp - amount);
        return { blocked: false, newHp: player.hp };
    }

    applyHeal(playerIndex, amount) {
        const player = this.players[playerIndex];
        const oldHp = player.hp;
        player.hp = Math.min(this.MAX_HP, player.hp + amount);
        const recovered = player.hp - oldHp;
        const overflow = amount - recovered;
        
        if (overflow > 0 && !player.hasShield) {
            player.hasShield = true;
        }
        return { recovered, hasShield: player.hasShield };
    }

    checkGameOver() {
        const p1 = this.players[0].hp;
        const p2 = this.players[1].hp;
        
        if (p1 <= 0 && p2 <= 0) this.winner = "MUTUAL DESTRUCTION";
        else if (p1 <= 0) this.winner = "PLAYER 2 SURVIVES";
        else if (p2 <= 0) this.winner = "PLAYER 1 SURVIVES";
        
        if (this.winner) this.phase = Phase.GAME_OVER;
        return this.winner !== null;
    }
}
