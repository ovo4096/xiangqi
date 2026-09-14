import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, chooseAiMove, describeMove, getGameResult, initialBoard, isInCheck, legalMoves, pieceLabel, type Piece, type PieceType, type Side } from './engine'

let nextId = 0
const p = (type: PieceType, side: Side, x: number, y: number): Piece => ({ id: `test-${nextId++}`, type, side, x, y })
// Separated general files keep unrelated movement tests free of flying captures.
const position = (...pieces: Piece[]): Piece[] => [p('general', 'black', 3, 0), p('general', 'red', 5, 9), ...pieces]
const destinations = (board: Piece[], piece: Piece) => legalMoves(board, piece).map(to => `${to.x},${to.y}`).sort()

test('the initial position has 32 unique pieces and 44 legal red opening moves', () => {
  const board = initialBoard()
  assert.equal(board.length, 32)
  assert.equal(new Set(board.map(piece => piece.id)).size, 32)
  assert.equal(new Set(board.map(piece => `${piece.x},${piece.y}`)).size, 32)
  assert.equal(board.filter(piece => piece.side === 'red').reduce((count, piece) => count + legalMoves(board, piece).length, 0), 44)
  assert.equal(isInCheck(board, 'red'), false)
  assert.equal(isInCheck(board, 'black'), false)
  assert.equal(getGameResult(board, 'red'), null)
})

test('initial position has 1926 continuations including six that expose the black general', () => {
  const board = initialBoard()
  let count = 0
  let exposed = 0
  for (const piece of board.filter(piece => piece.side === 'red')) {
    for (const to of legalMoves(board, piece)) {
      const next = applyMove(board, piece.id, to)
      for (const reply of next.filter(piece => piece.side === 'black')) {
        for (const destination of legalMoves(next, reply)) {
          count++
          if (isInCheck(applyMove(next, reply.id, destination), 'black')) exposed++
        }
      }
    }
  }
  // A cannon can take an opening horse; the opponent may then move a second
  // blocker away and leave its general exposed to that cannon's remaining screen.
  assert.equal(count, 1926)
  assert.equal(exposed, 6)
})

test('a blocked horse leg removes both destinations on that side', () => {
  const horse = p('horse', 'red', 4, 4)
  const board = position(horse, p('pawn', 'red', 5, 4))
  assert.deepEqual(destinations(board, horse), ['2,3', '2,5', '3,2', '3,6', '5,2', '5,6'])
})

test('elephants cannot cross the river or move through a blocked eye', () => {
  const elephant = p('elephant', 'red', 2, 5)
  const board = position(elephant, p('pawn', 'red', 3, 6))
  assert.deepEqual(destinations(board, elephant), ['0,7'])
  const blackElephant = p('elephant', 'black', 2, 4)
  assert.deepEqual(destinations(position(blackElephant), blackElephant), ['0,2', '4,2'])
})

test('advisors stay on palace diagonals and generals stay inside the palace', () => {
  const advisor = p('advisor', 'red', 3, 9)
  assert.deepEqual(destinations(position(advisor), advisor), ['4,8'])
  const board = position()
  const general = board.find(piece => piece.side === 'red')!
  assert.deepEqual(destinations(board, general), ['4,9', '5,8'])
})

test('rook rays stop at the first piece and cannot capture friendly pieces', () => {
  const rook = p('rook', 'red', 0, 5)
  const board = position(rook, p('pawn', 'red', 0, 3), p('horse', 'black', 0, 7))
  const moves = destinations(board, rook)
  assert.ok(moves.includes('0,4'))
  assert.ok(moves.includes('0,6'))
  assert.ok(moves.includes('0,7'))
  assert.ok(!moves.includes('0,3'))
  assert.ok(!moves.includes('0,2'))
  assert.ok(!moves.includes('0,8'))
})

test('a cannon needs exactly one screen to capture and cannot land beyond its screen', () => {
  const cannon = p('cannon', 'red', 0, 5)
  const screen = p('pawn', 'black', 0, 3)
  const target = p('rook', 'black', 0, 1)
  const behind = p('horse', 'black', 0, 0)
  const moves = destinations(position(cannon, screen, target, behind), cannon)
  assert.ok(moves.includes('0,4'))
  assert.ok(moves.includes('0,1'))
  assert.ok(!moves.includes('0,3'))
  assert.ok(!moves.includes('0,2'))
  assert.ok(!moves.includes('0,0'))
  assert.ok(!destinations(position(cannon, target), cannon).includes('0,1'))
})

