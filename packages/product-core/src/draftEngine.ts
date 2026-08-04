import type {
  ChallengeManifestEntry,
  ChallengeManifestSnapshot,
  DraftBoard,
  DraftCapabilities,
  DraftConstraints,
  DraftRequest,
  DraftResult,
  DraftValidationIssue,
  DuelFormat
} from './types';

const DEFAULT_CONSTRAINTS: DraftConstraints = {
  maxPerOverlapGroup: {
    'fast-guess': 4,
    'typo-guess-modifier': 2
  },
  maxPerCategory: {}
};

function boardConfig(format: DuelFormat): { size: 9 | 25; winTarget: 5 | 13 } {
  return format === 'casual'
    ? { size: 9, winTarget: 5 }
    : { size: 25, winTarget: 13 };
}

function randomSeed(): number {
  const values = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(values);
    return values[0] ?? Date.now();
  }
  return Date.now() >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const random = mulberry32(seed);
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) continue;
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
}

function mergedConstraints(input?: Partial<DraftConstraints>): DraftConstraints {
  return {
    maxPerOverlapGroup: {
      ...DEFAULT_CONSTRAINTS.maxPerOverlapGroup,
      ...(input?.maxPerOverlapGroup ?? {})
    },
    maxPerCategory: {
      ...DEFAULT_CONSTRAINTS.maxPerCategory,
      ...(input?.maxPerCategory ?? {})
    }
  };
}

function hasCapabilities(
  entry: ChallengeManifestEntry,
  capabilities?: DraftCapabilities
): boolean {
  if (!capabilities) return true;
  return entry.capabilities.every(capability => capabilities.available.has(capability));
}

function canAdd(
  entry: ChallengeManifestEntry,
  selected: readonly ChallengeManifestEntry[],
  constraints: DraftConstraints
): boolean {
  const usedConflictKeys = new Set(selected.flatMap(item => item.conflictKeys));
  if (entry.conflictKeys.some(key => usedConflictKeys.has(key))) return false;

  const categoryLimit = constraints.maxPerCategory[entry.category];
  if (categoryLimit !== undefined) {
    const count = selected.filter(item => item.category === entry.category).length;
    if (count >= categoryLimit) return false;
  }

  for (const group of entry.overlapGroups) {
    const limit = constraints.maxPerOverlapGroup[group];
    if (limit === undefined) continue;
    const count = selected.filter(item => item.overlapGroups.includes(group)).length;
    if (count >= limit) return false;
  }

  return true;
}

function createBoardId(seed: number, createdAt: number): string {
  return `board-${createdAt.toString(36)}-${seed.toString(36)}`;
}

export function validateDraftBoard(
  board: DraftBoard,
  manifest: ChallengeManifestSnapshot,
  requestCapabilities?: DraftCapabilities,
  requestConstraints?: Partial<DraftConstraints>
): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  const config = boardConfig(board.format);
  if (board.fields.length !== config.size) {
    issues.push({
      code: 'wrong-board-size',
      message: `Expected ${config.size} fields, received ${board.fields.length}.`,
      challengeIds: board.fields.map(field => field.challengeId)
    });
  }

  const byId = new Map(manifest.entries.map(entry => [entry.id, entry]));
  const seen = new Set<string>();
  const conflictOwners = new Map<string, string>();
  const overlapCounts = new Map<string, string[]>();
  const categoryCounts = new Map<string, string[]>();
  const constraints = mergedConstraints(requestConstraints);

  for (const field of board.fields) {
    const entry = byId.get(field.challengeId);
    if (!entry) {
      issues.push({
        code: 'unknown-challenge',
        message: `Unknown challenge ${field.challengeId}.`,
        challengeIds: [field.challengeId]
      });
      continue;
    }
    if (seen.has(entry.id)) {
      issues.push({
        code: 'duplicate-challenge',
        message: `Challenge ${entry.id} appears more than once.`,
        challengeIds: [entry.id]
      });
    }
    seen.add(entry.id);

    if (!hasCapabilities(entry, requestCapabilities)) {
      issues.push({
        code: 'missing-capability',
        message: `Missing a required capability for ${entry.name}.`,
        challengeIds: [entry.id]
      });
    }

    for (const key of entry.conflictKeys) {
      const existing = conflictOwners.get(key);
      if (existing) {
        issues.push({
          code: 'conflict-key',
          message: `${existing} and ${entry.id} share draft conflict ${key}.`,
          challengeIds: [existing, entry.id]
        });
      } else {
        conflictOwners.set(key, entry.id);
      }
    }

    for (const group of entry.overlapGroups) {
      const ids = overlapCounts.get(group) ?? [];
      ids.push(entry.id);
      overlapCounts.set(group, ids);
    }

    const categoryIds = categoryCounts.get(entry.category) ?? [];
    categoryIds.push(entry.id);
    categoryCounts.set(entry.category, categoryIds);
  }

  for (const [group, ids] of overlapCounts) {
    const limit = constraints.maxPerOverlapGroup[group];
    if (limit !== undefined && ids.length > limit) {
      issues.push({
        code: 'overlap-limit',
        message: `Overlap group ${group} exceeds ${limit}.`,
        challengeIds: ids
      });
    }
  }

  for (const [category, ids] of categoryCounts) {
    const limit = constraints.maxPerCategory[category as keyof typeof constraints.maxPerCategory];
    if (limit !== undefined && ids.length > limit) {
      issues.push({
        code: 'category-limit',
        message: `Category ${category} exceeds ${limit}.`,
        challengeIds: ids
      });
    }
  }

  return issues;
}

