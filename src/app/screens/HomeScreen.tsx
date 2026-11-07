import { useCallback, useEffect, useRef, useState } from 'react';
import { COOKINGS, HEATINGS, HOME_TYPES, INSULATIONS, REGIONS, type Document } from '../../model';
import { bundledPacks } from '../../packs';
import { Field, FieldGroup, NumberInput, Segmented, Switch } from '../components/controls';
import { EditArea } from '../components/EditArea';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSavedChange } from '../components/SavedNote';
import {
  COOKING_LABEL,
  GROWING_LABEL,
  HEATING_LABEL,
  HOME_TYPE_LABEL,
  INSULATION_LABEL,
} from '../labels';
import { useDocument } from '../state';
import { type HomeAnswers, type HomeQuestion } from './homeQuestions';
import { applyRegion, isAllElectric } from './region';

const AREA_DEBOUNCE_MS = 600;

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((v) => ({ value: v, label: labels[v] }));

/**
 * A select over an enum of the document. In first-run setup (`answers` given) it starts on a
 * "Choose" placeholder, not on the document's default, until the person picks.
 */
function ChooseField<T extends string>({
  label,
  question,
  value,
  values,
  labels,
  answers,
  onPick,
}: {
  label: string;
  question: HomeQuestion;
  value: T;
  values: readonly T[];
  labels: Record<T, string>;
  answers?: HomeAnswers;
  onPick: (next: T) => void;
}) {
  const unanswered = answers !== undefined && !answers.answered.has(question);
  return (
    <Field label={label}>
      <select
        value={unanswered ? '' : value}
        onChange={(e) => {
          answers?.mark(question);
          onPick(e.target.value as T);
        }}
      >
        {unanswered ? (
          <option value="" disabled>
            Choose
          </option>
        ) : null}
        {values.map((v) => (
          <option key={v} value={v}>
            {labels[v]}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * The home profile: one form, saved as you go. Used in onboarding and as a screen. In onboarding
 * `answers` is given: type, heating, cooking and mains gas start unanswered and must be picked.
 */
export function HomeScreen({
  embedded = false,
  answers,
}: {
  embedded?: boolean;
  answers?: HomeAnswers;
}) {
  const { home } = useDocument();
  const { change, note } = useSavedChange();
  const set = (label: string, fn: (home: Document['home'], draft: Document) => void) =>
    change(label, (d) => fn(d.home, d));
  const [area, setArea] = useState(home.area ?? '');
  const areaText = useRef(area);
  const savedArea = useRef(home.area ?? '');
  const areaTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    savedArea.current = home.area ?? '';
  });
  // The postcode saves a moment after typing stops, on blur, and when the screen is left.
  const commitArea = useCallback(() => {
    clearTimeout(areaTimer.current);
    const next = areaText.current.trim();
    if (next === savedArea.current) return;
    try {
      change('area', (d) => void (d.home.area = next === '' ? undefined : next));
      savedArea.current = next;
    } catch {
      // read-only meanwhile: nothing to save
    }
  }, [change]);
  useEffect(() => commitArea, [commitArea]);
  const subregions = bundledPacks().regions.UK?.subregions ?? [];

  return (
    <div>
      {embedded ? <h1>Tell us about your home</h1> : <ScreenHeader title="Home" />}
      {!embedded && (
        <p>
          Make a heating plan for a power cut. Check the equipment manual, ventilation and carbon
          monoxide detection; portable heaters must not be left unattended or used while sleeping.
        </p>
      )}
      {note}
      <EditArea>
        <ChooseField
          label="What kind of home is it?"
          question="type"
          value={home.type}
          values={HOME_TYPES}
          labels={HOME_TYPE_LABEL}
          answers={answers}
          onPick={(type) => set('home type', (h) => void (h.type = type))}
        />
        <Field label="How many floors?">
          <NumberInput
            value={home.floors}
            min={1}
            step={1}
            onChange={(n) =>
              n && set('floors', (h) => void (h.floors = Math.max(1, Math.round(n))))
            }
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
        <ChooseField
          label="How is the house heated?"
          question="heating"
          value={home.heating}
          values={HEATINGS}
          labels={HEATING_LABEL}
          answers={answers}
          onPick={(heating) => set('heating', (h) => void (h.heating = heating))}
        />
        <ChooseField
          label="How do you cook?"
          question="cooking"
          value={home.cooking}
          values={COOKINGS}
          labels={COOKING_LABEL}
          answers={answers}
          onPick={(cooking) => set('cooking', (h) => void (h.cooking = cooking))}
        />
        {answers ? (
          <FieldGroup label="Is there a mains gas supply?">
            <Segmented
              label="Mains gas"
              value={answers.answered.has('mainsGas') ? (home.mainsGas ? 'yes' : 'no') : undefined}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              onChange={(v) => {
                answers.mark('mainsGas');
                set('mains gas', (h) => void (h.mainsGas = v === 'yes'));
              }}
            />
          </FieldGroup>
        ) : (
          <Switch
            label="Is there a mains gas supply?"
            checked={home.mainsGas}
            onChange={(mainsGas) => set('mains gas', (h) => void (h.mainsGas = mainsGas))}
          />
        )}
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
            onChange={(e) => {
              setArea(e.target.value);
              areaText.current = e.target.value;
              clearTimeout(areaTimer.current);
              areaTimer.current = setTimeout(commitArea, AREA_DEBOUNCE_MS);
            }}
            onBlur={commitArea}
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
      </EditArea>
    </div>
  );
}