test('pawns gain sideways moves only after crossing and can never move backward', () => {
  const red = p('pawn', 'red', 2, 5)
  assert.deepEqual(destinations(position(red), red), ['2,4'])
  const redCrossed = { ...red, y: 4 }
  assert.deepEqual(destinations(position(redCrossed), redCrossed), ['1,4', '2,3', '3,4'])
  const black = p('pawn', 'black', 6, 4)
  assert.deepEqual(destinations(position(black), black), ['6,5'])
  const blackCrossed = { ...black, y: 5 }
  assert.deepEqual(destinations(position(blackCrossed), blackCrossed), ['5,5', '6,6', '7,5'])
  const atEnd = { ...red, x: 0, y: 0 }
  assert.deepEqual(destinations(position(atEnd), atEnd), ['1,0'])
})

test('facing generals may remain on the board until one captures along the open file', () => {
  const black = p('general', 'black', 4, 0), red = p('general', 'red', 4, 9)
  const board = [black, red]
  assert.equal(isInCheck(board, 'red'), true)
  assert.equal(isInCheck(board, 'black'), true)
  assert.equal(getGameResult(board, 'red'), null)
  assert.equal(getGameResult(board, 'black'), null)
  assert.ok(destinations(board, red).includes('4,8'))
  assert.ok(destinations(board, red).includes('4,0'))
  const won = applyMove(board, red.id, { x: 4, y: 0 })
  assert.equal(getGameResult(won, 'black')?.winner, 'red')
})

test('a piece shielding facing generals may move off their file', () => {
  const shield = p('rook', 'red', 4, 5)
  const board = [p('general', 'black', 4, 0), p('general', 'red', 4, 9), shield]
  assert.equal(isInCheck(board, 'red'), false)
  assert.ok(destinations(board, shield).includes('3,5'))
  const next = applyMove(board, shield.id, { x: 3, y: 5 })
  assert.equal(isInCheck(next, 'red'), true)
  assert.equal(getGameResult(next, 'black'), null)
  const black = next.find(piece => piece.type === 'general' && piece.side === 'black')!
  assert.ok(destinations(next, black).includes('4,9'))
})

test('moves that expose their own general are allowed', () => {
  const shield = p('rook', 'red', 5, 7)
  const board = position(shield, p('rook', 'black', 5, 0))
  assert.equal(isInCheck(board, 'red'), false)
  assert.ok(destinations(board, shield).includes('4,7'))
  assert.ok(destinations(board, shield).includes('5,0'))
  const exposed = applyMove(board, shield.id, { x: 4, y: 7 })
  assert.equal(isInCheck(exposed, 'red'), true)
  assert.equal(getGameResult(exposed, 'black'), null)
})

test('a cannon threat can be answered or ignored by moving its screen', () => {
  const shield = p('rook', 'red', 5, 7)
  const board = position(shield, p('cannon', 'black', 5, 0))
  assert.equal(isInCheck(board, 'red'), true)
  assert.ok(destinations(board, shield).includes('4,7'))
  assert.ok(destinations(board, shield).includes('5,6'))
})

test('check detection observes blocked horse legs', () => {
  const horse = p('horse', 'black', 4, 7)
  const board = position(horse)
  assert.equal(isInCheck(board, 'red'), true)
  assert.equal(isInCheck([...board, p('pawn', 'red', 4, 8)], 'red'), false)
})

test('a threatened player can move another piece without protecting the general', () => {
  const rook = p('rook', 'red', 0, 7)
  const board = position(rook, p('rook', 'black', 5, 0))
  assert.equal(isInCheck(board, 'red'), true)
  assert.ok(destinations(board, rook).includes('0,6'))
  assert.ok(destinations(board, rook).includes('5,7'))
  const ignored = applyMove(board, rook.id, { x: 0, y: 6 })
  assert.equal(isInCheck(ignored, 'red'), true)
  assert.equal(getGameResult(ignored, 'black'), null)
  assert.equal(isInCheck(applyMove(board, rook.id, { x: 5, y: 7 }), 'red'), false)
})

test('traditional checkmate and stalemate positions do not end the game', () => {
  const stalemate = [p('general', 'black', 3, 0), p('general', 'red', 5, 9), p('rook', 'black', 4, 0), p('rook', 'black', 0, 8)]
  assert.equal(isInCheck(stalemate, 'red'), false)
  assert.equal(getGameResult(stalemate, 'red'), null)
  const mate = [...stalemate, p('rook', 'black', 5, 1)]
  assert.equal(isInCheck(mate, 'red'), true)
  assert.equal(getGameResult(mate, 'red'), null)
})

