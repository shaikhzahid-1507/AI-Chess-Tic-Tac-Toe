/* ============================================================
   Tic-Tac-Toe engine — minimax (perfect play) and an "easy"
   mode that plays reasonably but makes mistakes.
   Board: array of 9, index 0..8, values null | "X" | "O".
   ============================================================ */

const TicTacToe = (function () {

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  function emptyBoard() { return Array(9).fill(null); }

  function winner(board) {
    for (const [a, b, c] of LINES) {
      if (board[a] && board[a] === board[b] && board[b] === board[c]) {
        return { player: board[a], line: [a, b, c] };
      }
    }
    return null;
  }

  function isFull(board) { return board.every(cell => cell !== null); }

  function availableMoves(board) {
    const moves = [];
    for (let i = 0; i < 9; i++) if (!board[i]) moves.push(i);
    return moves;
  }

  function other(p) { return p === "X" ? "O" : "X"; }

  function minimax(board, player, aiPlayer, depth) {
    const w = winner(board);
    if (w) return { score: w.player === aiPlayer ? 10 - depth : depth - 10 };
    if (isFull(board)) return { score: 0 };

    const moves = availableMoves(board);
    let best = null;

    for (const idx of moves) {
      const next = board.slice();
      next[idx] = player;
      const result = minimax(next, other(player), aiPlayer, depth + 1);
      const scored = { index: idx, score: result.score };
      if (best === null ||
          (player === aiPlayer && scored.score > best.score) ||
          (player !== aiPlayer && scored.score < best.score)) {
        best = scored;
      }
    }
    return best;
  }

  function bestMove(board, aiPlayer) {
    return minimax(board, aiPlayer, aiPlayer, 0).index;
  }

  function easyMove(board, aiPlayer) {
    const human = other(aiPlayer);
    const moves = availableMoves(board);
    // 30% chance of playing the perfect move anyway, otherwise mostly random
    // but still take an immediate win and mostly avoid handing over a loss.
    for (const idx of moves) {
      const next = board.slice(); next[idx] = aiPlayer;
      if (winner(next)) return idx; // always take a winning move
    }
    if (Math.random() < 0.55) {
      for (const idx of moves) {
        const next = board.slice(); next[idx] = human;
        if (winner(next)) return idx; // sometimes block
      }
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  return { emptyBoard, winner, isFull, availableMoves, bestMove, easyMove, other };
})();
