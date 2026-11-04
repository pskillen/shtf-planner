// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentProvider, useChange, useDocument } from '../src/app/state';

function Probe() {
  const doc = useDocument();
  const change = useChange();
  return (
    <div>
      <p data-testid="count">{doc.household.members.length}</p>
      <button
        onClick={() =>
          change('add member', (d) => {
            d.household.members.push({
              id: `m${d.household.members.length}`,
              name: 'Alex',
              dob: '1984-03-12',
              tags: [],
              medication: [],
            });
          })
        }
      >
        add
      </button>
    </div>
  );
}

afterEach(cleanup);

describe('DocumentProvider', () => {
  it('opens the document, then useChange re-renders useDocument', async () => {
    render(
      <DocumentProvider>
        <Probe />
      </DocumentProvider>,
    );
    expect(screen.getByText(/Loading your plan/)).toBeTruthy();
    expect(await screen.findByTestId('count')).toBeTruthy();
    expect(screen.getByTestId('count').textContent).toBe('0');
    await act(async () => {
      screen.getByRole('button', { name: 'add' }).click();
    });
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('useDocument outside the provider says so', () => {
    expect(() => render(<Probe />)).toThrow(/inside <DocumentProvider>/);
  });
});
