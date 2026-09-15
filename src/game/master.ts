import type { AiMove, Piece, PieceType, Side } from './engine'

/** The master searches the same capture-the-general variant as the public rules. */
export interface MasterOptions {
  milliseconds?: number
  maxNodes?: number
  maxDepth?: number
  /** Earlier positions discourage loops; this is a search preference, never a draw rule. */
  previousPositions?: Piece[][]
}
export interface MasterStats {
  nodes: number
  quiescenceNodes: number
  completedDepth: number
  selectiveDepth: number
  elapsedMs: number
  score: number
  transpositionHits: number
  cutoffs: number
  interrupted: boolean
}
export interface MasterResult { move: AiMove | null; stats: MasterStats }

const KING = 1, ADVISOR = 2, ELEPHANT = 3, HORSE = 4, ROOK = 5, CANNON = 6, PAWN = 7
const TYPES: PieceType[] = ['general', 'advisor', 'elephant', 'horse', 'rook', 'cannon', 'pawn']
const VALUE = [0, 100_000, 210, 210, 440, 1_000, 480, 110]
const MATE = 1_000_000, MAX_PLY = 64, TABLE_SIZE = 1 << 18, TABLE_MASK = TABLE_SIZE - 1
const EXACT = 1, LOWER = 2, UPPER = 3
const now = () => performance.now()
const file = (square: number) => square % 9
const rank = (square: number) => (square / 9) | 0
const sign = (code: number) => code > 0 ? 1 : -1
const inside = (x: number, y: number) => x >= 0 && x < 9 && y >= 0 && y < 10
const palace = (x: number, y: number, side: number) => x >= 3 && x <= 5 && (side === 1 ? y >= 7 && y <= 9 : y >= 0 && y <= 2)
const codeIndex = (code: number) => code > 0 ? code - 1 : 6 - code
const orthogonal = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const horseSteps = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]]

// Deterministic dual Zobrist keys. The second key guards table index collisions.
let randomState = 0x4d595df4
function random32() {
  randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5
  return randomState >>> 0
}
const zobristA = Uint32Array.from({ length: 14 * 90 }, random32)
const zobristB = Uint32Array.from({ length: 14 * 90 }, random32)
const turnA = random32(), turnB = random32()

function positional(type: number, square: number, side: number): number {
  const x = file(square), y = rank(square), advancement = side === 1 ? 9 - y : y
  const center = 4 - Math.abs(4 - x)
  switch (type) {
    case PAWN: return advancement * 9 + (advancement >= 5 ? 75 + center * 13 : center * 3) - (advancement === 9 ? 55 : 0)
    case HORSE: return center * 11 + Math.min(advancement, 6) * 9 - (x === 0 || x === 8 ? 32 : 0)
    case CANNON: return center * 7 + Math.min(advancement, 5) * 3
    case ROOK: return center * 3 + advancement * 4
    case ADVISOR: return center * 3
    case ELEPHANT: return x === 4 ? 14 : 0
    case KING: return (x === 4 ? 10 : 0) - advancement * 10
    default: return 0
  }
}
const squareValue = new Int32Array(14 * 90)
for (let code = -7; code <= 7; code++) {
  if (!code) continue
  for (let square = 0; square < 90; square++) {
    squareValue[codeIndex(code) * 90 + square] = sign(code) * (VALUE[Math.abs(code)] + positional(Math.abs(code), square, sign(code)))
  }
}

/** Numeric board is private to this module; input Piece objects are never mutated. */
class Position {
  squares = new Int8Array(90)
  kings = [-1, -1]
  keyA = 0
  keyB = 0
  evaluation = 0
  constructor(board: Piece[], side: number) {
    for (const piece of board) {
      const code = (TYPES.indexOf(piece.type) + 1) * (piece.side === 'red' ? 1 : -1)
      this.set(piece.y * 9 + piece.x, code)
    }
    if (side === -1) { this.keyA ^= turnA; this.keyB ^= turnB }
  }
  set(square: number, code: number) {
    const old = this.squares[square]
    if (old) {
      const index = codeIndex(old) * 90 + square
      this.keyA ^= zobristA[index]; this.keyB ^= zobristB[index]
      this.evaluation -= squareValue[index]
      if (Math.abs(old) === KING) this.kings[old > 0 ? 0 : 1] = -1
    }
    this.squares[square] = code
    if (code) {
      const index = codeIndex(code) * 90 + square
      this.keyA ^= zobristA[index]; this.keyB ^= zobristB[index]
      this.evaluation += squareValue[index]
      if (Math.abs(code) === KING) this.kings[code > 0 ? 0 : 1] = square
    }
  }
  make(move: number): number {
    const from = (move / 90) | 0, to = move % 90, captured = this.squares[to], moving = this.squares[from]
    this.set(from, 0); this.set(to, moving)
    this.keyA ^= turnA; this.keyB ^= turnB
    return captured
  }
  unmake(move: number, captured: number) {
    const from = (move / 90) | 0, to = move % 90, moving = this.squares[to]
    this.set(to, captured); this.set(from, moving)
    this.keyA ^= turnA; this.keyB ^= turnB
  }
  king(side: number) { return this.kings[side === 1 ? 0 : 1] }
}

