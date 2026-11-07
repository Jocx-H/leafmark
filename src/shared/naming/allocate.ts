import { PART_LENGTH } from './constants'
import { isAsciiDigits } from './validate'

export type SequenceAllocation =
  | { kind: 'assigned'; sequence: string }
  | { kind: 'manual'; message: string; used: string[] }
  | { kind: 'full'; message: string }

const ALL_SEQUENCES: readonly string[] = Array.from({ length: 100 }, (_, index) =>
  String(index).padStart(PART_LENGTH, '0')
)

export function normalizeSequenceList(used: readonly string[]): string[] {
  const unique = new Set<string>()
  for (const value of used) {
    if (value.length === PART_LENGTH && isAsciiDigits(value)) unique.add(value)
  }
  return [...unique].sort()
}

export function freeSequences(used: readonly string[]): string[] {
  const taken = new Set(normalizeSequenceList(used))
  return ALL_SEQUENCES.filter((value) => !taken.has(value))
}

/**
 * Recommends the next sequence number for a category.
 *
 * Rules from the design baseline:
 * - empty category recommends `00`;
 * - otherwise `max + 1`;
 * - gaps are never filled automatically;
 * - when `99` is already used the user must pick a free number manually;
 * - a completely full category is reported as full.
 */
export function recommendSequence(used: readonly string[]): SequenceAllocation {
  const normalized = normalizeSequenceList(used)
  if (normalized.length === 0) return { kind: 'assigned', sequence: '00' }

  const max = Number(normalized[normalized.length - 1])
  if (max < 99) {
    return { kind: 'assigned', sequence: String(max + 1).padStart(PART_LENGTH, '0') }
  }

  if (normalized.length >= 100) {
    return { kind: 'full', message: '该二级分类的 100 个序号已全部占用，请选择其他二级分类' }
  }

  return {
    kind: 'manual',
    message: '该分类的 99 号已被占用，请从空闲序号中手动选择',
    used: normalized
  }
}
