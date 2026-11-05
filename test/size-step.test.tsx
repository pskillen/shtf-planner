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
