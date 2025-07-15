// Socket.IO 연결
const socket = io();

// 게임 상태
let gameState = {
  gameId: null,
  playerId: null,
  nickname: null,
  board: null,
  currentPlayer: 0,
  gameOver: false,
  players: {
    0: { nickname: "대기 중..." },
    1: { nickname: "대기 중..." },
  },
};

// DOM 요소들
const lobby = document.getElementById("lobby");
const game = document.getElementById("game");
const gameOver = document.getElementById("gameOver");
const gameIdInput = document.getElementById("gameId");
const joinBtn = document.getElementById("joinBtn");
const createBtn = document.getElementById("createBtn");
const customGameIdInput = document.getElementById("customGameId");
const nicknameInput = document.getElementById("nickname");
const createNicknameInput = document.getElementById("createNickname");
const player1Name = document.getElementById("player1Name");
const player2Name = document.getElementById("player2Name");

// 탭 요소들
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const board = document.getElementById("board");
const ctx = board.getContext("2d");
const statusText = document.getElementById("statusText");
const currentPlayerIndicator = document.getElementById("currentPlayer");
const restartBtn = document.getElementById("restartBtn");
const leaveBtn = document.getElementById("leaveBtn");
const winnerText = document.getElementById("winnerText");
const winnerStone = document.getElementById("winnerStone");
const playAgainBtn = document.getElementById("playAgainBtn");
const newGameBtn = document.getElementById("newGameBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomLevel = document.getElementById("zoomLevel");

// 보드 설정
const INITIAL_BOARD_SIZE = 15;
const BASE_CELL_SIZE = 40;
const BASE_STONE_RADIUS = 18;

// 보드 상태
let boardSize = INITIAL_BOARD_SIZE;

// 확대/축소 상태
let currentZoom = 1;
let cellSize = BASE_CELL_SIZE;
let stoneRadius = BASE_STONE_RADIUS;

// 보드 그리기
function drawBoard() {
  ctx.clearRect(0, 0, board.width, board.height);

  // 배경 그라데이션
  const gradient = ctx.createLinearGradient(0, 0, board.width, board.height);
  gradient.addColorStop(0, "#deb887");
  gradient.addColorStop(1, "#d2b48c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, board.width, board.height);

  // 격자 그리기
  ctx.strokeStyle = "#8B4513";
  ctx.lineWidth = Math.max(1, currentZoom * 0.5);

  for (let i = 0; i < boardSize; i++) {
    // 세로선
    ctx.beginPath();
    ctx.moveTo(cellSize * (i + 1), cellSize);
    ctx.lineTo(cellSize * (i + 1), cellSize * boardSize);
    ctx.stroke();

    // 가로선
    ctx.beginPath();
    ctx.moveTo(cellSize, cellSize * (i + 1));
    ctx.lineTo(cellSize * boardSize, cellSize * (i + 1));
    ctx.stroke();
  }

  // 격자점 그리기 (보드 크기에 따라 동적 조정)
  const starPoints = [];
  if (boardSize >= 15) {
    // 15x15 이상일 때 전통적인 격자점
    const center = Math.floor(boardSize / 2);
    const quarter = Math.floor(boardSize / 4);
    starPoints.push(quarter, center, boardSize - 1 - quarter);
  }

  ctx.fillStyle = "#8B4513";
  for (let row of starPoints) {
    for (let col of starPoints) {
      ctx.beginPath();
      ctx.arc(
        cellSize * (col + 1),
        cellSize * (row + 1),
        Math.max(3, currentZoom * 2),
        0,
        2 * Math.PI
      );
      ctx.fill();
    }
  }

  // 돌 그리기
  if (gameState.board) {
    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        if (gameState.board[row][col] !== null) {
          drawStone(row, col, gameState.board[row][col]);
        }
      }
    }
  }
}

