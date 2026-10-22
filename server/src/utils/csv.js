/** Konversi rows ke CSV (separator ";" ramah Excel locale ID) */
export function toCsv(rows, cols) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map((c) => esc(c.label)).join(';');
  const lines = rows.map((r) =>
    cols.map((c) => esc(typeof c.key === 'function' ? c.key(r) : r[c.key])).join(';')
  );
  return '\uFEFF' + [head, ...lines].join('\r\n');
}

/** Kirim CSV sebagai attachment */
export function sendCsv(res, filename, rows, cols) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows, cols));
}
