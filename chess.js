/* ============================================================
   Chess engine — board representation, legal move generation,
   check/mate detection, and a minimax+alpha-beta AI.
   Board convention: board[row][col], row 0 = rank 1 (white side),
   row 7 = rank 8 (black side). col 0 = file a ... col 7 = file h.
   ============================================================ */

const ChessEngine = (function () {

  const WHITE = "w", BLACK = "b";

  function initialBoard() {
    const empty = () => Array.from({ length: 8 }, () => Array(8).fill(null));
    const b = empty();
    const backRank = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    for (let c = 0; c < 8; c++) {
      b[0][c] = "w" + backRank[c];
      b[1][c] = "wP";
      b[6][c] = "bP";
      b[7][c] = "b" + backRank[c];
    }
    return b;
  }

  function newGame() {
    return {
      board: initialBoard(),
      turn: WHITE,
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null, // {row,col} of the square that can be captured to
      lastMove: null,
      history: [] // list of SAN-ish strings
    };
  }

  function cloneState(s) {
    return {
      board: s.board.map(row => row.slice()),
      turn: s.turn,
      castling: { ...s.castling },
      enPassant: s.enPassant ? { ...s.enPassant } : null,
      lastMove: s.lastMove ? { ...s.lastMove } : null,
      history: s.history.slice()
    };
  }

  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function colorOf(piece) { return piece ? piece[0] : null; }
  function typeOf(piece) { return piece ? piece[1] : null; }
  function opponent(color) { return color === WHITE ? BLACK : WHITE; }

  const DIRS = {
    B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    R: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    Q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
    N: [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]],
    K: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  };

  // Generate pseudo-legal moves for a single square (no check filtering).
  function pseudoMovesForSquare(state, r, c) {
    const piece = state.board[r][c];
    if (!piece) return [];
    const color = colorOf(piece);
    const type = typeOf(piece);
    const moves = [];

    const pushMove = (tr, tc, extra = {}) => {
      moves.push({ from: { row: r, col: c }, to: { row: tr, col: tc }, piece, ...extra });
    };

    if (type === "P") {
      const dir = color === WHITE ? 1 : -1;
      const startRow = color === WHITE ? 1 : 6;
      const promoRow = color === WHITE ? 7 : 0;

      // forward one
      if (inBounds(r + dir, c) && !state.board[r + dir][c]) {
        if (r + dir === promoRow) {
          ["Q", "R", "B", "N"].forEach(pt => pushMove(r + dir, c, { promotion: pt }));
        } else {
          pushMove(r + dir, c);
        }
        // forward two
        if (r === startRow && !state.board[r + 2 * dir][c]) {
          pushMove(r + 2 * dir, c, { doubleStep: true });
        }
      }
      // captures
      for (const dc of [-1, 1]) {
        const tr = r + dir, tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const target = state.board[tr][tc];
        if (target && colorOf(target) !== color) {
          if (tr === promoRow) {
            ["Q", "R", "B", "N"].forEach(pt => pushMove(tr, tc, { promotion: pt, capture: target }));
          } else {
            pushMove(tr, tc, { capture: target });
          }
        } else if (!target && state.enPassant && state.enPassant.row === tr && state.enPassant.col === tc) {
          pushMove(tr, tc, { enPassant: true, capture: state.board[r][tc] });
        }
      }
    } else if (type === "N" || type === "K") {
      for (const [dr, dc] of DIRS[type]) {
        const tr = r + dr, tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const target = state.board[tr][tc];
        if (!target || colorOf(target) !== color) {
          pushMove(tr, tc, target ? { capture: target } : {});
        }
      }
      if (type === "K") {
        // castling — legality of squares (not attacked) checked by caller
        const rights = state.castling;
        const row = color === WHITE ? 0 : 7;
        if (r === row && c === 4) {
          if ((color === WHITE ? rights.wK : rights.bK) &&
              !state.board[row][5] && !state.board[row][6] &&
              state.board[row][7] === color + "R") {
            pushMove(row, 6, { castle: "K" });
          }
          if ((color === WHITE ? rights.wQ : rights.bQ) &&
              !state.board[row][1] && !state.board[row][2] && !state.board[row][3] &&
              state.board[row][0] === color + "R") {
            pushMove(row, 2, { castle: "Q" });
          }
        }
      }
    } else {
      // sliding pieces B, R, Q
      for (const [dr, dc] of DIRS[type]) {
        let tr = r + dr, tc = c + dc;
        while (inBounds(tr, tc)) {
          const target = state.board[tr][tc];
          if (!target) {
            pushMove(tr, tc);
          } else {
            if (colorOf(target) !== color) pushMove(tr, tc, { capture: target });
            break;
          }
          tr += dr; tc += dc;
        }
      }
    }
    return moves;
  }

  function isSquareAttacked(state, row, col, byColor) {
    // Pawn attacks
    const dir = byColor === WHITE ? -1 : 1; // squares a byColor pawn would attack FROM relative to target
    for (const dc of [-1, 1]) {
      const pr = row + dir, pc = col + dc;
      if (inBounds(pr, pc) && state.board[pr][pc] === byColor + "P") return true;
    }
    // Knight
    for (const [dr, dc] of DIRS.N) {
      const pr = row + dr, pc = col + dc;
      if (inBounds(pr, pc) && state.board[pr][pc] === byColor + "N") return true;
    }
    // King
    for (const [dr, dc] of DIRS.K) {
      const pr = row + dr, pc = col + dc;
      if (inBounds(pr, pc) && state.board[pr][pc] === byColor + "K") return true;
    }
    // Sliding: bishop/queen diagonals
    for (const [dr, dc] of DIRS.B) {
      let pr = row + dr, pc = col + dc;
      while (inBounds(pr, pc)) {
        const t = state.board[pr][pc];
        if (t) {
          if (colorOf(t) === byColor && (typeOf(t) === "B" || typeOf(t) === "Q")) return true;
          break;
        }
        pr += dr; pc += dc;
      }
    }
    // Sliding: rook/queen orthogonals
    for (const [dr, dc] of DIRS.R) {
      let pr = row + dr, pc = col + dc;
      while (inBounds(pr, pc)) {
        const t = state.board[pr][pc];
        if (t) {
          if (colorOf(t) === byColor && (typeOf(t) === "R" || typeOf(t) === "Q")) return true;
          break;
        }
        pr += dr; pc += dc;
      }
    }
    return false;
  }

  function findKing(state, color) {
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (state.board[r][c] === color + "K") return { row: r, col: c };
    return null;
  }

  function applyMove(state, move) {
    const s = cloneState(state);
    const { from, to, piece } = move;
    const color = colorOf(piece);

    s.board[from.row][from.col] = null;

    if (move.enPassant) {
      s.board[from.row][to.col] = null; // remove captured pawn
    }

    s.board[to.row][to.col] = move.promotion ? color + move.promotion : piece;

    if (move.castle === "K") {
      const row = from.row;
      s.board[row][5] = color + "R";
      s.board[row][7] = null;
    } else if (move.castle === "Q") {
      const row = from.row;
      s.board[row][3] = color + "R";
      s.board[row][0] = null;
    }

    // update castling rights
    if (typeOf(piece) === "K") {
      if (color === WHITE) { s.castling.wK = false; s.castling.wQ = false; }
      else { s.castling.bK = false; s.castling.bQ = false; }
    }
    const clearRookRight = (r, c) => {
      if (r === 0 && c === 0) s.castling.wQ = false;
      if (r === 0 && c === 7) s.castling.wK = false;
      if (r === 7 && c === 0) s.castling.bQ = false;
      if (r === 7 && c === 7) s.castling.bK = false;
    };
    clearRookRight(from.row, from.col);
    clearRookRight(to.row, to.col);

    // en passant target
    s.enPassant = move.doubleStep ? { row: (from.row + to.row) / 2, col: from.col } : null;

    s.turn = opponent(state.turn);
    s.lastMove = { from, to };
    return s;
  }

  function legalMovesForColor(state, color) {
    const all = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = state.board[r][c];
        if (piece && colorOf(piece) === color) {
          all.push(...pseudoMovesForSquare(state, r, c));
        }
      }
    }
    // filter: cannot leave own king in check; castling requires king not
    // currently in check and not passing through/landing on attacked square
    const legal = [];
    for (const m of all) {
      if (m.castle) {
        const row = m.from.row;
        if (isSquareAttacked(state, row, 4, opponent(color))) continue; // in check
        const passCols = m.castle === "K" ? [5, 6] : [3, 2];
        let blocked = false;
        for (const pc of passCols) {
          if (isSquareAttacked(state, row, pc, opponent(color))) { blocked = true; break; }
        }
        if (blocked) continue;
      }
      const next = applyMove(state, m);
      const king = findKing(next, color);
      if (king && isSquareAttacked(next, king.row, king.col, opponent(color))) continue;
      legal.push(m);
    }
    return legal;
  }

  function isInCheck(state, color) {
    const king = findKing(state, color);
    if (!king) return false;
    return isSquareAttacked(state, king.row, king.col, opponent(color));
  }

  function gameStatus(state) {
    const moves = legalMovesForColor(state, state.turn);
    const check = isInCheck(state, state.turn);
    if (moves.length === 0) {
      return check ? { over: true, result: opponent(state.turn) + "-wins", reason: "checkmate" }
                   : { over: true, result: "draw", reason: "stalemate" };
    }
    return { over: false, check, movesAvailable: moves.length };
  }

  const SQUARE_NAME = (r, c) => "abcdefgh"[c] + (r + 1);

  function moveToNotation(state, move, legalMovesThisTurn) {
    const type = typeOf(move.piece);
    if (move.castle === "K") return "O-O";
    if (move.castle === "Q") return "O-O-O";
    const capture = move.capture || move.enPassant;
    let s = "";
    if (type === "P") {
      if (capture) s += "abcdefgh"[move.from.col] + "x";
      s += SQUARE_NAME(move.to.row, move.to.col);
      if (move.promotion) s += "=" + move.promotion;
    } else {
      s += type;
      s += (capture ? "x" : "") + SQUARE_NAME(move.to.row, move.to.col);
    }
    return s;
  }

  // ---------------- Evaluation ----------------
  const PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

  const PAWN_PST = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ];
  const KNIGHT_PST = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50]
  ];
  const BISHOP_PST = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20]
  ];
  const ROOK_PST = [
    [0, 0, 0, 5, 5, 0, 0, 0],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ];
  const QUEEN_PST = [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20]
  ];
  const KING_PST = [
    [20, 30, 10, 0, 0, 10, 30, 20],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30]
  ];
  const PST = { P: PAWN_PST, N: KNIGHT_PST, B: BISHOP_PST, R: ROOK_PST, Q: QUEEN_PST, K: KING_PST };

  function evaluate(state) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = state.board[r][c];
        if (!piece) continue;
        const color = colorOf(piece), type = typeOf(piece);
        const value = PIECE_VALUE[type];
        const pstRow = color === WHITE ? r : 7 - r;
        const pstVal = PST[type][pstRow][c];
        const sign = color === WHITE ? 1 : -1;
        score += sign * (value + pstVal);
      }
    }
    return score; // positive favors White
  }

  function orderMoves(moves) {
    return moves.slice().sort((a, b) => {
      const av = a.capture ? PIECE_VALUE[typeOf(a.capture)] : 0;
      const bv = b.capture ? PIECE_VALUE[typeOf(b.capture)] : 0;
      return bv - av;
    });
  }

  function minimax(state, depth, alpha, beta, maximizing) {
    const status = gameStatus(state);
    if (depth === 0 || status.over) {
      if (status.over && status.reason === "checkmate") {
        return maximizing ? -100000 - depth : 100000 + depth;
      }
      if (status.over) return 0;
      return evaluate(state);
    }
    const moves = orderMoves(legalMovesForColor(state, state.turn));
    if (maximizing) {
      let best = -Infinity;
      for (const m of moves) {
        const next = applyMove(state, m);
        const val = minimax(next, depth - 1, alpha, beta, false);
        best = Math.max(best, val);
        alpha = Math.max(alpha, val);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const m of moves) {
        const next = applyMove(state, m);
        const val = minimax(next, depth - 1, alpha, beta, true);
        best = Math.min(best, val);
        beta = Math.min(beta, val);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  function bestMove(state, depth) {
    const color = state.turn;
    const maximizing = color === WHITE;
    const moves = orderMoves(legalMovesForColor(state, color));
    if (moves.length === 0) return null;
    let best = null;
    let bestVal = maximizing ? -Infinity : Infinity;
    let alpha = -Infinity, beta = Infinity;
    // small randomization among near-equal top moves for variety
    const scored = [];
    for (const m of moves) {
      const next = applyMove(state, m);
      const val = minimax(next, depth - 1, alpha, beta, !maximizing);
      scored.push({ m, val });
      if (maximizing) alpha = Math.max(alpha, val);
      else beta = Math.min(beta, val);
    }
    scored.sort((a, b) => maximizing ? b.val - a.val : a.val - b.val);
    const topVal = scored[0].val;
    const margin = 25; // centipawns tolerance for variety
    const topChoices = scored.filter(s => Math.abs(s.val - topVal) <= margin);
    best = topChoices[Math.floor(Math.random() * topChoices.length)].m;
    return best;
  }

  return {
    WHITE, BLACK,
    newGame, cloneState, applyMove,
    legalMovesForColor, pseudoMovesForSquare,
    isInCheck, gameStatus, findKing, isSquareAttacked,
    moveToNotation, bestMove, evaluate, colorOf, typeOf, opponent
  };
})();