/** All piece moves, including moves exposing one's own general. */
function generate(position: Position, side: number, capturesOnly = false): number[] {
  const squares = position.squares, moves: number[] = []
  for (let from = 0; from < 90; from++) {
    const code = squares[from]
    if (!code || sign(code) !== side) continue
    const type = Math.abs(code), x = file(from), y = rank(from)
    const add = (nx: number, ny: number) => {
      if (!inside(nx, ny)) return
      const to = ny * 9 + nx, target = squares[to]
      if (target && sign(target) === side) return
      if (!capturesOnly || target) moves.push(from * 90 + to)
    }
    if (type === ROOK || type === CANNON) {
      for (const [dx, dy] of orthogonal) {
        let screen = false
        for (let nx = x + dx, ny = y + dy; inside(nx, ny); nx += dx, ny += dy) {
          const to = ny * 9 + nx, target = squares[to]
          if (type === ROOK) {
            if (!target) { if (!capturesOnly) moves.push(from * 90 + to) }
            else { if (sign(target) !== side) moves.push(from * 90 + to); break }
          } else if (!screen) {
            if (target) screen = true
            else if (!capturesOnly) moves.push(from * 90 + to)
          } else if (target) {
            if (sign(target) !== side) moves.push(from * 90 + to)
            break
          }
        }
      }
    } else if (type === HORSE) {
      for (const [dx, dy] of horseSteps) {
        const leg = (y + (Math.abs(dy) === 2 ? Math.sign(dy) : 0)) * 9 + x + (Math.abs(dx) === 2 ? Math.sign(dx) : 0)
        if (!squares[leg]) add(x + dx, y + dy)
      }
    } else if (type === ELEPHANT) {
      for (const [dx, dy] of diagonal) {
        const ny = y + dy * 2
        if ((side === 1 ? ny >= 5 : ny <= 4) && !squares[(y + dy) * 9 + x + dx]) add(x + dx * 2, ny)
      }
    } else if (type === ADVISOR) {
      for (const [dx, dy] of diagonal) if (palace(x + dx, y + dy, side)) add(x + dx, y + dy)
    } else if (type === KING) {
      for (const [dx, dy] of orthogonal) if (palace(x + dx, y + dy, side)) add(x + dx, y + dy)
      const enemy = position.king(-side)
      if (enemy >= 0 && file(enemy) === x) {
        const dy = Math.sign(rank(enemy) - y)
        let clear = true
        for (let ny = y + dy; ny !== rank(enemy); ny += dy) if (squares[ny * 9 + x]) { clear = false; break }
        if (clear) moves.push(from * 90 + enemy)
      }
    } else {
      add(x, y - side)
      if (side === 1 ? y <= 4 : y >= 5) { add(x - 1, y); add(x + 1, y) }
    }
  }
  return moves
}

/** First attacker of a square, respecting horse legs, cannon screens and flying generals. */
function attacker(position: Position, square: number, side: number): number {
  const squares = position.squares, x = file(square), y = rank(square)
  for (const [dx, dy] of orthogonal) {
    let screen = false
    for (let nx = x + dx, ny = y + dy; inside(nx, ny); nx += dx, ny += dy) {
      const from = ny * 9 + nx, code = squares[from]
      if (!code) continue
      if (!screen) {
        if (sign(code) === side) {
          const type = Math.abs(code)
          if (type === ROOK) return from
          if (type === KING && ((dx === 0 && Math.abs(squares[square]) === KING)
            || (Math.abs(nx - x) + Math.abs(ny - y) === 1 && palace(x, y, side)))) return from
          if (type === PAWN && ((nx === x && y - ny === -side)
            || (ny === y && Math.abs(nx - x) === 1 && (side === 1 ? ny <= 4 : ny >= 5)))) return from
        }
        screen = true
      } else {
        if (code === side * CANNON) return from
        break
      }
    }
  }
  for (const [dx, dy] of horseSteps) {
    const nx = x - dx, ny = y - dy
    if (!inside(nx, ny) || squares[ny * 9 + nx] !== side * HORSE) continue
    const leg = (ny + (Math.abs(dy) === 2 ? Math.sign(dy) : 0)) * 9 + nx + (Math.abs(dx) === 2 ? Math.sign(dx) : 0)
    if (!squares[leg]) return ny * 9 + nx
  }
  for (const [dx, dy] of diagonal) {
    const nx = x - dx, ny = y - dy
    if (inside(nx, ny) && squares[ny * 9 + nx] === side * ADVISOR && palace(x, y, side)) return ny * 9 + nx
    const ex = x - dx * 2, ey = y - dy * 2
    if (inside(ex, ey) && squares[ey * 9 + ex] === side * ELEPHANT
      && (side === 1 ? y >= 5 : y <= 4) && !squares[ny * 9 + nx]) return ey * 9 + ex
  }
  return -1
}

