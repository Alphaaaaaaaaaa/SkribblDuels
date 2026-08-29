import {
  EMBEDDED_SOUND_ASSETS,
  SOUND_ASSET_PATHS,
  type SoundEffectId
} from './generatedSoundAssets';

export interface SoundAudioLike {
  volume: number;
  currentTime: number;
  play(): Promise<unknown> | void;
  pause?(): void;
}

export type SoundAudioFactory = (source: string) => SoundAudioLike;

export interface SoundPlaybackDiagnostics {
  volumePercent: number;
  configuredSounds: number;
  embeddedSounds: number;
  missingSoundIds: SoundEffectId[];
  unlockAttempted: boolean;
  unlocked: boolean;
  playbackAttempts: number;
  playbackStarts: number;
  playbackRejections: number;
  lastSoundId: SoundEffectId | null;
  lastError: string | null;
  browserHasBeenActive: boolean | null;
}

export class SoundEffectPlayer {
  private volume = 0.82;
  private unlockAttempted = false;
  private unlocked = false;
  private unlockPromise: Promise<boolean> | null = null;
  private playbackAttempts = 0;
  private playbackStarts = 0;
  private playbackRejections = 0;
  private lastSoundId: SoundEffectId | null = null;
  private lastError: string | null = null;

  public constructor(
    private readonly assets: Readonly<Partial<Record<SoundEffectId, string>>> = EMBEDDED_SOUND_ASSETS,
    private readonly createAudio: SoundAudioFactory = source => new Audio(source)
  ) {}

  public setVolume(percent: number): void {
    const normalized = Number.isFinite(percent) ? Math.round(percent) : 82;
    this.volume = Math.min(100, Math.max(0, normalized)) / 100;
  }

  /**
   * Chrome may reject media started before the page has received a trusted
   * gesture. The product calls this from a capture-phase pointer/key handler,
   * silently priming one embedded media element for later socket/timer SFX.
   */
  public unlock(): Promise<boolean> {
    if (this.unlocked) return Promise.resolve(true);
    if (this.unlockPromise) return this.unlockPromise;
    this.unlockAttempted = true;
    const source = Object.values(this.assets).find((value): value is string => Boolean(value));
    if (!source) {
      this.lastError = 'No sound assets are embedded in this build.';
      return Promise.resolve(false);
    }
    this.unlockPromise = (async () => {
      try {
        const audio = this.createAudio(source);
        audio.volume = 0;
        audio.currentTime = 0;
        await audio.play();
        audio.pause?.();
        audio.currentTime = 0;
        this.unlocked = true;
        this.lastError = null;
        return true;
      } catch (error) {
        this.lastError = this.errorMessage(error);
        return false;
      } finally {
        this.unlockPromise = null;
      }
    })();
    return this.unlockPromise;
  }

  public play(soundId: SoundEffectId): boolean {
    const source = this.assets[soundId];
    if (!source || this.volume <= 0) return false;
    this.playbackAttempts += 1;
    this.lastSoundId = soundId;
    try {
      const audio = this.createAudio(source);
      audio.volume = this.volume;
      audio.currentTime = 0;
      const attempt = audio.play();
      if (attempt && typeof attempt.then === 'function') {
        void attempt.then(() => {
          this.playbackStarts += 1;
          this.lastError = null;
        }).catch(error => {
          this.playbackRejections += 1;
          this.lastError = this.errorMessage(error);
        });
      } else {
        this.playbackStarts += 1;
        this.lastError = null;
      }
      return true;
    } catch (error) {
      this.playbackRejections += 1;
      this.lastError = this.errorMessage(error);
      return false;
    }
  }

  public getDiagnostics(): SoundPlaybackDiagnostics {
    const configured = Object.keys(SOUND_ASSET_PATHS) as SoundEffectId[];
    const activation = typeof navigator === 'undefined'
      ? null
      : (navigator as Navigator & {
          userActivation?: { hasBeenActive?: boolean };
        }).userActivation?.hasBeenActive ?? null;
    return {
      volumePercent: Math.round(this.volume * 100),
      configuredSounds: configured.length,
      embeddedSounds: configured.filter(soundId => Boolean(this.assets[soundId])).length,
      missingSoundIds: configured.filter(soundId => !this.assets[soundId]),
      unlockAttempted: this.unlockAttempted,
      unlocked: this.unlocked,
      playbackAttempts: this.playbackAttempts,
      playbackStarts: this.playbackStarts,
      playbackRejections: this.playbackRejections,
      lastSoundId: this.lastSoundId,
      lastError: this.lastError,
      browserHasBeenActive: activation
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  }
}
