import {
  CHALLENGE_DEFINITIONS_VERSION,
  starterChallengeDefinitions
} from '@skribbl-duels/challenge-definitions';
import type {
  GatewayClientCapability,
  GatewayDraftBoardSnapshot
} from '@skribbl-duels/gateway-contracts';
import {
  createChallengeManifest,
  generateDraftBoard,
  type ChallengeCapability,
  type ChallengeManifestSnapshot,
  type DuelFormat
} from '@skribbl-duels/product-core';

const manifest = createChallengeManifest({
  definitionsVersion: CHALLENGE_DEFINITIONS_VERSION,
  definitions: starterChallengeDefinitions.map(definition => ({
    id: definition.id,
    version: definition.version,
    metadata: definition.metadata,
    defaultParameters: definition.defaultParameters
  }))
}, 'en', 0);

function asCapabilities(values: readonly GatewayClientCapability[]): ReadonlySet<ChallengeCapability> {
  return new Set(values as readonly ChallengeCapability[]);
}

function boardSize(format: DuelFormat): 9 | 25 {
  return format === 'casual' ? 9 : 25;
}

export class GatewayDraftAuthority {
  public readonly manifest: ChallengeManifestSnapshot = manifest;

  public requiredPickCount(format: DuelFormat): 9 | 25 {
    return boardSize(format);
  }

  public definitionVersion(challengeId: string): number | null {
    return this.manifest.entries.find(entry => entry.id === challengeId)?.definitionVersion ?? null;
  }

  public availableChallengeIds(
    format: DuelFormat,
    selectedChallengeIds: readonly string[],
    capabilities: readonly GatewayClientCapability[],
    seed: number
  ): string[] {
    const selected = new Set(selectedChallengeIds);
    const available = asCapabilities(capabilities);
    return this.manifest.entries
      .filter(entry => entry.formats.includes(format))
      .filter(entry => format !== 'ranked' || entry.rankedEligible)
      .filter(entry => !selected.has(entry.id))
      .filter(entry => entry.capabilities.every(capability => available.has(capability)))
      .filter(entry => generateDraftBoard(this.manifest, {
        format,
        seed,
        includeIds: [...selectedChallengeIds, entry.id],
        capabilities: { available }
      }, 0).board !== null)
      .map(entry => entry.id);
  }

  public createChallengeOffer(
    format: DuelFormat,
    selectedChallengeIds: readonly string[],
    capabilities: readonly GatewayClientCapability[],
    seed: number,
    random: () => number
  ): string[] {
    const availableIds = this.availableChallengeIds(
      format,
      selectedChallengeIds,
      capabilities,
      seed
    );
    const availableEntries = availableIds
      .map(challengeId => this.manifest.entries.find(entry => entry.id === challengeId))
      .filter(entry => entry !== undefined);
    if (availableEntries.length < 2) return [];

    const selectedEntries = selectedChallengeIds
      .map(challengeId => this.manifest.entries.find(entry => entry.id === challengeId))
      .filter(entry => entry !== undefined);
    const categoryCounts = new Map<string, number>();
    for (const entry of selectedEntries) {
      categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);
    }

    const byCategory = new Map<string, typeof availableEntries>();
    for (const entry of availableEntries) {
      const entries = byCategory.get(entry.category) ?? [];
      entries.push(entry);
      byCategory.set(entry.category, entries);
    }
    const leastRepresentedCategory = (excluded?: string): string | null => {
      const categories = [...byCategory.keys()].filter(category => category !== excluded);
      if (categories.length === 0) return null;
      const minimum = Math.min(...categories.map(category => categoryCounts.get(category) ?? 0));
      const tied = categories.filter(category => (categoryCounts.get(category) ?? 0) === minimum);
      return tied[this.randomIndex(tied.length, random)] ?? null;
    };
    const pickFromCategory = (category: string, excludedId?: string): string | null => {
      const entries = (byCategory.get(category) ?? []).filter(entry => entry.id !== excludedId);
      return entries[this.randomIndex(entries.length, random)]?.id ?? null;
    };

    const firstCategory = leastRepresentedCategory();
    if (!firstCategory) return [];
    const firstId = pickFromCategory(firstCategory);
    if (!firstId) return [];
    const secondCategory = leastRepresentedCategory(firstCategory);
    const secondId = secondCategory
      ? pickFromCategory(secondCategory)
      : pickFromCategory(firstCategory, firstId);
    if (!secondId || secondId === firstId) return [];
    return random() < 0.5 ? [firstId, secondId] : [secondId, firstId];
  }

  public chooseFinalChallengeId(
    format: DuelFormat,
    selectedChallengeIds: readonly string[],
    capabilities: readonly GatewayClientCapability[],
    seed: number,
    random: () => number
  ): { challengeId: string; candidateChallengeIds: string[] } | null {
    const candidateChallengeIds = this.availableChallengeIds(
      format,
      selectedChallengeIds,
      capabilities,
      seed
    );
    if (candidateChallengeIds.length === 0) return null;

    const categoryCounts = new Map<string, number>();
    for (const challengeId of selectedChallengeIds) {
      const entry = this.manifest.entries.find(item => item.id === challengeId);
      if (entry) categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);
    }
    const candidates = candidateChallengeIds
      .map(challengeId => this.manifest.entries.find(entry => entry.id === challengeId))
      .filter(entry => entry !== undefined);
    const minimum = Math.min(...candidates.map(entry => categoryCounts.get(entry.category) ?? 0));
    const balanced = candidates.filter(entry => (categoryCounts.get(entry.category) ?? 0) === minimum);
    const selected = balanced[this.randomIndex(balanced.length, random)];
    return selected ? { challengeId: selected.id, candidateChallengeIds } : null;
  }

  public createCompletedBoard(
    format: DuelFormat,
    selectedChallengeIds: readonly string[],
    capabilities: readonly GatewayClientCapability[],
    seed: number,
    createdAt: number
  ): GatewayDraftBoardSnapshot {
    const result = generateDraftBoard(this.manifest, {
      format,
      seed,
      includeIds: selectedChallengeIds,
      capabilities: { available: asCapabilities(capabilities) }
    }, createdAt);
    if (!result.board || result.board.fields.length !== boardSize(format)) {
      throw new Error(result.issues.map(issue => issue.message).join(' ') || 'The draft board could not be completed.');
    }
    const actualIds = result.board.fields.map(field => field.challengeId);
    if (actualIds.some((challengeId, index) => challengeId !== selectedChallengeIds[index])) {
      throw new Error('The completed draft board does not preserve the authoritative pick order.');
    }
    return result.board;
  }

  private randomIndex(length: number, random: () => number): number {
    if (length <= 1) return 0;
    return Math.min(length - 1, Math.floor(random() * length));
  }
}
