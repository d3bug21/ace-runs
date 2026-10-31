// What screens may ask of the app. Implemented by App (src/app/App.ts).
import type { CharacterId, RideId, RunMode, StageId } from '../contracts';
import type { SaveData } from '../app/Save';
import type { DeviceInfo } from '../app/Device';
import type { AudioPort, Speaker } from '../app/types';
import type { WarmupView } from './Stretch';

export type UiSound = 'click' | 'back' | 'select' | 'unlock' | 'page' | 'star';

export interface AppApi {
  readonly save: SaveData;
  readonly device: DeviceInfo;
  readonly audio: AudioPort;
  /** True when touch glyphs should be shown (touch device or last input was touch). */
  touchGlyphs(): boolean;
  sound(s: UiSound): void;
  voice(speaker: Speaker, group: string, opts?: { priority?: boolean; interrupt?: boolean; delay?: number }): number;
  goTitle(): void;
  goCharacter(): void;
  goRide(): void;
  goStages(): void;
  afterRide(): void;
  openBook(): void;
  openSettings(): void;
  selectCharacter(c: CharacterId, announce: boolean): void;
  selectRide(r: RideId, announce: boolean): void;
  previewStage(s: StageId): void;
  startTutorial(): void;
  startStage(stage: StageId, mode: RunMode): void;
  quitApp(): void;
  /** v1.0.1 warm-up: a new view wired to the shared warm-up controller. */
  newWarmView(): WarmupView;
  /** Guided "Stretch with me!" routine is running. */
  warmGuided(): boolean;
  /** A place picked on the stage select / "Next place", waiting for the ride re-pick + intro. */
  pendingRun(): { stage: StageId; mode: RunMode } | null;
}
