/**
 * Turns on-device OCR output from a photographed delivery note into draft
 * lines (product, batch, expiry, quantity) plus the note's number, source
 * and date.
 *
 * OCR of paper forms is noisy, so this is deliberately a *suggestion*: every
 * line is reviewed and corrected by staff before anything is confirmed
 * (mobile/CLAUDE.md rule 1). Unmatched rows are kept with productId null so
 * nothing on the paper is silently dropped.
 *
 * Pure functions, no React Native imports — unit-tested in __tests__.
 */

export interface OcrWord {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CatalogProduct {
  id: number;
  name: string;
  sku: string;
}

export interface ParsedLine {
  /** The row as read, so staff can compare against the paper. */
  raw: string;
  productId: number | null;
  batchNo: string | null;
  expiryDate: string | null;
  quantity: number | null;
}

export interface ParsedDelivery {
  deliveryNoteNo: string | null;
  source: string | null;
  receivedDate: string | null;
  lines: ParsedLine[];
}

type Column = 'description' | 'batch' | 'expiry' | 'quantity';

const HEADER_WORDS: Record<Column, RegExp> = {
  description: /^(description|item|items|product|products|particulars|commodity)$/i,
  batch: /^(batch|lot|b\/no|batch\/lot)$/i,
  expiry: /^(expiry|exp|exp\.|expiry\/date|expiration)$/i,
  quantity: /^(qty|qty\.|quantity|quantities|qnty|issued|received)$/i,
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0');

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > lastDayOfMonth(y, m) || y < 2000 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function monthIndex(word: string): number | null {
  const i = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return i === -1 ? null : i + 1;
}

/**
 * Every date in the text, as YYYY-MM-DD with the matched span. Day-first
 * (DD/MM/YYYY), as written in Nigeria. Month-only dates (08/2027,
 * "Aug 2027") mean the end of that month — how expiry is printed on packs.
 */
export function findDates(text: string): { iso: string; start: number; end: number }[] {
  const found: { iso: string; start: number; end: number }[] = [];
  // Spans a more specific pattern already matched — even as an invalid date,
  // so "31/02/2027" isn't re-read as the month-only "02/2027".
  const consumed: [number, number][] = [];
  const taken = (s: number, e: number) => consumed.some(([cs, ce]) => s < ce && e > cs);
  const add = (iso: string | null, m: RegExpExecArray) => {
    const start = m.index;
    const end = m.index + m[0].length;
    if (taken(start, end)) return;
    consumed.push([start, end]);
    if (iso) found.push({ iso, start, end });
  };
  const run = (re: RegExp, fn: (m: RegExpExecArray) => string | null) => {
    for (let m = re.exec(text); m; m = re.exec(text)) add(fn(m), m);
  };

  run(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, (m) => valid(+m[1], +m[2], +m[3]));
  run(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g, (m) => valid(fullYear(+m[3]), +m[2], +m[1]));
  run(/\b(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/., ]+(\d{4}|\d{2})\b/g, (m) => {
    const month = monthIndex(m[2]);
    return month ? valid(fullYear(+m[3]), month, +m[1]) : null;
  });
  run(/\b([A-Za-z]{3,9})[-/., ]+(\d{4})\b/g, (m) => {
    const month = monthIndex(m[1]);
    const y = +m[2];
    return month ? valid(y, month, lastDayOfMonth(y, month)) : null;
  });
  run(/\b(\d{1,2})[/\-.](\d{4})\b/g, (m) => {
    const y = +m[2];
    return valid(y, +m[1], +m[1] >= 1 && +m[1] <= 12 ? lastDayOfMonth(y, +m[1]) : 1);
  });

  return found.sort((a, b) => a.start - b.start);
}

export function parseDate(text: string): string | null {
  return findDates(text)[0]?.iso ?? null;
}

// ---------------------------------------------------------------- rows

interface Row {
  words: OcrWord[];
  text: string;
}

const centerY = (w: OcrWord) => (w.top + w.bottom) / 2;
const centerX = (w: OcrWord) => (w.left + w.right) / 2;

/** Group words into visual rows: similar vertical centre, then left to right. */
export function groupRows(words: OcrWord[]): Row[] {
  const clean = words.filter((w) => w.text.trim());
  if (clean.length === 0) return [];
  const heights = clean.map((w) => w.bottom - w.top).sort((a, b) => a - b);
  const tolerance = Math.max(4, heights[Math.floor(heights.length / 2)] * 0.6);

  const rows: { y: number; words: OcrWord[] }[] = [];
  for (const w of [...clean].sort((a, b) => centerY(a) - centerY(b))) {
    const row = rows.find((r) => Math.abs(r.y - centerY(w)) <= tolerance);
    if (row) {
      row.words.push(w);
      row.y = row.words.reduce((s, x) => s + centerY(x), 0) / row.words.length;
    } else {
      rows.push({ y: centerY(w), words: [w] });
    }
  }

  return rows
    .sort((a, b) => a.y - b.y)
    .map((r) => {
      const sorted = r.words.sort((a, b) => a.left - b.left);
      return { words: sorted, text: sorted.map((w) => w.text).join(' ') };
    });
}

// ---------------------------------------------------------------- products

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// Words too common in drug names to identify a product on their own.
const WEAK = new Set(['tablets', 'tablet', 'tabs', 'tab', 'capsules', 'caps', 'injection', 'dispersible', 'syrup', 'suspension', 'and', 'for', 'with', 'the']);

/** Best catalogue match for a row: product code, else share of the name's distinctive words present. */
export function matchProduct(text: string, catalog: CatalogProduct[]): CatalogProduct | null {
  const rowTokens = new Set(norm(text).split(' '));
  const rowCompact = compact(text);
  let best: { p: CatalogProduct; score: number } | null = null;

  for (const p of catalog) {
    const sku = compact(p.sku);
    let score = sku.length >= 3 && rowCompact.includes(sku) ? 1 : 0;
    // Distinctive words only: strengths and pack sizes (250mg, 6x4) vary in how they're printed.
    const tokens = norm(p.name).split(' ').filter((t) => t.length >= 3 && !WEAK.has(t) && !/\d/.test(t));
    if (tokens.length) {
      const hit = tokens.filter((t) => rowTokens.has(t) || rowCompact.includes(t)).length / tokens.length;
      score = Math.max(score, hit);
    }
    if (score >= 0.6 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}

// ---------------------------------------------------------------- fields

const BATCH_TOKEN = /^(?=.*\d)(?=.*[A-Z])[A-Z0-9][A-Z0-9\-/]{3,19}$/;
// Strength / pack sizes that look like batch numbers but aren't: 250MG, 100ML, 10X10, 20/120.
const NOT_BATCH = /^(\d+(\.\d+)?(MG|ML|G|MCG|IU|L|KG|%)|\d+X\d+|\d+\/\d+)$/;

function batchFrom(text: string, exclude: Set<string>): string | null {
  const labelled = /\b(?:batch|lot|b\/n)\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-/]{2,19})/i.exec(text);
  if (labelled) return labelled[1].toUpperCase();
  for (const raw of text.split(/\s+/)) {
    const t = raw.replace(/[,;:]+$/, '').toUpperCase();
    if (BATCH_TOKEN.test(t) && !NOT_BATCH.test(t) && !exclude.has(t) && !findDates(t).length) return t;
  }
  return null;
}

function integersIn(text: string): number[] {
  return [...text.matchAll(/(?<![\w./-])(\d{1,3}(?:,\d{3})+|\d+)(?![\w./-])/g)].map((m) => Number(m[1].replace(/,/g, '')));
}

function stripDates(text: string): string {
  let out = text;
  for (const d of [...findDates(text)].reverse()) out = out.slice(0, d.start) + ' ' + out.slice(d.end);
  return out;
}

function withoutProductWords(text: string, product: CatalogProduct | null): string {
  if (!product) return text;
  const drop = new Set([...norm(product.name).split(' '), compact(product.sku)]);
  return text
    .split(/\s+/)
    .filter((w) => !drop.has(norm(w)) && !drop.has(compact(w)))
    .join(' ');
}

// ---------------------------------------------------------------- header fields

function headerFields(rows: Row[]) {
  let deliveryNoteNo: string | null = null;
  let source: string | null = null;
  let receivedDate: string | null = null;

  for (const { text } of rows) {
    deliveryNoteNo ??=
      /\b(?:delivery\s*note|d\.?\s?n|waybill|way\s*bill|siv|srv|issue\s*voucher|note)\s*(?:no\.?|number|#)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9/\-]{2,})/i.exec(text)?.[1] ?? null;
    const src = /\b(?:from|supplier|source|issued\s+by|consignor|shipped\s+from)\s*[:\-]\s*(.{3,80})$/i.exec(text)?.[1];
    if (!source && src) source = src.trim();
    if (!receivedDate && /\bdate\b/i.test(text) && !/\bexp/i.test(text)) receivedDate = parseDate(text);
  }
  return { deliveryNoteNo, source, receivedDate };
}

// ---------------------------------------------------------------- main

interface Header {
  index: number;
  /** Every header word starts a column (printed tables are left-aligned); known ones are named. */
  columns: { left: number; col: Column | null }[];
}

/** The table header row, if the note is laid out as a table. */
function findHeader(rows: Row[], catalog: CatalogProduct[]): Header | null {
  for (const [index, row] of rows.entries()) {
    // An item line with "Lot:" and "Qty" in it is not a header.
    if (/\d{2,}/.test(row.text) || matchProduct(row.text, catalog)) continue;
    const found = new Set<Column>();
    const columns = row.words.map((w) => {
      const word = w.text.replace(/[:.]$/, '');
      const col = (Object.keys(HEADER_WORDS) as Column[]).find((c) => !found.has(c) && HEADER_WORDS[c].test(word)) ?? null;
      if (col) found.add(col);
      return { left: w.left, col };
    });
    if (found.size >= 2 && (found.has('quantity') || found.has('batch'))) return { index, columns };
  }
  return null;
}

function cellText(row: Row, header: Header, col: Column): string {
  const slack = 12;
  return row.words
    .filter((w) => {
      // The column a word sits in: the right-most header starting at or before it.
      let owner: Column | null | undefined;
      for (const c of header.columns) if (c.left - slack <= centerX(w)) owner = c.col;
      return owner === col;
    })
    .map((w) => w.text)
    .join(' ');
}

export function parseDeliveryNote(words: OcrWord[], catalog: CatalogProduct[]): ParsedDelivery {
  const rows = groupRows(words);
  const header = findHeader(rows, catalog);
  const body = header ? rows.slice(header.index + 1) : rows;
  const skus = new Set(catalog.map((p) => p.sku.toUpperCase()));
  const lines: ParsedLine[] = [];

  for (const row of body) {
    const product = matchProduct(row.text, catalog);
    const rest = withoutProductWords(row.text, product);

    let batchNo: string | null = null;
    let expiryDate: string | null = null;
    let quantity: number | null = null;

    if (header) {
      const has = (col: Column) => header.columns.some((c) => c.col === col);
      if (has('batch')) {
        const cell = cellText(row, header, 'batch');
        batchNo = batchFrom(cell, skus) ?? (cell.trim().toUpperCase() || null);
      }
      if (has('expiry')) expiryDate = parseDate(cellText(row, header, 'expiry'));
      if (has('quantity')) quantity = integersIn(stripDates(cellText(row, header, 'quantity')))[0] ?? null;
    }

    const dates = findDates(rest);
    expiryDate ??= dates.length ? dates.map((d) => d.iso).sort().at(-1)! : null;
    batchNo ??= batchFrom(stripDates(rest), skus);
    if (quantity === null) {
      const labelled = /\b(?:qty|quantity)\.?\s*[:\-]?\s*(\d{1,3}(?:,\d{3})+|\d+)/i.exec(rest);
      if (labelled) quantity = Number(labelled[1].replace(/,/g, ''));
      else {
        let nums = integersIn(stripDates(rest).replace(batchNo ?? '\u0000', ' '));
        // A small leading number is the serial-number column, not a quantity.
        if (nums.length > 1 && /^\s*\d{1,3}[.)]?\s/.test(row.text)) nums = nums.slice(1);
        quantity = nums[0] ?? null;
      }
    }

    // Keep a row if it names a product, or looks like an item line (a quantity plus a batch or expiry).
    if (product || (quantity !== null && (batchNo !== null || expiryDate !== null))) {
      lines.push({ raw: row.text, productId: product?.id ?? null, batchNo, expiryDate, quantity: quantity && quantity > 0 ? quantity : null });
    }
  }

  return { ...headerFields(rows), lines };
}
