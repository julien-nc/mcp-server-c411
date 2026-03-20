import { getNestedNumber, getNestedString } from './data-utils.js';
import type { JsonRecord, SearchResultItem } from './types.js';

function formatBytes(size: unknown): string | null {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return null;
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function getInfoHash(record: JsonRecord): string | null {
  return getNestedString(
    record,
    ['infoHash'],
    ['info_hash'],
    ['hash'],
    ['attributes', 'infoHash'],
    ['attributes', 'info_hash'],
    ['attributes', 'hash']
  );
}

function formatTorrentResult(item: unknown): string | null {
  const structured = toTorrentResult(item);
  return structured ? formatStructuredSearchResult(structured) : null;
}

function toTorrentResult(item: unknown): SearchResultItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as JsonRecord;
  const title = getNestedString(record, ['name'], ['title']);
  if (!title) {
    return null;
  }

  const category = getNestedString(record, ['category', 'name']);
  const subcategory = getNestedString(record, ['subcategory', 'name']);
  const sizeBytes = getNestedNumber(record, ['size']);
  const size = getNestedString(record, ['formattedSize']) ?? formatBytes(sizeBytes);
  const seeders = getNestedNumber(record, ['seeders']);
  const leechers = getNestedNumber(record, ['leechers']);
  const uploader = getNestedString(record, ['uploader', 'username'], ['uploader', 'name']);
  const infoHash = getInfoHash(record);

  return {
    title,
    type: 'torrent',
    ...(category ? { category } : {}),
    ...(subcategory ? { subcategory } : {}),
    ...(size ? { size } : {}),
    ...(sizeBytes !== null ? { sizeBytes } : {}),
    ...(seeders !== null ? { seeders } : {}),
    ...(leechers !== null ? { leechers } : {}),
    ...(uploader ? { uploader } : {}),
    ...(infoHash ? { infoHash } : {}),
  };
}

function formatReleaseResult(item: JsonRecord): string | null {
  const structured = toReleaseResult(item);
  return structured ? formatStructuredSearchResult(structured) : null;
}

function toReleaseResult(item: JsonRecord): SearchResultItem | null {
  const title = getNestedString(item, ['title'], ['name']);
  if (!title) {
    return null;
  }

  const count = Array.isArray(item.torrents) ? item.torrents.length : null;
  const seeders = getNestedNumber(item, ['seeders', 'total'], ['seeders']);
  const leechers = getNestedNumber(item, ['leechers', 'total'], ['leechers']);

  return {
    title,
    type: 'release',
    ...(count !== null ? { versionCount: count } : {}),
    ...(seeders !== null ? { seeders } : {}),
    ...(leechers !== null ? { leechers } : {}),
  };
}

function formatSeriesResult(item: JsonRecord): string | null {
  const structured = toSeriesResult(item);
  return structured ? formatStructuredSearchResult(structured) : null;
}

function toSeriesResult(item: JsonRecord): SearchResultItem | null {
  const title = getNestedString(item, ['title'], ['name']);
  if (!title) {
    return null;
  }

  const seasonCount = Array.isArray(item.seasons) ? item.seasons.length : null;
  const seeders = getNestedNumber(item, ['seeders', 'total'], ['seeders']);
  const leechers = getNestedNumber(item, ['leechers', 'total'], ['leechers']);

  return {
    title,
    type: 'series',
    ...(seasonCount !== null ? { seasonCount } : {}),
    ...(seeders !== null ? { seeders } : {}),
    ...(leechers !== null ? { leechers } : {}),
  };
}

export function formatStructuredSearchResult(item: SearchResultItem): string {
  const parts = [`Title: ${item.title}`];

  if (item.type !== 'torrent') {
    parts.push(`Type: ${item.type}`);
  }

  if (item.category) {
    parts.push(`Category: ${item.subcategory ? `${item.category} / ${item.subcategory}` : item.category}`);
  }

  if (item.size) {
    parts.push(`Size: ${item.size}`);
  }

  if (item.versionCount !== undefined) {
    parts.push(`Versions: ${item.versionCount}`);
  }

  if (item.seasonCount !== undefined) {
    parts.push(`Seasons: ${item.seasonCount}`);
  }

  if (item.seeders !== undefined) {
    parts.push(`Seeds: ${item.seeders}`);
  }

  if (item.leechers !== undefined) {
    parts.push(`Leechers: ${item.leechers}`);
  }

  if (item.uploader) {
    parts.push(`Uploader: ${item.uploader}`);
  }

  if (item.infoHash) {
    parts.push(`InfoHash: ${item.infoHash}`);
  }

  return parts.join(' | ');
}

export function toStructuredSearchResult(item: unknown): SearchResultItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as JsonRecord;
  const itemType = getNestedString(record, ['type']);

  if (itemType === 'release') {
    return toReleaseResult(record);
  }

  if (itemType === 'series') {
    return toSeriesResult(record);
  }

  return toTorrentResult(record);
}

export function formatSearchResult(item: unknown): string | null {
  const structured = toStructuredSearchResult(item);
  return structured ? formatStructuredSearchResult(structured) : null;
}
