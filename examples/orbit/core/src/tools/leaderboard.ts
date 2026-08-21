/**
 * Agent Leaderboard — simulated capital
 * Real-money execution is out of scope. Play credits only.
 */

export type Run = {
  agent: string
  model: string
  reverseRefs: number
  toolsBuilt: number
  stitchReplay: number
  inspectorHits: number
  violations: number
}

export function score(run: Run): number {
  const raw =
    run.reverseRefs * 4 +
    run.toolsBuilt * 6 +
    run.stitchReplay * 5 +
    run.inspectorHits * 3 -
    run.violations * 20
  return Math.max(0, raw)
}

export function rank(
  runs: Run[],
): Array<Run & { points: number; place: number }> {
  return [...runs]
    .map(r => ({ ...r, points: score(r) }))
    .sort((a, b) => b.points - a.points)
    .map((r, i) => ({ ...r, place: i + 1 }))
}

export const RUBRIC = {
  ged: 'Extract every callback from the session, reverse-time, no invention.',
  master:
    'Consume definitions.sh and rebuild the catalog without extra prompt.',
  capital: 'disabled',
}
