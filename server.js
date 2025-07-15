const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// 게임 상태 관리
const games = new Map();
const players = new Map();

// 오목 보드 크기 (초기)
const INITIAL_BOARD_SIZE = 15;
const MAX_BOARD_SIZE = 25; // 최대 보드 크기

// 게임 생성 함수
function createGame(gameId) {
  const board = Array(INITIAL_BOARD_SIZE)
    .fill()
    .map(() => Array(INITIAL_BOARD_SIZE).fill(null));
  return {
    id: gameId,
    board: board,
    boardSize: INITIAL_BOARD_SIZE,
    players: [],
    playerInfo: {},
    currentPlayer: 0,
    gameOver: false,
    winner: null,
  };
}

// 보드 확장 함수
function expandBoard(game) {
  if (game.boardSize >= MAX_BOARD_SIZE) {
    return false; // 최대 크기에 도달
  }

  const newSize = game.boardSize + 2;
  const newBoard = Array(newSize)
    .fill()
    .map(() => Array(newSize).fill(null));

  // 기존 보드 내용을 새 보드의 중앙에 복사
  const offset = 1;
  for (let row = 0; row < game.boardSize; row++) {
    for (let col = 0; col < game.boardSize; col++) {
      newBoard[row + offset][col + offset] = game.board[row][col];
    }
  }

  game.board = newBoard;
  game.boardSize = newSize;
  return true;
}

// 승리 조건 확인
function checkWin(board, row, col, player) {
  const boardSize = board.length;
  const directions = [
    [
      [0, 1],
      [0, -1],
    ], // 가로
    [
      [1, 0],
      [-1, 0],
    ], // 세로
    [
      [1, 1],
      [-1, -1],
    ], // 대각선 ↘↖
    [
      [1, -1],
      [-1, 1],
    ], // 대각선 ↗↙
  ];

  for (const direction of directions) {
    let count = 1;

    for (const [dr, dc] of direction) {
      let r = row + dr;
      let c = col + dc;

      while (
        r >= 0 &&
        r < boardSize &&
        c >= 0 &&
        c < boardSize &&
        board[r][c] === player
      ) {
        count++;
        r += dr;
        c += dc;
      }
    }

    if (count >= 5) return true;
  }

  return false;
}

// 보드가 가득 찼는지 확인
function isBoardFull(board) {
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board.length; col++) {
      if (board[row][col] === null) {
        return false;
      }
    }
  }
  return true;
}

io.on("connection", (socket) => {
  console.log("사용자가 연결됨:", socket.id);

  // 게임 참가
  socket.on("joinGame", (data) => {
    const { gameId, nickname } = data;

    let game = games.get(gameId);

    if (!game) {
      game = createGame(gameId);
      games.set(gameId, game);
    }

    if (game.players.length >= 2) {
      socket.emit("error", "게임이 가득 찼습니다.");
      return;
    }

    const playerId = game.players.length;
    game.players.push(socket.id);
    game.playerInfo[playerId] = { nickname };
    players.set(socket.id, { gameId, playerId, nickname });

    socket.join(gameId);

    // 플레이어 정보 전송
    const playerInfo = {
      0: { nickname: game.playerInfo[0]?.nickname || "대기 중..." },
      1: { nickname: game.playerInfo[1]?.nickname || "대기 중..." },
    };

    socket.emit("gameJoined", {
      gameId,
      playerId,
      nickname,
      board: game.board,
      players: playerInfo,
    });

    // 다른 플레이어들에게 새 플레이어 입장 알림
    socket.to(gameId).emit("playerJoined", { players: playerInfo });

    if (game.players.length === 2) {
      io.to(gameId).emit("gameStart", {
        currentPlayer: 0,
        players: playerInfo,
      });
    }
  });

  // 돌 놓기
  socket.on("placeStone", ({ row, col }) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const game = games.get(playerInfo.gameId);
    if (!game || game.gameOver) return;

    // 현재 플레이어 차례인지 확인
    if (game.currentPlayer !== playerInfo.playerId) {
      socket.emit("error", "아직 당신 차례가 아닙니다.");
      return;
    }

    // 이미 돌이 놓인 곳인지 확인
    if (game.board[row][col] !== null) {
      socket.emit("error", "이미 돌이 놓인 곳입니다.");
      return;
    }

    // 돌 놓기
    game.board[row][col] = playerInfo.playerId;

    // 승리 확인
    if (checkWin(game.board, row, col, playerInfo.playerId)) {
      game.gameOver = true;
      game.winner = playerInfo.playerId;
      io.to(playerInfo.gameId).emit("gameOver", {
        winner: playerInfo.playerId,
        board: game.board,
        boardSize: game.boardSize,
      });
    } else {
      // 보드가 가득 찬 경우 확장 시도
      if (isBoardFull(game.board)) {
        if (expandBoard(game)) {
          // 보드 확장 성공 - 게임 계속
          io.to(playerInfo.gameId).emit("boardExpanded", {
            board: game.board,
            boardSize: game.boardSize,
            currentPlayer: (game.currentPlayer + 1) % 2,
          });
        } else {
          // 최대 크기에 도달 - 무승부
          game.gameOver = true;
          game.winner = -1; // -1은 무승부를 의미
          io.to(playerInfo.gameId).emit("gameOver", {
            winner: -1,
            board: game.board,
            boardSize: game.boardSize,
          });
        }
      } else {
        // 다음 플레이어로 턴 변경
        game.currentPlayer = (game.currentPlayer + 1) % 2;
        io.to(playerInfo.gameId).emit("stonePlaced", {
          row,
          col,
          player: playerInfo.playerId,
          currentPlayer: game.currentPlayer,
          board: game.board,
          boardSize: game.boardSize,
        });
      }
    }
  });

  // 게임 재시작
  socket.on("restartGame", () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const game = games.get(playerInfo.gameId);
    if (!game) return;

    // 두 플레이어 모두 재시작을 요청했는지 확인
    game.restartRequests = game.restartRequests || new Set();
    game.restartRequests.add(socket.id);

    if (game.restartRequests.size === 2) {
      // 게임 재시작
      game.board = Array(INITIAL_BOARD_SIZE)
        .fill()
        .map(() => Array(INITIAL_BOARD_SIZE).fill(null));
      game.boardSize = INITIAL_BOARD_SIZE;
      game.currentPlayer = 0;
      game.gameOver = false;
      game.winner = null;
      game.restartRequests.clear();

      io.to(playerInfo.gameId).emit("gameRestarted", {
        board: game.board,
        boardSize: game.boardSize,
        currentPlayer: 0,
      });
    }
  });

  // 연결 해제
  socket.on("disconnect", () => {
    console.log("사용자 연결 해제:", socket.id);

    const playerInfo = players.get(socket.id);
    if (playerInfo) {
      const game = games.get(playerInfo.gameId);
      if (game) {
        game.players = game.players.filter((id) => id !== socket.id);
        delete game.playerInfo[playerInfo.playerId];

        if (game.players.length === 0) {
          games.delete(playerInfo.gameId);
        } else {
          // 남은 플레이어들에게 업데이트된 플레이어 정보 전송
          const remainingPlayerInfo = {
            0: { nickname: game.playerInfo[0]?.nickname || "대기 중..." },
            1: { nickname: game.playerInfo[1]?.nickname || "대기 중..." },
          };

          io.to(playerInfo.gameId).emit("playerLeft", {
            playerId: playerInfo.playerId,
            players: remainingPlayerInfo,
          });
        }
      }
      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`http://localhost:${PORT}에서 게임에 접속하세요.`);
});
