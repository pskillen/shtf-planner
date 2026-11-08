import { Link, useParams } from 'react-router-dom';
import { checklist, checklistPacks, checklistRunView, checklistScenarios } from '../../engine';
import { today } from '../../util';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDocument } from '../state';
import { usePacks } from '../usePacks';
import { ChecklistPrintSheet, type PrintGroup } from './checklists/ChecklistPrintSheet';
import {
  checklistsPath,
  formatRunStart,
  parsePreviewIds,
  previewPath,
  runPath,
  viewerTimeZone,
} from './checklists/view';

/** The toolbar above the sheet. It is hidden on paper. */
function PrintBar({ back, backLabel }: { back: string; backLabel: string }) {
  return (
    <div className="print-bar no-print">
      <Link to={back} className="back-link">
        ← {backLabel}
      </Link>
      <button type="button" onClick={() => window.print()}>
        Print
      </button>
      <p className="muted">
        Opens your device's print dialog; choose "Save as PDF" there to keep a copy. Nothing is sent
        anywhere.
      </p>
    </div>
  );
}

const printedOn = () => `Printed ${formatRunStart(new Date().toISOString())}`;

/** A blank, printable copy of one scenario's steps, or several scenarios' combined. */
export function ChecklistPreviewPrintScreen() {
  const { scenarioId = '' } = useParams();
  const requested = parsePreviewIds(scenarioId);
  const doc = useDocument();
  const packs = usePacks();
  const known = checklistScenarios(doc, packs).filter((s) => requested.includes(s.id));
  if (requested.length === 0 || known.length < requested.length) {
    return (
      <div>
        <ScreenHeader title="Printable checklist" back={checklistsPath} backLabel="Checklists" />
        <p>That scenario is not available for your region.</p>
      </div>
    );
  }
  const knownIds = known.map((s) => s.id);
  const view = checklist(doc, packs, knownIds, today());
  const nameOf = new Map(known.map((s) => [s.id, s.name]));
  const combined = known.length > 1;
  const groups: PrintGroup[] = view.groups.map((g) => ({
    phase: g.phase,
    steps: g.steps.map((s) => ({
      id: s.id,
      text: s.text,
      source: s.source,
      ...(s.sourceTitle !== undefined ? { sourceTitle: s.sourceTitle } : {}),
      ...(s.sourceChecked !== undefined ? { sourceChecked: s.sourceChecked } : {}),
      ...(combined ? { forNames: s.scenarioIds.map((id) => nameOf.get(id) ?? id) } : {}),
    })),
  }));
  const names = known.map((s) => s.name).join(', ');
  const versions = checklistPacks(packs, doc.settings.region)
    .map((p) => `${p.id} version ${p.version}`)
    .join(', ');
  return (
    <div>
      <PrintBar back={previewPath(knownIds)} backLabel="Preview" />
      <ChecklistPrintSheet
        title={names}
        facts={['Blank copy: tick and write on it by hand.']}
        groups={groups}
        footer={[`Scenarios: ${names}`, `Content: ${versions}`, printedOn()]}
      />
    </div>
  );
}

/** A run as it was saved: ticks, tick times and saved notes, from the run's frozen steps. */
export function ChecklistRunPrintScreen() {
  const { runId = '' } = useParams();
  const doc = useDocument();
  const view = checklistRunView(doc, runId);
  if (!view) {
    return (
      <div>
        <ScreenHeader title="Printable checklist" back={checklistsPath} backLabel="Checklists" />
        <p>
          That list was not found. It may have been removed, or it has not reached this device yet.
        </p>
      </div>
    );
  }
  if (view.needsScenario) {
    return (
      <div>
        <ScreenHeader title="Printable checklist" back={runPath(runId)} backLabel="Checklist" />
        <p>
          This list has no scenario selected, so it has no steps to print. Choose a scenario on the
          list first.
        </p>
      </div>
    );
  }
  const selected = view.scenarios.filter((s) => s.selected);
  const names = selected.map((s) => s.name).join(', ');
  const nameOf = new Map(view.scenarios.map((s) => [s.id, s.name]));
  const combined = selected.length > 1;
  const groups: PrintGroup[] = view.groups.map((g) => ({
    phase: g.phase,
    steps: g.steps.map((s) => ({
      id: s.id,
      text: s.text,
      source: s.source,
      ...(s.sourceTitle !== undefined ? { sourceTitle: s.sourceTitle } : {}),
      ...(s.sourceChecked !== undefined ? { sourceChecked: s.sourceChecked } : {}),
      ...(combined ? { forNames: s.selectedScenarioIds.map((id) => nameOf.get(id) ?? id) } : {}),
      ...(s.doneAt !== undefined ? { doneAt: s.doneAt } : {}),
      ...(s.note !== undefined ? { note: s.note } : {}),
    })),
  }));
  const zone = viewerTimeZone();
  const versions = view.packs.map((p) => `${p.id} version ${p.version}`).join(', ');
  return (
    <div>
      <PrintBar back={runPath(runId)} backLabel="Checklist" />
      <ChecklistPrintSheet
        title={names}
        facts={[
          `Started ${formatRunStart(view.started)}${
            view.finished !== undefined ? `. Finished ${formatRunStart(view.finished)}` : ''
          }`,
          `${view.done} of ${view.total} done. Saved notes only; times are ${zone}.`,
        ]}
        groups={groups}
        footer={[
          `Scenarios: ${names}`,
          `Started ${formatRunStart(view.started)} (${zone})`,
          `Content: ${versions}`,
          printedOn(),
        ]}
      />
    </div>
  );
}
