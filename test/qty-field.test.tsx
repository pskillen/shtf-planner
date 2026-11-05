// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QtyField } from '../src/app/components/QtyField';
import { formatQty } from '../src/util';

afterEach(cleanup);

describe('formatQty', () => {
  it('formats wholes and quarters', () => {
    expect(formatQty(2)).toBe('2');
    expect(formatQty(0.5)).toBe('½');
    expect(formatQty(2.75)).toBe('2¾');
  });
});

describe('QtyField', () => {
  it('keeps the total above zero and allows half packs', () => {
    const onChange = vi.fn();
    const Harness = () => {
      const [value, setValue] = useState(1);
      return (
        <QtyField
          value={value}
          onChange={(n) => {
            setValue(n);
            onChange(n);
          }}
          label="How many tins"
        />
      );
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('radio', { name: '½' }));
    expect(onChange).toHaveBeenCalledWith(1.5);
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /One fewer/i }));
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it('starts whole packs at one when no fraction is chosen', () => {
    const Harness = () => {
      const [value, setValue] = useState(2.25);
      return <QtyField value={value} onChange={setValue} />;
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('radio', { name: '+' }));
    const input = screen.getByRole('spinbutton', { name: /How many, number/i });
    expect(input.getAttribute('min')).toBe('1');
  });
});
