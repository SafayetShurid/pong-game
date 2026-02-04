const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game rooms storage
const rooms = new Map();

// Player connections
const players = new Map();

// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 12;
const BALL_RADIUS = 10;
const PADDLE_OFFSET = 20;

class GameRoom {
    constructor(roomCode, hostId) {
        this.roomCode = roomCode;
        this.hostId = hostId;
        this.guestId = null;
        this.players = new Map();
        this.gameState = this.createInitialState();
        this.gameRunning = false;
        this.gameLoop = null;
        this.winningScore = 10;
        this.baseSpeed = 4;
        this.lastUpdate = Date.now();
    }

    createInitialState() {
        return {
            paddle1: {
                x: PADDLE_OFFSET,
                y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
                width: PADDLE_WIDTH,
                height: PADDLE_HEIGHT,
                dy: 0,
                score: 0
            },
            paddle2: {
                x: CANVAS_WIDTH - PADDLE_OFFSET - PADDLE_WIDTH,
                y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
                width: PADDLE_WIDTH,
                height: PADDLE_HEIGHT,
                dy: 0,
                score: 0
            },
            ball: {
                x: CANVAS_WIDTH / 2,
                y: CANVAS_HEIGHT / 2,
                radius: BALL_RADIUS,
                dx: this.baseSpeed,
                dy: (Math.random() - 0.5) * 6
            }
        };
    }

    resetBall(direction = 1) {
        this.gameState.ball = {
            x: CANVAS_WIDTH / 2,
            y: CANVAS_HEIGHT / 2,
            radius: BALL_RADIUS,
            dx: this.baseSpeed * direction,
            dy: (Math.random() - 0.5) * 6
        };
    }

    update() {
        if (!this.gameRunning) return;

        const state = this.gameState;
        const paddleSpeed = 8;

        // Move paddles
        state.paddle1.y += state.paddle1.dy;
        state.paddle2.y += state.paddle2.dy;

        // Paddle boundaries
        state.paddle1.y = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, state.paddle1.y));
        state.paddle2.y = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, state.paddle2.y));

        // Move ball
        state.ball.x += state.ball.dx;
        state.ball.y += state.ball.dy;

        // Ball collision with top/bottom walls
        let wallHit = false;
        if (state.ball.y - state.ball.radius <= 0 || state.ball.y + state.ball.radius >= CANVAS_HEIGHT) {
            state.ball.dy *= -1;
            state.ball.y = Math.max(state.ball.radius, Math.min(CANVAS_HEIGHT - state.ball.radius, state.ball.y));
            wallHit = true;
        }

        // Ball collision with paddles
        let paddleHit = false;
        if (this.checkPaddleCollision(state.paddle1)) {
            this.handlePaddleHit(state.paddle1, 1);
            paddleHit = true;
        }
        if (this.checkPaddleCollision(state.paddle2)) {
            this.handlePaddleHit(state.paddle2, -1);
            paddleHit = true;
        }

        // Scoring
        let scored = null;
        let winner = null;

        if (state.ball.x < 0) {
            state.paddle2.score++;
            scored = 2;
            if (state.paddle2.score >= this.winningScore) {
                winner = 2;
                this.gameRunning = false;
            } else {
                this.resetBall(-1);
            }
        } else if (state.ball.x > CANVAS_WIDTH) {
            state.paddle1.score++;
            scored = 1;
            if (state.paddle1.score >= this.winningScore) {
                winner = 1;
                this.gameRunning = false;
            } else {
                this.resetBall(1);
            }
        }

        return { wallHit, paddleHit, scored, winner };
    }

    checkPaddleCollision(paddle) {
        const ball = this.gameState.ball;
        return ball.x - ball.radius < paddle.x + paddle.width &&
            ball.x + ball.radius > paddle.x &&
            ball.y - ball.radius < paddle.y + paddle.height &&
            ball.y + ball.radius > paddle.y;
    }

    handlePaddleHit(paddle, direction) {
        const ball = this.gameState.ball;
        const hitPos = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
        const maxAngle = Math.PI / 4;
        const angle = hitPos * maxAngle;

        const speedIncrease = 1.05;
        const maxSpeed = this.baseSpeed * 2;
        const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        const newSpeed = Math.min(currentSpeed * speedIncrease, maxSpeed);

        ball.dx = direction * newSpeed * Math.cos(angle);
        ball.dy = newSpeed * Math.sin(angle);

        if (direction === 1) {
            ball.x = paddle.x + paddle.width + ball.radius;
        } else {
            ball.x = paddle.x - ball.radius;
        }
    }

    isFull() {
        return this.players.size >= 2;
    }

    isEmpty() {
        return this.players.size === 0;
    }
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function broadcastToRoom(room, message, excludePlayerId = null) {
    room.players.forEach((playerData, playerId) => {
        if (playerId !== excludePlayerId) {
            const ws = players.get(playerId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        }
    });
}

wss.on('connection', (ws) => {
    const playerId = uuidv4();
    players.set(playerId, ws);

    console.log(`Player connected: ${playerId}`);

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(ws, playerId, message);
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });

    ws.on('close', () => {
        console.log(`Player disconnected: ${playerId}`);
        handleDisconnect(playerId);
        players.delete(playerId);
    });

    // Send player ID
    ws.send(JSON.stringify({ type: 'connected', playerId }));
});

