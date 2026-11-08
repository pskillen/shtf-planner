interface PickerScenario {
  id: string;
  name: string;
  selected: boolean;
}

/**
 * Which of a run's own scenarios are selected. Only the scenarios the run was started with are
 * offered (its frozen catalogue). The last one selected cannot be unticked; a run with none
 * (after a bad merge) can have any one ticked.
 */
export function ScenarioPicker({
  scenarios,
  hiddenWithState,
  onChange,
}: {
  scenarios: readonly PickerScenario[];
  hiddenWithState: number;
  /** The new selection, in the run's catalogue order. */
  onChange: (ids: string[]) => void;
}) {
  const selectedCount = scenarios.filter((s) => s.selected).length;
  function toggle(id: string, on: boolean) {
    onChange(scenarios.filter((s) => (s.id === id ? on : s.selected)).map((s) => s.id));
  }
  return (
    <fieldset className="checklist-picker">
      <legend>Scenarios in this list</legend>
      {scenarios.map((s) => (
        <label key={s.id} className="check-row">
          <input
            type="checkbox"
            checked={s.selected}
            disabled={s.selected && selectedCount === 1}
            onChange={(e) => toggle(s.id, e.target.checked)}
          />
          <span>{s.name}</span>
        </label>
      ))}
      <p className="muted">
        At least one scenario stays selected. Removing a scenario hides the steps only it supplies.
        {hiddenWithState > 0
          ? ` ${hiddenWithState} hidden ${hiddenWithState === 1 ? 'step keeps' : 'steps keep'} a tick or note, and ${hiddenWithState === 1 ? 'it comes' : 'they come'} back if you add the scenario again.`
          : ' Ticks and notes on hidden steps are kept and come back if you add the scenario again.'}
      </p>
    </fieldset>
  );
}
