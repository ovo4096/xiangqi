import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMove, chooseAiMove, getGameResult, initialBoard, isInCheck, legalMoves, type AiMove, type Piece, type PieceType, type Side } from './engine'
import { masterMoves, searchMaster } from './master'

let nextId = 0
const p = (type: PieceType, side: Side, x: number, y: number): Piece => ({ id: `master-test-${nextId++}`, type, side, x, y })
const serializeMoves = (moves: AiMove[]) => moves.map(move => `${move.pieceId}:${move.to.x},${move.to.y}`).sort()
const publicMoves = (board: Piece[], side: Side) => board.filter(piece => piece.side === side)
  .flatMap(piece => legalMoves(board, piece).map(to => ({ pieceId: piece.id, to })))
const validate = (board: Piece[], side: Side, move: AiMove | null): AiMove => {
  assert.ok(move)
  assert.ok(serializeMoves(publicMoves(board, side)).includes(`${move.pieceId}:${move.to.x},${move.to.y}`))
  return move
}

test('master numeric generator matches the public free rules through 160 seeded plies', () => {
  let seed = 0x12345678, board = initialBoard(), side: Side = 'red'
  for (let ply = 0; ply < 160; ply++) {
    for (const turn of ['red', 'black'] as const) assert.deepEqual(serializeMoves(masterMoves(board, turn)), serializeMoves(publicMoves(board, turn)))
    const moves = publicMoves(board, side)
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    if (!moves.length || getGameResult(board, side)) { board = initialBoard(); side = 'red'; continue }
    const move = moves[(seed >>> 0) % moves.length]
    board = applyMove(board, move.pieceId, move.to)
    side = side === 'red' ? 'black' : 'red'
  }
})

test('master preserves exposed-general moves and takes the enemy general first', () => {
  const attacker = p('rook', 'red', 3, 2)
  const board = [p('general', 'black', 3, 0), p('general', 'red', 5, 9), attacker, p('rook', 'black', 5, 0)]
  assert.equal(isInCheck(board, 'red'), true)
  assert.ok(masterMoves(board, 'red').some(move => move.pieceId === attacker.id && move.to.x === 2 && move.to.y === 2))
  const move = searchMaster(board, 'red', { maxNodes: 1, milliseconds: 1 }).move
  assert.deepEqual(move, { pieceId: attacker.id, to: { x: 3, y: 0 } })
  const won = applyMove(board, move!.pieceId, move!.to)
  assert.equal(getGameResult(won, 'black')?.winner, 'red')
  assert.equal(chooseAiMove(won, 'black', 'master'), null)
})

test('master captures a facing general and keeps the caller board unchanged', () => {
  const black = p('general', 'black', 4, 0), red = p('general', 'red', 4, 9), board = [black, red]
  const snapshot = JSON.stringify(board)
  assert.deepEqual(searchMaster(board, 'black').move, { pieceId: black.id, to: { x: 4, y: 9 } })
  assert.equal(JSON.stringify(board), snapshot)
})

test('quiescence refuses a poisoned cannon even with only one full search ply', () => {
  const rook = p('rook', 'red', 0, 5)
  const board = [p('general', 'black', 3, 0), p('general', 'red', 5, 9), rook,
    p('cannon', 'black', 0, 3), p('rook', 'black', 0, 0)]
  const result = searchMaster(board, 'red', { maxDepth: 1, milliseconds: 200, maxNodes: 100_000 })
  const move = validate(board, 'red', result.move)
  assert.notDeepEqual(move, { pieceId: rook.id, to: { x: 0, y: 3 } })
  assert.equal(result.stats.completedDepth, 1)
  assert.ok(result.stats.selectiveDepth > 1)
})

test('a threatened general can be protected by a quiet interposition', () => {
  const rook = p('rook', 'red', 0, 7)
  const board = [p('general', 'red', 4, 9), p('general', 'black', 3, 0),
    p('rook', 'black', 4, 5), p('rook', 'black', 3, 8), p('rook', 'black', 5, 0), rook]
  const result = searchMaster(board, 'red', { maxDepth: 1, milliseconds: 200 })
  const move = validate(board, 'red', result.move)
  assert.deepEqual(move, { pieceId: rook.id, to: { x: 4, y: 7 } })
  assert.equal(isInCheck(applyMove(board, move.pieceId, move.to), 'red'), false)
  assert.equal(getGameResult(board, 'red'), null)
})

test('master still returns a piece move in a lost position; only capture ends play', () => {
  const board = [p('general', 'black', 3, 0), p('general', 'red', 5, 9),
    p('rook', 'black', 4, 0), p('rook', 'black', 0, 8)]
  validate(board, 'red', searchMaster(board, 'red', { milliseconds: 100, maxDepth: 3 }).move)
  assert.equal(getGameResult(board, 'red'), null)
})

test('tiny budgets return a safe legal fallback without mutating the input', () => {
  const board = [p('general', 'black', 3, 0), p('general', 'red', 5, 9),
    p('rook', 'red', 0, 7), p('rook', 'black', 5, 0)]
  const snapshot = JSON.stringify(board)
  const result = searchMaster(board, 'red', { milliseconds: 1, maxNodes: 1 })
  const move = validate(board, 'red', result.move)
  assert.equal(isInCheck(applyMove(board, move.pieceId, move.to), 'red'), false)
  assert.equal(result.stats.interrupted, true)
  assert.equal(JSON.stringify(board), snapshot)
})

test('bounded iterative deepening completes layers, uses transpositions and reports its work', () => {
  const board = initialBoard(), snapshot = JSON.stringify(board)
  const result = searchMaster(board, 'black', { milliseconds: 500, maxNodes: 40_000, maxDepth: 8 })
  validate(board, 'black', result.move)
  assert.ok(result.stats.completedDepth >= 2)
  assert.ok(result.stats.nodes <= 40_001)
  assert.ok(result.stats.nodes >= result.stats.quiescenceNodes)
  assert.ok(result.stats.transpositionHits > 0)
  assert.ok(result.stats.elapsedMs < 2_000)
  assert.equal(JSON.stringify(board), snapshot)
})

test('master returns no move without inventing a stalemate win', () => {
  const board = [p('general', 'black', 3, 0), p('general', 'red', 4, 9),
    ...[[3, 7], [5, 7], [4, 8], [3, 9], [5, 9]].map(([x, y]) => p('advisor', 'red', x, y))]
  assert.equal(searchMaster(board, 'red').move, null)
  assert.equal(getGameResult(board, 'red'), null)
})

test('long histories cannot make loop avoidance outweigh winning a rook', () => {
  const rook = p('rook', 'red', 0, 5)
  const board = [p('general', 'black', 3, 0), p('general', 'red', 5, 9), rook, p('rook', 'black', 0, 3)]
  const capture = { pieceId: rook.id, to: { x: 0, y: 3 } }
  const afterCapture = applyMove(board, rook.id, capture.to)
  const result = searchMaster(board, 'red', { maxDepth: 1, milliseconds: 300, previousPositions: Array.from({ length: 100 }, () => afterCapture) })
  assert.deepEqual(result.move, capture)
})
