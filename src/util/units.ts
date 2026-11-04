type UnitRegion = 'UK' | 'US';

const LITRES_PER_US_GALLON = 3.785411784;

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/** A volume held in litres, shown in the region's unit: "10 L" in the UK, "2.6 gal" in the US. */
export function formatVolume(litres: number, region: UnitRegion): string {
  if (region === 'US') return `${trim(litres / LITRES_PER_US_GALLON)} gal`;
  return `${trim(litres)} L`;
}

/** A temperature held in degrees Celsius, shown in the region's unit: "18 °C" or "64 °F". */
export function formatTemp(celsius: number, region: UnitRegion): string {
  if (region === 'US') return `${Math.round((celsius * 9) / 5 + 32)} °F`;
  return `${Math.round(celsius)} °C`;
}
