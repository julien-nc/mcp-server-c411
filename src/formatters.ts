import { getNestedNumber, getNestedString } from './data-utils.js';
import type { JsonRecord, SearchResultItem, TorrentComment, TorrentCommentAuthor, TorrentCommentReply, TorrentCommentsPage, TorrentDetail, TorrentFileEntry, TorrentTmdbInfo, TorrentTrustInfo } from './types.js';

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

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function htmlToMarkdown(value: string): string {
  let md = value;

  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n');

  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/p>/gi, '\n\n');
  md = md.replace(/<\/div>/gi, '\n');

  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*(?:\/>|><\/img>)/gi, '![]($1)');

  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, table) => {
    const rows: string[] = [];
    const rowMatches = table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    for (const rowMatch of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
      for (const cellMatch of cellMatches) {
        cells.push(stripHtml(cellMatch[1]).trim());
      }
      if (cells.length > 0) {
        rows.push(`| ${cells.join(' | ')} |`);
      }
    }
    if (rows.length > 0) {
      const colCount = rows[0].split('|').length - 2;
      const header = `| ${Array(colCount).fill('---').join(' | ')} |`;
      return [header, ...rows].join('\n') + '\n';
    }
    return '';
  });

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

  md = md.replace(/<[^>]+>/g, '');

  md = md.replace(/&nbsp;/gi, ' ');
  md = md.replace(/&amp;/gi, '&');
  md = md.replace(/&lt;/gi, '<');
  md = md.replace(/&gt;/gi, '>');
  md = md.replace(/&#39;/gi, "'");
  md = md.replace(/&quot;/gi, '"');

  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/^[\s\n]+/gm, '');
  md = md.replace(/[\s\n]+$/gm, '');

  return md.trim();
}

function toTorrentFiles(value: unknown): TorrentFileEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const record = entry as JsonRecord;
    const rawPath = record.path;
    if (!Array.isArray(rawPath)) {
      return [];
    }

    const path = rawPath.filter((segment): segment is string => typeof segment === 'string' && segment.length > 0);
    if (path.length === 0) {
      return [];
    }

    const length = getNestedNumber(record, ['length']);
    return [{
      path,
      ...(length !== null ? { length } : {}),
    }];
  });
}

function toTorrentTrustInfo(value: unknown): TorrentTrustInfo | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as JsonRecord;
  const trust: TorrentTrustInfo = {
    enabled: getBoolean(record.enabled),
    score: getNestedNumber(record, ['score']) ?? undefined,
    votesCount: getNestedNumber(record, ['votesCount']) ?? undefined,
    positiveCount: getNestedNumber(record, ['positiveCount']) ?? undefined,
    negativeCount: getNestedNumber(record, ['negativeCount']) ?? undefined,
    status: getNestedString(record, ['status']) ?? undefined,
    isTested: getBoolean(record.isTested),
  };

  return Object.values(trust).some((item) => item !== undefined) ? trust : undefined;
}

function toTorrentTmdbInfo(value: unknown): TorrentTmdbInfo | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as JsonRecord;
  const tmdb: TorrentTmdbInfo = {
    id: getNestedNumber(record, ['id']) ?? undefined,
    imdbId: getNestedString(record, ['imdbId']) ?? undefined,
    type: getNestedString(record, ['type']) ?? undefined,
    title: getNestedString(record, ['title']) ?? undefined,
    originalTitle: getNestedString(record, ['originalTitle']) ?? undefined,
    year: getNestedNumber(record, ['year']) ?? undefined,
    overview: getNestedString(record, ['overview']) ?? undefined,
    posterUrl: getNestedString(record, ['posterUrl']) ?? undefined,
    backdropUrl: getNestedString(record, ['backdropUrl']) ?? undefined,
    genres: getStringArray(record.genres),
    rating: getNestedNumber(record, ['rating']) ?? undefined,
    ratingCount: getNestedNumber(record, ['ratingCount']) ?? undefined,
    releaseDate: getNestedString(record, ['releaseDate']) ?? undefined,
    countries: getStringArray(record.countries),
    languages: getStringArray(record.languages),
    productionCompanies: getStringArray(record.productionCompanies),
    status: getNestedString(record, ['status']) ?? undefined,
    tagline: getNestedString(record, ['tagline']) ?? undefined,
  };

  return Object.values(tmdb).some((item) => item !== undefined) ? tmdb : undefined;
}

