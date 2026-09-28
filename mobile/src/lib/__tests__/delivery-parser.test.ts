import { describe, expect, it } from '@jest/globals';

import { findDates, groupRows, matchProduct, parseDate, parseDeliveryNote, type CatalogProduct, type OcrWord } from '../delivery-parser';

const catalog: CatalogProduct[] = [
  { id: 1, name: 'Artemether/Lumefantrine 20/120mg tablets (6x4)', sku: 'AL-20-120' },
  { id: 2, name: 'Oral Rehydration Salts, low osmolarity', sku: 'ORS-LO' },
  { id: 3, name: 'Amoxicillin 250mg dispersible tablets (10)', sku: 'AMX-250' },
  { id: 4, name: 'Zinc sulphate 20mg dispersible tablets (10)', sku: 'ZNC-20' },
];

/**
 * Fake OCR output: one entry per visual row, each cell placed at an x
 * position and split into words, like ML Kit elements.
 */
function page(rows: [number, string][][], lineHeight = 20): OcrWord[] {
  const words: OcrWord[] = [];
  rows.forEach((cells, r) => {
    const top = 40 + r * lineHeight * 1.8 + (r % 2); // slight jitter, as on a real photo
    for (const [x, text] of cells) {
      let left = x;
      for (const w of text.split(' ')) {
        words.push({ text: w, left, top, right: left + w.length * 9, bottom: top + lineHeight });
        left += w.length * 9 + 8;
      }
    }
  });
  return words;
}

describe('dates', () => {
  it.each([
    ['31/08/2027', '2027-08-31'],
    ['2027-08-31', '2027-08-31'],
    ['31-AUG-27', '2027-08-31'],
    ['08/2027', '2027-08-31'],
    ['Aug 2027', '2027-08-31'],
    ['Feb 2028', '2028-02-29'],
    ['Exp: 3.11.2026', '2026-11-03'],
  ])('reads %s as %s', (text, iso) => {
    expect(parseDate(text)).toBe(iso);
  });

  it('rejects impossible dates and pack strengths', () => {
    expect(parseDate('31/02/2027')).toBeNull();
    expect(findDates('Artemether 20/120mg')).toEqual([]);
  });
});

describe('matchProduct', () => {
  it('matches by product code or by the distinctive words of the name', () => {
    expect(matchProduct('ORS-LO sachets', catalog)?.id).toBe(2);
    expect(matchProduct('Amoxicillin 250mg disp tabs', catalog)?.id).toBe(3);
    expect(matchProduct('Artemether Lumefantrine 20/120 tabs', catalog)?.id).toBe(1);
  });

  it('leaves unknown products unmatched rather than guessing', () => {
    expect(matchProduct('Paracetamol 500mg tablets', catalog)).toBeNull();
    expect(matchProduct('dispersible tablets', catalog)).toBeNull();
  });
});

describe('groupRows', () => {
  it('rebuilds rows left to right from words scattered by OCR', () => {
    const rows = groupRows(page([[[20, 'Qty:'], [300, '40']], [[20, 'Batch'], [300, 'AL2409B']]]).reverse());
    expect(rows.map((r) => r.text)).toEqual(['Qty: 40', 'Batch AL2409B']);
  });
});

describe('parseDeliveryNote', () => {
  it('reads a tabular delivery note using its header columns', () => {
    const words = page([
      [[20, 'KADUNA STATE CENTRAL MEDICAL STORES']],
      [[20, 'Delivery Note No: DN-0042'], [420, 'Date: 25/09/2026']],
      [[20, 'From: Kaduna State CMS']],
      [[20, 'S/N'], [80, 'Description'], [400, 'Batch'], [520, 'Expiry'], [640, 'Qty'], [720, 'Unit Price']],
      [[20, '1'], [80, 'Artemether/Lumefantrine 20/120mg'], [400, 'AL2409B'], [520, '31/08/2027'], [640, '40'], [720, '1,200']],
      [[20, '2'], [80, 'ORS low osmolarity'], [520, '12/2027'], [640, '100'], [720, '150']],
      [[20, '3'], [80, 'Paracetamol 500mg tablets'], [400, 'PCM771'], [520, '30/06/2027'], [640, '25'], [720, '300']],
      [[20, 'Received by: ____________'], [420, 'Signature']],
    ]);

    const parsed = parseDeliveryNote(words, catalog);

    expect(parsed.deliveryNoteNo).toBe('DN-0042');
    expect(parsed.source).toBe('Kaduna State CMS');
    expect(parsed.receivedDate).toBe('2026-09-25');
    expect(parsed.lines.map(({ raw, ...l }) => l)).toEqual([
      { productId: 1, batchNo: 'AL2409B', expiryDate: '2027-08-31', quantity: 40 },
      { productId: 2, batchNo: null, expiryDate: '2027-12-31', quantity: 100 },
      // Not in the catalogue: kept, for staff to pick the product or remove the line.
      { productId: null, batchNo: 'PCM771', expiryDate: '2027-06-30', quantity: 25 },
    ]);
  });

  it('reads labelled free-text lines without a table header', () => {
    const words = page([
      [[20, 'Waybill No. WB/2026/118']],
      [[20, 'Amoxicillin 250mg dispersible tablets Lot: AMX2501 Exp: Mar 2027 Qty 60']],
      [[20, 'Zinc sulphate 20mg Batch ZN88A Exp 30/11/2027 Qty: 1,000']],
    ]);

    const parsed = parseDeliveryNote(words, catalog);

    expect(parsed.deliveryNoteNo).toBe('WB/2026/118');
    expect(parsed.lines.map(({ raw, ...l }) => l)).toEqual([
      { productId: 3, batchNo: 'AMX2501', expiryDate: '2027-03-31', quantity: 60 },
      { productId: 4, batchNo: 'ZN88A', expiryDate: '2027-11-30', quantity: 1000 },
    ]);
  });

  it('returns nothing to confirm from a page with no item lines', () => {
    expect(parseDeliveryNote(page([[[20, 'Thank you for your business']]]), catalog).lines).toEqual([]);
    expect(parseDeliveryNote([], catalog)).toEqual({ deliveryNoteNo: null, source: null, receivedDate: null, lines: [] });
  });
});
