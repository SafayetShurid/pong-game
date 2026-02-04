// Pong Game - Classic Arcade Edition with Multiplayer

// Sound System using Web Audio API
class SoundSystem {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }

    playTone(frequency, duration, type = 'square', volume = 0.3, delay = 0) {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime + delay);

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime + delay);
        gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + delay + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + delay + duration);

        oscillator.start(this.audioContext.currentTime + delay);
        oscillator.stop(this.audioContext.currentTime + delay + duration);
    }

    paddleHit() {
        this.playTone(440, 0.08, 'square', 0.2);
        this.playTone(880, 0.05, 'square', 0.1, 0.02);
    }

    wallHit() {
        this.playTone(220, 0.1, 'triangle', 0.15);
    }

    score() {
        this.playTone(523.25, 0.1, 'square', 0.2, 0);
        this.playTone(659.25, 0.1, 'square', 0.2, 0.1);
        this.playTone(783.99, 0.15, 'square', 0.25, 0.2);
    }

    gameStart() {
        this.playTone(261.63, 0.1, 'square', 0.2, 0);
        this.playTone(329.63, 0.1, 'square', 0.2, 0.1);
        this.playTone(392.00, 0.1, 'square', 0.2, 0.2);
        this.playTone(523.25, 0.2, 'square', 0.3, 0.3);
    }

    victory() {
        this.playTone(523.25, 0.15, 'square', 0.25, 0);
        this.playTone(523.25, 0.15, 'square', 0.25, 0.15);
        this.playTone(523.25, 0.15, 'square', 0.25, 0.3);
        this.playTone(659.25, 0.3, 'square', 0.3, 0.45);
        this.playTone(587.33, 0.15, 'square', 0.25, 0.75);
        this.playTone(659.25, 0.15, 'square', 0.25, 0.9);
        this.playTone(783.99, 0.4, 'square', 0.35, 1.05);
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

// Multiplayer Network Manager
class NetworkManager {
    constructor(game) {
        this.game = game;
        this.ws = null;
        this.playerId = null;
        this.roomCode = null;
        this.playerNumber = null;
        this.isHost = false;
        this.connected = false;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('Connected to server');
                this.connected = true;
                resolve();
            };

            this.ws.onclose = () => {
                console.log('Disconnected from server');
                this.connected = false;
                this.game.handleDisconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            };
        });
    }

    handleMessage(message) {
        switch (message.type) {
            case 'connected':
                this.playerId = message.playerId;
                break;
            case 'roomCreated':
                this.roomCode = message.roomCode;
                this.playerNumber = message.playerNumber;
                this.isHost = true;
                this.game.onRoomCreated(message.roomCode);
                break;
            case 'roomJoined':
                this.roomCode = message.roomCode;
                this.playerNumber = message.playerNumber;
                this.isHost = false;
                this.game.onRoomJoined(message.roomCode);
                break;
            case 'playerJoined':
                this.game.onPlayerJoined();
                break;
            case 'playerLeft':
                this.game.onPlayerLeft();
                break;
            case 'gameStart':
                this.game.onOnlineGameStart(message.state);
                break;
            case 'gameState':
                this.game.onGameState(message.state, message.events);
                break;
            case 'gameOver':
                this.game.onOnlineGameOver(message.winner);
                break;
            case 'error':
                this.game.showToast(message.message);
                break;
        }
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    createRoom(winningScore, baseSpeed) {
        this.send({
            type: 'createRoom',
            winningScore,
            baseSpeed
        });
    }

    joinRoom(roomCode) {
        this.send({
            type: 'joinRoom',
            roomCode
        });
    }

    startGame() {
        this.send({ type: 'startGame' });
    }

    sendPaddleMove(direction) {
        this.send({
            type: 'paddleMove',
            direction
        });
    }

    leaveRoom() {
        this.send({ type: 'leaveRoom' });
        this.roomCode = null;
        this.playerNumber = null;
        this.isHost = false;
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Main Game Class
class PongGame {
    constructor() {
        this.canvas = document.getElementById('pongCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Game mode: 'local' or 'online'
        this.gameMode = null;

        // Game state
        this.gameRunning = false;
        this.gamePaused = false;
        this.gameOver = false;

        // Settings
        this.winningScore = 10;
        this.baseSpeed = 4;

        // Colors
        this.colors = {
            paddle1: '#00f5ff',
            paddle2: '#ff00ff',
            ball: '#ffffff',
            centerLine: 'rgba(139, 92, 246, 0.3)',
            glow: 'rgba(139, 92, 246, 0.5)'
        };

        // Paddle properties
        this.paddleWidth = 12;
        this.paddleHeight = 100;
        this.paddleSpeed = 8;
        this.paddleOffset = 20;

        // Ball properties
        this.ballRadius = 10;

        // Initialize game objects
        this.initGameObjects();

        // Key states
        this.keys = {
            w: false,
            s: false,
            ArrowUp: false,
            ArrowDown: false
        };

        // Online key states (for sending to server)
        this.lastDirection = 'stop';

        // DOM elements - Mode Selection
        this.modeSelection = document.getElementById('modeSelection');
        this.localModeBtn = document.getElementById('localModeBtn');
        this.onlineModeBtn = document.getElementById('onlineModeBtn');

        // DOM elements - Online Menu
        this.onlineMenu = document.getElementById('onlineMenu');
        this.createRoomBtn = document.getElementById('createRoomBtn');
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        this.roomCodeInput = document.getElementById('roomCodeInput');
        this.backToModeBtn = document.getElementById('backToModeBtn');
        this.onlineWinningScoreSelect = document.getElementById('onlineWinningScore');
        this.onlineBallSpeedSelect = document.getElementById('onlineBallSpeed');

        // DOM elements - Waiting Room
        this.waitingRoom = document.getElementById('waitingRoom');
        this.roomCodeDisplay = document.getElementById('roomCodeDisplay');
        this.copyCodeBtn = document.getElementById('copyCodeBtn');
        this.waitingText = document.getElementById('waitingText');
        this.player2Status = document.getElementById('player2Status');
        this.startOnlineBtn = document.getElementById('startOnlineBtn');
        this.leaveRoomBtn = document.getElementById('leaveRoomBtn');

        // DOM elements - Guest Waiting Room
        this.guestWaitingRoom = document.getElementById('guestWaitingRoom');
        this.guestRoomCodeDisplay = document.getElementById('guestRoomCodeDisplay');
        this.guestLeaveRoomBtn = document.getElementById('guestLeaveRoomBtn');

        // DOM elements - Game
        this.scoreboard = document.getElementById('scoreboard');
        this.canvasWrapper = document.getElementById('canvasWrapper');
        this.controlsInfo = document.getElementById('controlsInfo');
        this.gameSettings = document.getElementById('gameSettings');
        this.overlay = document.getElementById('gameOverlay');
        this.overlayTitle = document.getElementById('overlayTitle');
        this.overlayMessage = document.getElementById('overlayMessage');
        this.playBtn = document.getElementById('playBtn');
        this.score1Element = document.getElementById('score1');
        this.score2Element = document.getElementById('score2');
        this.winningScoreSelect = document.getElementById('winningScore');
        this.ballSpeedSelect = document.getElementById('ballSpeed');
        this.player1Controls = document.getElementById('player1Controls');
        this.player2Controls = document.getElementById('player2Controls');

        // DOM elements - Toast
        this.connectionToast = document.getElementById('connectionToast');
        this.toastMessage = document.getElementById('toastMessage');

        // Sound system
        this.sound = new SoundSystem();

        // Network manager
        this.network = new NetworkManager(this);

        // Bind events
        this.bindEvents();
    }

    initGameObjects() {
        this.paddle1 = {
            x: this.paddleOffset,
            y: this.canvas.height / 2 - this.paddleHeight / 2,
            width: this.paddleWidth,
            height: this.paddleHeight,
            dy: 0,
            score: 0
        };

        this.paddle2 = {
            x: this.canvas.width - this.paddleOffset - this.paddleWidth,
            y: this.canvas.height / 2 - this.paddleHeight / 2,
            width: this.paddleWidth,
            height: this.paddleHeight,
            dy: 0,
            score: 0
        };

        this.resetBall();
    }

    resetBall(direction = 1) {
        this.ball = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            radius: this.ballRadius,
            dx: this.baseSpeed * direction,
            dy: (Math.random() - 0.5) * 6,
            trail: []
        };
    }

    bindEvents() {
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Mode selection
        this.localModeBtn.addEventListener('click', () => this.selectLocalMode());
        this.onlineModeBtn.addEventListener('click', () => this.selectOnlineMode());

        // Online menu
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.backToModeBtn.addEventListener('click', () => this.backToModeSelection());
        this.roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Waiting room
        this.copyCodeBtn.addEventListener('click', () => this.copyRoomCode());
        this.startOnlineBtn.addEventListener('click', () => this.network.startGame());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.guestLeaveRoomBtn.addEventListener('click', () => this.leaveRoom());

        // Play button (local mode)
        this.playBtn.addEventListener('click', () => this.startLocalGame());

        // Settings
        this.winningScoreSelect.addEventListener('change', (e) => {
            this.winningScore = parseInt(e.target.value);
        });

        this.ballSpeedSelect.addEventListener('change', (e) => {
            const speeds = { slow: 3, normal: 4, fast: 6 };
            this.baseSpeed = speeds[e.target.value];
            if (!this.gameRunning) {
                this.ball.dx = this.baseSpeed * Math.sign(this.ball.dx || 1);
            }
        });
    }

    handleKeyDown(e) {
        // Local mode controls
        if (this.gameMode === 'local') {
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                if (!this.gameRunning || this.gameOver) {
                    this.startLocalGame();
                } else if (!this.gamePaused) {
                    this.pauseGame();
                } else {
                    this.resumeGame();
                }
            }

            if (e.key === 'Escape' && this.gameRunning && !this.gameOver) {
                if (this.gamePaused) {
                    this.resumeGame();
                } else {
                    this.pauseGame();
                }
            }
        }

        // Online mode controls
        if (this.gameMode === 'online' && this.gameRunning) {
            let direction = null;

            if (this.network.playerNumber === 1) {
                if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
                    direction = 'up';
                } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
                    direction = 'down';
                }
            } else {
                if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                    direction = 'up';
                } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                    direction = 'down';
                }
            }

            if (direction && direction !== this.lastDirection) {
                this.lastDirection = direction;
                this.network.sendPaddleMove(direction);
                e.preventDefault();
            }
        }

        // Local mode key tracking
        if (this.keys.hasOwnProperty(e.key)) {
            e.preventDefault();
            this.keys[e.key] = true;
        }
    }

    handleKeyUp(e) {
        if (this.keys.hasOwnProperty(e.key)) {
            this.keys[e.key] = false;
        }

        // Online mode: stop paddle
        if (this.gameMode === 'online' && this.gameRunning) {
            const isMovementKey = ['w', 'W', 's', 'S', 'ArrowUp', 'ArrowDown'].includes(e.key);
            if (isMovementKey) {
                // Check if all movement keys are released
                const anyPressed = this.keys.w || this.keys.s || this.keys.ArrowUp || this.keys.ArrowDown;
                if (!anyPressed && this.lastDirection !== 'stop') {
                    this.lastDirection = 'stop';
                    this.network.sendPaddleMove('stop');
                }
            }
        }
    }

    // Mode Selection
    selectLocalMode() {
        this.gameMode = 'local';
        this.modeSelection.classList.add('hidden');
        this.showGameUI();
        this.showOverlay('Ready to Play?', 'Press SPACE to start');
        this.draw();
    }

    async selectOnlineMode() {
        this.sound.init();
        this.modeSelection.classList.add('hidden');
        this.onlineMenu.classList.remove('hidden');

        if (!this.network.connected) {
            try {
                await this.network.connect();
            } catch (error) {
                this.showToast('Could not connect to server');
                this.backToModeSelection();
            }
        }
    }

    backToModeSelection() {
        this.gameMode = null;
        this.onlineMenu.classList.add('hidden');
        this.waitingRoom.classList.add('hidden');
        this.guestWaitingRoom.classList.add('hidden');
        this.hideGameUI();
        this.modeSelection.classList.remove('hidden');
    }

    // Online Mode Methods
    async createRoom() {
        const winningScore = parseInt(this.onlineWinningScoreSelect.value);
        const speeds = { slow: 3, normal: 4, fast: 6 };
        const baseSpeed = speeds[this.onlineBallSpeedSelect.value];

        this.network.createRoom(winningScore, baseSpeed);
    }

    joinRoom() {
        const roomCode = this.roomCodeInput.value.trim().toUpperCase();
        if (roomCode.length !== 4) {
            this.showToast('Please enter a 4-character room code');
            return;
        }
        this.network.joinRoom(roomCode);
    }

    onRoomCreated(roomCode) {
        this.onlineMenu.classList.add('hidden');
        this.waitingRoom.classList.remove('hidden');
        this.roomCodeDisplay.textContent = roomCode;
        this.startOnlineBtn.classList.add('hidden');
    }

    onRoomJoined(roomCode) {
        this.onlineMenu.classList.add('hidden');
        this.guestWaitingRoom.classList.remove('hidden');
        this.guestRoomCodeDisplay.textContent = roomCode;
        this.roomCodeInput.value = '';
    }

    onPlayerJoined() {
        this.player2Status.querySelector('.status-dot').classList.add('connected');
        this.waitingText.textContent = 'Player 2 connected!';
        this.startOnlineBtn.classList.remove('hidden');
    }

    onPlayerLeft() {
        if (this.network.isHost) {
            this.player2Status.querySelector('.status-dot').classList.remove('connected');
            this.waitingText.textContent = 'Waiting for opponent...';
            this.startOnlineBtn.classList.add('hidden');
        }

        if (this.gameRunning) {
            this.gameRunning = false;
            this.showToast('Opponent disconnected');
            this.returnToWaitingRoom();
        }
    }

    returnToWaitingRoom() {
        this.hideGameUI();
        if (this.network.isHost) {
            this.waitingRoom.classList.remove('hidden');
            this.player2Status.querySelector('.status-dot').classList.remove('connected');
            this.waitingText.textContent = 'Waiting for opponent...';
            this.startOnlineBtn.classList.add('hidden');
        } else {
            this.backToModeSelection();
        }
    }

    leaveRoom() {
        this.network.leaveRoom();
        this.backToModeSelection();
    }

    copyRoomCode() {
        const code = this.roomCodeDisplay.textContent;
        navigator.clipboard.writeText(code).then(() => {
            this.copyCodeBtn.textContent = '✓';
            setTimeout(() => {
                this.copyCodeBtn.textContent = '📋';
            }, 2000);
        });
    }

    onOnlineGameStart(state) {
        this.gameMode = 'online';
        this.sound.init();
        this.sound.gameStart();

        this.waitingRoom.classList.add('hidden');
        this.guestWaitingRoom.classList.add('hidden');

        this.showGameUI();
        this.hideOverlay();

        // Update controls display for online mode
        this.updateOnlineControls();

        this.gameRunning = true;
        this.gameOver = false;

        // Apply initial state
        this.applyGameState(state);

        // Start render loop
        this.renderLoop();
    }

    updateOnlineControls() {
        this.controlsInfo.classList.add('online-mode');

        if (this.network.playerNumber === 1) {
            this.player1Controls.classList.add('active');
            this.player2Controls.classList.remove('active');
            this.player1Controls.querySelector('.control-label').innerHTML = 'You <span class="you-indicator">(Player 1)</span>';
        } else {
            this.player1Controls.classList.remove('active');
            this.player2Controls.classList.add('active');
            this.player2Controls.querySelector('.control-label').innerHTML = 'You <span class="you-indicator">(Player 2)</span>';
        }
    }

    onGameState(state, events) {
        this.applyGameState(state);

        // Play sounds based on events
        if (events) {
            if (events.paddleHit) this.sound.paddleHit();
            if (events.wallHit) this.sound.wallHit();
            if (events.scored) this.sound.score();
        }
    }

    applyGameState(state) {
        this.paddle1.x = state.paddle1.x;
        this.paddle1.y = state.paddle1.y;
        this.paddle1.score = state.paddle1.score;

        this.paddle2.x = state.paddle2.x;
        this.paddle2.y = state.paddle2.y;
        this.paddle2.score = state.paddle2.score;

        this.ball.x = state.ball.x;
        this.ball.y = state.ball.y;
        this.ball.dx = state.ball.dx;
        this.ball.dy = state.ball.dy;

        // Update ball trail
        if (!this.ball.trail) this.ball.trail = [];
        this.ball.trail.push({ x: this.ball.x, y: this.ball.y });
        if (this.ball.trail.length > 15) {
            this.ball.trail.shift();
        }

        this.updateScoreDisplay();
    }

    onOnlineGameOver(winner) {
        this.gameOver = true;
        this.gameRunning = false;
        this.sound.victory();

        const isWinner = winner === this.network.playerNumber;
        const title = isWinner ? 'You Win!' : 'You Lose!';
        const color = isWinner ? '#22c55e' : '#ef4444';

        this.showOverlay(title, 'Returning to lobby...');
        this.overlayTitle.style.color = color;
        this.overlayTitle.style.textShadow = `0 0 30px ${color}`;
        this.playBtn.classList.add('hidden');

        setTimeout(() => {
            this.returnToWaitingRoom();
            this.playBtn.classList.remove('hidden');
        }, 3000);
    }

    renderLoop() {
        if (!this.gameRunning && !this.gameOver) return;

        this.draw();

        if (this.gameRunning) {
            requestAnimationFrame(() => this.renderLoop());
        }
    }

    handleDisconnect() {
        if (this.gameRunning) {
            this.gameRunning = false;
            this.showToast('Connection lost');
        }
        this.backToModeSelection();
    }

    showToast(message, duration = 3000) {
        this.toastMessage.textContent = message;
        this.connectionToast.classList.remove('hidden');

        setTimeout(() => {
            this.connectionToast.classList.add('hidden');
        }, duration);
    }

    // UI Helpers
    showGameUI() {
        this.scoreboard.classList.remove('hidden');
        this.canvasWrapper.classList.remove('hidden');
        this.controlsInfo.classList.remove('hidden');
        if (this.gameMode === 'local') {
            this.gameSettings.classList.remove('hidden');
        }
    }

    hideGameUI() {
        this.scoreboard.classList.add('hidden');
        this.canvasWrapper.classList.add('hidden');
        this.controlsInfo.classList.add('hidden');
        this.gameSettings.classList.add('hidden');
        this.controlsInfo.classList.remove('online-mode');
        this.player1Controls.classList.remove('active');
        this.player2Controls.classList.remove('active');
        this.player1Controls.querySelector('.control-label').textContent = 'Player 1';
        this.player2Controls.querySelector('.control-label').textContent = 'Player 2';
    }

    // Local Mode Game Methods
    startLocalGame() {
        this.sound.init();
        this.sound.gameStart();

        this.gameRunning = true;
        this.gamePaused = false;
        this.gameOver = false;
        this.paddle1.score = 0;
        this.paddle2.score = 0;
        this.updateScoreDisplay();
        this.initGameObjects();
        this.hideOverlay();
        this.gameLoop();
    }

    pauseGame() {
        this.gamePaused = true;
        this.showOverlay('Paused', 'Press SPACE or ESC to continue');
        this.playBtn.innerHTML = '<span class="btn-icon">▶</span><span>Resume</span>';
    }

    resumeGame() {
        this.gamePaused = false;
        this.hideOverlay();
        this.gameLoop();
    }

    endLocalGame(winner) {
        this.gameOver = true;
        this.gameRunning = false;
        this.sound.victory();
        const winnerName = winner === 1 ? 'Player 1' : 'Player 2';
        const winnerColor = winner === 1 ? '#00f5ff' : '#ff00ff';
        this.showOverlay(`${winnerName} Wins!`, 'Press SPACE to play again');
        this.overlayTitle.style.color = winnerColor;
        this.overlayTitle.style.textShadow = `0 0 30px ${winnerColor}`;
        this.playBtn.innerHTML = '<span class="btn-icon">↻</span><span>Play Again</span>';
    }

    showOverlay(title, message) {
        this.overlayTitle.textContent = title;
        this.overlayMessage.textContent = message;
        this.overlay.classList.remove('hidden');
    }

    hideOverlay() {
        this.overlay.classList.add('hidden');
        this.overlayTitle.style.color = '';
        this.overlayTitle.style.textShadow = '';
    }

    updateScoreDisplay() {
        this.score1Element.textContent = this.paddle1.score;
        this.score2Element.textContent = this.paddle2.score;

        this.score1Element.style.transform = 'scale(1.2)';
        this.score2Element.style.transform = 'scale(1.2)';
        setTimeout(() => {
            this.score1Element.style.transform = 'scale(1)';
            this.score2Element.style.transform = 'scale(1)';
        }, 150);
    }

    update() {
        // Update paddle positions based on keys (local mode only)
        if (this.keys.w) this.paddle1.dy = -this.paddleSpeed;
        else if (this.keys.s) this.paddle1.dy = this.paddleSpeed;
        else this.paddle1.dy = 0;

        if (this.keys.ArrowUp) this.paddle2.dy = -this.paddleSpeed;
        else if (this.keys.ArrowDown) this.paddle2.dy = this.paddleSpeed;
        else this.paddle2.dy = 0;

        // Move paddles
        this.paddle1.y += this.paddle1.dy;
        this.paddle2.y += this.paddle2.dy;

        // Paddle boundaries
        this.paddle1.y = Math.max(0, Math.min(this.canvas.height - this.paddleHeight, this.paddle1.y));
        this.paddle2.y = Math.max(0, Math.min(this.canvas.height - this.paddleHeight, this.paddle2.y));

        // Update ball trail
        this.ball.trail.push({ x: this.ball.x, y: this.ball.y });
        if (this.ball.trail.length > 15) {
            this.ball.trail.shift();
        }

        // Move ball
        this.ball.x += this.ball.dx;
        this.ball.y += this.ball.dy;

        // Ball collision with top/bottom walls
        if (this.ball.y - this.ball.radius <= 0 || this.ball.y + this.ball.radius >= this.canvas.height) {
            this.ball.dy *= -1;
            this.ball.y = Math.max(this.ball.radius, Math.min(this.canvas.height - this.ball.radius, this.ball.y));
            this.sound.wallHit();
        }

        // Ball collision with paddles
        if (this.checkPaddleCollision(this.paddle1)) {
            this.handlePaddleHit(this.paddle1, 1);
            this.sound.paddleHit();
        }

        if (this.checkPaddleCollision(this.paddle2)) {
            this.handlePaddleHit(this.paddle2, -1);
            this.sound.paddleHit();
        }

        // Scoring
        if (this.ball.x < 0) {
            this.paddle2.score++;
            this.updateScoreDisplay();
            if (this.paddle2.score >= this.winningScore) {
                this.endLocalGame(2);
                return;
            }
            this.sound.score();
            this.resetBall(-1);
        } else if (this.ball.x > this.canvas.width) {
            this.paddle1.score++;
            this.updateScoreDisplay();
            if (this.paddle1.score >= this.winningScore) {
                this.endLocalGame(1);
                return;
            }
            this.sound.score();
            this.resetBall(1);
        }
    }

    checkPaddleCollision(paddle) {
        return this.ball.x - this.ball.radius < paddle.x + paddle.width &&
            this.ball.x + this.ball.radius > paddle.x &&
            this.ball.y - this.ball.radius < paddle.y + paddle.height &&
            this.ball.y + this.ball.radius > paddle.y;
    }

    handlePaddleHit(paddle, direction) {
        const hitPos = (this.ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
        const maxAngle = Math.PI / 4;
        const angle = hitPos * maxAngle;

        const speedIncrease = 1.05;
        const maxSpeed = this.baseSpeed * 2;
        const currentSpeed = Math.sqrt(this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy);
        const newSpeed = Math.min(currentSpeed * speedIncrease, maxSpeed);

        this.ball.dx = direction * newSpeed * Math.cos(angle);
        this.ball.dy = newSpeed * Math.sin(angle);

        if (direction === 1) {
            this.ball.x = paddle.x + paddle.width + this.ball.radius;
        } else {
            this.ball.x = paddle.x - this.ball.radius;
        }
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#0d0d20';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid pattern
        this.drawGrid();

        // Draw center line
        this.drawCenterLine();

        // Draw ball trail
        this.drawBallTrail();

        // Draw paddles with glow
        this.drawPaddle(this.paddle1, this.colors.paddle1);
        this.drawPaddle(this.paddle2, this.colors.paddle2);

        // Draw ball with glow
        this.drawBall();
    }

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(139, 92, 246, 0.05)';
        this.ctx.lineWidth = 1;

        const gridSize = 40;

        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawCenterLine() {
        const segmentHeight = 20;
        const gap = 15;
        const x = this.canvas.width / 2;

        this.ctx.strokeStyle = this.colors.centerLine;
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';

        for (let y = 0; y < this.canvas.height; y += segmentHeight + gap) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x, Math.min(y + segmentHeight, this.canvas.height));
            this.ctx.stroke();
        }
    }

    drawPaddle(paddle, color) {
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 20;

        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 6);
        this.ctx.fill();

        const gradient = this.ctx.createLinearGradient(paddle.x, paddle.y, paddle.x + paddle.width, paddle.y);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 6);
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
    }

    drawBallTrail() {
        if (!this.ball.trail) return;

        for (let i = 0; i < this.ball.trail.length; i++) {
            const pos = this.ball.trail[i];
            const alpha = (i / this.ball.trail.length) * 0.3;
            const size = (i / this.ball.trail.length) * this.ball.radius;

            this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    drawBall() {
        this.ctx.shadowColor = '#ffffff';
        this.ctx.shadowBlur = 25;

        const gradient = this.ctx.createRadialGradient(
            this.ball.x - 3, this.ball.y - 3, 0,
            this.ball.x, this.ball.y, this.ball.radius
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.5, '#f0f0ff');
        gradient.addColorStop(1, '#c0c0e0');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
    }

    gameLoop() {
        if (!this.gameRunning || this.gamePaused || this.gameOver) return;

        this.update();
        this.draw();

        requestAnimationFrame(() => this.gameLoop());
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PongGame();
});
