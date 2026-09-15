import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { cpus } from 'node:os'
import { applyMove, chooseAiMove, describeMove, getGameResult, initialBoard, legalMoves, type Piece, type Side } from '../src/game/engine'
import { searchMaster } from '../src/game/master'

// Example: npx tsx scripts/benchmark-ai.ts --games=4 --milliseconds=400 --plies=100 --equal-budget --output=.local-artifacts/ai-benchmark.json
const args = process.argv.slice(2)
const integer = (name: string, fallback: number) => Number(args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback)
const games = integer('games', 4), milliseconds = integer('milliseconds', 800), maxPlies = integer('plies', 120)
const equalBudget = args.includes('--equal-budget')
const output = args.find(arg => arg.startsWith('--output='))?.slice('--output='.length)
const metadata = { date: new Date().toISOString(), platform: process.platform, architecture: process.arch,
  node: process.version, cpu: cpus()[0]?.model,
  masterSha256: createHash('sha256').update(readFileSync(new URL('../src/game/master.ts', import.meta.url))).digest('hex'),
  legacySha256: createHash('sha256').update(readFileSync(new URL('../src/game/engine.ts', import.meta.url))).digest('hex') }
const material = { general: 0, rook: 1000, cannon: 480, horse: 440, elephant: 210, advisor: 210, pawn: 110 }
const openings: { name: string; moves: [number, number, number, number][] }[] = [
  { name: 'initial', moves: [] },
  { name: 'central-cannons', moves: [[1, 7, 4, 7], [7, 2, 4, 2], [1, 9, 2, 7], [7, 0, 6, 2]] },
  { name: 'horses-and-pawns', moves: [[1, 9, 2, 7], [7, 0, 6, 2], [6, 6, 6, 5], [2, 3, 2, 4]] },
]
const results = []
for (let game = 0; game < games; game++) {
  const masterSide: Side = game % 2 === 0 ? 'red' : 'black'
  const opening = openings[Math.floor(game / 2) % openings.length]
  let board = initialBoard(), side: Side = 'red'
  for (const [x, y, toX, toY] of opening.moves) {
    const piece = board.find(candidate => candidate.x === x && candidate.y === y)!
    if (!legalMoves(board, piece).some(to => to.x === toX && to.y === toY)) throw new Error('Invalid benchmark opening')
    board = applyMove(board, piece.id, { x: toX, y: toY }); side = side === 'red' ? 'black' : 'red'
  }
  const history: Piece[][] = [], repetitions = new Map<string, number>(), moves = []
  let winner: string | null = null, reason = 'ply-limit', masterMs = 0, legacyMs = 0, masterNodes = 0, depths = 0, masterTurns = 0
  for (let ply = 0; ply < maxPlies; ply++) {
    const start = performance.now(), isMaster = side === masterSide
    const result = isMaster ? searchMaster(board, side, { milliseconds, maxNodes: 1_500_000, maxDepth: 16, previousPositions: history }) : null
    const move = result ? result.move : chooseAiMove(board, side, 'hard', equalBudget
      ? { milliseconds, nodes: 1_500_000, depth: 16 } : undefined)
    const elapsed = performance.now() - start
    if (isMaster) { masterMs += elapsed; masterNodes += result!.stats.nodes; depths += result!.stats.completedDepth; masterTurns++ }
    else legacyMs += elapsed
    if (!move) { reason = 'no-piece-move'; break }
    const piece = board.find(candidate => candidate.id === move.pieceId)!
    if (piece.side !== side || !legalMoves(board, piece).some(to => to.x === move.to.x && to.y === move.to.y)) throw new Error('Engine returned an illegal piece move')
    moves.push({ side, engine: isMaster ? 'master' : 'legacy-hard', notation: describeMove(board, move.pieceId, move.to), move,
      ...(result ? { depth: result.stats.completedDepth, score: result.stats.score } : {}), elapsedMs: Math.round(elapsed) })
    history.push(board)
    board = applyMove(board, move.pieceId, move.to)
    side = side === 'red' ? 'black' : 'red'
    const gameResult = getGameResult(board, side)
    if (gameResult) { winner = gameResult.winner === masterSide ? 'master' : 'legacy-hard'; reason = 'general-captured'; break }
    const key = side + board.map(candidate => `${candidate.side[0]}${candidate.type}:${candidate.x},${candidate.y}`).sort().join(';')
    const repeats = (repetitions.get(key) ?? 0) + 1
    repetitions.set(key, repeats)
    if (repeats >= 3) { reason = 'repetition-adjudication'; break }
  }
  const materialDifference = board.reduce((sum, piece) => sum + (piece.side === masterSide ? 1 : -1) * material[piece.type], 0)
  const summary = { game: game + 1, opening: opening.name, masterSide, winner, reason, plies: moves.length, materialDifference,
    masterMs: Math.round(masterMs), legacyMs: Math.round(legacyMs), masterNodes, masterMeanDepth: +(depths / masterTurns).toFixed(2) }
  results.push({ ...summary, moves, finalBoard: board })
  console.log(JSON.stringify(summary))
  if (output) writeFileSync(output, JSON.stringify({ metadata, configuration: { games, milliseconds, maxPlies, equalBudget }, results }, null, 2))
}
console.log(JSON.stringify({ masterWins: results.filter(game => game.winner === 'master').length,
  legacyWins: results.filter(game => game.winner === 'legacy-hard').length, unresolved: results.filter(game => !game.winner).length }))
