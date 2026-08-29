# 🎮 AI Chess & Tic-Tac-Toe

An interactive browser-based gaming application featuring **Chess and AI-powered Tic-Tac-Toe** with intelligent gameplay, multiple difficulty levels, and a responsive user interface.

## ✨ Features

### ♟️ Chess
- Interactive chess gameplay
- Browser-based interface
- Player vs AI gameplay
- Responsive game board
- Move-based gameplay

### ❌⭕ AI Tic-Tac-Toe
- Player vs AI gameplay
- Perfect AI mode using the **Minimax algorithm**
- Easy AI mode with intentionally imperfect gameplay
- Automatic winner detection
- Draw detection
- Winning-line detection
- Multiple difficulty levels

The Tic-Tac-Toe engine uses a 9-cell board representation and implements Minimax to calculate optimal moves for the AI. :contentReference[oaicite:0]{index=0}

## 🧠 AI Gameplay

The project includes two Tic-Tac-Toe AI modes:

### Perfect Mode
The AI uses the **Minimax algorithm** to evaluate possible game states and select the optimal move.

### Easy Mode
The AI makes less optimal decisions and can make mistakes, providing a more casual gameplay experience.

The engine also automatically detects:
- Winning combinations
- Available moves
- Full boards
- Player turns
- AI moves

There are eight possible winning combinations on the 3×3 board. :contentReference[oaicite:1]{index=1}

## 🛠️ Technologies Used

- **HTML5**
- **CSS3**
- **JavaScript**
- **Minimax Algorithm**
- **Game Logic & State Management**
- **Responsive Web Design**

## 📂 Project Structure

```text
AI chess and tic tac too/
│
├── index.html
├── app.js
├── style.css
├── chess.js
└── tictactoe.js