function evaluate(position: Position, side: number): number {
  let score = position.evaluation
  let redHorses = 0, blackHorses = 0, redRooks = 0, blackRooks = 0
  for (let square = 0; square < 90; square++) {
    const code = position.squares[square], type = Math.abs(code)
    if (!code) continue
    const owner = sign(code), x = file(square), y = rank(square)
    if (type === HORSE) {
      if (owner === 1) redHorses++; else blackHorses++
      // Blocked legs matter more than nominal centralization.
      let mobility = 0
      for (const [dx, dy] of horseSteps) {
        const nx = x + dx, ny = y + dy
        if (!inside(nx, ny)) continue
        const leg = (y + (Math.abs(dy) === 2 ? Math.sign(dy) : 0)) * 9 + x + (Math.abs(dx) === 2 ? Math.sign(dx) : 0)
        if (!position.squares[leg] && position.squares[ny * 9 + nx] * owner <= 0) mobility++
      }
      score += owner * (mobility * 7 - 21)
    } else if (type === ROOK || type === CANNON) {
      if (type === ROOK) { if (owner === 1) redRooks++; else blackRooks++ }
      let mobility = 0
      for (const [dx, dy] of orthogonal) {
        for (let nx = x + dx, ny = y + dy; inside(nx, ny); nx += dx, ny += dy) {
          const target = position.squares[ny * 9 + nx]
          if (target) { if (target * owner < 0) mobility++; break }
          mobility++
        }
      }
      score += owner * mobility * (type === ROOK ? 3 : 2)
    }
  }
  // Horses gain relative importance after heavy-piece exchanges.
  score += (redHorses - blackHorses) * (4 - redRooks - blackRooks) * 9
  return score * side + 8
}

/** Public diagnostic used by rule parity tests and repeatable benchmarks. */
export function masterMoves(board: Piece[], side: Side): AiMove[] {
  const position = new Position(board, side === 'red' ? 1 : -1)
  const ids = new Map(board.map(piece => [piece.y * 9 + piece.x, piece.id]))
  return generate(position, side === 'red' ? 1 : -1).map(move => ({
    pieceId: ids.get((move / 90) | 0)!, to: { x: file(move % 90), y: rank(move % 90) },
  }))
}