// 돌 그리기
function drawStone(row, col, player) {
  const x = (col + 1) * cellSize;
  const y = (row + 1) * cellSize;

  ctx.beginPath();
  ctx.arc(x, y, stoneRadius, 0, 2 * Math.PI);

  if (player === 0) {
    // 검은 돌
    const blackGradient = ctx.createRadialGradient(
      x - 3,
      y - 3,
      0,
      x,
      y,
      stoneRadius
    );
    blackGradient.addColorStop(0, "#666");
    blackGradient.addColorStop(1, "#000");
    ctx.fillStyle = blackGradient;
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = Math.max(1, currentZoom * 0.5);
    ctx.stroke();

    // 하이라이트
    ctx.beginPath();
    ctx.arc(
      x - stoneRadius * 0.3,
      y - stoneRadius * 0.3,
      stoneRadius * 0.3,
      0,
      2 * Math.PI
    );
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fill();
  } else {
    // 흰 돌
    const whiteGradient = ctx.createRadialGradient(
      x - 3,
      y - 3,
      0,
      x,
      y,
      stoneRadius
    );
    whiteGradient.addColorStop(0, "#fff");
    whiteGradient.addColorStop(1, "#f0f0f0");
    ctx.fillStyle = whiteGradient;
    ctx.fill();
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = Math.max(1, currentZoom * 0.5);
    ctx.stroke();

    // 그림자
    ctx.beginPath();
    ctx.arc(
      x + stoneRadius * 0.1,
      y + stoneRadius * 0.1,
      stoneRadius,
      0,
      2 * Math.PI
    );
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fill();
  }
}

// 마우스 클릭 처리
board.addEventListener("click", (e) => {
  if (gameState.gameOver) return;

  const rect = board.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const col = Math.round(x / cellSize - 1);
  const row = Math.round(y / cellSize - 1);

  if (row >= 0 && row < boardSize && col >= 0 && col < boardSize) {
    socket.emit("placeStone", { row, col });
  }
});

// 닉네임 유효성 검사
function validateNickname(nickname) {
  if (!nickname || nickname.trim() === "") {
    alert("닉네임을 입력해주세요!");
    return false;
  }
  if (nickname.length < 2) {
    alert("닉네임은 최소 2자 이상이어야 합니다!");
    return false;
  }
  if (nickname.length > 15) {
    alert("닉네임은 최대 15자까지 입력할 수 있습니다!");
    return false;
  }
  return true;
}

// 탭 전환 기능
function switchTab(tabName) {
  // 모든 탭 버튼에서 active 클래스 제거
  tabBtns.forEach((btn) => btn.classList.remove("active"));
  // 모든 탭 콘텐츠에서 active 클래스 제거
  tabContents.forEach((content) => content.classList.remove("active"));

  // 선택된 탭 활성화
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById(`${tabName}-tab`).classList.add("active");
}

// 탭 클릭 이벤트
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.getAttribute("data-tab");
    switchTab(tabName);
  });
});

// 게임 참가 함수
function joinGame() {
  const nickname = nicknameInput.value.trim();
  const gameId = gameIdInput.value.trim();

  if (!validateNickname(nickname)) {
    return;
  }

  if (gameId) {
    // 게임 코드 유효성 검사
    if (gameId.length < 3) {
      alert("게임 코드는 최소 3자 이상이어야 합니다!");
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(gameId)) {
      alert("게임 코드는 영문자와 숫자만 사용할 수 있습니다!");
      return;
    }
    socket.emit("joinGame", { gameId, nickname });
  } else {
    alert("게임 코드를 입력해주세요!");
  }
}

// 게임 참가 버튼 클릭
joinBtn.addEventListener("click", joinGame);

// Enter 키로 게임 참가
gameIdInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    joinGame();
  }
});

// 새 게임 만들기 함수
function createGame() {
  const nickname = createNicknameInput.value.trim();
  let customGameId = customGameIdInput.value.trim();

  if (!validateNickname(nickname)) {
    return;
  }

  // 게임 코드가 없으면 자동으로 랜덤 생성
  if (!customGameId) {
    customGameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    customGameIdInput.value = customGameId;
  } else {
    // 게임 코드 유효성 검사
    if (customGameId.length < 3) {
      alert("게임 코드는 최소 3자 이상이어야 합니다!");
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(customGameId)) {
      alert("게임 코드는 영문자와 숫자만 사용할 수 있습니다!");
      return;
    }
  }

  // 게임 생성
  socket.emit("joinGame", { gameId: customGameId, nickname });
}

