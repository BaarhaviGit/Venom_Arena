const socket = io();
const joinSoloBtn = document.getElementById('join-solo-btn');
const joinMultiBtn = document.getElementById('join-multi-btn');
const initialScreen = document.getElementById('initial-screen');
const gameScreen = document.getElementById('game-screen');
const canvas = document.getElementById('game-canvas');
const nameInput = document.getElementById('player-name');
const toastContainer = document.getElementById('toast-container');
const gameOverOverlay = document.getElementById('game-over-overlay');
const gameOverTitle = document.getElementById('game-over-title');
const replayBtn = document.getElementById('replay-btn');
const ctx = canvas.getContext('2d');
const statusMessage = document.getElementById('status-message');
const scoreBoard = document.getElementById('score-board');

let canvasSize = 400; // default, will calculate
let gridSize = 20;
let cellSize = canvasSize / gridSize;

// Set up canvas
canvas.width = canvasSize;
canvas.height = canvasSize;

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  // Remove after animation completes (3s total)
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

joinSoloBtn.addEventListener('click', () => {
  const pName = nameInput.value.trim() || 'Anonymous';
  initialScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  gameOverOverlay.classList.add('hidden');
  socket.emit('joinGame', { name: pName, mode: 'solo' });
  statusMessage.textContent = 'Starting Solo Game...';
});

joinMultiBtn.addEventListener('click', () => {
  const pName = nameInput.value.trim() || 'Anonymous';
  initialScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  gameOverOverlay.classList.add('hidden');
  socket.emit('joinGame', { name: pName, mode: 'multi' });
  statusMessage.textContent = 'Waiting for other players...';
});

replayBtn.addEventListener('click', () => {
  // Simplest way to cleanly replay is to reload to home screen
  location.reload();
});

// Capture keystrokes
document.addEventListener('keydown', (e) => {
  if (document.activeElement === nameInput) return; // Don't block typing in the input!

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    e.preventDefault(); // Prevent scrolling
    socket.emit('keydown', e.code);
  }
});

// Mobile Swipe Controls
let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault(); // Prevent scrolling while playing
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  const touchEndX = e.changedTouches[0].screenX;
  const touchEndY = e.changedTouches[0].screenY;
  
  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;
  
  // Must swipe at least 30px to trigger (prevents accidental taps)
  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dx) > 30) {
      if (dx > 0) socket.emit('keydown', 'ArrowRight');
      else socket.emit('keydown', 'ArrowLeft');
    }
  } else {
    if (Math.abs(dy) > 30) {
      if (dy > 0) socket.emit('keydown', 'ArrowDown');
      else socket.emit('keydown', 'ArrowUp');
    }
  }
});

socket.on('gameState', (state) => {
  if (!state) return;
  
  // Update cell size based on state grid size just in case
  gridSize = state.gridSize;
  cellSize = canvas.width / gridSize;

  draw(state);
  updateScoreBoard(state.players);

  if (state.status === 'gameover') {
    statusMessage.textContent = 'Game Over!';
    statusMessage.style.color = '#8b6b4a';
    gameOverOverlay.classList.remove('hidden');
    
    // Determine title if we won or lost based on active players (or handle via events)
    // The specific win/loss toasts will also trigger
  }
});

socket.on('joinError', (msg) => {
  showToast(`⚠️ ${msg}`);
  gameScreen.classList.add('hidden');
  initialScreen.classList.remove('hidden');
});

socket.on('gameStart', () => {
  statusMessage.textContent = 'Game Started! Survive and eat apples.';
});

socket.on('playerJoined', (name) => {
  showToast(`${name} joined the game`);
});

socket.on('playerDied', (data) => {
  if (data.id === socket.id) {
    showToast(`💀 You were eliminated!`);
  } else {
    showToast(`💀 ${data.name} was eliminated!`);
  }
});

socket.on('playerLeft', (name) => {
  showToast(`👋 ${name} left the game`);
});

socket.on('playerWon', (data) => {
  if (data.id === socket.id) {
    showToast(`🏆 You won the game!`);
  } else {
    showToast(`🏆 ${data.name} won the game!`);
  }
});

function draw(state) {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw grid (optional, for aesthetics)
  ctx.strokeStyle = 'rgba(212, 180, 131, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i < canvas.width; i += cellSize) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
  }

  // Draw Food
  const food = state.food;
  ctx.fillStyle = '#ff0055';
  ctx.shadowColor = '#ff0055';
  ctx.shadowBlur = 5; // Reduced from 15 to 5 for better performance
  ctx.beginPath();
  ctx.arc(food.x * cellSize + cellSize/2, food.y * cellSize + cellSize/2, cellSize/2 - 2, 0, 2 * Math.PI);
  ctx.fill();
  ctx.shadowBlur = 0; // Reset shadow

  // Draw Players
  for (const id in state.players) {
    const player = state.players[id];
    if (!player.alive) continue;

    // Draw snake body as distinct segments
    player.body.forEach((segment, index) => {
      const isHead = index === 0;
      const x = segment.x * cellSize;
      const y = segment.y * cellSize;
      const padding = isHead ? 0 : 2; // Head is slightly larger
      const radius = isHead ? 6 : 4;
      
      ctx.fillStyle = player.color;
      ctx.beginPath();
      // Draw a rounded rectangle for each segment
      ctx.roundRect(x + padding, y + padding, cellSize - padding*2, cellSize - padding*2, radius);
      ctx.fill();
    });

    // Reset shadow for eyes
    ctx.shadowBlur = 0;
    
    // Draw Eyes on Head
    const head = player.body[0];
    const hx = head.x * cellSize + cellSize / 2;
    const hy = head.y * cellSize + cellSize / 2;
    
    ctx.fillStyle = '#ffffff';
    // Offset eyes based on direction
    const eyeOffset = cellSize * 0.2;
    const dir = player.direction;
    
    let ex1, ey1, ex2, ey2;
    if (dir.x !== 0) { // moving left/right
      ex1 = hx + (dir.x * eyeOffset); ey1 = hy - eyeOffset;
      ex2 = hx + (dir.x * eyeOffset); ey2 = hy + eyeOffset;
    } else { // moving up/down (or initial 0,0)
      const dy = dir.y === 0 ? -1 : dir.y; // default face up
      ex1 = hx - eyeOffset; ey1 = hy + (dy * eyeOffset);
      ex2 = hx + eyeOffset; ey2 = hy + (dy * eyeOffset);
    }

    ctx.beginPath();
    ctx.arc(ex1, ey1, 2, 0, Math.PI * 2);
    ctx.arc(ex2, ey2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateScoreBoard(players) {
  scoreBoard.innerHTML = '';
  for (const id in players) {
    const p = players[id];
    const el = document.createElement('div');
    el.className = 'player-score';
    el.style.borderLeft = `4px solid ${p.color}`;
    el.textContent = `${p.name}: ${p.score}`;
    if (!p.alive) {
      el.style.opacity = '0.5';
      el.style.textDecoration = 'line-through';
    }
    scoreBoard.appendChild(el);
  }
}