function toTorrentCommentAuthor(value: unknown): TorrentCommentAuthor | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as JsonRecord;
  const author: TorrentCommentAuthor = {
    id: getNestedNumber(record, ['id']) ?? undefined,
    username: getNestedString(record, ['username']) ?? undefined,
    role: getNestedString(record, ['role']) ?? undefined,
    avatar: typeof record.avatar === 'string' || record.avatar === null ? record.avatar : undefined,
  };

  return Object.values(author).some((item) => item !== undefined) ? author : undefined;
}

function toTorrentCommentReply(value: unknown): TorrentCommentReply | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as JsonRecord;
  const contentHtml = getNestedString(record, ['content']) ?? undefined;
  const reply: TorrentCommentReply = {
    id: getNestedNumber(record, ['id']) ?? undefined,
    username: getNestedString(record, ['username']) ?? undefined,
    ...(contentHtml ? { contentHtml } : {}),
  };

  return Object.values(reply).some((item) => item !== undefined) ? reply : undefined;
}

export function toTorrentComments(value: unknown): TorrentComment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const record = entry as JsonRecord;
    const contentHtml = getNestedString(record, ['content']) ?? undefined;
    const comment: TorrentComment = {
      id: getNestedNumber(record, ['id']) ?? undefined,
      ...(contentHtml ? { contentHtml, contentText: stripHtml(contentHtml) } : {}),
      isEdited: record.isEdited === 1 || getBoolean(record.isEdited),
      createdAt: getNestedString(record, ['createdAt']) ?? undefined,
      editedAt: typeof record.editedAt === 'string' || record.editedAt === null ? record.editedAt : undefined,
      author: toTorrentCommentAuthor(record.author),
      replyTo: toTorrentCommentReply(record.replyTo),
    };

    return [comment];
  });
}

export function formatStructuredTorrentComment(comment: TorrentComment): string {
  const parts: string[] = [];

  if (comment.author?.username) {
    parts.push(`Author: ${comment.author.username}`);
  }

  if (comment.createdAt) {
    parts.push(`Created: ${comment.createdAt}`);
  }

  if (comment.isEdited) {
    parts.push('Edited: yes');
  }

  if (comment.replyTo?.username) {
    parts.push(`ReplyTo: ${comment.replyTo.username}`);
  }

  if (comment.contentText) {
    parts.push(`Comment: ${comment.contentText}`);
  }

  return parts.join(' | ');
}

