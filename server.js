const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// 사용자 및 룸 관리
const users = new Map();
const rooms = new Map();
const lobbyUsers = new Set();

io.on('connection', (socket) => {
    console.log('새로운 연결:', socket.id);

    // 로그인
    socket.on('login', ({ nickname }) => {
        users.set(socket.id, { id: socket.id, nickname, inLobby: false });
        console.log(`${nickname} 로그인`);
    });

    // 로비 입장
    socket.on('enterLobby', () => {
        const user = users.get(socket.id);
        if (user) {
            user.inLobby = true;
            lobbyUsers.add(socket.id);
            broadcastOnlineUsers();
        }
    });

    // 로비 퇴장
    socket.on('leaveLobby', () => {
        const user = users.get(socket.id);
        if (user) {
            user.inLobby = false;
            lobbyUsers.delete(socket.id);
            broadcastOnlineUsers();
        }
    });

    // 온라인 유저 목록 브로드캐스트
    function broadcastOnlineUsers() {
        const onlineUsers = Array.from(lobbyUsers)
            .map(id => users.get(id))
            .filter(user => user && user.inLobby);
        
        lobbyUsers.forEach(userId => {
            io.to(userId).emit('updateOnlineUsers', onlineUsers);
        });
    }

    // 채팅 메시지
    socket.on('chatMessage', ({ message }) => {
        const user = users.get(socket.id);
        if (user && user.inLobby) {
            lobbyUsers.forEach(userId => {
                io.to(userId).emit('chatMessage', {
                    nickname: user.nickname,
                    message
                });
            });
        }
    });

    // 매칭 요청
    socket.on('sendMatchRequest', ({ targetId }) => {
        const requester = users.get(socket.id);
        const target = users.get(targetId);
        
        if (requester && target) {
            io.to(targetId).emit('matchRequest', {
                requesterId: socket.id,
                requesterNickname: requester.nickname
            });
        }
    });

    // 매칭 수락
    socket.on('acceptMatch', ({ requesterId }) => {
        const requester = users.get(requesterId);
        const accepter = users.get(socket.id);
        
        if (!requester || !accepter) return;

        const roomId = `room_${requesterId}_${socket.id}`;
        
        socket.join(roomId);
        io.sockets.sockets.get(requesterId).join(roomId);

        const players = {
            red: requesterId,
            blue: socket.id
        };

        rooms.set(roomId, {
            players,
            currentPlayer: 'red',
            centralBlockPlaced: false,
            redCount: 23,
            blueCount: 24,
            board: Array(49).fill(null),
            moveHistory: []
        });

        // 로비에서 제거
        requester.inLobby = false;
        accepter.inLobby = false;
        lobbyUsers.delete(requesterId);
        lobbyUsers.delete(socket.id);
        broadcastOnlineUsers();

        // 게임 시작 알림
        io.to(requesterId).emit('matchAccepted', {
            roomId,
            color: 'red',
            opponentNickname: accepter.nickname
        });
        
        io.to(socket.id).emit('matchAccepted', {
            roomId,
            color: 'blue',
            opponentNickname: requester.nickname
        });

        console.log(`게임 시작: ${roomId}`);
    });

    // 매칭 거절
    socket.on('declineMatch', ({ requesterId }) => {
        const requester = users.get(requesterId);
        const decliner = users.get(socket.id);
        
        if (requester && decliner) {
            io.to(requesterId).emit('matchDeclined', {
                targetNickname: decliner.nickname
            });
        }
    });

    // 중앙 블록 배치
    socket.on('placeCentralBlock', ({ roomId, index, player }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        if (room.centralBlockPlaced) {
            socket.emit('error', { message: '중앙 블록이 이미 배치되었습니다!' });
            return;
        }

        room.board[index] = player;
        room.centralBlockPlaced = true;
        room.moveHistory.push({ index, player });

        if (player === 'red') {
            room.redCount--;
        } else {
            room.blueCount--;
        }

        io.to(roomId).emit('centralBlockPlaced', {
            index,
            player,
            redCount: room.redCount,
            blueCount: room.blueCount
        });

        room.currentPlayer = room.currentPlayer === 'red' ? 'blue' : 'red';
        io.to(roomId).emit('turnChange', { currentPlayer: room.currentPlayer });
    });

    // 블록 배치
    socket.on('placeBlock', ({ roomId, index, player }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        if (room.players[room.currentPlayer] !== socket.id) {
            socket.emit('error', { message: '당신의 차례가 아닙니다!' });
            return;
        }

        room.board[index] = player;
        room.moveHistory.push({ index, player });

        if (player === 'red') {
            room.redCount--;
        } else {
            room.blueCount--;
        }

        io.to(roomId).emit('blockPlaced', {
            index,
            player,
            redCount: room.redCount,
            blueCount: room.blueCount
        });

        if (checkVictory(room.board, index, player)) {
            io.to(roomId).emit('gameOver', { winner: player });
            cleanupRoom(roomId);
            return;
        }

        if (room.redCount === 0 && room.blueCount === 0) {
            io.to(roomId).emit('gameOver', { winner: 'draw' });
            cleanupRoom(roomId);
            return;
        }

        room.currentPlayer = room.currentPlayer === 'red' ? 'blue' : 'red';
        io.to(roomId).emit('turnChange', { currentPlayer: room.currentPlayer });
    });

    // 실행 취소
    socket.on('undoMove', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.moveHistory.length === 0) return;

        const lastMove = room.moveHistory.pop();
        
        if (lastMove.index === 24 && room.moveHistory.length === 0) {
            room.moveHistory.push(lastMove);
            socket.emit('error', { message: '중앙 블록은 되돌릴 수 없습니다!' });
            return;
        }

        room.board[lastMove.index] = null;

        if (lastMove.player === 'red') {
            room.redCount++;
        } else {
            room.blueCount++;
        }

        room.currentPlayer = room.currentPlayer === 'red' ? 'blue' : 'red';

        io.to(roomId).emit('moveUndone', {
            index: lastMove.index,
            redCount: room.redCount,
            blueCount: room.blueCount,
            currentPlayer: room.currentPlayer
        });
    });

    // 이모티콘 전송
    socket.on('sendEmoji', ({ roomId, emoji }) => {
        io.to(roomId).emit('receiveEmoji', { emoji });
    });

    // 게임 종료
    socket.on('exitGame', ({ roomId }) => {
        io.to(roomId).emit('opponentDisconnected');
        cleanupRoom(roomId);
    });

    // 연결 해제
    socket.on('disconnect', () => {
        console.log('연결 해제:', socket.id);

        const user = users.get(socket.id);
        if (user && user.inLobby) {
            lobbyUsers.delete(socket.id);
            broadcastOnlineUsers();
        }

        rooms.forEach((room, roomId) => {
            if (room.players.red === socket.id || room.players.blue === socket.id) {
                io.to(roomId).emit('opponentDisconnected');
                cleanupRoom(roomId);
            }
        });

        users.delete(socket.id);
    });

    function cleanupRoom(roomId) {
        const room = rooms.get(roomId);
        if (room) {
            const redUser = users.get(room.players.red);
            const blueUser = users.get(room.players.blue);
            
            if (redUser) {
                redUser.inLobby = false;
            }
            if (blueUser) {
                blueUser.inLobby = false;
            }
            
            rooms.delete(roomId);
        }
    }
});

function checkVictory(board, lastIndex, player) {
    const directions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1]
    ];

    for (const [dx, dy] of directions) {
        let count = 1;

        for (let step = 1; step <= 3; step++) {
            const nx = Math.floor(lastIndex / 7) + dx * step;
            const ny = (lastIndex % 7) + dy * step;
            if (nx >= 0 && ny >= 0 && nx < 7 && ny < 7) {
                const nextIndex = nx * 7 + ny;
                if (board[nextIndex] === player) {
                    count++;
                } else {
                    break;
                }
            }
        }

        for (let step = 1; step <= 3; step++) {
            const nx = Math.floor(lastIndex / 7) - dx * step;
            const ny = (lastIndex % 7) - dy * step;
            if (nx >= 0 && ny >= 0 && nx < 7 && ny < 7) {
                const prevIndex = nx * 7 + ny;
                if (board[prevIndex] === player) {
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

server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
