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
    let sentChatMessages = new Set();

    // === 로그인 ===
    loginButton.addEventListener("click", handleLogin);
    nicknameInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleLogin();
    });

    function handleLogin() {
