// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MonthField } from '../src/app/screens/stores/MonthField';

afterEach(cleanup);

function monthNative(): boolean {
  const probe = document.createElement('input');
  probe.setAttribute('type', 'month');
  return probe.type === 'month';
}

describe('MonthField hints', () => {
  it('shows Optional. when empty', () => {
    render(
      <MonthField
        value={undefined}
        onChange={() => undefined}
        shelfLife="years"
        today="2026-11-05"
      />,
    );
    expect(screen.getByText('Optional.')).toBeTruthy();
  });

  it('with a native month box, does not repeat the chosen month under the label', () => {
    if (!monthNative()) return;
    render(
      <MonthField
        value="2027-03"
        onChange={() => undefined}
        shelfLife="years"
        today="2026-11-05"
      />,
    );
    expect(screen.queryByText('Mar 2027')).toBeNull();
    expect(document.querySelector('input[type="month"]')).toBeTruthy();
  });

  it('with a text box, echoes the parsed month in the hint', () => {
    if (monthNative()) {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type')!;
      Object.defineProperty(HTMLInputElement.prototype, 'type', {
        ...desc,
        get() {
          const t = desc.get!.call(this) as string;
          return t === 'month' ? 'text' : t;
        },
        configurable: true,
      });
    }
    render(
      <MonthField
        value="2027-03"
        onChange={() => undefined}
        shelfLife="years"
        today="2026-11-05"
      />,
    );
    expect(screen.getByText('Mar 2027')).toBeTruthy();
    expect(document.querySelector('input[placeholder="Mar 2027"]')).toBeTruthy();
  });

  it('with a text box, shows the parse error instead of a month hint', () => {
    if (monthNative()) {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type')!;
      Object.defineProperty(HTMLInputElement.prototype, 'type', {
        ...desc,
        get() {
          const t = desc.get!.call(this) as string;
          return t === 'month' ? 'text' : t;
        },
        configurable: true,
      });
    }
    render(
      <MonthField
        value={undefined}
        onChange={() => undefined}
        shelfLife="years"
        today="2026-11-05"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Mar 2027'), { target: { value: 'soon' } });
    expect(screen.getByText(/Read as a month and year/)).toBeTruthy();
    expect(screen.queryByText('Optional.')).toBeNull();
  });
});

describe('MonthField action', () => {
  it('renders the action beside the input', () => {
    render(
      <MonthField
        value={undefined}
        onChange={() => undefined}
        shelfLife="years"
        today="2026-11-05"
        action={<button type="button">Read the date</button>}
      />,
    );
    expect(document.querySelector('.field-input-row')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Read the date' })).toBeTruthy();
  });
});
