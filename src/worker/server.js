// Cloudflare Worker & Durable Object - Potion Roulette Edge Server

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Basic Routing
    if (url.pathname.startsWith('/api/matchmake')) {
      return await handleMatchmaking(request, env);
    }

    if (url.pathname.startsWith('/api/room/')) {
      const roomId = url.pathname.split('/')[3];
      const id = env.GAME_ROOM.idFromName(roomId);
      const roomObject = env.GAME_ROOM.get(id);
      return await roomObject.fetch(request);
    }

    return new Response('Potion Roulette Edge Server', { status: 200 });
  }
};

async function handleMatchmaking(request, env) {
  // Simple matchmaking: Generate a random 4-letter room code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let roomId = '';
  for (let i = 0; i < 4; i++) {
    roomId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return new Response(JSON.stringify({ roomId }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

import { GameState } from '../gameLogic.js';

// Durable Object for Game State & WebSockets
export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
    
    this.game = new GameState();
    this.game.players[1].isAi = false;
    this.lockedPotions = { 0: null, 1: null };
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(webSocket) {
    webSocket.accept();
    this.sessions.push(webSocket);

    if (this.sessions.length > 2) {
      webSocket.send(JSON.stringify({ type: 'error', message: 'Room Full' }));
      webSocket.close();
      return;
    }

    const assignedId = this.sessions.length - 1;
    webSocket.send(JSON.stringify({ type: 'connected', playerId: assignedId }));

    webSocket.addEventListener("message", async msg => {
      try {
        const data = JSON.parse(msg.data);
        
        if (data.type === 'action' && data.action === 'LOCK_POTION') {
            this.lockedPotions[data.playerId] = data.payload;
            this.broadcast({ type: 'action', action: 'LOCK_POTION', playerId: data.playerId });
            
            if (this.lockedPotions[0] && this.lockedPotions[1]) {
                this.game.brewedPotions = [this.lockedPotions[0], this.lockedPotions[1]];
                this.game.activePlayerIndex = 0; 
                
                const results = this.game.resolvePotion(0); 
                const simultaneousDeath = this.game.applyResolution(results);
                
                this.broadcast({
                    type: 'resolution',
                    results: results,
                    brewedPotions: this.game.brewedPotions,
                    simultaneousDeath: simultaneousDeath,
                    newState: {
                        p1_hp: this.game.players[0].hp,
                        p2_hp: this.game.players[1].hp,
                        p1_hand: this.game.players[0].hand,
                        p2_hand: this.game.players[1].hand,
                        winner: this.game.winner
                    }
                });
                
                this.lockedPotions = { 0: null, 1: null };
            }
        } else {
            this.broadcast(data);
        }
      } catch (err) {
        webSocket.send(JSON.stringify({ error: err.message }));
      }
    });

    webSocket.addEventListener("close", () => {
      this.sessions = this.sessions.filter(ws => ws !== webSocket);
      this.broadcast({ type: 'player_disconnected' });
    });
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.sessions.forEach(ws => {
      try { ws.send(data); } catch (e) { /* ignore */ }
    });
  }
}
