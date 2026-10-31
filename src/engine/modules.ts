// Module bindings used by the engine (avatar, food models, effects, stages).
import type { StageId, StageModule } from '../contracts';
import { createArcadeStage } from '../stages/arcade';
import { createIndoorStage } from '../stages/indoor';
import { createJungleStage } from '../stages/jungle';
import { createOutdoorStage } from '../stages/outdoor';
import { createParksStage } from '../stages/parks';
import { createSportsStage } from '../stages/sports';
import { createFallbackStage } from './FallbackStage';

export { createAvatar } from '../avatar/index';
export { createFoodModel } from '../food/models';
export { createEffects } from '../fx/Effects';

const FACTORIES: Record<StageId, () => StageModule> = {
  indoor: createIndoorStage,
  arcade: createArcadeStage,
  outdoor: createOutdoorStage,
  sports: createSportsStage,
  jungle: createJungleStage,
  parks: createParksStage,
};

export function createStage(id: StageId): StageModule {
  const f = FACTORIES[id];
  return f ? f() : createFallbackStage(id);
}
