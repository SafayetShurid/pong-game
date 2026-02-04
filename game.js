// Pong Game - Classic Arcade Edition
class PongGame {
    constructor() {
        this.canvas = document.getElementById('pongCanvas');
        this.ctx = this.canvas.getContext('2d');

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

        // DOM elements
        this.overlay = document.getElementById('gameOverlay');
        this.overlayTitle = document.getElementById('overlayTitle');
        this.overlayMessage = document.getElementById('overlayMessage');
        this.playBtn = document.getElementById('playBtn');
        this.score1Element = document.getElementById('score1');
        this.score2Element = document.getElementById('score2');
        this.winningScoreSelect = document.getElementById('winningScore');
        this.ballSpeedSelect = document.getElementById('ballSpeed');

        // Bind events
        this.bindEvents();

        // Initial draw
        this.draw();
    }

    initGameObjects() {
        // Paddles
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

        // Ball
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

        // Play button
        this.playBtn.addEventListener('click', () => this.startGame());

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
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (!this.gameRunning || this.gameOver) {
                this.startGame();
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

        if (this.keys.hasOwnProperty(e.key)) {
            e.preventDefault();
            this.keys[e.key] = true;
        }
    }

    handleKeyUp(e) {
        if (this.keys.hasOwnProperty(e.key)) {
            this.keys[e.key] = false;
        }
    }

    startGame() {
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

    endGame(winner) {
        this.gameOver = true;
        this.gameRunning = false;
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

        // Animate score change
        this.score1Element.style.transform = 'scale(1.2)';
        this.score2Element.style.transform = 'scale(1.2)';
        setTimeout(() => {
            this.score1Element.style.transform = 'scale(1)';
            this.score2Element.style.transform = 'scale(1)';
        }, 150);
    }

    update() {
        // Update paddle positions based on keys
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
        }

        // Ball collision with paddles
        if (this.checkPaddleCollision(this.paddle1)) {
            this.handlePaddleHit(this.paddle1, 1);
        }

        if (this.checkPaddleCollision(this.paddle2)) {
            this.handlePaddleHit(this.paddle2, -1);
        }

        // Scoring
        if (this.ball.x < 0) {
            this.paddle2.score++;
            this.updateScoreDisplay();
            if (this.paddle2.score >= this.winningScore) {
                this.endGame(2);
                return;
            }
            this.resetBall(-1);
        } else if (this.ball.x > this.canvas.width) {
            this.paddle1.score++;
            this.updateScoreDisplay();
            if (this.paddle1.score >= this.winningScore) {
                this.endGame(1);
                return;
            }
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
        // Calculate hit position relative to paddle center (-1 to 1)
        const hitPos = (this.ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);

        // Adjust angle based on where ball hits paddle
        const maxAngle = Math.PI / 4; // 45 degrees
        const angle = hitPos * maxAngle;

        // Increase speed slightly on each hit (up to a max)
        const speedIncrease = 1.05;
        const maxSpeed = this.baseSpeed * 2;
        const currentSpeed = Math.sqrt(this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy);
        const newSpeed = Math.min(currentSpeed * speedIncrease, maxSpeed);

        // Set new velocity
        this.ball.dx = direction * newSpeed * Math.cos(angle);
        this.ball.dy = newSpeed * Math.sin(angle);

        // Move ball outside paddle to prevent multiple collisions
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
        // Glow effect
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 20;

        // Paddle body
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 6);
        this.ctx.fill();

        // Inner highlight
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
        // Outer glow
        this.ctx.shadowColor = '#ffffff';
        this.ctx.shadowBlur = 25;

        // Ball body
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
