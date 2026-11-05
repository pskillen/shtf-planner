import { DEFAULT_EXPIRY, expiryWindows } from '../../engine';
import { REGIONS } from '../../model';
import { bundledPacks } from '../../packs';
import { FieldGroup, Segmented, Switch } from '../components/controls';
import { EditArea } from '../components/EditArea';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSavedChange } from '../components/SavedNote';
import { useDocument } from '../state';
import { applyRegion } from './region';
import { DataSection } from './settings/DataSection';
import { packLabel, packSwitch, setPack } from './settings/packs';

/** Region, content packs, review cadence, anonymising and (later) the data section. */
export function SettingsScreen() {
  const { settings } = useDocument();
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
        <ul className="row-list">
          {packs.all.map((p) => {
            const { on, wrongRegion } = packSwitch(p, settings);
            return (
              <li key={p.id} className="row-item">
                <Switch
                  label={packLabel(p)}
                  hint={wrongRegion ? `${p.region} only` : undefined}
                  checked={on}
                  disabled={wrongRegion}
                  onChange={(checked) => change('packs', (d) => setPack(d, p, checked))}
                />
              </li>
            );
          })}
        </ul>

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

      <DataSection />
    </div>
  );
}
