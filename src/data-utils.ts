import type { JsonRecord } from './types.js';

export function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getNestedString(record: JsonRecord, ...paths: string[][]): string | null {
  for (const path of paths) {
    let current: unknown = record;

    for (const segment of path) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        current = undefined;
        break;
      }

      current = (current as JsonRecord)[segment];
    }

    const result = getString(current);
    if (result) {
      return result;
    }
  }

  return null;
}

export function getNestedNumber(record: JsonRecord, ...paths: string[][]): number | null {
  for (const path of paths) {
    let current: unknown = record;

    for (const segment of path) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        current = undefined;
        break;
      }

      current = (current as JsonRecord)[segment];
    }

    const result = getNumber(current);
    if (result !== null) {
      return result;
    }
  }

  return null;
}
