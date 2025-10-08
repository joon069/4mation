const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));

// 게임 룸 관리
const rooms = new Map();
const waitingPlayers = [];

io.on('connection', (socket) => {
    console.log('새로운 플레이어 연결:', socket.id);

    // 온라인 매칭 요청
    socket.on('findMatch', () => {
        if (waitingPlayers.length > 0) {
            // 대기 중인 플레이어와 매칭
            const opponent = waitingPlayers.shift();
            const roomId = `room_${socket.id}_${opponent.id}`;
            
            socket.join(roomId);
            opponent.join(roomId);

            const players = {
                red: socket.id,
                blue: opponent.id
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

            // 양쪽 플레이어에게 게임 시작 알림
            socket.emit('gameStart', { roomId, color: 'red', opponentId: opponent.id });
            opponent.emit('gameStart', { roomId, color: 'blue', opponentId: socket.id });

            console.log(`게임 시작: ${roomId}`);
        } else {
            // 대기열에 추가
            waitingPlayers.push(socket);
            socket.emit('waiting');
            console.log('플레이어 대기 중:', socket.id);
        }
    });

    // 블록 배치
    socket.on('placeBlock', ({ roomId, index, player }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        // 현재 플레이어 차례 확인
        if (room.players[room.currentPlayer] !== socket.id) {
            socket.emit('error', { message: '당신의 차례가 아닙니다!' });
            return;
        }

        // 게임 상태 업데이트
        room.board[index] = player;
        room.moveHistory.push({ index, player });

        // 블록 개수 업데이트
        if (player === 'red') {
            room.redCount--;
        } else {
            room.blueCount--;
        }

        // 모든 플레이어에게 업데이트 브로드캐스트
        io.to(roomId).emit('blockPlaced', {
            index,
            player,
            redCount: room.redCount,
            blueCount: room.blueCount
        });

        // 승리 확인
        if (checkVictory(room.board, index, player)) {
            io.to(roomId).emit('gameOver', { winner: player });
            rooms.delete(roomId);
            return;
        }

        // 무승부 확인
        if (room.redCount === 0 && room.blueCount === 0) {
            io.to(roomId).emit('gameOver', { winner: 'draw' });
            rooms.delete(roomId);
            return;
        }

        // 턴 변경
        room.currentPlayer = room.currentPlayer === 'red' ? 'blue' : 'red';
        io.to(roomId).emit('turnChange', { currentPlayer: room.currentPlayer });
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

        io.to(roomId).emit('centralBlockPlaced', {
            index,
            player,
            redCount: room.redCount,
            blueCount: room.blueCount
        });

        room.currentPlayer = room.currentPlayer === 'red' ? 'blue' : 'red';
        io.to(roomId).emit('turnChange', { currentPlayer: room.currentPlayer });
    });

    // 실행 취소
    socket.on('undoMove', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.moveHistory.length === 0) return;

        const lastMove = room.moveHistory.pop();
        
        // 중앙 블록은 실행 취소 불가
        if (lastMove.index === 24 && room.moveHistory.length === 1) {
            room.moveHistory.push(lastMove);
            socket.emit('error', { message: '중앙 블록은 되돌릴 수 없습니다!' });
            return;
        }

        room.board[lastMove.index] = null;

        // 블록 개수 복원
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

    // 연결 해제
    socket.on('disconnect', () => {
        console.log('플레이어 연결 해제:', socket.id);

        // 대기열에서 제거
        const waitingIndex = waitingPlayers.indexOf(socket);
        if (waitingIndex > -1) {
            waitingPlayers.splice(waitingIndex, 1);
        }

        // 진행 중인 게임에서 상대방에게 알림
        rooms.forEach((room, roomId) => {
            if (room.players.red === socket.id || room.players.blue === socket.id) {
                io.to(roomId).emit('opponentDisconnected');
                rooms.delete(roomId);
            }
        });
    });
});

// 승리 확인 함수
function checkVictory(board, lastIndex, player) {
    const directions = [
        [0, 1],   // 가로
        [1, 0],   // 세로
        [1, 1],   // 대각선 \
        [1, -1]   // 대각선 /
    ];

    for (const [dx, dy] of directions) {
        let count = 1;

        // 한 방향으로 확인
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

        // 반대 방향으로 확인
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
