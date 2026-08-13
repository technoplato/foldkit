/**
 * Compression ladder
 * solve → 10× fewer (canonical) → 10× again OR human comments
 * Open a dam if compression costs more than it saves.
 */

export type StageId = "solve" | "ten-x" | "explain"

export function countLines(source: string): number {
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  while (lines.length && lines[lines.length - 1] === "") lines.pop()
  return lines.length
}

export function passesTenX(prev: number, next: number): boolean {
  return prev > 0 && next > 0 && next * 10 <= prev
}
