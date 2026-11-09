import { useState } from 'react';
import { DEFAULT_EXPIRY, calendarCandidates, expiryWindows, nextReviewDue } from '../../engine';
import { today } from '../../util';
import { REGIONS } from '../../model';
import { bundledPacks } from '../../packs';
import { CalendarExport } from '../components/CalendarExport';
import { FieldGroup, Segmented, Switch } from '../components/controls';
import { EditArea } from '../components/EditArea';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSavedChange } from '../components/SavedNote';
import { useDocument, useEditable, useStoreStatus } from '../state';
import { usePacks } from '../usePacks';
import { formatReviewDate } from '../reviewDisplay';
import { applyRegion } from './region';
import { DataSection } from './settings/DataSection';
import { ContentPacks } from './settings/ContentPacks';
import { setPack } from './settings/packs';

/** Region, content packs, review cadence, anonymising and (later) the data section. */
export function SettingsScreen() {
  const doc = useDocument();
  const editable = useEditable();
  const activePacks = usePacks();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { settings } = doc;
  const storeStatus = useStoreStatus();
  const { change, note } = useSavedChange();
  const packs = bundledPacks();
  const windows = expiryWindows(settings);

  return (
    <div>
      <ScreenHeader title="Settings" back="/app/more" backLabel="More" />
      {note}

      <EditArea>
        <FieldGroup
          label="Region"
          hint="Sets the units, the pack of guidance and the links we show."
        >
          <Segmented
            label="Region"
            value={settings.region}
            options={REGIONS.map((r) => ({
              value: r,
              label: r === 'UK' ? 'United Kingdom' : 'United States',
            }))}
            onChange={(region) => change('region', (d) => applyRegion(d, region))}
          />
        </FieldGroup>

        <h2>Content packs</h2>
        <p className="muted">
          The lists of items, equipment and guidance the plan is built from. Packs for the other
          region stay off.
        </p>
        <ContentPacks
          packs={packs}
          settings={settings}
          onToggle={(p, checked) => change('packs', (d) => setPack(d, p, checked))}
        />

        <FieldGroup
          label="Review reminder"
          hint="How often to be asked to check the plan is still right."
        >
          <Segmented
            label="Review cadence"
            value={settings.reviewCadenceMonths}
            options={[
              { value: 3, label: 'Every 3 months' },
              { value: 6, label: 'Every 6 months' },
            ]}
            onChange={(m) =>
              change('review cadence', (d) => void (d.settings.reviewCadenceMonths = m))
            }
          />
          {storeStatus.kind === 'ok' ? (
            <p className="muted">Next review {formatReviewDate(nextReviewDue(doc))}</p>
          ) : null}
        </FieldGroup>

        <FieldGroup
          label="Expiry colours"
          hint="Best-before dates show in words and colours: Expired and Expires soon (red), Before next check (amber)."
        >
          <Segmented
            label="Expires soon within"
            value={windows.soonMonths}
            options={[0, 1, 2, 3].map((m) => ({
              value: m,
              label: m === 0 ? 'This month' : m === 1 ? '1 month' : `${m} months`,
            }))}
            onChange={(m) =>
              change('expiry soon', (d) => {
                d.settings.expirySoonMonths = m;
                // The check window includes the soon window, so it moves up with it.
                if ((d.settings.expiryCheckMonths ?? DEFAULT_EXPIRY.checkMonths) < m) {
                  d.settings.expiryCheckMonths = m;
                }
              })
            }
          />
          <Segmented
            label="Next check in"
            value={windows.checkMonths}
            options={[1, 2, 3, 6, 12]
              .filter((m) => m >= windows.soonMonths)
              .map((m) => ({
                value: m,
                label: m === 12 ? '1 year' : m === 1 ? '1 month' : `${m} months`,
              }))}
            onChange={(m) => change('expiry check', (d) => void (d.settings.expiryCheckMonths = m))}
          />
        </FieldGroup>

        <Switch
          label="Anonymise names"
          hint="Names are replaced if you ever send data to an AI review."
          checked={settings.anonymise}
          onChange={(anonymise) =>
            change('anonymise', (d) => void (d.settings.anonymise = anonymise))
          }
        />
      </EditArea>

      {storeStatus.kind === 'ok' && editable && (
        <button type="button" onClick={() => setCalendarOpen(true)}>
          Add to calendar
        </button>
      )}
      {calendarOpen && storeStatus.kind === 'ok' && editable && (
        <CalendarExport
          candidates={calendarCandidates(doc, activePacks, today())}
          createdAt={doc.meta.createdAt}
          asOf={today()}
          onClose={() => setCalendarOpen(false)}
        />
      )}
      <DataSection />
    </div>
  );
}
