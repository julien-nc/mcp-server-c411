import { Buffer } from 'node:buffer';
import axios from 'axios';
import { getString } from './data-utils.js';
import type { JsonRecord } from './types.js';

export class MaintenanceError extends Error {
  constructor(message = 'c411.org appears to be in maintenance mode. Please try again later.') {
    super(message);
    this.name = 'MaintenanceError';
  }
}

export function getContentType(headers: Record<string, unknown> | undefined): string | undefined {
  return typeof headers?.['content-type'] === 'string' ? headers['content-type'] : undefined;
}

export function decodeResponseBody(data: unknown): string | null {
  if (typeof data === 'string') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }

  return null;
}

export function getErrorMessageFromResponse(data: unknown, contentType?: string): string | null {
  if (typeof data === 'object' && data !== null && !Buffer.isBuffer(data) && !ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) {
    return getString((data as JsonRecord).message);
  }

  const decodedBody = decodeResponseBody(data);
  if (!decodedBody) {
    return null;
  }

  const normalizedContentType = contentType?.toLowerCase() ?? '';
  const trimmedBody = decodedBody.trim();

  if (!trimmedBody) {
    return null;
  }

  if (normalizedContentType.includes('json') || /^[\[{]/.test(trimmedBody)) {
    try {
      const parsed = JSON.parse(trimmedBody) as JsonRecord;
      const jsonMessage = getString(parsed.message);
      if (jsonMessage) {
        return jsonMessage;
      }
    } catch {
      // Fall through to text extraction.
    }
  }

  if (normalizedContentType.includes('text') || normalizedContentType.includes('html') || !normalizedContentType) {
    const condensedBody = trimmedBody.replace(/\s+/g, ' ').slice(0, 200);
    return condensedBody || null;
  }

  return null;
}

export function isMaintenanceMessage(message: string | null): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes('maintenance') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('down for maintenance') ||
    normalized.includes('service unavailable')
  );
}

export function isMaintenanceResponse(status: number, data: unknown, contentType?: string): boolean {
  if (status === 503) {
    return true;
  }

  return isMaintenanceMessage(getErrorMessageFromResponse(data, contentType));
}

export function getSafeErrorMessage(error: unknown, requestTimeoutMs: number): string {
  if (axios.isAxiosError(error)) {
    const message = getErrorMessageFromResponse(
      error.response?.data,
      getContentType(error.response?.headers as Record<string, unknown> | undefined)
    ) || error.message;

    if (error.code === 'ECONNABORTED') {
      return `Request timed out after ${requestTimeoutMs}ms`;
    }

    return error.response?.status ? `HTTP ${error.response.status} - ${message}` : message;
  }

  return error instanceof Error ? error.message : 'Unknown error';
}
