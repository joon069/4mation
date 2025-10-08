const socket = io();

document.addEventListener("DOMContentLoaded", () => {
    // DOM 요소
    const loginScreen = document.getElementById("login-screen");
    const nicknameInput = document.getElementById("nickname-input");
    const loginButton = document.getElementById("login-button");
    const modeSelection = document.getElementById("mode-selection");
    const currentNicknameSpan = document.getElementById("current-nickname");
    const offlineButton = document.getElementById("offline-button");
    const onlineButton = document.getElementById("online-button");
    const onlineLobby = document.getElementById("online-lobby");
    const backToMenu = document.getElementById("back-to-menu");
    const chatMessages = document.getElementById("chat-messages");
    const chatInput = document.getElementById("chat-input");
    const chatSend = document.getElementById("chat-send");
    const onlineUsersList = document.getElementById("online-users-list");
    const onlineCount = document.getElementById("online-count");
    const gameContainer = document.getElementById("game-container");
    const board = document.getElementById("game-board");
    const redCountElement = document.getElementById("red-count");
    const blueCountElement = document.getElementById("blue-count");
    const gameOverScreen = document.getElementById("game-over-screen");
    const winnerMessage = document.getElementById("winner-message");
    const restartButton = document.getElementById("restart-button");
    const undoButton = document.getElementById("undo-button");
    const exitButton = document.getElementById("exit-button");
    const statusMessage = document.getElementById("status-message");
    const opponentNameDiv = document.getElementById("opponent-name");
    const matchRequestModal = document.getElementById("match-request-modal");
    const matchRequestText = document.getElementById("match-request-text");
    const acceptMatch = document.getElementById("accept-match");
    const declineMatch = document.getElementById("decline-match");
    const emojiPanel = document.getElementById("emoji-panel");
    const emojiDisplay = document.getElementById("emoji-display");

    // 게임 상태
    let myNickname = null;
    let currentPlayer = "red";
    let centralBlockPlaced = false;
    let redCount = 23;
    let blueCount = 24;
    let lastPlacedIndex = null;
    let lastPlayer = null;
    let moveHistory = [];
    let gameMode = null;
    let myColor = null;
    let roomId = null;
    let isMyTurn = false;
    let opponentNickname = null;
    let currentMatchRequest = null;

    // === 로그인 ===
    loginButton.addEventListener("click", handleLogin);
    nicknameInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleLogin();
    });

    function handleLogin() {
        const nickname = nicknameInput.value.trim();
        if (nickname === "") {
            alert("닉네임을 입력해주세요!");
            return;
        }
        myNickname = nickname;
        socket.emit('login', { nickname });
        loginScreen.classList.add("hidden");
        modeSelection.classList.remove("hidden");
        currentNicknameSpan.textContent = `환영합니다, ${myNickname}님!`;
    }

    // === 모드 선택 ===
    offlineButton.addEventListener("click", () => {
        gameMode = 'offline';
        modeSelection.classList.add("hidden");
        startGame();
    });

    onlineButton.addEventListener("click", () => {
        gameMode = 'online';
        modeSelection.classList.add("hidden");
        onlineLobby.classList.remove("hidden");
        socket.emit('enterLobby');
    });

    backToMenu.addEventListener("click", () => {
        onlineLobby.classList.add("hidden");
        modeSelection.classList.remove("hidden");
        socket.emit('leaveLobby');
    });

    // === 채팅 ===
    chatSend.addEventListener("click", sendChatMessage);
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendChatMessage();
    });

    function sendChatMessage() {
        const message = chatInput.value.trim();
        if (message === "") return;
        
        if (sentChatMessages.has(message)) {
            alert("같은 메시지를 중복으로 보낼 수 없습니다!");
            return;
        }

        socket.emit('chatMessage', { message });
        sentChatMessages.add(message);
        chatInput.value = "";
    }

    // === 온라인 유저 목록 ===
    function renderOnlineUsers(users) {
        onlineUsersList.innerHTML = "";
        onlineCount.textContent = users.length;

        users.forEach(user => {
            const userCard = document.createElement("div");
            userCard.className = "user-card";
            
            if (user.nickname === myNickname) {
                userCard.classList.add("self");
            }

            const username = document.createElement("div");
            username.className = "username";
            username.textContent = user.nickname;
            userCard.appendChild(username);

            if (user.nickname !== myNickname) {
                userCard.addEventListener("click", () => {
                    if (confirm(`${user.nickname}님에게 매칭 요청을 보내시겠습니까?`)) {
                        socket.emit('sendMatchRequest', { targetId: user.id });
                    }
                });
            }

            onlineUsersList.appendChild(userCard);
        });
    }

    // === 매칭 시스템 ===
    acceptMatch.addEventListener("click", () => {
        if (currentMatchRequest) {
            socket.emit('acceptMatch', { requesterId: currentMatchRequest.requesterId });
            matchRequestModal.classList.add("hidden");
            currentMatchRequest = null;
        }
    });

    declineMatch.addEventListener("click", () => {
        if (currentMatchRequest) {
            socket.emit('declineMatch', { requesterId: currentMatchRequest.requesterId });
            matchRequestModal.classList.add("hidden");
            currentMatchRequest = null;
        }
    });

    // === 게임 시작 ===
    function startGame() {
        gameContainer.classList.remove("hidden");
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

    // === 셀 클릭 처리 ===
    function handleCellClick(event) {
        const cell = event.target;
        const index = parseInt(cell.dataset.index, 10);

        if (gameMode === 'online') {
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

            if (cell.classList.contains("red") || cell.classList.contains("blue")) {
                alert("이미 차있는 칸입니다!");
                return;
            }

            if (!isValidPlacement(index)) {
                alert("블록을 놓을 수 없는 위치입니다!");
                return;
            }

            socket.emit('placeBlock', { roomId, index, player: myColor });
        } else {
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

    // === 게임 로직 ===
    function updateBlockCountsOnMove() {
        if (currentPlayer === "red") {
            redCount--;
        } else if (currentPlayer === "blue") {
            blueCount--;
        }
        updateBlockCounts();
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

    // === 이모티콘 ===
    const emojiBtns = document.querySelectorAll(".emoji-btn");
    emojiBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const emoji = btn.dataset.emoji;
            if (gameMode === 'online' && roomId) {
                socket.emit('sendEmoji', { roomId, emoji });
            }
        });
    });

    function displayEmoji(emoji) {
        emojiDisplay.innerHTML = `<span class="emoji-animation">${emoji}</span>`;
        setTimeout(() => {
            emojiDisplay.innerHTML = "";
        }, 1000);
    }

    // === 컨트롤 버튼 ===
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

    exitButton.addEventListener("click", () => {
        if (gameMode === 'online') {
            socket.emit('exitGame', { roomId });
        }
        window.location.reload();
    });

    // === Socket.io 이벤트 ===
    socket.on('updateOnlineUsers', (users) => {
        renderOnlineUsers(users);
    });

    socket.on('chatMessage', (data) => {
        const messageDiv = document.createElement("div");
        messageDiv.className = "chat-message";
        messageDiv.innerHTML = `<span class="username">${data.nickname}:</span>${data.message}`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    socket.on('matchRequest', (data) => {
        currentMatchRequest = data;
        matchRequestText.textContent = `${data.requesterNickname}님이 매칭을 요청했습니다.`;
        matchRequestModal.classList.remove("hidden");
    });

    socket.on('matchAccepted', (data) => {
        roomId = data.roomId;
        myColor = data.color;
        opponentNickname = data.opponentNickname;
        isMyTurn = myColor === 'red';
        onlineLobby.classList.add("hidden");
        startGame();
        opponentNameDiv.textContent = `상대: ${opponentNickname}`;
        statusMessage.textContent = `게임 시작! 당신은 ${myColor.toUpperCase()} 입니다.`;
        updateTurnIndicator();
    });

    socket.on('matchDeclined', (data) => {
        alert(`${data.targetNickname}님이 매칭을 거절했습니다.`);
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

    socket.on('receiveEmoji', (data) => {
        displayEmoji(data.emoji);
    });

    socket.on('opponentDisconnected', () => {
        alert("상대방이 연결을 끊었습니다.");
        window.location.reload();
    });

    socket.on('error', (data) => {
        alert(data.message);
    });
});
