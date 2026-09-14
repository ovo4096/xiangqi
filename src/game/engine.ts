/** Pure Xiangqi rules. Coordinates are viewed from red's side of the board. */
export type Side = 'red' | 'black'
export type PieceType = 'general' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'pawn'
export type Point = { x: number; y: number }
export interface Piece extends Point { id: string; type: PieceType; side: Side }
export interface Move { pieceId: string; from: Point; to: Point; captured?: Piece }
export type AiMove = { pieceId: string; to: Point }
export type Difficulty = 'easy' | 'medium' | 'hard'
export type GameResult = { winner: Side | null; reason: string }

const WIDTH = 9
const HEIGHT = 10
const MATE = 1_000_000
const MATERIAL: Record<PieceType, number> = {
  general: 100_000, rook: 900, cannon: 450, horse: 420, elephant: 200, advisor: 200, pawn: 100,
}
const ORTHOGONAL: Point[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
const DIAGONAL: Point[] = [{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }]
const HORSE_STEPS: Point[] = [
  { x: 2, y: 1 }, { x: 2, y: -1 }, { x: -2, y: 1 }, { x: -2, y: -1 },
  { x: 1, y: 2 }, { x: -1, y: 2 }, { x: 1, y: -2 }, { x: -1, y: -2 },
]
const opposite = (side: Side): Side => side === 'red' ? 'black' : 'red'
const onBoard = (x: number, y: number) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT
const inPalace = (x: number, y: number, side: Side) => x >= 3 && x <= 5 && (side === 'red' ? y >= 7 && y <= 9 : y >= 0 && y <= 2)
const crossedRiver = (piece: Piece) => piece.side === 'red' ? piece.y <= 4 : piece.y >= 5
const indexOf = (x: number, y: number) => y * WIDTH + x
type Squares = Array<Piece | undefined>

function makeSquares(board: Piece[]): Squares {
  const squares: Squares = new Array(WIDTH * HEIGHT)
  for (const piece of board) squares[indexOf(piece.x, piece.y)] = piece
  return squares
}

export function initialBoard(): Piece[] {
  const board: Piece[] = []
  const backRank: PieceType[] = ['rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook']
  for (const side of ['black', 'red'] as const) {
    const rank = side === 'black' ? 0 : 9
    backRank.forEach((type, x) => board.push({ id: `${side}-${type}-${x}`, side, type, x, y: rank }))
    for (const x of [1, 7]) board.push({ id: `${side}-cannon-${x}`, side, type: 'cannon', x, y: side === 'black' ? 2 : 7 })
    for (const x of [0, 2, 4, 6, 8]) board.push({ id: `${side}-pawn-${x}`, side, type: 'pawn', x, y: side === 'black' ? 3 : 6 })
  }
  return board
}

/** Destinations before checking whether the move exposes its own general. */
function pseudoMoves(board: Piece[], piece: Piece, squares: Squares): Point[] {
  const moves: Point[] = []
  const add = (x: number, y: number) => {
    if (onBoard(x, y) && squares[indexOf(x, y)]?.side !== piece.side) moves.push({ x, y })
  }
  switch (piece.type) {
    case 'general': {
      for (const d of ORTHOGONAL) {
        const x = piece.x + d.x, y = piece.y + d.y
        if (inPalace(x, y, piece.side)) add(x, y)
      }
      const enemyGeneral = board.find(p => p.type === 'general' && p.side !== piece.side)
      if (enemyGeneral?.x === piece.x) {
        const step = Math.sign(enemyGeneral.y - piece.y)
        let blocked = false
        for (let y = piece.y + step; y !== enemyGeneral.y; y += step) {
          if (squares[indexOf(piece.x, y)]) { blocked = true; break }
        }
        if (!blocked) add(enemyGeneral.x, enemyGeneral.y)
      }
      break
    }
    case 'advisor':
      for (const d of DIAGONAL) {
        const x = piece.x + d.x, y = piece.y + d.y
        if (inPalace(x, y, piece.side)) add(x, y)
      }
      break
    case 'elephant':
      for (const d of DIAGONAL) {
        const x = piece.x + d.x * 2, y = piece.y + d.y * 2
        if ((piece.side === 'red' ? y >= 5 : y <= 4) && !squares[indexOf(piece.x + d.x, piece.y + d.y)]) add(x, y)
      }
      break
    case 'horse':
      for (const d of HORSE_STEPS) {
        const legX = piece.x + (Math.abs(d.x) === 2 ? Math.sign(d.x) : 0)
        const legY = piece.y + (Math.abs(d.y) === 2 ? Math.sign(d.y) : 0)
        if (!squares[indexOf(legX, legY)]) add(piece.x + d.x, piece.y + d.y)
      }
      break
    case 'rook':
    case 'cannon':
      for (const d of ORTHOGONAL) {
        let screen = false
        for (let x = piece.x + d.x, y = piece.y + d.y; onBoard(x, y); x += d.x, y += d.y) {
          const target = squares[indexOf(x, y)]
          if (piece.type === 'rook') {
            if (target?.side !== piece.side) moves.push({ x, y })
            if (target) break
          } else if (!screen) {
            if (target) screen = true
            else moves.push({ x, y })
          } else if (target) {
            if (target.side !== piece.side) moves.push({ x, y })
            break
          }
        }
      }
      break
    case 'pawn':
      add(piece.x, piece.y + (piece.side === 'red' ? -1 : 1))
      if (crossedRiver(piece)) { add(piece.x - 1, piece.y); add(piece.x + 1, piece.y) }
      break
  }
  return moves
}

function interveningCount(piece: Piece, target: Point, squares: Squares): number {
  const dx = Math.sign(target.x - piece.x), dy = Math.sign(target.y - piece.y)
  let count = 0
  for (let x = piece.x + dx, y = piece.y + dy; x !== target.x || y !== target.y; x += dx, y += dy) {
    if (squares[indexOf(x, y)]) count++
  }
  return count
}

function attacks(piece: Piece, general: Piece, squares: Squares): boolean {
  const dx = general.x - piece.x, dy = general.y - piece.y
  const ax = Math.abs(dx), ay = Math.abs(dy)
  switch (piece.type) {
    case 'general':
      return (dx === 0 && interveningCount(piece, general, squares) === 0)
        || (ax + ay === 1 && inPalace(general.x, general.y, piece.side))
    case 'advisor': return ax === 1 && ay === 1 && inPalace(general.x, general.y, piece.side)
    case 'elephant': return ax === 2 && ay === 2
      && (piece.side === 'red' ? general.y >= 5 : general.y <= 4)
      && !squares[indexOf(piece.x + dx / 2, piece.y + dy / 2)]
    case 'horse': return ((ax === 2 && ay === 1) || (ax === 1 && ay === 2))
      && !squares[indexOf(piece.x + (ax === 2 ? Math.sign(dx) : 0), piece.y + (ay === 2 ? Math.sign(dy) : 0))]
    case 'rook': return (dx === 0 || dy === 0) && interveningCount(piece, general, squares) === 0
    case 'cannon': return (dx === 0 || dy === 0) && interveningCount(piece, general, squares) === 1
    case 'pawn': return (dx === 0 && dy === (piece.side === 'red' ? -1 : 1))
      || (crossedRiver(piece) && ax === 1 && dy === 0)
  }
}

function checkedWithSquares(board: Piece[], side: Side, squares: Squares): boolean {
  const general = board.find(p => p.side === side && p.type === 'general')
  if (!general) return true
  return board.some(p => p.side !== side && attacks(p, general, squares))
}

export function isInCheck(board: Piece[], side: Side): boolean {
  return checkedWithSquares(board, side, makeSquares(board))
}

/** Immutable move application. Call legalMoves first when accepting player input. */
export function applyMove(board: Piece[], pieceId: string, to: Point): Piece[] {
  const piece = board.find(p => p.id === pieceId)
  if (!piece) throw new Error(`Unknown piece: ${pieceId}`)
  if (!Number.isInteger(to.x) || !Number.isInteger(to.y) || !onBoard(to.x, to.y)) throw new RangeError('Destination is outside the board')
  const occupant = board.find(p => p.x === to.x && p.y === to.y)
  if (occupant && occupant.side === piece.side) throw new Error('Cannot move onto a friendly piece')
  return board.filter(p => p.id === pieceId || p.x !== to.x || p.y !== to.y)
    .map(p => p.id === pieceId ? { ...p, x: to.x, y: to.y } : p)
}

export function legalMoves(board: Piece[], piece: Piece): Point[] {
  const current = board.find(p => p.id === piece.id)
  if (!current) return []
  return pseudoMoves(board, current, makeSquares(board)).filter(to => !isInCheck(applyMove(board, current.id, to), current.side))
}

function allLegalMoves(board: Piece[], side: Side): AiMove[] {
  const moves: AiMove[] = []
  const squares = makeSquares(board)
  for (const piece of board) {
    if (piece.side !== side) continue
    for (const to of pseudoMoves(board, piece, squares)) {
      if (!isInCheck(applyMove(board, piece.id, to), side)) moves.push({ pieceId: piece.id, to })
    }
  }
  return moves
}

export function getGameResult(board: Piece[], sideToMove: Side): GameResult | null {
  const redGeneral = board.some(p => p.side === 'red' && p.type === 'general')
  const blackGeneral = board.some(p => p.side === 'black' && p.type === 'general')
  if (!redGeneral && !blackGeneral) return { winner: null, reason: '双方主帅均不在棋盘上' }
  if (!redGeneral) return { winner: 'black', reason: '红帅被吃，黑方获胜' }
  if (!blackGeneral) return { winner: 'red', reason: '黑将被吃，红方获胜' }
  // A side with no legal move loses in Xiangqi, even when its general is not checked.
  for (const piece of board) if (piece.side === sideToMove && legalMoves(board, piece).length) return null
  const loser = sideToMove === 'red' ? '红方' : '黑方'
  return { winner: opposite(sideToMove), reason: isInCheck(board, sideToMove) ? `${loser}被将死` : `${loser}无棋可走，困毙` }
}

function positionValue(piece: Piece): number {
  const advancement = piece.side === 'red' ? 9 - piece.y : piece.y
  const center = 4 - Math.abs(4 - piece.x)
  switch (piece.type) {
    case 'pawn': return advancement * 10 + (crossedRiver(piece) ? 65 + center * 12 : center * 2) - (advancement === 9 ? 25 : 0)
    case 'horse': return center * 9 + Math.min(advancement, 6) * 6 - (piece.x === 0 || piece.x === 8 ? 20 : 0)
    case 'cannon': return center * 5 + Math.min(advancement, 5) * 3
    case 'rook': return center * 3 + advancement * 4
    case 'advisor': return piece.x === 4 ? 8 : 0
    case 'elephant': return piece.x === 4 ? 10 : 0
    case 'general': return -advancement * 12 + (piece.x === 4 ? 12 : 0)
  }
}

function evaluate(board: Piece[], side: Side): number {
  let total = 0
  const squares = makeSquares(board)
  for (const piece of board) {
    let value = MATERIAL[piece.type] + positionValue(piece)
    if (piece.type === 'horse' || piece.type === 'rook' || piece.type === 'cannon') value += pseudoMoves(board, piece, squares).length * 2
    total += piece.side === side ? value : -value
  }
  return total
}

function orderMoves(board: Piece[], moves: AiMove[], preferred?: AiMove): AiMove[] {
  const squares = makeSquares(board)
  const pieces = new Map(board.map(p => [p.id, p]))
  const scored = moves.map(move => {
    const piece = pieces.get(move.pieceId)!
    const captured = squares[indexOf(move.to.x, move.to.y)]
    const isPreferred = preferred?.pieceId === move.pieceId && preferred.to.x === move.to.x && preferred.to.y === move.to.y
    const value = (isPreferred ? MATE * 10 : 0) + (captured ? MATERIAL[captured.type] * 10 - MATERIAL[piece.type] : 0)
      + positionValue({ ...piece, ...move.to }) - positionValue(piece)
    return { move, value }
  })
  scored.sort((a, b) => b.value - a.value)
  return scored.map(entry => entry.move)
}

/** Bounded iterative deepening keeps the NPC responsive on phones and laptops. */
export function chooseAiMove(board: Piece[], side: Side, difficulty: Difficulty): AiMove | null {
  if (!board.some(p => p.type === 'general' && p.side === side)
    || !board.some(p => p.type === 'general' && p.side !== side)) return null
  const candidates = orderMoves(board, allLegalMoves(board, side))
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]

  const settings = {
    easy: { depth: 1, milliseconds: 100, nodes: 2_000 },
    medium: { depth: 2, milliseconds: 300, nodes: 8_000 },
    hard: { depth: 4, milliseconds: 800, nodes: 24_000 },
  }[difficulty]
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now()
  const deadline = now() + settings.milliseconds
  let nodes = 0
  let interrupted = false
  let bestMove = candidates[0]
  const leafScores: { move: AiMove; score: number }[] = []

  const search = (position: Piece[], turn: Side, depth: number, alpha: number, beta: number, ply: number): number => {
    nodes++
    if (nodes > settings.nodes || (nodes % 32 === 0 && now() > deadline)) {
      interrupted = true
      return evaluate(position, turn)
    }
    if (!position.some(p => p.type === 'general' && p.side === turn)) return -MATE + ply
    if (!position.some(p => p.type === 'general' && p.side !== turn)) return MATE - ply
    // A short check extension prevents stopping the search with a hanging general.
    const checked = isInCheck(position, turn)
    if (depth <= 0 && (!checked || ply >= settings.depth + 2)) return evaluate(position, turn)
    const moves = orderMoves(position, allLegalMoves(position, turn))
    if (!moves.length) return -MATE + ply
    let best = -Infinity
    for (const move of moves) {
      const value = -search(applyMove(position, move.pieceId, move.to), opposite(turn), depth - 1, -beta, -alpha, ply + 1)
      if (interrupted) return value
      best = Math.max(best, value)
      alpha = Math.max(alpha, value)
      if (alpha >= beta) break
    }
    return best
  }

  for (let depth = 1; depth <= settings.depth; depth++) {
    let bestScore = -Infinity
    let iterationMove = bestMove
    let alpha = -Infinity
    for (const move of orderMoves(board, candidates, bestMove)) {
      const next = applyMove(board, move.pieceId, move.to)
      const score = -search(next, opposite(side), depth - 1, -Infinity, -alpha, 1)
      if (interrupted) break
      if (depth === 1) leafScores.push({ move, score })
      if (score > bestScore) { bestScore = score; iterationMove = move }
      alpha = Math.max(alpha, score)
    }
    if (interrupted) break
    bestMove = iterationMove
    if (bestScore >= MATE - 100 || now() >= deadline) break
  }

  if (difficulty === 'easy' && leafScores.length) {
    leafScores.sort((a, b) => b.score - a.score)
    // The beginner NPC varies its play among reasonable moves, but takes a forced win.
    const top = leafScores[0].score
    const options = leafScores.filter(entry => entry.score >= top - (top > MATE / 2 ? 0 : 65)).slice(0, 5)
    return options[Math.floor(Math.random() * options.length)].move
  }
  return bestMove
}