test('only an actually captured general awards a win', () => {
  for (const side of ['red', 'black'] as const) {
    const board = initialBoard()
    const afterCapture = board.filter(piece => piece.type !== 'general' || piece.side !== side)
    assert.equal(getGameResult(afterCapture, side)?.winner, side === 'red' ? 'black' : 'red')
    assert.match(getGameResult(afterCapture, side)!.reason, /被吃/)
  }
  assert.deepEqual(getGameResult([], 'red'), { winner: null, reason: '双方主帅均不在棋盘上' })
})

test('applying a move captures immutably and rejects invalid coordinates or friendly captures', () => {
  const rook = p('rook', 'red', 0, 5), target = p('pawn', 'black', 0, 3)
  const board = position(rook, target)
  const snapshot = JSON.stringify(board)
  const next = applyMove(board, rook.id, { x: 0, y: 3 })
  assert.equal(JSON.stringify(board), snapshot)
  assert.equal(next.length, board.length - 1)
  assert.equal(next.some(piece => piece.id === target.id), false)
  assert.equal(next.find(piece => piece.id === rook.id)?.y, 3)
  assert.throws(() => applyMove(board, rook.id, { x: 9, y: 0 }), RangeError)
  assert.throws(() => applyMove(board, rook.id, { x: 5, y: 9 }), /friendly/)
})

test('move notation and labels follow each player\'s viewpoint', () => {
  const board = initialBoard()
  const redHorse = board.find(piece => piece.side === 'red' && piece.type === 'horse' && piece.x === 1)!
  const blackPawn = board.find(piece => piece.side === 'black' && piece.type === 'pawn' && piece.x === 2)!
  assert.equal(describeMove(board, redHorse.id, { x: 2, y: 7 }), '马八进七')
  assert.equal(describeMove(board, blackPawn.id, { x: 2, y: 4 }), '卒3进1')
  assert.equal(pieceLabel({ side: 'red', type: 'general' }), '帅')
  assert.equal(pieceLabel({ side: 'black', type: 'elephant' }), '象')
})

test('NPCs return legal moves without mutating their position at every difficulty', () => {
  const board = initialBoard()
  const before = JSON.stringify(board)
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const move = chooseAiMove(board, 'black', difficulty)
    assert.ok(move)
    const piece = board.find(piece => piece.id === move.pieceId)!
    assert.equal(piece.side, 'black')
    assert.ok(legalMoves(board, piece).some(to => to.x === move.to.x && to.y === move.to.y))
  }
  assert.equal(JSON.stringify(board), before)
})

test('every NPC takes an offered general, even while its own general is threatened', () => {
  const attacker = p('rook', 'red', 3, 2)
  const board = position(attacker, p('rook', 'black', 5, 0))
  assert.equal(isInCheck(board, 'red'), true)
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const move = chooseAiMove(board, 'red', difficulty)
    assert.deepEqual(move, { pieceId: attacker.id, to: { x: 3, y: 0 } })
  }
  const after = applyMove(board, attacker.id, { x: 3, y: 0 })
  assert.equal(chooseAiMove(after, 'red', 'hard'), null)
  assert.equal(chooseAiMove(after, 'black', 'hard'), null)
})

test('NPCs can protect a threatened general as a strategy', () => {
  const board = position(p('rook', 'red', 0, 7), p('rook', 'black', 5, 0))
  const move = chooseAiMove(board, 'red', 'medium')
  assert.ok(move)
  assert.equal(isInCheck(applyMove(board, move.pieceId, move.to), 'red'), false)
})

test('every NPC still moves when the general has no safe square', () => {
  const board = [p('general', 'black', 3, 0), p('general', 'red', 5, 9), p('rook', 'black', 4, 0), p('rook', 'black', 0, 8)]
  const general = board.find(piece => piece.side === 'red')!
  const before = JSON.stringify(board)
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const move = chooseAiMove(board, 'red', difficulty)
    assert.ok(move)
    assert.equal(move.pieceId, general.id)
    assert.ok(legalMoves(board, general).some(to => to.x === move.to.x && to.y === move.to.y))
  }
  assert.equal(JSON.stringify(board), before)
})

test('no available piece move returns no NPC move but does not award a win', () => {
  const stuck = [p('general', 'black', 3, 0), p('general', 'red', 4, 9),
    ...[[3, 7], [5, 7], [4, 8], [3, 9], [5, 9]].map(([x, y]) => p('advisor', 'red', x, y))]
  assert.ok(stuck.filter(piece => piece.side === 'red').every(piece => legalMoves(stuck, piece).length === 0))
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    assert.equal(chooseAiMove(stuck, 'red', difficulty), null)
  }
  assert.equal(getGameResult(stuck, 'red'), null)
})
