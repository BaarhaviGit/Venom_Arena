const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const { createGameState, createPlayer, gameLoop, handleInput } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Use Redis Adapter if REDIS_URL is provided (e.g. from docker-compose or K8s)
const REDIS_URL = process.env.REDIS_URL || null;

async function setupRedis() {
  if (REDIS_URL) {
    try {
      const pubClient = createClient({ url: REDIS_URL });
      const subClient = pubClient.duplicate();
      
      await pubClient.connect();
      await subClient.connect();
      
      io.adapter(createAdapter(pubClient, subClient));
      console.log(`Socket.io Redis adapter connected to ${REDIS_URL}`);
    } catch (err) {
      console.error("Redis connection error:", err);
    }
  } else {
    console.log("No REDIS_URL provided, using in-memory adapter (single-node mode)");
  }
}

setupRedis();

// In-memory state for rooms on THIS pod (as per README caveat)
const rooms = {};

const PLAYER_COLORS = ['#ff1a1a', '#cc0000', '#ff4d4d', '#990000']; // Whitish Red theme snake colors

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinGame', (playerData) => {
    let roomName = null;
    const mode = playerData.mode || 'multi';

    if (mode === 'multi') {
      // Find a room with < 4 players that is waiting
      for (const r in rooms) {
        if (rooms[r].mode !== 'solo' && rooms[r].status === 'waiting' && Object.keys(rooms[r].players).length < 4) {
          roomName = r;
          break;
        }
      }
    }

    // Create new room if none found or if solo mode
    if (!roomName) {
      roomName = 'room_' + Math.random().toString(36).substring(2, 9);
      rooms[roomName] = createGameState();
      rooms[roomName].mode = mode;
    }

    socket.join(roomName);
    socket.roomName = roomName;

    const gameState = rooms[roomName];
    
    // Auto-assign a unique color from the PLAYER_COLORS list
    const usedColors = Object.values(gameState.players).map(p => p.color);
    const availableColors = PLAYER_COLORS.filter(c => !usedColors.includes(c));
    const chosenColor = availableColors.length > 0 ? availableColors[0] : '#ffffff';
    
    const newPlayer = createPlayer(socket.id, playerData.name, chosenColor);
    
    gameState.players[socket.id] = newPlayer;

    io.to(roomName).emit('gameState', gameState);
    io.to(roomName).emit('playerJoined', newPlayer.name);

    if (gameState.mode === 'solo' && gameState.status === 'waiting') {
      // Start immediately for solo
      gameState.status = 'playing';
      io.to(roomName).emit('gameStart');
      startGameLoop(roomName);
    } else if (gameState.mode !== 'solo' && Object.keys(gameState.players).length >= 2 && gameState.status === 'waiting') {
      // If 2 or more players in multi, start the game
      gameState.status = 'playing';
      io.to(roomName).emit('gameStart');
      startGameLoop(roomName);
    }
  });

  socket.on('keydown', (keyCode) => {
    const roomName = socket.roomName;
    if (!roomName || !rooms[roomName]) return;
    handleInput(rooms[roomName], socket.id, keyCode);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const roomName = socket.roomName;
    if (roomName && rooms[roomName]) {
      const pName = rooms[roomName].players[socket.id]?.name;
      delete rooms[roomName].players[socket.id];
      if (pName) {
        io.to(roomName).emit('playerLeft', pName);
      }
      if (Object.keys(rooms[roomName].players).length === 0) {
        delete rooms[roomName]; // Clean up empty room
      } else {
        io.to(roomName).emit('gameState', rooms[roomName]);
      }
    }
  });
});

function startGameLoop(roomName) {
  let timerId = null;

  function tick() {
    const state = rooms[roomName];
    if (!state) return;

    const events = gameLoop(state);
    
    for (const event of events) {
      if (event.type === 'playerDied') {
        io.to(roomName).emit('playerDied', { id: event.id, name: event.name });
      }
      if (event.type === 'playerWon') {
        io.to(roomName).emit('playerWon', { id: event.id, name: event.name });
      }
    }

    io.to(roomName).emit('gameState', state);

    if (state.status === 'gameover') {
      // Optional: reset after some time
      setTimeout(() => {
        if (rooms[roomName]) {
          delete rooms[roomName];
        }
      }, 5000);
      return; // Stop the loop
    }

    // Calculate dynamic speed based on max score
    const playersArr = Object.values(state.players);
    const maxScore = playersArr.length > 0 ? Math.max(...playersArr.map(p => p.score)) : 0;
    
    // Base speed: 200ms (Very slow start). Decrease by 1ms per point (1 apple = 10 points = 10ms faster). Minimum delay: 50ms.
    const currentDelay = Math.max(50, 200 - maxScore);

    timerId = setTimeout(tick, currentDelay);
  }

  tick();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
