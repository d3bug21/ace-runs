// The audio surface the app uses. Structurally identical to the documented AudioManager API
// (src/audio/AudioManager.ts) so the app layer and the dev harness can run with either.
export type Bus = 'music' | 'voice' | 'sfx';
export type Speaker = 'ace' | 'ciela' | 'narrator';

export interface LoopHandle {
  setVolume(v: number): void;
  setRate(r: number): void;
  stop(fade?: number): void;
}

export interface AudioPort {
  unlock(): void;
  readonly unlocked: boolean;
  setVolume(bus: Bus, v: number): void;
  getVolume(bus: Bus): number;
  preload(selectors: string[]): Promise<void>;
  playSfx(id: string, opts?: { volume?: number; rate?: number; pan?: number; delay?: number }): void;
  playVoice(speaker: Speaker, group: string, opts?: { priority?: boolean; minGap?: number; interrupt?: boolean; delay?: number }): number;
  hasVoice(speaker: Speaker, group: string): boolean;
  stopVoices(): void;
  playMusic(id: string | null, fade?: number): void;
  playAmbience(id: string | null, fade?: number): void;
  loop(key: string, id: string | null, volume?: number): LoopHandle | null;
  setDuck(amount: number): void;
  suspend(): void;
  resume(): void;
}
