import type { OcrWord } from './delivery-parser';

/** Web preview: no on-device OCR — the scan flow offers manual entry. */
export class OcrUnavailableError extends Error {
  constructor() {
    super('Text recognition runs on the phone app only.');
  }
}

export function isOcrAvailable(): boolean {
  return false;
}

export async function recognizeWords(_uri: string): Promise<OcrWord[]> {
  throw new OcrUnavailableError();
}