export function formatStructuredTorrentCommentsPage(page: TorrentCommentsPage): string {
  if (page.comments.length === 0) {
    return `InfoHash: ${page.infoHash} | Page: ${page.page} | No comments found`;
  }

  return page.comments.map((comment) => formatStructuredTorrentComment(comment)).join('\n');
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

export function toStructuredTorrentDetail(item: unknown): TorrentDetail | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as JsonRecord;
  const title = getNestedString(record, ['name'], ['title']);
  const infoHash = getInfoHash(record);

  if (!title || !infoHash) {
    return null;
  }

  const category = getNestedString(record, ['metadata', 'category', 'name'], ['category', 'name']);
  const subcategory = getNestedString(record, ['metadata', 'subcategory', 'name'], ['subcategory', 'name']);
  const sizeBytes = getNestedNumber(record, ['size']);
  const files = toTorrentFiles(record.files);
  const detail: TorrentDetail = {
    title,
    infoHash,
    ...(category ? { category } : {}),
    ...(subcategory ? { subcategory } : {}),
    ...(sizeBytes !== null ? { sizeBytes, size: formatBytes(sizeBytes) ?? undefined } : {}),
    ...(getNestedNumber(record, ['seeders']) !== null ? { seeders: getNestedNumber(record, ['seeders']) ?? undefined } : {}),
    ...(getNestedNumber(record, ['leechers']) !== null ? { leechers: getNestedNumber(record, ['leechers']) ?? undefined } : {}),
    ...(getNestedNumber(record, ['completions']) !== null ? { completions: getNestedNumber(record, ['completions']) ?? undefined } : {}),
    ...(getNestedString(record, ['uploader'], ['uploader', 'username'], ['uploader', 'name']) ? { uploader: getNestedString(record, ['uploader'], ['uploader', 'username'], ['uploader', 'name']) ?? undefined } : {}),
    ...(getNestedString(record, ['createdAt']) ? { createdAt: getNestedString(record, ['createdAt']) ?? undefined } : {}),
    ...(getNestedString(record, ['status']) ? { status: getNestedString(record, ['status']) ?? undefined } : {}),
    ...(getNestedString(record, ['description']) ? { descriptionHtml: getNestedString(record, ['description']) ?? undefined } : {}),
    ...(getBoolean(record.isFreeleech) !== undefined ? { isFreeleech: getBoolean(record.isFreeleech) } : {}),
    ...(getBoolean(record.isExclusive) !== undefined ? { isExclusive: getBoolean(record.isExclusive) } : {}),
    ...(getBoolean(record.lowBitrateWarning) !== undefined ? { lowBitrateWarning: getBoolean(record.lowBitrateWarning) } : {}),
    fileCount: files.length,
    files,
    ...(toTorrentTmdbInfo(record.metadata && typeof record.metadata === 'object' ? (record.metadata as JsonRecord).tmdbData : undefined)
      ? { tmdb: toTorrentTmdbInfo(record.metadata && typeof record.metadata === 'object' ? (record.metadata as JsonRecord).tmdbData : undefined) }
      : {}),
    ...(toTorrentTrustInfo(record.trust) ? { trust: toTorrentTrustInfo(record.trust) } : {}),
  };

  return detail;
}

export function formatStructuredTorrentDetail(item: TorrentDetail): string {
  const parts = [
    `Title: ${item.title}`,
    `InfoHash: ${item.infoHash}`,
  ];

  if (item.category) {
    parts.push(`Category: ${item.subcategory ? `${item.category} / ${item.subcategory}` : item.category}`);
  }

  if (item.size) {
    parts.push(`Size: ${item.size}`);
  }

  if (item.seeders !== undefined) {
    parts.push(`Seeds: ${item.seeders}`);
  }

  if (item.leechers !== undefined) {
    parts.push(`Leechers: ${item.leechers}`);
  }

  if (item.completions !== undefined) {
    parts.push(`Completions: ${item.completions}`);
  }

  if (item.uploader) {
    parts.push(`Uploader: ${item.uploader}`);
  }

  if (item.createdAt) {
    parts.push(`Created: ${item.createdAt}`);
  }

  if (item.status) {
    parts.push(`Status: ${item.status}`);
  }

  parts.push(`Files: ${item.fileCount}`);

  if (item.isFreeleech) {
    parts.push('Freeleech: yes');
  }

  if (item.isExclusive) {
    parts.push('Exclusive: yes');
  }

  if (item.lowBitrateWarning) {
    parts.push('Low bitrate warning: yes');
  }

  if (item.tmdb?.title) {
    parts.push(`TMDB: ${item.tmdb.title}`);
  }

  if (item.trust?.status) {
    parts.push(`Trust: ${item.trust.status}${item.trust.score !== undefined ? ` (${item.trust.score})` : ''}`);
  }

  if (item.descriptionHtml) {
    parts.push(`\n${htmlToMarkdown(item.descriptionHtml)}`);
  }

  return parts.join(' | ');
}

export function formatSearchResult(item: unknown): string | null {
  const structured = toStructuredSearchResult(item);
  return structured ? formatStructuredSearchResult(structured) : null;
}