function handleMessage(ws, playerId, message) {
    switch (message.type) {
        case 'createRoom':
            createRoom(ws, playerId, message);
            break;
        case 'joinRoom':
            joinRoom(ws, playerId, message);
            break;
        case 'startGame':
            startGame(playerId);
            break;
        case 'paddleMove':
            handlePaddleMove(playerId, message);
            break;
        case 'leaveRoom':
            leaveRoom(playerId);
            break;
    }
}

function createRoom(ws, playerId, message) {
    let roomCode = generateRoomCode();
    while (rooms.has(roomCode)) {
        roomCode = generateRoomCode();
    }

    const room = new GameRoom(roomCode, playerId);
    room.players.set(playerId, { playerNumber: 1, ready: false });
    room.winningScore = message.winningScore || 10;
    room.baseSpeed = message.baseSpeed || 4;
    rooms.set(roomCode, room);

    ws.roomCode = roomCode;
    ws.playerId = playerId;

    ws.send(JSON.stringify({
        type: 'roomCreated',
        roomCode,
        playerNumber: 1
    }));

    console.log(`Room created: ${roomCode} by ${playerId}`);
}

function joinRoom(ws, playerId, message) {
    const roomCode = message.roomCode.toUpperCase();
    const room = rooms.get(roomCode);

    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
    }

    if (room.isFull()) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
    }

    room.guestId = playerId;
    room.players.set(playerId, { playerNumber: 2, ready: false });

    ws.roomCode = roomCode;
    ws.playerId = playerId;

    ws.send(JSON.stringify({
        type: 'roomJoined',
        roomCode,
        playerNumber: 2
    }));

    // Notify host that guest joined
    const hostWs = players.get(room.hostId);
    if (hostWs && hostWs.readyState === WebSocket.OPEN) {
        hostWs.send(JSON.stringify({ type: 'playerJoined' }));
    }

    console.log(`Player ${playerId} joined room ${roomCode}`);
}

function startGame(playerId) {
    const ws = players.get(playerId);
    if (!ws || !ws.roomCode) return;

    const room = rooms.get(ws.roomCode);
    if (!room || room.hostId !== playerId) return;

    if (!room.isFull()) {
        ws.send(JSON.stringify({ type: 'error', message: 'Waiting for another player' }));
        return;
    }

    room.gameState = room.createInitialState();
    room.gameRunning = true;

    broadcastToRoom(room, {
        type: 'gameStart',
        state: room.gameState
    });

    // Start game loop
    if (room.gameLoop) clearInterval(room.gameLoop);
    room.gameLoop = setInterval(() => {
        if (!room.gameRunning) {
            clearInterval(room.gameLoop);
            return;
        }

        const events = room.update();

        broadcastToRoom(room, {
            type: 'gameState',
            state: room.gameState,
            events
        });

        if (events.winner) {
            clearInterval(room.gameLoop);
            broadcastToRoom(room, {
                type: 'gameOver',
                winner: events.winner
            });
        }
    }, 1000 / 60); // 60 FPS

    console.log(`Game started in room ${ws.roomCode}`);
}

function handlePaddleMove(playerId, message) {
    const ws = players.get(playerId);
    if (!ws || !ws.roomCode) return;

    const room = rooms.get(ws.roomCode);
    if (!room || !room.gameRunning) return;

    const playerData = room.players.get(playerId);
    if (!playerData) return;

    const paddleSpeed = 8;
    const paddle = playerData.playerNumber === 1 ? room.gameState.paddle1 : room.gameState.paddle2;

    switch (message.direction) {
        case 'up':
            paddle.dy = -paddleSpeed;
            break;
        case 'down':
            paddle.dy = paddleSpeed;
            break;
        case 'stop':
            paddle.dy = 0;
            break;
    }
}

function leaveRoom(playerId) {
    const ws = players.get(playerId);
    if (!ws || !ws.roomCode) return;

    const roomCode = ws.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return;

    handleDisconnect(playerId);
}

function handleDisconnect(playerId) {
    const ws = players.get(playerId);
    if (!ws || !ws.roomCode) return;

    const roomCode = ws.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.players.delete(playerId);

    if (room.gameLoop) {
        clearInterval(room.gameLoop);
    }

    if (room.isEmpty()) {
        rooms.delete(roomCode);
        console.log(`Room ${roomCode} deleted (empty)`);
    } else {
        room.gameRunning = false;
        broadcastToRoom(room, {
            type: 'playerLeft'
        });

        // If host left, make guest the new host
        if (playerId === room.hostId && room.guestId) {
            room.hostId = room.guestId;
            room.guestId = null;
            const newHostData = room.players.get(room.hostId);
            if (newHostData) {
                newHostData.playerNumber = 1;
            }
        }
    }

    ws.roomCode = null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🏓 Pong server running on http://localhost:${PORT}`);
});