export function generateDraftBoard(
  manifest: ChallengeManifestSnapshot,
  request: DraftRequest,
  now = Date.now()
): DraftResult {
  const seed = request.seed ?? randomSeed();
  const config = boardConfig(request.format);
  const include = new Set(request.includeIds ?? []);
  const exclude = new Set(request.excludeIds ?? []);
  const constraints = mergedConstraints(request.constraints);

  const candidates = manifest.entries.filter(entry => {
    if (!entry.formats.includes(request.format)) return false;
    if (request.format === 'ranked' && !entry.rankedEligible) return false;
    if (exclude.has(entry.id)) return false;
    if (!hasCapabilities(entry, request.capabilities)) return false;
    return true;
  });

  const byId = new Map(candidates.map(entry => [entry.id, entry]));
  const selected: ChallengeManifestEntry[] = [];
  const issues: DraftValidationIssue[] = [];

  for (const id of include) {
    const entry = byId.get(id);
    if (!entry) {
      issues.push({
        code: 'unknown-challenge',
        message: `Required challenge ${id} is unavailable for this draft.`,
        challengeIds: [id]
      });
      continue;
    }
    if (!canAdd(entry, selected, constraints)) {
      issues.push({
        code: 'conflict-key',
        message: `Required challenge ${id} conflicts with another required challenge.`,
        challengeIds: [...selected.map(item => item.id), id]
      });
      continue;
    }
    selected.push(entry);
  }

  const categoryCounts = new Map<string, number>();
  for (const entry of selected) {
    categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);
  }

  const pool = shuffled(
    candidates.filter(entry => !include.has(entry.id)),
    seed
  );

  while (selected.length < config.size && pool.length > 0) {
    const eligible = pool.filter(entry => canAdd(entry, selected, constraints));
    if (eligible.length === 0) break;
    eligible.sort((left, right) => {
      const leftCount = categoryCounts.get(left.category) ?? 0;
      const rightCount = categoryCounts.get(right.category) ?? 0;
      if (leftCount !== rightCount) return leftCount - rightCount;
      return pool.indexOf(left) - pool.indexOf(right);
    });
    const entry = eligible[0];
    if (!entry) break;
    selected.push(entry);
    categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);
    const index = pool.indexOf(entry);
    if (index >= 0) pool.splice(index, 1);
  }

  if (selected.length !== config.size) {
    issues.push({
      code: 'wrong-board-size',
      message: `Only ${selected.length} compatible challenges were available for a ${config.size}-field board.`,
      challengeIds: selected.map(entry => entry.id)
    });
    return { board: null, issues, candidateCount: candidates.length };
  }

  const board: DraftBoard = {
    boardId: createBoardId(seed, now),
    format: request.format,
    size: config.size,
    winTarget: config.winTarget,
    seed,
    createdAt: now,
    fields: selected.map((entry, fieldIndex) => ({
      fieldIndex,
      challengeId: entry.id,
      definitionVersion: entry.definitionVersion
    })),
    manifestVersion: 1
  };

  const validationIssues = validateDraftBoard(
    board,
    manifest,
    request.capabilities,
    constraints
  );

  return {
    board: issues.length === 0 && validationIssues.length === 0 ? board : null,
    issues: [...issues, ...validationIssues],
    candidateCount: candidates.length
  };
}
