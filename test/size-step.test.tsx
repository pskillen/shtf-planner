// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldSkipSizeStep } from '../src/app/screens/stores/pickerHelpers';
import { SizeStep } from '../src/app/screens/stores/SizeStep';
import { biggarDocument } from '../src/fixtures/household-biggar';
import { bundledPacks } from '../src/packs';
import { liveStore } from './helpers/liveStore';

afterEach(cleanup);

const beans = () => bundledPacks().items['items-base:baked-beans']!;

describe('shouldSkipSizeStep', () => {
  it('is true for one size and no products', () => {
    const doc = biggarDocument();
    delete doc.products['prod-beans'];
    const oneSize = { ...beans(), sizes: [beans().sizes[0]!] };
    expect(shouldSkipSizeStep(doc, oneSize)).toBe(true);
  });

  it('is false when the household already has a product of the item', () => {
    expect(shouldSkipSizeStep(biggarDocument(), beans())).toBe(false);
  });
});

describe('SizeStep as a new product form (confirm)', () => {
  it('has the name first, a size already chosen, and saves only on Save product', () => {
    const onDone = vi.fn();
    const s = liveStore(biggarDocument());
    render(s.wrap(<SizeStep confirm item={beans()} initialName="Calpol" onDone={onDone} />));
    const name = screen.getByLabelText(/^Product name/);
    const first = screen.getByRole('button', { pressed: true });
    expect(name.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '415 g' }));
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: '' } });
    expect(
      (screen.getByRole('button', { name: 'Save product' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(name, { target: { value: 'Calpol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: beans().id, name: 'Calpol' }),
    );
  });
});

describe('SizeStep new product form: a typed size', () => {
  it('is saved by Save product, with no separate Use this size button', () => {
    const onDone = vi.fn();
    const s = liveStore(biggarDocument());
    const water = bundledPacks().items['items-base:water-container']!;
    const drink = {
      ...water,
      measure: 'volume' as const,
      sizes: [{ amount: 500, unit: 'ml' as const }],
    };
    render(s.wrap(<SizeStep confirm item={drink} initialName="Cola" onDone={onDone} />));
    fireEvent.click(screen.getByRole('button', { name: 'Another size' }));
    expect(screen.queryByRole('button', { name: 'Use this size' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '330' } });
    fireEvent.click(screen.getByRole('radio', { name: 'ml' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cola', size: { amount: 330, unit: 'ml' } }),
    );
  });

  it('keeps the highlighted chip when the form is closed by tapping a chip', () => {
    const onDone = vi.fn();
    const s = liveStore(biggarDocument());
    render(s.wrap(<SizeStep confirm item={beans()} initialName="Beans" onDone={onDone} />));
    fireEvent.click(screen.getByRole('button', { name: 'Another size' }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '330' } });
    fireEvent.click(screen.getByRole('button', { name: '415 g' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ size: beans().sizes[0] }));
  });

  it('disables Save product while the Amount is blank, so a stale size cannot be saved', () => {
    const onDone = vi.fn();
    const s = liveStore(biggarDocument());
    render(s.wrap(<SizeStep confirm item={beans()} initialName="Beans" onDone={onDone} />));
    fireEvent.click(screen.getByRole('button', { name: 'Another size' }));
    const amount = screen.getByLabelText('Amount');
    fireEvent.change(amount, { target: { value: '330' } });
    const save = screen.getByRole('button', { name: 'Save product' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.change(amount, { target: { value: '' } });
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('puts "Same as a product you already have?" before the size, not between it and Save', () => {
    const s = liveStore(biggarDocument());
    render(s.wrap(<SizeStep confirm item={beans()} onDone={vi.fn()} />));
    const same = screen.getByText('Same as a product you already have?');
    const save = screen.getByRole('button', { name: 'Save product' });
    const size = screen.getByRole('heading', { name: 'Size' });
    expect(same.compareDocumentPosition(size) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(same.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('SizeStep', () => {
  it('reuses an existing product for the same item, name and size', () => {
    const onDone = vi.fn();
    const s = liveStore(biggarDocument());
    render(s.wrap(<SizeStep item={beans()} onDone={onDone} />));
    fireEvent.click(screen.getByRole('button', { name: 'Test beans 415 g' }));
    expect(onDone).toHaveBeenCalledWith({ productId: 'prod-beans' });
  });

  it('matches a size chip when the optional name matches an existing product', () => {
    const onDone = vi.fn();
    const s = liveStore(biggarDocument());
    render(s.wrap(<SizeStep item={beans()} onDone={onDone} />));
    fireEvent.change(screen.getByLabelText('Name (optional)'), {
      target: { value: 'Test beans 415 g' },
    });
    fireEvent.click(screen.getByRole('button', { name: '415 g' }));
    expect(onDone).toHaveBeenCalledWith({ productId: 'prod-beans' });
  });

  it('initialises Another size with the first suggested unit', () => {
    const onDone = vi.fn();
    const packs = bundledPacks();
    const water = packs.items['items-base:water-container']!;
    const doc = biggarDocument();
    delete doc.products['prod-can'];
    const s = liveStore(doc);
    render(s.wrap(<SizeStep item={water} onDone={onDone} />));
    fireEvent.click(screen.getByRole('button', { name: 'Another size' }));
    expect(screen.getByRole('radio', { name: 'L' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('10');
  });

  it('accepts a typed multipack size', () => {
    const onDone = vi.fn();
    const doc = biggarDocument();
    delete doc.products['prod-beans'];
    const s = liveStore(doc);
    render(s.wrap(<SizeStep item={beans()} onDone={onDone} />));
    fireEvent.click(screen.getByRole('button', { name: 'Another size' }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '220' } });
    fireEvent.change(screen.getByLabelText('× count (optional multipack)'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use this size' }));
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ size: { amount: 220, unit: 'g', count: 4 } }),
    );
  });

  it('limits units to the item measure', () => {
    const onDone = vi.fn();
    const s = liveStore(biggarDocument());
    render(s.wrap(<SizeStep item={beans()} onDone={onDone} />));
    fireEvent.click(screen.getByRole('button', { name: 'Another size' }));
    expect(screen.queryByRole('radio', { name: 'ml' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'g' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'kg' })).toBeTruthy();
  });

  it('skips straight to onDone when there is one size and no products', async () => {
    const onDone = vi.fn();
    const doc = biggarDocument();
    delete doc.products['prod-beans'];
    const oneSize = { ...beans(), sizes: [beans().sizes[0]!] };
    const s = liveStore(doc);
    render(s.wrap(<SizeStep item={oneSize} onDone={onDone} />));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: oneSize.id, size: oneSize.sizes[0] }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'Another size' })).toBeNull();
  });
});
