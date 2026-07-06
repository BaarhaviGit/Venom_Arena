const GRID_SIZE = 20;

function createGameState() {
  return {
    players: {},
    food: randomFoodPosition([]),
    gridSize: GRID_SIZE,
    status: 'waiting', // waiting, playing, gameover
    mode: 'multi' // default mode
  };
}

function randomFoodPosition(playersArray) {
  let position;
  while (true) {
    position = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
    
    // Check if food spawns on a player
    let onPlayer = false;
    for (const player of playersArray) {
      for (const segment of player.body) {
        if (segment.x === position.x && segment.y === position.y) {
          onPlayer = true;
          break;
        }
      }
      if (onPlayer) break;
    }
    
    if (!onPlayer) {
      return position;
    }
  }
}

function createPlayer(id, name, color) {
  return {
    id,
    name: name || 'Anonymous',
    body: [
      { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) }
    ],
    direction: { x: 0, y: 0 },
    nextDirection: { x: 0, y: 0 },
    color: color || '#000000',
    alive: true,
    score: 0
  };
}

function gameLoop(state) {
  const events = [];
  if (state.status !== 'playing') return events;

  const players = Object.values(state.players);
  let activePlayers = 0;

  for (const player of players) {
    if (!player.alive) continue;
    activePlayers++;

    // Apply next direction
    player.direction = { ...player.nextDirection };

    if (player.direction.x === 0 && player.direction.y === 0) continue;

    const head = { ...player.body[0] };
    head.x += player.direction.x;
    head.y += player.direction.y;

    // 1. Screen wrapping (classic snake style)
    if (head.x < 0) head.x = GRID_SIZE - 1;
    else if (head.x >= GRID_SIZE) head.x = 0;

    if (head.y < 0) head.y = GRID_SIZE - 1;
    else if (head.y >= GRID_SIZE) head.y = 0;

    // 2. Check self & other player collision
    let collided = false;
    for (const other of players) {
      if (!other.alive) continue;
      for (const segment of other.body) {
        if (segment.x === head.x && segment.y === head.y) {
          collided = true;
          break;
        }
      }
      if (collided) break;
    }
    
    if (collided) {
      player.alive = false;
      events.push({ type: 'playerDied', id: player.id, name: player.name });
      continue;
    }

    // 3. Move head
    player.body.unshift(head);

    // 4. Check food
    if (head.x === state.food.x && head.y === state.food.y) {
      player.score += 10;
      state.food = randomFoodPosition(players);
    } else {
      player.body.pop(); // Remove tail if no food eaten
    }
  }

  // End game conditions
  const playersArr = Object.values(state.players);
  const activePlayersCount = playersArr.filter(p => p.alive).length;

  if (state.mode === 'solo') {
    if (activePlayersCount === 0) {
      state.status = 'gameover';
    }
  } else {
    // If multiplayer, game over when 1 or fewer players are alive (and we actually had players)
    if (playersArr.length > 1 && activePlayersCount <= 1) {
      state.status = 'gameover';
      const winner = playersArr.find(p => p.alive);
      if (winner) {
        events.push({ type: 'playerWon', id: winner.id, name: winner.name });
      }
    } else if (playersArr.length === 1 && activePlayersCount === 0) {
      state.status = 'gameover';
    }
  }

  return events;
}

function handleInput(state, id, keyCode) {
  const player = state.players[id];
  if (!player || !player.alive) return;

  // Arrow keys & WASD
  switch (keyCode) {
    case 'ArrowLeft':
    case 'KeyA':
      if (player.direction.x !== 1) player.nextDirection = { x: -1, y: 0 };
      break;
    case 'ArrowUp':
    case 'KeyW':
      if (player.direction.y !== 1) player.nextDirection = { x: 0, y: -1 };
      break;
    case 'ArrowRight':
    case 'KeyD':
      if (player.direction.x !== -1) player.nextDirection = { x: 1, y: 0 };
      break;
    case 'ArrowDown':
    case 'KeyS':
      if (player.direction.y !== -1) player.nextDirection = { x: 0, y: 1 };
      break;
  }
}

module.exports = {
  createGameState,
  createPlayer,
  gameLoop,
  handleInput,
  GRID_SIZE
};
