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
}
