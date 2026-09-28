import type { ParsedDelivery } from './delivery-parser';

/**
 * Hands the scan result to the review screen (too big for route params).
 * In memory only: an unconfirmed draft isn't worth persisting — staff still
 * have the paper note.
 */
export interface DeliveryDraft {
  capture: 'ocr' | 'manual';
  photoUri: string | null;
  parsed: ParsedDelivery;
}

let draft: DeliveryDraft | null = null;

export function setDeliveryDraft(next: DeliveryDraft | null) {
  draft = next;
}

export function getDeliveryDraft(): DeliveryDraft | null {
  return draft;
}