export function searchMaster(board: Piece[], sideName: Side, options: MasterOptions = {}): MasterResult {
  const started = now(), side = sideName === 'red' ? 1 : -1
  const milliseconds = Math.max(1, options.milliseconds ?? 2_800)
  const maxNodes = Math.max(1, options.maxNodes ?? 1_500_000)
  const maxDepth = Math.max(1, Math.min(32, options.maxDepth ?? 16))
  const stats: MasterStats = { nodes: 0, quiescenceNodes: 0, completedDepth: 0, selectiveDepth: 0, elapsedMs: 0,
    score: 0, transpositionHits: 0, cutoffs: 0, interrupted: false }
  const position = new Position(board, side)
  const rootMoves = generate(position, side)
  const finish = (move: number | null): MasterResult => {
    stats.elapsedMs = Math.round((now() - started) * 10) / 10
    const piece = move === null ? undefined : board.find(candidate => candidate.y * 9 + candidate.x === ((move / 90) | 0))
    return { move: piece && move !== null ? { pieceId: piece.id, to: { x: file(move % 90), y: rank(move % 90) } } : null, stats }
  }
  if (position.king(side) < 0 || position.king(-side) < 0 || !rootMoves.length) return finish(null)
  const takeGeneral = rootMoves.find(move => Math.abs(position.squares[move % 90]) === KING)
  if (takeGeneral !== undefined) { stats.score = MATE - 1; stats.completedDepth = 1; return finish(takeGeneral) }

  const keyA = new Int32Array(TABLE_SIZE), keyB = new Int32Array(TABLE_SIZE)
  const tableDepth = new Int8Array(TABLE_SIZE), tableFlag = new Uint8Array(TABLE_SIZE)
  const tableScore = new Int32Array(TABLE_SIZE), tableMove = new Uint16Array(TABLE_SIZE)
  const killers = new Int32Array(MAX_PLY * 2).fill(-1), history = new Int32Array(2 * 90 * 90)
  const pathA = new Int32Array(MAX_PLY + 1), pathB = new Int32Array(MAX_PLY + 1)
  const earlier = new Map<string, number>()
  for (const previous of options.previousPositions ?? []) {
    // Record both turns: UI history contains board positions but need not carry turn metadata.
    for (const previousSide of [1, -1]) {
      const prior = new Position(previous, previousSide), key = `${prior.keyA}:${prior.keyB}`
      earlier.set(key, (earlier.get(key) ?? 0) + 1)
    }
  }
  pathA[0] = position.keyA; pathB[0] = position.keyB
  const budget = () => {
    if (stats.nodes > maxNodes || ((stats.nodes & 255) === 0 && now() - started >= milliseconds)) stats.interrupted = true
    return stats.interrupted
  }
  const repeated = (ply: number) => {
    for (let back = ply - 4; back >= 0; back -= 2) if (pathA[back] === position.keyA && pathB[back] === position.keyB) return true
    return false
  }
  const ordered = (moves: number[], turn: number, ply: number, preferred = -1) => {
    const historyOffset = turn === 1 ? 0 : 8_100
    const scores = new Map<number, number>()
    for (const move of moves) {
      const to = move % 90, from = (move / 90) | 0, captured = Math.abs(position.squares[to]), piece = Math.abs(position.squares[from])
      const value = move === preferred ? 20_000_000 : captured ? 1_000_000 + VALUE[captured] * 16 - VALUE[piece]
        : move === killers[ply * 2] ? 900_000 : move === killers[ply * 2 + 1] ? 800_000
          : history[historyOffset + move] + positional(piece, to, turn) - positional(piece, from, turn)
      scores.set(move, value)
    }
    return moves.sort((a, b) => scores.get(b)! - scores.get(a)!)
  }
  const terminal = (turn: number, ply: number): number | null => {
    if (position.king(turn) < 0) return -MATE + ply
    if (position.king(-turn) < 0) return MATE - ply
    // Winning immediately takes precedence over one's own general being threatened.
    if (attacker(position, position.king(-turn), turn) >= 0) return MATE - ply - 1
    return null
  }
  const quiescence = (turn: number, alpha: number, beta: number, ply: number, qDepth: number): number => {
    stats.nodes++
    stats.quiescenceNodes++
    stats.selectiveDepth = Math.max(stats.selectiveDepth, ply)
    const result = terminal(turn, ply)
    if (result !== null) return result
    if (budget()) return 0
    if (repeated(ply)) return 0
    pathA[ply] = position.keyA; pathB[ply] = position.keyB
    const threatened = attacker(position, position.king(turn), -turn) >= 0
    const standPat = evaluate(position, turn)
    if (!threatened) {
      if (standPat >= beta) return standPat
      if (standPat > alpha) alpha = standPat
      if (qDepth >= 12 || ply >= MAX_PLY - 2) return standPat
    }
    let best = threatened ? -MATE + ply + 2 : standPat
    // In danger, quiet escapes and interpositions are mandatory search candidates.
    // This is tactical analysis, not an extra legality rule imposed on either player.
    const moves = ordered(generate(position, turn, !threatened), turn, ply)
    for (const move of moves) {
      const captured = position.make(move)
      let score: number
      if (ply >= MAX_PLY - 2) {
        const nextTerminal = terminal(-turn, ply + 1)
        score = nextTerminal === null ? evaluate(position, turn) : -nextTerminal
      } else {
        score = -quiescence(-turn, -beta, -alpha, ply + 1, qDepth + 1)
      }
      position.unmake(move, captured)
      if (stats.interrupted) return 0
      if (score > best) best = score
      if (score > alpha) alpha = score
      if (alpha >= beta) { stats.cutoffs++; return best }
    }
    return best
  }
  const search = (turn: number, depth: number, alpha: number, beta: number, ply: number): number => {
    if (depth <= 0 || ply >= MAX_PLY - 2) return quiescence(turn, alpha, beta, ply, 0)
    stats.nodes++
    const result = terminal(turn, ply)
    if (result !== null) return result
    if (budget()) return 0
    stats.selectiveDepth = Math.max(stats.selectiveDepth, ply)
    if (repeated(ply)) return 0
    pathA[ply] = position.keyA; pathB[ply] = position.keyB
    const originalAlpha = alpha, tableIndex = position.keyA & TABLE_MASK
    let preferred = -1
    if (tableFlag[tableIndex] && keyA[tableIndex] === position.keyA && keyB[tableIndex] === position.keyB) {
      preferred = tableMove[tableIndex]
      if (tableDepth[tableIndex] >= depth) {
        stats.transpositionHits++
        let score = tableScore[tableIndex]
        if (score > MATE - MAX_PLY) score -= ply
        else if (score < -MATE + MAX_PLY) score += ply
        if (tableFlag[tableIndex] === EXACT || (tableFlag[tableIndex] === LOWER && score >= beta)
          || (tableFlag[tableIndex] === UPPER && score <= alpha)) return score
      }
    }
    const threatened = attacker(position, position.king(turn), -turn) >= 0
    const moves = ordered(generate(position, turn), turn, ply, preferred)
    if (!moves.length) return evaluate(position, turn)
    let best = -MATE, bestMove = moves[0], count = 0
    for (const move of moves) {
      const captured = position.make(move)
      let value: number
      if (count === 0) value = -search(-turn, depth - 1, -beta, -alpha, ply + 1)
      else {
        const reducing = depth >= 3 && count >= 4 && !captured && !threatened
          && move !== killers[ply * 2] && attacker(position, position.king(-turn), turn) < 0
        value = -search(-turn, depth - 1 - (reducing ? 1 : 0), -alpha - 1, -alpha, ply + 1)
        if (reducing && value > alpha) value = -search(-turn, depth - 1, -alpha - 1, -alpha, ply + 1)
        if (value > alpha && value < beta) value = -search(-turn, depth - 1, -beta, -alpha, ply + 1)
      }
      position.unmake(move, captured)
      if (stats.interrupted) return 0
      count++
      if (value > best) { best = value; bestMove = move }
      if (value > alpha) alpha = value
      if (alpha >= beta) {
        stats.cutoffs++
        if (!captured) {
          if (killers[ply * 2] !== move) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = move }
          const index = (turn === 1 ? 0 : 8_100) + move
          history[index] = Math.min(600_000, history[index] + depth * depth * 16)
        }
        break
      }
    }
    keyA[tableIndex] = position.keyA; keyB[tableIndex] = position.keyB
    tableDepth[tableIndex] = depth; tableMove[tableIndex] = bestMove
    tableScore[tableIndex] = best > MATE - MAX_PLY ? best + ply : best < -MATE + MAX_PLY ? best - ply : best
    tableFlag[tableIndex] = best <= originalAlpha ? UPPER : best >= beta ? LOWER : EXACT
    return best
  }

  let bestMove = ordered(rootMoves, side, 0)[0]
  // A tiny budget must still return a move avoiding an immediate capture if possible.
  for (const move of rootMoves) {
    const captured = position.make(move)
    const safe = attacker(position, position.king(side), -side) < 0
    position.unmake(move, captured)
    if (safe) { bestMove = move; break }
  }
  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -MATE, iterationMove = bestMove, bestScore = -MATE
    for (const move of ordered(rootMoves, side, 0, bestMove)) {
      const captured = position.make(move)
      const occurrences = earlier.get(`${position.keyA}:${position.keyB}`) ?? 0
      const penalty = Math.min(90, 30 * occurrences)
      // Root alpha is expressed after the repetition preference. Translate it
      // into the child's raw evaluation scale before using a narrow window.
      // Mate scores are exempt from the preference and keep their original scale.
      const rawAlpha = Math.abs(alpha) < MATE / 2 ? alpha + penalty : alpha
      let score = -search(-side, depth - 1, -MATE, -rawAlpha, 1)
      if (penalty && Math.abs(score) < MATE / 2) score -= penalty
      position.unmake(move, captured)
      if (stats.interrupted) break
      if (score > bestScore) { bestScore = score; iterationMove = move }
      if (score > alpha) alpha = score
    }
    if (stats.interrupted) break
    bestMove = iterationMove; stats.completedDepth = depth; stats.score = bestScore
    if (bestScore > MATE - MAX_PLY || now() - started >= milliseconds) break
  }
  return finish(bestMove)
}
