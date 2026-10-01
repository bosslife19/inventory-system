import type { OcrWord } from './delivery-parser';

/**
 * On-device text recognition (Google ML Kit via
 * @infinitered/react-native-mlkit-text-recognition). The photo never leaves
 * the phone and it works offline.
 *
 * The native module only exists in a development / production build — not
 * in Expo Go — and it throws as soon as it's imported without one, so it is
 * loaded lazily and callers fall back to manual entry.
 */

export class OcrUnavailableError extends Error {
  constructor() {
    super('Text recognition needs the app build — it isn’t available in Expo Go.');
  }
}

type Recognize = (uri: string) => Promise<{
  blocks: { lines: { elements: { text: string; frame: { left: number; top: number; right: number; bottom: number } }[] }[] }[];
}>;

let recognize: Recognize | null | undefined;

function load(): Recognize | null {
  if (recognize === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      recognize = require('@infinitered/react-native-mlkit-text-recognition').recognizeText as Recognize;
    } catch {
      recognize = null;
    }
  }
  return recognize;
}

export function isOcrAvailable(): boolean {
  return load() !== null;
}

/** Every recognised word with its position on the photo. */
export async function recognizeWords(uri: string): Promise<OcrWord[]> {
  const fn = load();
  if (!fn) throw new OcrUnavailableError();
  const result = await fn(uri);
  let line = 0;
  return result.blocks.flatMap((b) =>
    b.lines.flatMap((l) => {
      const id = line++;
      return l.elements.map((e) => ({ text: e.text, left: e.frame.left, top: e.frame.top, right: e.frame.right, bottom: e.frame.bottom, line: id }));
    }),
  );
}
