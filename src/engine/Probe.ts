// Directional-control probe: attached only when the page URL asks for it. It drives the REAL app
// and engine (same run state, same window keyboard listeners) and reads the live runner + camera.
import type { Engine, RunOptions } from './api';

interface ProbeCapable {
  probeSample(): { position: [number, number, number]; forward: [number, number, number]; right: [number, number, number] };
  readonly isReadyForControl: boolean;
}

export interface ProbeDeps {
  app: { startRunDirect(o: RunOptions & { skipCountdown?: boolean }): Promise<void> };
  engine: Engine;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function installProbeIfRequested(deps: ProbeDeps): void {
  let flag: string | null = null;
  try {
    flag = new URLSearchParams(location.search).get('oneshot-directional-probe');
  } catch {
    flag = null;
  }
  if (flag !== '1') return;
  const engine = deps.engine as Engine & ProbeCapable;
  const probe = Object.freeze({
    schemaVersion: '1.0' as const,
    async reset(): Promise<void> {
      // One seeded, stable state: Ace in running shoes, indoor playground, middle lane, start of the
      // track (the first obstacles are 45 m ahead), countdown skipped, gameplay input live.
      await deps.app.startRunDirect({ character: 'ace', ride: 'shoes', stage: 'indoor', mode: 'adventure', seed: 20261031, skipCountdown: true });
      for (let i = 0; i < 600 && !engine.isReadyForControl; i++) await nextFrame();
      await nextFrame();
      await nextFrame();
    },
    sample() {
      const s = engine.probeSample();
      return { frame: 'screen-lane', measurement: 'position' as const, position: s.position, forward: s.forward, right: s.right };
    },
  });
  Object.defineProperty(window, '__ONESHOT_DIRECTIONAL_CONTROL_PROBE__', { value: probe, configurable: true, enumerable: false });
}
