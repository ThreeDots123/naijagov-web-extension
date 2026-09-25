import type { CopilotState } from "@/shared/state";

/**
 * A development-only way to see every state the panel can be in.
 *
 * Four of the five need a backend, a portal page or a checkpoint to reproduce,
 * and none of them should have to be faked by hand to check a colour or a line
 * of copy. It is rendered behind `import.meta.env.DEV`, so the production build
 * drops both the control and this module.
 *
 * It overrides what the panel *displays*. It never writes to session storage —
 * the service worker owns that, and a panel that could forge a state would be a
 * panel that could forge its way out of a checkpoint.
 */

export interface Scenario {
  label: string;
  connected: boolean;
  state: CopilotState;
  supported: boolean;
}

export const SCENARIOS = {
  live: { label: "Live", connected: false, state: "IDLE", supported: false },
  "not-connected": { label: "Not connected", connected: false, state: "IDLE", supported: true },
  reading: { label: "Reading", connected: true, state: "READING", supported: true },
  ready: { label: "Ready", connected: true, state: "READY", supported: true },
  unsupported: { label: "Unsupported page", connected: true, state: "READY", supported: false },
  checkpoint: { label: "Checkpoint", connected: true, state: "CHECKPOINT", supported: true },
} as const satisfies Record<string, Scenario>;

export type ScenarioKey = keyof typeof SCENARIOS;

export const SCENARIO_KEYS = Object.keys(SCENARIOS) as ScenarioKey[];

export interface StateSwitcherProps {
  value: ScenarioKey;
  onChange: (value: ScenarioKey) => void;
}

export function StateSwitcher({ value, onChange }: StateSwitcherProps) {
  return (
    <div className="flex flex-none items-center gap-2 border-t border-rule bg-page px-3 py-1.5">
      <label htmlFor="dev-scenario" className="flex-none text-[11px] text-ink-faint">
        DEV
      </label>

      <select
        id="dev-scenario"
        value={value}
        onChange={(event) => onChange(event.target.value as ScenarioKey)}
        className="min-w-0 flex-1 rounded border border-rule bg-surface px-1 py-0.5 text-[11px] text-ink-muted"
      >
        {SCENARIO_KEYS.map((key) => (
          <option key={key} value={key}>
            {SCENARIOS[key].label}
          </option>
        ))}
      </select>
    </div>
  );
}
