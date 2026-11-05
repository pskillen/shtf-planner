import { expiryLevel, expiryWindows } from '../../engine';
import { today } from '../../util';
import { EXPIRY_LABEL } from '../labels';
import { formatMonth } from '../screens/stores/stock';
import { useDocument } from '../state';

/**
 * A best-before shown by colour and word together: Expired (red), Expires soon (red), Before next
 * check (amber); nothing extra when it is later. The windows are the household's settings.
 * `showMonth` puts the month ("Mar 2027") in front of the word.
 */
export function ExpiryBadge({
  bestBefore,
  showMonth = false,
}: {
  bestBefore: string;
  showMonth?: boolean;
}) {
  const { settings } = useDocument();
  const level = expiryLevel(bestBefore, today(), expiryWindows(settings));
  const word = level === 'ok' ? undefined : EXPIRY_LABEL[level];
  if (!showMonth && !word) return null;
  return (
    <span className={`bb bb-${level}`} data-expiry={level}>
      {showMonth ? formatMonth(bestBefore) : null}
      {showMonth && word ? ' · ' : null}
      {word}
    </span>
  );
}
