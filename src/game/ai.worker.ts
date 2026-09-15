import { chooseAiMove, type Difficulty, type Piece } from './engine';
import { searchMaster } from './master';

self.onmessage = (event: MessageEvent<{ board: Piece[]; difficulty: Difficulty; previousPositions?: Piece[][] }>) => {
  try {
    if (event.data.difficulty === 'master') {
      const result = searchMaster(event.data.board, 'black', { previousPositions: event.data.previousPositions });
      self.postMessage({ move: result.move, stats: result.stats });
    } else {
      self.postMessage({ move: chooseAiMove(event.data.board, 'black', event.data.difficulty) });
    }
  } catch {
    self.postMessage({ error: true });
  }
};