export function pieceLabel(piece: Pick<Piece, 'type' | 'side'>): string {
  const labels: Record<Side, Record<PieceType, string>> = {
    red: { general: '帅', advisor: '仕', elephant: '相', horse: '马', rook: '车', cannon: '炮', pawn: '兵' },
    black: { general: '将', advisor: '士', elephant: '象', horse: '马', rook: '车', cannon: '炮', pawn: '卒' },
  }
  return labels[piece.side][piece.type]
}

export function describeMove(board: Piece[], pieceId: string, to: Point): string {
  const piece = board.find(p => p.id === pieceId)
  if (!piece) return ''
  const numerals = '一二三四五六七八九'
  const numeral = (value: number) => piece.side === 'red' ? numerals[value - 1] : String(value)
  const file = (x: number) => numeral(piece.side === 'red' ? 9 - x : x + 1)
  const sameFile = board.filter(p => p.side === piece.side && p.type === piece.type && p.x === piece.x)
    .sort((a, b) => piece.side === 'red' ? a.y - b.y : b.y - a.y)
  let prefix = pieceLabel(piece) + file(piece.x)
  if (sameFile.length > 1) {
    const at = sameFile.findIndex(p => p.id === piece.id)
    const order = at === 0 ? '前' : at === sameFile.length - 1 ? '后' : sameFile.length === 3 ? '中' : numeral(at + 1)
    prefix = order + pieceLabel(piece)
  }
  if (piece.y === to.y) return prefix + '平' + file(to.x)
  const forward = piece.side === 'red' ? to.y < piece.y : to.y > piece.y
  const destination = piece.type === 'horse' || piece.type === 'advisor' || piece.type === 'elephant'
    ? file(to.x) : numeral(Math.abs(to.y - piece.y))
  return prefix + (forward ? '进' : '退') + destination
}
