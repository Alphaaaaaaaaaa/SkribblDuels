import {
  EMBEDDED_SOUND_ASSETS,
  type SoundEffectId
} from './generatedSoundAssets';

export interface SoundAudioLike {
  volume: number;
  currentTime: number;
  play(): Promise<unknown> | void;
}

export type SoundAudioFactory = (source: string) => SoundAudioLike;

export class SoundEffectPlayer {
  private volume = 0.82;

  public constructor(
    private readonly assets: Readonly<Partial<Record<SoundEffectId, string>>> = EMBEDDED_SOUND_ASSETS,
    private readonly createAudio: SoundAudioFactory = source => new Audio(source)
  ) {}

  public setVolume(percent: number): void {
    const normalized = Number.isFinite(percent) ? Math.round(percent) : 82;
    this.volume = Math.min(100, Math.max(0, normalized)) / 100;
  }

  public play(soundId: SoundEffectId): boolean {
    const source = this.assets[soundId];
    if (!source || this.volume <= 0) return false;
    try {
      const audio = this.createAudio(source);
      audio.volume = this.volume;
      audio.currentTime = 0;
      const attempt = audio.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }
}
