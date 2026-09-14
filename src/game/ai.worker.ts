import { chooseAiMove, type Piece } from './engine';

self.onmessage = (event: MessageEvent<{ board: Piece[]; difficulty: 'easy' | 'medium' | 'hard' }>) => {
  try {
    self.postMessage({ move: chooseAiMove(event.data.board, 'black', event.data.difficulty) });
  } catch {
    self.postMessage({ error: true });
  }
};
