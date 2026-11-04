import { useState } from 'react';
import { COOKINGS, HEATINGS, HOME_TYPES, INSULATIONS, REGIONS, type Document } from '../../model';
import { bundledPacks } from '../../packs';
import { Field, FieldGroup, NumberInput, Segmented, Switch } from '../components/controls';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  COOKING_LABEL,
  GROWING_LABEL,
  HEATING_LABEL,
  HOME_TYPE_LABEL,
  INSULATION_LABEL,
} from '../labels';
import { useChange, useDocument } from '../state';
import { applyRegion, isAllElectric } from './region';

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((v) => ({ value: v, label: labels[v] }));

/** The home profile: one form, saved as you go. Used in onboarding and as a screen. */
export function HomeScreen({ embedded = false }: { embedded?: boolean }) {
  const { home } = useDocument();
  const change = useChange();
  const set = (label: string, fn: (home: Document['home'], draft: Document) => void) =>
    change(label, (d) => fn(d.home, d));
  const [area, setArea] = useState(home.area ?? '');
  const subregions = bundledPacks().regions.UK?.subregions ?? [];

  return (
    <div>
      {embedded ? <h1>Tell us about your home</h1> : <ScreenHeader title="Home" />}

      <Field label="What kind of home is it?">
        <select
          value={home.type}
          onChange={(e) =>
            set('home type', (h) => void (h.type = e.target.value as typeof home.type))
          }
        >
          {HOME_TYPES.map((v) => (
            <option key={v} value={v}>
              {HOME_TYPE_LABEL[v]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="How many floors?">
        <NumberInput
          value={home.floors}
          min={1}
          step={1}
          ariaLabel="Floors"
          onChange={(n) => n && set('floors', (h) => void (h.floors = Math.max(1, Math.round(n))))}
        />
      </Field>
      <FieldGroup label="How well insulated is it?">
        <Segmented
          label="Insulation"
          value={home.insulation}
          options={opts(INSULATIONS, INSULATION_LABEL)}
          onChange={(insulation) => set('insulation', (h) => void (h.insulation = insulation))}
        />
      </FieldGroup>
      <Field label="How is the house heated?">
        <select
          value={home.heating}
          onChange={(e) =>
            set('heating', (h) => void (h.heating = e.target.value as typeof home.heating))
          }
        >
          {HEATINGS.map((v) => (
            <option key={v} value={v}>
              {HEATING_LABEL[v]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="How do you cook?">
        <select
          value={home.cooking}
          onChange={(e) =>
            set('cooking', (h) => void (h.cooking = e.target.value as typeof home.cooking))
          }
        >
          {COOKINGS.map((v) => (
            <option key={v} value={v}>
              {COOKING_LABEL[v]}
            </option>
          ))}
        </select>
      </Field>
      <Switch
        label="Is there a mains gas supply?"
        checked={home.mainsGas}
        onChange={(mainsGas) => set('mains gas', (h) => void (h.mainsGas = mainsGas))}
      />
      {isAllElectric(home) ? (
        <p className="note" role="note">
          In a power cut this home has no heat or cooking; the score will show that.
        </p>
      ) : null}
      <Switch
        label="Solar panels"
        checked={home.solar}
        onChange={(solar) => set('solar', (h) => void (h.solar = solar))}
      />
      <Switch
        label="Home battery"
        checked={home.homeBattery}
        onChange={(homeBattery) => set('battery', (h) => void (h.homeBattery = homeBattery))}
      />
      <Switch
        label="Electric car charger"
        checked={home.evCharger}
        onChange={(evCharger) => set('ev charger', (h) => void (h.evCharger = evCharger))}
      />
      <FieldGroup label="How much food do you grow?">
        <Segmented
          label="Growing"
          value={home.growing}
          options={opts(['none', 'small', 'large'] as const, GROWING_LABEL)}
          onChange={(growing) => set('growing', (h) => void (h.growing = growing))}
        />
      </FieldGroup>
      <Field
        label="Postcode district or town"
        hint="Optional, like ML12. It stays on this device and is never sent anywhere."
      >
        <input
          type="text"
          autoComplete="off"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          onBlur={() => {
            const next = area.trim();
            if (next !== (home.area ?? ''))
              set('area', (h) => void (h.area = next === '' ? undefined : next));
          }}
        />
      </Field>
      <FieldGroup label="Where are you?">
        <Segmented
          label="Region"
          value={home.region}
          options={REGIONS.map((r) => ({
            value: r,
            label: r === 'UK' ? 'United Kingdom' : 'United States',
          }))}
          onChange={(region) => change('region', (d) => applyRegion(d, region))}
        />
      </FieldGroup>
      {home.region === 'UK' ? (
        <Field label="Which part of the UK?" hint="Picks the right flood and warning links.">
          <select
            value={home.subregion ?? ''}
            onChange={(e) =>
              set('subregion', (h) => {
                if (e.target.value === '') delete h.subregion;
                else h.subregion = e.target.value;
              })
            }
          >
            <option value="">Not set</option>
            {subregions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </div>
  );
}