// 새 게임 만들기 버튼 클릭
createBtn.addEventListener("click", createGame);

// Enter 키로 새 게임 만들기
customGameIdInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    createGame();
  }
});

// Enter 키로 닉네임 입력 (새 게임 탭)
createNicknameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    createGame();
  }
});

// 확대/축소 기능
function updateZoom(newZoom) {
  currentZoom = Math.max(0.5, Math.min(2, newZoom));
  cellSize = BASE_CELL_SIZE * currentZoom;
  stoneRadius = BASE_STONE_RADIUS * currentZoom;

  // 캔버스 크기 업데이트
  const newSize = boardSize * cellSize + cellSize * 2;
  board.width = newSize;
  board.height = newSize;

  // 확대/축소 레벨 표시 업데이트
  zoomLevel.textContent = Math.round(currentZoom * 100) + "%";

  // 버튼 상태 업데이트
  zoomInBtn.disabled = currentZoom >= 2;
  zoomOutBtn.disabled = currentZoom <= 0.5;

  // 보드 다시 그리기
  drawBoard();
}

// 확대 버튼
zoomInBtn.addEventListener("click", () => {
  updateZoom(currentZoom + 0.1);
});

// 축소 버튼
zoomOutBtn.addEventListener("click", () => {
  updateZoom(currentZoom - 0.1);
});

// 마우스 휠로 확대/축소
board.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  updateZoom(currentZoom + delta);
});

// 게임 재시작
restartBtn.addEventListener("click", () => {
  socket.emit("restartGame");
});

// 게임 나가기
leaveBtn.addEventListener("click", () => {
  showLobby();
});

// 다시 하기
playAgainBtn.addEventListener("click", () => {
  hideGameOver();
  socket.emit("restartGame");
});

// 새 게임
newGameBtn.addEventListener("click", () => {
  hideGameOver();
  showLobby();
});

// 로비 표시
function showLobby() {
  lobby.classList.remove("hidden");
  game.classList.add("hidden");
  gameOver.classList.add("hidden");

  // 입력 필드 초기화
  gameIdInput.value = "";
  customGameIdInput.value = "";
  nicknameInput.value = "";
  createNicknameInput.value = "";

  // 첫 번째 탭으로 돌아가기
  switchTab("join");

  gameState = {
    gameId: null,
    playerId: null,
    nickname: null,
    board: null,
    currentPlayer: 0,
    gameOver: false,
    players: {
      0: { nickname: "대기 중..." },
      1: { nickname: "대기 중..." },
    },
  };

  updatePlayerNames();
}

// 게임 화면 표시
function showGame() {
  lobby.classList.add("hidden");
  game.classList.remove("hidden");
  gameOver.classList.add("hidden");
}

// 게임 오버 화면 표시
function showGameOver(winner) {
  gameOver.classList.remove("hidden");

  if (winner === -1) {
    // 무승부
    winnerText.textContent = "🤝 무승부입니다!";
    winnerStone.className = "stone draw";
  } else if (winner === gameState.playerId) {
    winnerText.textContent = "🎉 승리했습니다!";
    winnerStone.className = `stone ${
      gameState.playerId === 0 ? "black" : "white"
    }`;
  } else {
    winnerText.textContent = "😔 패배했습니다...";
    winnerStone.className = `stone ${
      gameState.playerId === 0 ? "white" : "black"
    }`;
  }
}

// 게임 오버 화면 숨기기
function hideGameOver() {
  gameOver.classList.add("hidden");
}

// 현재 플레이어 표시 업데이트
function updateCurrentPlayer() {
  const stone = currentPlayerIndicator.querySelector(".stone");
  stone.className = `stone ${
    gameState.currentPlayer === 0 ? "black" : "white"
  }`;
}

// 플레이어 닉네임 업데이트
function updatePlayerNames() {
  player1Name.textContent = gameState.players[0].nickname;
  player2Name.textContent = gameState.players[1].nickname;
}

