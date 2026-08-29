/* ============================================================
   App controller — home screen (game + mode picker + history),
   and the Chess / Tic-Tac-Toe screens, each supporting both
   "vs the House" (AI) and "Two Players" (shared device) modes.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

  /* ===========================================================
     HISTORY (persisted to localStorage)
     =========================================================== */
  const HISTORY_KEY = "theStudy.history";
  const MAX_HISTORY = 40;

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function addHistoryEntry(entry) {
    const list = loadHistory();
    list.unshift({ ...entry, timestamp: new Date().toISOString() });
    saveHistory(list.slice(0, MAX_HISTORY));
    renderHistory();
  }
  function formatTimestamp(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
           d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const GAME_ICON = { chess: "♞", ttt: "✕" };
  const historyListEl = document.getElementById("historyList");
  function renderHistory() {
    const list = loadHistory();
    historyListEl.innerHTML = "";
    list.forEach(item => {
      const li = document.createElement("li");
      li.className = "history-item";
      const left = document.createElement("span");
      left.className = "history-item__result";
      left.textContent = `${GAME_ICON[item.game] || "•"} ${item.result}`;
      const right = document.createElement("span");
      right.className = "history-item__meta";
      right.textContent = `${item.modeLabel} · ${formatTimestamp(item.timestamp)}`;
      li.appendChild(left);
      li.appendChild(right);
      historyListEl.appendChild(li);
    });
  }
  document.getElementById("clearHistoryBtn").addEventListener("click", () => {
    saveHistory([]);
    renderHistory();
  });
  renderHistory();

  /* ===========================================================
     SCREEN NAVIGATION
     =========================================================== */
  const screenHome = document.getElementById("screenHome");
  const screenChess = document.getElementById("screenChess");
  const screenTtt = document.getElementById("screenTtt");

  function showScreen(name) {
    screenHome.classList.toggle("is-hidden", name !== "home");
    screenChess.classList.toggle("is-hidden", name !== "chess");
    screenTtt.classList.toggle("is-hidden", name !== "ttt");
    if (name === "home") renderHistory();
  }

  /* ===========================================================
     HOME SCREEN — game / mode picker
     =========================================================== */
  let selectedGame = "chess";
  let selectedMode = "ai";

  const chessAiSetup = document.getElementById("chessAiSetup");
  const tttAiSetup = document.getElementById("tttAiSetup");
  const aiSetupBlock = document.getElementById("aiSetupBlock");
  const twoPlayerNote = document.getElementById("twoPlayerNote");
  const twoPlayerNoteText = document.getElementById("twoPlayerNoteText");

  function refreshHomeVisibility() {
    chessAiSetup.classList.toggle("is-hidden", selectedGame !== "chess");
    tttAiSetup.classList.toggle("is-hidden", selectedGame !== "ttt");
    aiSetupBlock.classList.toggle("is-hidden", selectedMode !== "ai");
    twoPlayerNote.classList.toggle("is-hidden", selectedMode !== "2p");
    twoPlayerNoteText.textContent = selectedGame === "chess"
      ? "Player 1 takes White, Player 2 takes Black. Pass the device between turns."
      : "Player 1 plays X and moves first, Player 2 plays O. Pass the device between turns.";
  }

  document.querySelectorAll(".choice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.choice;
      document.querySelectorAll(`.choice-btn[data-choice="${group}"]`).forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      if (group === "game") selectedGame = btn.dataset.value;
      else selectedMode = btn.dataset.value;
      refreshHomeVisibility();
    });
  });
  refreshHomeVisibility();

  document.getElementById("enterStudyBtn").addEventListener("click", () => {
    if (selectedGame === "chess") {
      startChessGame(selectedMode);
      showScreen("chess");
    } else {
      startTttGame(selectedMode);
      showScreen("ttt");
    }
  });

  document.getElementById("chessBackBtn").addEventListener("click", () => showScreen("home"));
  document.getElementById("tttBackBtn").addEventListener("click", () => showScreen("home"));
  document.getElementById("chessRematchBtn").addEventListener("click", () => startChessGame(chessMode));
  document.getElementById("tttRematchBtn").addEventListener("click", () => startTttGame(tttMode));

  /* ===========================================================
     CHESS
     =========================================================== */
  const PIECE_GLYPH = {
    wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
    bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟"
  };

  const chessBoardEl = document.getElementById("chessBoard");
  const chessRanksEl = document.getElementById("chessRanks");
  const chessFilesEl = document.getElementById("chessFiles");
  const chessStatusEl = document.getElementById("chessStatus");
  const chessSideSel = document.getElementById("chessSide");
  const chessDiffSel = document.getElementById("chessDifficulty");
  const chessMoveLogEl = document.getElementById("chessMoveLog");
  const chessCapByWhiteEl = document.getElementById("chessCapturedByWhite");
  const chessCapByBlackEl = document.getElementById("chessCapturedByBlack");

  let chessState = null;
  let chessMode = "ai";         // "ai" | "2p"
  let humanColor = "w";
  let aiColor = "b";
  let chessDepth = 2;
  let selected = null;
  let selectedLegalMoves = [];
  let chessOver = false;
  let capturedByWhite = [];     // black pieces White has captured
  let capturedByBlack = [];     // white pieces Black has captured
  let aiThinking = false;

  const DEPTH_BY_DIFFICULTY = { "1": 1, "2": 2, "3": 3 };

  function buildChessBoardDom() {
    chessBoardEl.innerHTML = "";
    chessRanksEl.innerHTML = "";
    chessFilesEl.innerHTML = "";
    for (let visRow = 0; visRow < 8; visRow++) {
      const rankSpan = document.createElement("span");
      rankSpan.textContent = 8 - visRow;
      chessRanksEl.appendChild(rankSpan);
    }
    "abcdefgh".split("").forEach(f => {
      const fileSpan = document.createElement("span");
      fileSpan.textContent = f;
      chessFilesEl.appendChild(fileSpan);
    });
    for (let visRow = 0; visRow < 8; visRow++) {
      for (let col = 0; col < 8; col++) {
        const row = 7 - visRow;
        const sq = document.createElement("div");
        sq.className = "sq " + ((row + col) % 2 === 0 ? "dark" : "light");
        sq.dataset.row = row;
        sq.dataset.col = col;
        sq.addEventListener("click", onSquareClick);
        chessBoardEl.appendChild(sq);
      }
    }
  }

  function squareEl(row, col) {
    const visRow = 7 - row;
    const index = visRow * 8 + col;
    return chessBoardEl.children[index];
  }

  function renderChessBoard() {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const el = squareEl(row, col);
        el.innerHTML = "";
        el.classList.remove("selected", "legal", "legal-capture", "last-from", "last-to", "in-check");
        const piece = chessState.board[row][col];
        if (piece) {
          const span = document.createElement("span");
          span.className = "piece";
          span.textContent = PIECE_GLYPH[piece];
          el.appendChild(span);
        }
      }
    }
    if (chessState.lastMove) {
      squareEl(chessState.lastMove.from.row, chessState.lastMove.from.col).classList.add("last-from");
      squareEl(chessState.lastMove.to.row, chessState.lastMove.to.col).classList.add("last-to");
    }
    if (selected) {
      squareEl(selected.row, selected.col).classList.add("selected");
      selectedLegalMoves.forEach(m => {
        const el = squareEl(m.to.row, m.to.col);
        el.classList.add(m.capture || m.enPassant ? "legal-capture" : "legal");
      });
    }
    const king = ChessEngine.findKing(chessState, chessState.turn);
    if (king && ChessEngine.isInCheck(chessState, chessState.turn)) {
      squareEl(king.row, king.col).classList.add("in-check");
    }
  }

  function renderCaptured() {
    chessCapByWhiteEl.textContent = capturedByWhite.map(p => PIECE_GLYPH[p]).join(" ");
    chessCapByBlackEl.textContent = capturedByBlack.map(p => PIECE_GLYPH[p]).join(" ");
  }

  function setChessStatus(text) { chessStatusEl.textContent = text; }

  function logMove(text, color) {
    const li = document.createElement("li");
    li.textContent = (color === "w" ? "White: " : "Black: ") + text;
    chessMoveLogEl.appendChild(li);
    chessMoveLogEl.scrollTop = chessMoveLogEl.scrollHeight;
  }

  function isHumanTurnChess() {
    if (chessMode === "2p") return true;
    return chessState.turn === humanColor;
  }

  function startChessGame(mode) {
    chessMode = mode;
    chessState = ChessEngine.newGame();
    humanColor = chessSideSel.value;
    aiColor = ChessEngine.opponent(humanColor);
    chessDepth = DEPTH_BY_DIFFICULTY[chessDiffSel.value];
    selected = null;
    selectedLegalMoves = [];
    chessOver = false;
    capturedByWhite = [];
    capturedByBlack = [];
    chessMoveLogEl.innerHTML = "";
    renderCaptured();
    buildChessBoardDom();
    renderChessBoard();
    if (chessMode === "2p") {
      setChessStatus("White to move.");
    } else {
      setChessStatus(humanColor === "w" ? "White to move — that's you." : "White to move — the house opens.");
    }
    maybeTriggerAiChessMove();
  }

  function onSquareClick(e) {
    if (chessOver || aiThinking) return;
    if (!isHumanTurnChess()) return;
    const row = parseInt(e.currentTarget.dataset.row, 10);
    const col = parseInt(e.currentTarget.dataset.col, 10);
    const piece = chessState.board[row][col];

    if (selected) {
      const match = selectedLegalMoves.find(m => m.to.row === row && m.to.col === col);
      if (match) { playChessMove(match); return; }
    }
    if (piece && ChessEngine.colorOf(piece) === chessState.turn) {
      selected = { row, col };
      const all = ChessEngine.legalMovesForColor(chessState, chessState.turn);
      selectedLegalMoves = all.filter(m => m.from.row === row && m.from.col === col);
      renderChessBoard();
    } else {
      selected = null;
      selectedLegalMoves = [];
      renderChessBoard();
    }
  }

  function playChessMove(move) {
    const movingColor = chessState.turn;
    const notation = ChessEngine.moveToNotation(chessState, move);
    if (move.capture) {
      if (movingColor === "w") capturedByWhite.push(move.capture);
      else capturedByBlack.push(move.capture);
    }
    chessState = ChessEngine.applyMove(chessState, move);
    logMove(notation, movingColor);
    selected = null;
    selectedLegalMoves = [];
    renderChessBoard();
    renderCaptured();
    evaluateChessStatus();
    if (!chessOver) maybeTriggerAiChessMove();
  }

  function chessModeLabel() {
    return chessMode === "ai" ? "Vs. House" : "Two Players";
  }

  function evaluateChessStatus() {
    const status = ChessEngine.gameStatus(chessState);
    if (status.over) {
      chessOver = true;
      if (status.reason === "checkmate") {
        const winnerColor = status.result.startsWith("w") ? "White" : "Black";
        let resultText;
        if (chessMode === "ai") {
          const youWon = status.result.startsWith(humanColor);
          resultText = youWon ? "You won by checkmate" : "The house won by checkmate";
          setChessStatus(`Checkmate — ${winnerColor} wins.${youWon ? " Well played." : " Better luck next game."}`);
        } else {
          resultText = `${winnerColor} won by checkmate`;
          setChessStatus(`Checkmate — ${winnerColor} wins.`);
        }
        addHistoryEntry({ game: "chess", modeLabel: chessModeLabel(), result: resultText });
      } else {
        setChessStatus("Stalemate — the game is a draw.");
        addHistoryEntry({ game: "chess", modeLabel: chessModeLabel(), result: "Draw by stalemate" });
      }
      return;
    }
    const colorName = chessState.turn === "w" ? "White" : "Black";
    let whoseTurn;
    if (chessMode === "ai") {
      whoseTurn = chessState.turn === humanColor ? `Your move (${colorName}).` : `The house is thinking (${colorName})…`;
    } else {
      whoseTurn = `${colorName} to move.`;
    }
    setChessStatus((status.check ? "Check! " : "") + whoseTurn);
  }

  function maybeTriggerAiChessMove() {
    if (chessOver || chessMode !== "ai") return;
    if (chessState.turn !== aiColor) return;
    aiThinking = true;
    setChessStatus(`The house is thinking (${aiColor === "w" ? "White" : "Black"})…`);
    setTimeout(() => {
      const move = ChessEngine.bestMove(chessState, chessDepth);
      aiThinking = false;
      if (!move) { evaluateChessStatus(); return; }
      playChessMove(move);
    }, 260);
  }

  /* ===========================================================
     TIC-TAC-TOE
     =========================================================== */
  const tttGridEl = document.getElementById("tttGrid");
  const tttStatusEl = document.getElementById("tttStatus");
  const tttSideSel = document.getElementById("tttSide");
  const tttDiffSel = document.getElementById("tttDifficulty");
  const tttLabelXEl = document.getElementById("tttLabelX");
  const tttLabelOEl = document.getElementById("tttLabelO");
  const tttScoreXEl = document.getElementById("tttScoreX");
  const tttScoreOEl = document.getElementById("tttScoreO");
  const tttScoreDrawEl = document.getElementById("tttScoreDraw");

  let tttBoard = TicTacToe.emptyBoard();
  let tttMode = "ai";           // "ai" | "2p"
  let tttHuman = "X";
  let tttAI = "O";
  let tttCurrentTurn = "X";
  let tttOver = false;
  let tttDifficulty = "hard";
  let tttScore = { x: 0, o: 0, draw: 0 };

  function markSVG(mark) {
    if (mark === "X") {
      return `<svg viewBox="0 0 100 100" class="mark-x">
        <line x1="20" y1="20" x2="80" y2="80"/>
        <line x1="80" y1="20" x2="20" y2="80"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 100 100" class="mark-o">
      <circle cx="50" cy="50" r="32"/>
    </svg>`;
  }

  function buildTttGridDom() {
    tttGridEl.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement("div");
      cell.className = "ttt-cell";
      cell.dataset.index = i;
      cell.addEventListener("click", onTttCellClick);
      tttGridEl.appendChild(cell);
    }
  }

  function renderTtt() {
    for (let i = 0; i < 9; i++) {
      const cell = tttGridEl.children[i];
      cell.classList.remove("win");
      cell.innerHTML = tttBoard[i] ? markSVG(tttBoard[i]) : "";
    }
    const w = TicTacToe.winner(tttBoard);
    if (w) w.line.forEach(i => tttGridEl.children[i].classList.add("win"));
  }

  function setTttStatus(text) { tttStatusEl.textContent = text; }

  function renderTttScoreLabels() {
    if (tttMode === "ai") {
      tttLabelXEl.textContent = tttHuman === "X" ? "You (X)" : "House (X)";
      tttLabelOEl.textContent = tttHuman === "O" ? "You (O)" : "House (O)";
    } else {
      tttLabelXEl.textContent = "Player 1 (X)";
      tttLabelOEl.textContent = "Player 2 (O)";
    }
  }

  function renderTttScore() {
    tttScoreXEl.textContent = tttScore.x;
    tttScoreOEl.textContent = tttScore.o;
    tttScoreDrawEl.textContent = tttScore.draw;
  }

  function isHumanTurnTtt() {
    if (tttMode === "2p") return true;
    return tttCurrentTurn === tttHuman;
  }

  function startTttGame(mode) {
    tttMode = mode;
    tttBoard = TicTacToe.emptyBoard();
    tttHuman = tttSideSel.value;
    tttAI = TicTacToe.other(tttHuman);
    tttDifficulty = tttDiffSel.value;
    tttCurrentTurn = "X";
    tttOver = false;
    buildTttGridDom();
    renderTtt();
    renderTttScoreLabels();
    renderTttScore();
    if (tttMode === "2p") {
      setTttStatus("Player 1 (X) moves first.");
    } else {
      setTttStatus(tttCurrentTurn === tttHuman ? "Your move." : "The house opens.");
    }
    maybeTriggerAiTttMove();
  }

  function onTttCellClick(e) {
    if (tttOver) return;
    if (!isHumanTurnTtt()) return;
    const idx = parseInt(e.currentTarget.dataset.index, 10);
    if (tttBoard[idx]) return;
    placeTttMark(idx, tttCurrentTurn);
  }

  function placeTttMark(idx, mark) {
    tttBoard[idx] = mark;
    tttCurrentTurn = TicTacToe.other(mark);
    renderTtt();
    evaluateTttStatus();
    if (!tttOver) maybeTriggerAiTttMove();
  }

  function tttModeLabel() {
    return tttMode === "ai" ? "Vs. House" : "Two Players";
  }

  function evaluateTttStatus() {
    const w = TicTacToe.winner(tttBoard);
    if (w) {
      tttOver = true;
      if (w.player === "X") tttScore.x++; else tttScore.o++;
      let resultText;
      if (tttMode === "ai") {
        const youWon = w.player === tttHuman;
        resultText = youWon ? "You won" : "The house won";
        setTttStatus(youWon ? "You win! The chalk favors you today." : "The house wins this round.");
      } else {
        const winnerLabel = w.player === "X" ? "Player 1 (X)" : "Player 2 (O)";
        resultText = `${winnerLabel} won`;
        setTttStatus(`${winnerLabel} wins this round.`);
      }
      addHistoryEntry({ game: "ttt", modeLabel: tttModeLabel(), result: resultText });
      renderTttScore();
      return;
    }
    if (TicTacToe.isFull(tttBoard)) {
      tttOver = true;
      tttScore.draw++;
      setTttStatus("It's a draw — the board fills evenly.");
      addHistoryEntry({ game: "ttt", modeLabel: tttModeLabel(), result: "Draw" });
      renderTttScore();
      return;
    }
    if (tttMode === "ai") {
      setTttStatus(tttCurrentTurn === tttHuman ? "Your move." : "The house is thinking…");
    } else {
      setTttStatus(`${tttCurrentTurn === "X" ? "Player 1 (X)" : "Player 2 (O)"} to move.`);
    }
  }

  function maybeTriggerAiTttMove() {
    if (tttOver || tttMode !== "ai") return;
    if (tttCurrentTurn !== tttAI) return;
    setTttStatus("The house is thinking…");
    setTimeout(() => {
      const idx = tttDifficulty === "hard"
        ? TicTacToe.bestMove(tttBoard, tttAI)
        : TicTacToe.easyMove(tttBoard, tttAI);
      if (idx === undefined || idx === null) return;
      placeTttMark(idx, tttAI);
    }, 320);
  }

  showScreen("home");
});
