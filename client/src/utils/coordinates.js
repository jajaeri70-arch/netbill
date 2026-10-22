export function parseCoordinate(value, axis) {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text || !['latitude', 'longitude'].includes(axis)) return null;
  const max = axis === 'latitude' ? 90 : 180;
  const direction = text.match(/[NSEW]$/)?.[0];
  if (direction && ((axis === 'latitude' && !/[NS]$/.test(direction)) || (axis === 'longitude' && !/[EW]$/.test(direction)))) return null;
  const body = text.replace(/[NSEW]$/, '').trim();
  let result;
  const marked = body.match(/^([+-]?\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*['′]?(?:\s*(\d+(?:\.\d+)?)\s*["″]?)?$/);
  if (marked && (marked[2] !== undefined || marked[3] !== undefined)) {
    const degrees = Number(marked[1]);
    const minutes = Number(marked[2] || 0);
    const seconds = Number(marked[3] || 0);
    if (minutes >= 60 || seconds >= 60) return null;
    result = Math.sign(degrees || 1) * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
  } else {
    const decimal = body.match(/^([+-]?\d+(?:\.\d+)?)$/);
    if (!decimal) return null;
    const raw = decimal[1];
    const numeric = Number(raw);
    if (Math.abs(numeric) <= max) result = numeric;
    else {
      const unsigned = raw.replace(/^[+-]/, '');
      const [whole, fraction = ''] = unsigned.split('.');
      const degreeDigits = axis === 'latitude' ? (whole.length >= 6 ? whole.length - 4 : 1) : (whole.length >= 7 ? whole.length - 4 : 3);
      const degrees = Number(whole.slice(0, degreeDigits));
      const mmss = `${whole.slice(degreeDigits)}${fraction ? `.${fraction}` : ''}`;
      const parts = mmss.match(/^(\d{2})(\d{2}(?:\.\d+)?)$/);
      if (!parts) return null;
      const minutes = Number(parts[1]);
      const seconds = Number(parts[2]);
      if (minutes >= 60 || seconds >= 60) return null;
      result = degrees + minutes / 60 + seconds / 3600;
      if (raw.startsWith('-')) result = -result;
    }
  }
  if (direction === 'S' || direction === 'W') result = -Math.abs(result);
  if (direction === 'N' || direction === 'E') result = Math.abs(result);
  return Number.isFinite(result) && Math.abs(result) <= max ? result : null;
}