// 상태 텍스트 업데이트
function updateStatus() {
  if (gameState.gameOver) {
    statusText.textContent = "게임 종료";
  } else if (gameState.currentPlayer === gameState.playerId) {
    statusText.textContent = "당신 차례입니다";
  } else {
    statusText.textContent = "상대방 차례입니다";
  }
}

// Socket.IO 이벤트 리스너들

// 게임 참가 성공
socket.on("gameJoined", (data) => {
  gameState.gameId = data.gameId;
  gameState.playerId = data.playerId;
  gameState.nickname = data.nickname;
  gameState.board = data.board;
  boardSize = data.boardSize || INITIAL_BOARD_SIZE;

  // 플레이어 정보 업데이트
  if (data.players) {
    gameState.players = data.players;
  }

  showGame();

  // 캔버스 크기 업데이트
  const newSize = boardSize * cellSize + cellSize * 2;
  board.width = newSize;
  board.height = newSize;

  drawBoard();
  updateStatus();
  updatePlayerNames();

  console.log(
    `게임 ${data.gameId}에 참가했습니다. 플레이어 ${data.playerId + 1} (${
      data.nickname
    })`
  );
});

// 플레이어 입장
socket.on("playerJoined", (data) => {
  if (data.players) {
    gameState.players = data.players;
    updatePlayerNames();
  }
});

// 게임 시작
socket.on("gameStart", (data) => {
  gameState.currentPlayer = data.currentPlayer;

  // 플레이어 정보 업데이트
  if (data.players) {
    gameState.players = data.players;
    updatePlayerNames();
  }

  updateCurrentPlayer();
  updateStatus();

  if (gameState.currentPlayer === gameState.playerId) {
    statusText.textContent = "게임이 시작되었습니다! 당신 차례입니다.";
  } else {
    statusText.textContent = "게임이 시작되었습니다! 상대방 차례입니다.";
  }
});

// 돌이 놓임
socket.on("stonePlaced", (data) => {
  gameState.board = data.board;
  boardSize = data.boardSize || boardSize;
  gameState.currentPlayer = data.currentPlayer;

  drawBoard();
  updateCurrentPlayer();
  updateStatus();
});

// 게임 종료
socket.on("gameOver", (data) => {
  gameState.gameOver = true;
  gameState.board = data.board;
  boardSize = data.boardSize || boardSize;
  gameState.winner = data.winner;

  drawBoard();
  updateStatus();
  showGameOver(data.winner);
});

// 보드 확장
socket.on("boardExpanded", (data) => {
  gameState.board = data.board;
  boardSize = data.boardSize;
  gameState.currentPlayer = data.currentPlayer;

  // 캔버스 크기 업데이트
  const newSize = boardSize * cellSize + cellSize * 2;
  board.width = newSize;
  board.height = newSize;

  drawBoard();
  updateCurrentPlayer();
  updateStatus();

  // 보드 확장 알림
  statusText.textContent = `보드가 ${boardSize}x${boardSize}로 확장되었습니다!`;
  setTimeout(() => {
    updateStatus();
  }, 2000);
});

// 게임 재시작
socket.on("gameRestarted", (data) => {
  gameState.board = data.board;
  boardSize = data.boardSize || INITIAL_BOARD_SIZE;
  gameState.currentPlayer = data.currentPlayer;
  gameState.gameOver = false;
  gameState.winner = null;

  // 캔버스 크기 업데이트
  const newSize = boardSize * cellSize + cellSize * 2;
  board.width = newSize;
  board.height = newSize;

  hideGameOver();
  drawBoard();
  updateCurrentPlayer();
  updateStatus();
});

// 플레이어 나감
socket.on("playerLeft", (data) => {
  if (data.players) {
    gameState.players = data.players;
    updatePlayerNames();
  }
  alert("상대방이 게임을 나갔습니다.");
  showLobby();
});

// 에러 메시지
socket.on("error", (message) => {
  alert(message);
});

// 초기 보드 그리기
updateZoom(1); // 초기 확대/축소 설정
updatePlayerNames();
