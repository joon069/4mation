// Socket.io 연결
const socket = io();

document.addEventListener("DOMContentLoaded", () => {
    const board = document.getElementById("game-board");
    const offlineButton = document.getElementById("offline-button");
    const onlineButton = document.getElementById("online-button");
    const redCountElement = document.getElementById("red-count");
    const blueCountElement = document.getElementById("blue-count");
    const gameOverScreen = document.getElementById("game-over-screen");
    const winnerMessage = document.getElementById("winner-message");
    const restartButton = document.getElementById("restart-button");
    const undoButton = document.getElementById("undo-button");
    const exitButton = document.getElementById("exit-button");
    const statusMessage = document.getElementById("status-message");

    let currentPlayer = "red";
    let centralBlockPlaced = false;
    let redCount = 23;
    let blueCount = 24;
    let lastPlacedIndex = null;
    let lastPlayer = null;
    let moveHistory = [];
    let gameMode = null; // 'offline' or 'online'
    let myColor = null;
    let roomId = null;
    let isMyTurn = false;

    // 오프라인 모드
    offlineButton.addEventListener("click", () => {
        gameMode = 'offline';
        startGame();
    });

    // 온라인 모드
    onlineButton.addEventListener("click", () => {
        gameMode = 'online';
        statusMessage.textContent = "매칭 중...";
        statusMessage.classList.remove("hidden");
        socket.emit('findMatch');
    });

    restartButton.addEventListener("click", () => {
        if (gameMode === 'offline') {
            resetGame();
        } else {
            window.location.reload();
        }
    });

    undoButton.addEventListener("click", () => {
        if (gameMode === 'offline') {
            undoLastMove();
        } else {
            socket.emit('undoMove', { roomId });
        }
    });

    exitButton.addEventListener("click", () => {
        window.location.reload();
    });

    function startGame() {
        document.getElementById("mode-selection").classList.add("hidden");
        document.getElementById("game-container").classList.remove("hidden");
        createBoard();
        updateBlockCounts();
        
        if (gameMode === 'online') {
            updateTurnIndicator();
        }
    }

    function createBoard() {
        board.innerHTML = '';
        for (let i = 0; i < 49; i++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.dataset.index = i;
            cell.addEventListener("click", handleCellClick);
            board.appendChild(cell);
        }
    }

    function handleCellClick(event) {
        const cell = event.target;
        const index = parseInt(cell.dataset.index, 10);

        if (gameMode === 'online') {
            // 온라인 모드: 내 턴인지 확인
            if (!isMyTurn) {
                alert("상대방의 차례입니다!");
                return;
            }

            if (!centralBlockPlaced) {
                const centerIndex = Math.floor(49 / 2);
                if (index === centerIndex) {
                    socket.emit('placeCentralBlock', { roomId, index, player: myColor });
                    return;
                } else {
                    alert("첫 블록은 중앙에만 놓을 수 있습니다!");
                    return;
                }
            }

            // 이미 차 있는 셀인지 확인
            if (cell.classList.contains("red") || cell.classList.contains("blue")) {
                alert("이미 차있는 칸입니다!");
                return;
            }

            // 유효한 배치 위치 확인
            if (!isValidPlacement(index)) {
                alert("블록을 놓을 수 없는 위치입니다!");
                return;
            }

            socket.emit('placeBlock', { roomId, index, player: myColor });
        } else {
            // 오프라인 모드 (기존 로직)
            handleOfflineCellClick(cell, index);
        }
    }

    function handleOfflineCellClick(cell, index) {
        if (!centralBlockPlaced) {
            const centerIndex = Math.floor(49 / 2);
            if (index === centerIndex) {
                cell.classList.add(currentPlayer);
                centralBlockPlaced = true;
                lastPlacedIndex = index;
                lastPlayer = currentPlayer;
                moveHistory.push({ index, player: currentPlayer });
                updateBlockCountsOnMove();
                switchPlayer();
                return;
            } else {
                alert("첫 블록은 중앙에만 놓을 수 있습니다!");
                return;
            }
        }

        if (cell.classList.contains("red") || cell.classList.contains("blue")) {
            alert("이미 차있는 칸입니다!");
            return;
        }

        if (!isValidPlacement(index)) {
            alert("블록을 놓을 수 없는 위치입니다!");
            return;
        }

        cell.classList.add(currentPlayer);
        lastPlacedIndex = index;
        lastPlayer = currentPlayer;
        moveHistory.push({ index, player: currentPlayer });
        updateBlockCountsOnMove();

        if (checkVictory()) {
            endGame(`${currentPlayer.toUpperCase()} Wins!`);
            return;
        }

        if (redCount === 0 && blueCount === 0) {
            endGame("Draw!");
            return;
        }

        switchPlayer();
    }

    function updateBlockCountsOnMove() {
        if (currentPlayer === "red") {
            redCount--;
        } else if (currentPlayer === "blue") {
            blueCount--;
        }
        updateBlockCounts();
    }

    function undoLastMove() {
        if (moveHistory.length === 0) {
            alert("되돌릴 수 있는 이동이 없습니다!");
            return;
        }

        const lastMove = moveHistory.pop();
        const cell = board.children[lastMove.index];

        if (lastMove.index === Math.floor(49 / 2)) {
            alert("중앙 블록은 되돌릴 수 없습니다!");
            moveHistory.push(lastMove);
            return;
        }

        cell.classList.remove("red", "blue");

        if (lastMove.player === "red") {
            redCount++;
        } else {
            blueCount++;
        }
        updateBlockCounts();

        lastPlacedIndex = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1].index : null;
        lastPlayer = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1].player : null;

        switchPlayer();
    }

    function switchPlayer() {
        currentPlayer = currentPlayer === "red" ? "blue" : "red";
    }

    function isValidPlacement(index) {
        if (lastPlacedIndex === null) return true;

        const surroundingEmpty = getSurroundingIndices(lastPlacedIndex)
            .some(idx => !board.children[idx].classList.contains("red") && !board.children[idx].classList.contains("blue"));

        if (surroundingEmpty) {
            return Math.abs(Math.floor(lastPlacedIndex / 7) - Math.floor(index / 7)) <= 1 &&
                Math.abs(lastPlacedIndex % 7 - index % 7) <= 1;
        } else {
            const surroundingIndices = getSurroundingIndices(index);
            return surroundingIndices.some(idx => board.children[idx].classList.contains(lastPlayer));
        }
    }

    function getSurroundingIndices(index) {
        const row = Math.floor(index / 7);
        const col = index % 7;
        const indices = [];

        for (let r = row - 1; r <= row + 1; r++) {
            for (let c = col - 1; c <= col + 1; c++) {
                if (r >= 0 && c >= 0 && r < 7 && c < 7 && (r !== row || c !== col)) {
                    indices.push(r * 7 + c);
                }
            }
        }

        return indices;
    }

    function checkVictory() {
        const cells = document.querySelectorAll(".cell");
        const directions = [
            [0, 1],
            [1, 0],
            [1, 1],
            [1, -1],
        ];

        for (const [dx, dy] of directions) {
            let count = 1;

            for (let step = 1; step <= 3; step++) {
                const nx = Math.floor(lastPlacedIndex / 7) + dx * step;
                const ny = (lastPlacedIndex % 7) + dy * step;
                if (nx >= 0 && ny >= 0 && nx < 7 && ny < 7) {
                    const nextIndex = nx * 7 + ny;
                    if (cells[nextIndex].classList.contains(currentPlayer)) {
                        count++;
                    } else {
                        break;
                    }
                }
            }

            for (let step = 1; step <= 3; step++) {
                const nx = Math.floor(lastPlacedIndex / 7) - dx * step;
                const ny = (lastPlacedIndex % 7) - dy * step;
                if (nx >= 0 && ny >= 0 && nx < 7 && ny < 7) {
                    const prevIndex = nx * 7 + ny;
                    if (cells[prevIndex].classList.contains(currentPlayer)) {
                        count++;
                    } else {
                        break;
                    }
                }
            }

            if (count >= 4) {
                return true;
            }
        }

        return false;
    }

    function endGame(resultMessage) {
        winnerMessage.textContent = resultMessage;
        gameOverScreen.classList.remove("hidden");
    }

    function updateBlockCounts() {
        redCountElement.textContent = redCount;
        blueCountElement.textContent = blueCount;
    }

    function updateTurnIndicator() {
        if (gameMode === 'online') {
            statusMessage.textContent = isMyTurn ? `당신의 차례 (${myColor.toUpperCase()})` : "상대방의 차례";
            statusMessage.classList.remove("hidden");
        }
    }

    function resetGame() {
        centralBlockPlaced = false;
        redCount = 23;
        blueCount = 24;
        currentPlayer = "red";
        lastPlacedIndex = null;
        lastPlayer = null;
        moveHistory = [];
        createBoard();
        updateBlockCounts();
        gameOverScreen.classList.add("hidden");
    }

    // Socket.io 이벤트 핸들러
    socket.on('waiting', () => {
        statusMessage.textContent = "매칭 대기 중...";
    });

    socket.on('gameStart', (data) => {
        roomId = data.roomId;
        myColor = data.color;
        isMyTurn = myColor === 'red'; // Red가 먼저 시작
        startGame();
        statusMessage.textContent = `게임 시작! 당신은 ${myColor.toUpperCase()} 입니다.`;
        updateTurnIndicator();
    });

    socket.on('centralBlockPlaced', (data) => {
        const cell = board.children[data.index];
        cell.classList.add(data.player);
        centralBlockPlaced = true;
        lastPlacedIndex = data.index;
        lastPlayer = data.player;
        redCount = data.redCount;
        blueCount = data.blueCount;
        updateBlockCounts();
    });

    socket.on('blockPlaced', (data) => {
        const cell = board.children[data.index];
        cell.classList.add(data.player);
        lastPlacedIndex = data.index;
        lastPlayer = data.player;
        redCount = data.redCount;
        blueCount = data.blueCount;
        updateBlockCounts();
    });

    socket.on('turnChange', (data) => {
        currentPlayer = data.currentPlayer;
        isMyTurn = currentPlayer === myColor;
        updateTurnIndicator();
    });

    socket.on('moveUndone', (data) => {
        const cell = board.children[data.index];
        cell.classList.remove("red", "blue");
        redCount = data.redCount;
        blueCount = data.blueCount;
        currentPlayer = data.currentPlayer;
        isMyTurn = currentPlayer === myColor;
        updateBlockCounts();
        updateTurnIndicator();
    });

    socket.on('gameOver', (data) => {
        if (data.winner === 'draw') {
            endGame("Draw!");
        } else {
            const winnerText = data.winner === myColor ? "You Win!" : "You Lose!";
            endGame(`${winnerText} (${data.winner.toUpperCase()} wins)`);
        }
    });

    socket.on('opponentDisconnected', () => {
        alert("상대방이 연결을 끊었습니다.");
        window.location.reload();
    });

    socket.on('error', (data) => {
        alert(data.message);
    });
});
