// Public engine API used by the app/UI layer. Lead-owned contract.
import type {
  BenefitId,
  CharacterId,
  FoodDef,
  JunkEffectId,
  PowerState,
  RideId,
  RunMode,
  Season,
  StageId,
  StageSection,
} from '../contracts';

export interface RunOptions {
  character: CharacterId;
  ride: RideId;
  stage: StageId;
  mode: RunMode;
  seed?: number;
}

export type TutorialStep = 'intro' | 'left' | 'right' | 'jump' | 'slide' | 'healthy' | 'junk' | 'done';

export interface RunStats {
  stage: StageId;
  mode: RunMode;
  character: CharacterId;
  ride: RideId;
  distance: number; // metres
  goal: number | null; // adventure finish distance, null for endless
  finished: boolean; // crossed the finish line (adventure) or completed tutorial
  timeSec: number;
  score: number;
  healthy: Record<string, number>; // food id -> count
  junk: Record<string, number>;
  healthyTotal: number;
  junkTotal: number;
  nearMisses: number;
  bumps: number;
  bestGlowLevel: number; // 0..5
  happyAndHealthy: number; // times the glow filled up
  sectionsSeen: string[]; // section ids passed (sports / seasons)
  seasonsSeen: Season[];
  stars: 0 | 1 | 2 | 3;
}

export type EngineEvent =
  | { type: 'loading'; progress: number }
  | { type: 'countdown'; n: 3 | 2 | 1 | 0 } // 0 = GO
  | { type: 'food'; food: FoodDef; count: number }
  | { type: 'bump'; hearts: number }
  | { type: 'heart'; hearts: number } // regained a heart
  | { type: 'shieldBlock' }
  | { type: 'bonk' }
  | { type: 'nearMiss' }
  | { type: 'glow'; level: number; full: boolean }
  | { type: 'section'; section: StageSection; index: number }
  | { type: 'tutorial'; step: TutorialStep }
  | { type: 'pause'; paused: boolean } // the player pressed P / Esc / the pause key (engine already paused/resumed)
  | { type: 'end'; stats: RunStats }; // run over: finished, puffed out (no hearts), or tutorial complete

export interface ActiveEffect<T extends string> {
  id: T;
  t: number; // seconds remaining
  max: number; // full duration
}

export interface HudState {
  running: boolean;
  paused: boolean;
  mode: RunMode;
  stage: StageId;
  hearts: number;
  maxHearts: number;
  healthy: number;
  junk: number;
  score: number;
  distance: number;
  goal: number | null;
  progress: number; // 0..1 toward the finish (adventure), 0 for endless
  section: StageSection;
  sections: StageSection[]; // for a progress bar with section markers (within goal)
  powers: ActiveEffect<BenefitId | 'magnet'>[];
  junkEffects: ActiveEffect<JunkEffectId | 'slump'>[];
  power: PowerState;
  countdown: number; // >0 while counting down
  tutorialStep: TutorialStep | null;
}

export type MenuView = 'title' | 'character' | 'ride' | 'stage' | 'results' | 'book' | 'settings';

export interface MenuSceneOptions {
  view: MenuView;
  character: CharacterId;
  ride: RideId;
  stage?: StageId; // backdrop theme
  /** Results: celebrate (true) or "great try" (false). */
  celebrate?: boolean;
}

export interface EngineSettings {
  reducedMotion: boolean;
  quality: 'auto' | 'low' | 'high';
}

export interface Engine {
  readonly canvas: HTMLCanvasElement;
  readonly running: boolean;
  readonly paused: boolean;
  on(fn: (e: EngineEvent) => void): () => void;
  /** 3D backdrop behind menus (avatar on a podium in a themed set). */
  showMenu(opts: MenuSceneOptions): void;
  /** Loads the stage and starts the countdown. Resolves once the countdown begins. */
  startRun(opts: RunOptions): Promise<void>;
  pause(): void;
  resume(): void;
  /** Restart the current run from the beginning (same options, new seed). */
  restartRun(): void;
  /** Abandon the current run silently (no 'end' event). */
  quitRun(): void;
  hud(): HudState;
  setSettings(s: EngineSettings): void;
  /** Keyboard + swipe gameplay input enable (disabled while menus overlay). */
  setInputEnabled(on: boolean): void;
}
