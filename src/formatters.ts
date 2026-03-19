import { getNestedNumber, getNestedString } from './data-utils.js';
import type { JsonRecord } from './types.js';

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
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as JsonRecord;
  const title = getNestedString(record, ['name'], ['title']);
  if (!title) {
    return null;
  }

  const parts = [`Title: ${title}`];
  const category = getNestedString(record, ['category', 'name']);
  const subcategory = getNestedString(record, ['subcategory', 'name']);
  const size = getNestedString(record, ['formattedSize']) ?? formatBytes(getNestedNumber(record, ['size']));
  const seeders = getNestedNumber(record, ['seeders']);
  const leechers = getNestedNumber(record, ['leechers']);
  const uploader = getNestedString(record, ['uploader', 'username'], ['uploader', 'name']);
  const infoHash = getInfoHash(record);

  if (category) {
    parts.push(`Category: ${subcategory ? `${category} / ${subcategory}` : category}`);
  }

  if (size) {
    parts.push(`Size: ${size}`);
  }

  if (seeders !== null) {
    parts.push(`Seeds: ${seeders}`);
  }

  if (leechers !== null) {
    parts.push(`Leechers: ${leechers}`);
  }

  if (uploader) {
    parts.push(`Uploader: ${uploader}`);
  }

  if (infoHash) {
    parts.push(`InfoHash: ${infoHash}`);
  }

  return parts.join(' | ');
}

function formatReleaseResult(item: JsonRecord): string | null {
  const title = getNestedString(item, ['title'], ['name']);
  if (!title) {
    return null;
  }

  const parts = [`Title: ${title}`, 'Type: release'];
  const count = Array.isArray(item.torrents) ? item.torrents.length : null;
  const seeders = getNestedNumber(item, ['seeders', 'total'], ['seeders']);
  const leechers = getNestedNumber(item, ['leechers', 'total'], ['leechers']);

  if (count !== null) {
    parts.push(`Versions: ${count}`);
  }

  if (seeders !== null) {
    parts.push(`Seeds: ${seeders}`);
  }

  if (leechers !== null) {
    parts.push(`Leechers: ${leechers}`);
  }

  return parts.join(' | ');
}

function formatSeriesResult(item: JsonRecord): string | null {
  const title = getNestedString(item, ['title'], ['name']);
  if (!title) {
    return null;
  }

  const parts = [`Title: ${title}`, 'Type: series'];
  const seasonCount = Array.isArray(item.seasons) ? item.seasons.length : null;
  const seeders = getNestedNumber(item, ['seeders', 'total'], ['seeders']);
  const leechers = getNestedNumber(item, ['leechers', 'total'], ['leechers']);

  if (seasonCount !== null) {
    parts.push(`Seasons: ${seasonCount}`);
  }

  if (seeders !== null) {
    parts.push(`Seeds: ${seeders}`);
  }

  if (leechers !== null) {
    parts.push(`Leechers: ${leechers}`);
  }

  return parts.join(' | ');
}

export function formatSearchResult(item: unknown): string | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as JsonRecord;
  const itemType = getNestedString(record, ['type']);

  if (itemType === 'release') {
    return formatReleaseResult(record);
  }

  if (itemType === 'series') {
    return formatSeriesResult(record);
  }

  return formatTorrentResult(record);
}
