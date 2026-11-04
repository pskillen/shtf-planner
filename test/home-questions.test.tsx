// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeScreen } from '../src/app/screens/HomeScreen';
import {
  HOME_QUESTIONS,
  allHomeAnswered,
  type HomeAnswers,
  type HomeQuestion,
} from '../src/app/screens/homeQuestions';
import { StoreContext } from '../src/app/state/storeContext';
import type { Document } from '../src/model';
import type { DocumentStore } from '../src/store';
import { biggarDocument } from '../src/fixtures/household-biggar';

afterEach(cleanup);

function draw(answered: HomeQuestion[]) {
  const doc: Document = biggarDocument();
  const ok = { kind: 'ok' as const };
  const store = {
    get: () => doc,
    status: () => ok,
    subscribe: () => () => undefined,
    change: vi.fn(),
  } as unknown as DocumentStore;
  const mark = vi.fn();
  const answers: HomeAnswers = { answered: new Set(answered), mark };
  render(
    <MemoryRouter>
      <StoreContext.Provider value={store}>
        <HomeScreen embedded answers={answers} />
      </StoreContext.Provider>
    </MemoryRouter>,
  );
  return { mark };
}

describe('the Home questions in setup', () => {
  it('needs all four answered', () => {
    expect(allHomeAnswered(new Set())).toBe(false);
    expect(allHomeAnswered(new Set(HOME_QUESTIONS.slice(0, 3)))).toBe(false);
    expect(allHomeAnswered(new Set(HOME_QUESTIONS))).toBe(true);
  });

  it('starts the selects on Choose and mains gas on neither answer', () => {
    draw([]);
    for (const label of [
      'What kind of home is it?',
      'How is the house heated?',
      'How do you cook?',
    ]) {
      expect((screen.getByLabelText(label) as HTMLSelectElement).value).toBe('');
    }
    expect(screen.getAllByRole('option', { name: 'Choose' })).toHaveLength(3);
    const gas = screen.getByRole('radiogroup', { name: 'Mains gas' });
    expect(gas.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
  });

  it('shows the document value once a question is answered, and marks a pick', () => {
    const { mark } = draw(['heating']);
    expect((screen.getByLabelText('How is the house heated?') as HTMLSelectElement).value).toBe(
      'heat-pump',
    );
    fireEvent.change(screen.getByLabelText('How do you cook?'), { target: { value: 'induction' } });
    expect(mark).toHaveBeenCalledWith('cooking');
    fireEvent.click(screen.getByRole('radio', { name: 'No' }));
    expect(mark).toHaveBeenCalledWith('mainsGas');
  });
});
