import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { candidateStatuses, platformTopics } from '../src/types.js';

type UnknownRecord = Record<string, unknown>;

const root = process.cwd();
const errors: string[] = [];
const statusSet = new Set<string>(candidateStatuses);
const topicSet = new Set<string>(platformTopics);
const sourceTypes = new Set([
  'official_record',
  'candidate_website',
  'campaign_release',
  'interview',
  'endorsement',
  'opinion',
  'independent_reporting',
  'discovery_source',
]);
const newsTypes = new Set(['reporting', 'interview', 'opinion', 'endorsement', 'campaign_release', 'official_notice']);
const changeTypes = new Set(['new_candidate', 'status_change', 'withdrawal', 'platform_change', 'coverage_added']);

function load(path: string): unknown {
  try {
    return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  } catch (error) {
    errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function check(condition: unknown, location: string, message: string): asserts condition {
  if (!condition) errors.push(`${location}: ${message}`);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function checkUrl(value: unknown, location: string, allowNull = false) {
  if (allowNull && value === null) return;
  if (typeof value !== 'string' || !value) {
    errors.push(`${location}: expected a non-empty URL`);
    return;
  }
  try {
    const parsed = new URL(value);
    check(parsed.protocol === 'https:' || parsed.protocol === 'http:', location, 'URL must use http or https');
    const tracking = [...parsed.searchParams.keys()].filter((key) => /^utm_|^(fbclid|gclid)$/i.test(key));
    check(tracking.length === 0, location, `tracking parameters are not allowed (${tracking.join(', ')})`);
    check(!parsed.hostname.endsWith('.au'), location, 'Australian domains are outside this monitor');
  } catch {
    errors.push(`${location}: invalid URL`);
  }
}

function checkPhotoUrl(value: unknown, location: string) {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
    const publicRoot = resolve(root, 'public');
    const assetPath = resolve(publicRoot, value.slice(1));
    check(assetPath.startsWith(`${publicRoot}/`), location, 'local asset must stay within public/');
    check(existsSync(assetPath), location, `local asset does not exist (${value})`);
    return;
  }
  checkUrl(value, location);
}

function uniqueIds(records: UnknownRecord[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const [index, record] of records.entries()) {
    const id = record.id;
    check(typeof id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(id), `${label}[${index}].id`, 'must be a stable kebab-case ID');
    if (typeof id === 'string') {
      check(!ids.has(id), `${label}[${index}].id`, `duplicate ID ${id}`);
      ids.add(id);
    }
  }
  return ids;
}

const candidatesRaw = load('src/data/candidates.json');
const newsRaw = load('src/data/news.json');
const changesRaw = load('src/data/changes.json');
const metaRaw = load('src/data/meta.json');

check(Array.isArray(candidatesRaw), 'candidates.json', 'expected an array');
check(Array.isArray(newsRaw), 'news.json', 'expected an array');
check(Array.isArray(changesRaw), 'changes.json', 'expected an array');
check(isRecord(metaRaw), 'meta.json', 'expected an object');

const candidates = Array.isArray(candidatesRaw) ? candidatesRaw.filter(isRecord) : [];
const news = Array.isArray(newsRaw) ? newsRaw.filter(isRecord) : [];
const changes = Array.isArray(changesRaw) ? changesRaw.filter(isRecord) : [];
const candidateIds = uniqueIds(candidates, 'candidates');
const newsIds = uniqueIds(news, 'news');
uniqueIds(changes, 'changes');

for (const [index, candidate] of candidates.entries()) {
  const at = `candidates[${index}]${typeof candidate.id === 'string' ? ` (${candidate.id})` : ''}`;
  check(typeof candidate.name === 'string' && candidate.name.trim().length > 2, `${at}.name`, 'required');
  check(Array.isArray(candidate.aliases) && candidate.aliases.every((item) => typeof item === 'string'), `${at}.aliases`, 'must be a string array');
  check(candidate.office === 'mayor' || candidate.office === 'councillor', `${at}.office`, 'must be mayor or councillor');
  check(typeof candidate.status === 'string' && statusSet.has(candidate.status), `${at}.status`, 'invalid status');
  check(isDate(candidate.statusDate), `${at}.statusDate`, 'must be YYYY-MM-DD');
  check(isRecord(candidate.statusSource), `${at}.statusSource`, 'required source object');
  if (isRecord(candidate.statusSource)) {
    checkUrl(candidate.statusSource.url, `${at}.statusSource.url`);
    check(typeof candidate.statusSource.label === 'string' && candidate.statusSource.label.length > 0, `${at}.statusSource.label`, 'required');
    check(typeof candidate.statusSource.sourceType === 'string' && sourceTypes.has(candidate.statusSource.sourceType), `${at}.statusSource.sourceType`, 'invalid source type');
  }
  check(typeof candidate.incumbent === 'boolean', `${at}.incumbent`, 'must be boolean');
  checkUrl(candidate.incumbencySourceUrl, `${at}.incumbencySourceUrl`, true);
  check(candidate.affiliation === null || isRecord(candidate.affiliation), `${at}.affiliation`, 'must be null or an object');
  if (isRecord(candidate.affiliation)) {
    check(typeof candidate.affiliation.name === 'string' && candidate.affiliation.name.length > 0, `${at}.affiliation.name`, 'required');
    check(['elector_organization', 'slate', 'other'].includes(String(candidate.affiliation.type)), `${at}.affiliation.type`, 'invalid type');
    checkUrl(candidate.affiliation.sourceUrl, `${at}.affiliation.sourceUrl`);
  }
  check(typeof candidate.biography === 'string' && candidate.biography.length >= 80, `${at}.biography`, 'must contain a neutral two- or three-sentence biography');
  checkUrl(candidate.campaignWebsite, `${at}.campaignWebsite`, true);
  check(Array.isArray(candidate.campaignLinks), `${at}.campaignLinks`, 'must be an array');
  if (Array.isArray(candidate.campaignLinks)) {
    for (const [linkIndex, link] of candidate.campaignLinks.entries()) {
      check(isRecord(link), `${at}.campaignLinks[${linkIndex}]`, 'must be an object');
      if (isRecord(link)) checkUrl(link.url, `${at}.campaignLinks[${linkIndex}].url`);
    }
  }
  check(isRecord(candidate.photo), `${at}.photo`, 'required object');
  if (isRecord(candidate.photo)) {
    checkPhotoUrl(candidate.photo.url, `${at}.photo.url`);
    checkUrl(candidate.photo.sourceUrl, `${at}.photo.sourceUrl`);
    check(typeof candidate.photo.alt === 'string' && candidate.photo.alt.length > 0, `${at}.photo.alt`, 'required');
    check(typeof candidate.photo.credit === 'string' && candidate.photo.credit.length > 0, `${at}.photo.credit`, 'required');
  }
  check(Array.isArray(candidate.platform), `${at}.platform`, 'must be an array');
  if (Array.isArray(candidate.platform)) {
    const positionIds = new Set<string>();
    for (const [positionIndex, position] of candidate.platform.entries()) {
      const posAt = `${at}.platform[${positionIndex}]`;
      check(isRecord(position), posAt, 'must be an object');
      if (!isRecord(position)) continue;
      check(typeof position.id === 'string' && !positionIds.has(position.id), `${posAt}.id`, 'must be unique within candidate');
      if (typeof position.id === 'string') positionIds.add(position.id);
      check(typeof position.topic === 'string' && topicSet.has(position.topic), `${posAt}.topic`, 'invalid topic');
      check(typeof position.summary === 'string' && position.summary.length >= 30, `${posAt}.summary`, 'must be a concise sourced paraphrase');
      checkUrl(position.sourceUrl, `${posAt}.sourceUrl`);
      check(typeof position.sourceType === 'string' && sourceTypes.has(position.sourceType), `${posAt}.sourceType`, 'invalid source type');
      check(isDate(position.verifiedDate), `${posAt}.verifiedDate`, 'must be YYYY-MM-DD');
    }
  }
  check(Array.isArray(candidate.recentNewsIds), `${at}.recentNewsIds`, 'must be an array');
  check(isTimestamp(candidate.lastVerified), `${at}.lastVerified`, 'must be an ISO timestamp');
  check(typeof candidate.needsReview === 'boolean', `${at}.needsReview`, 'must be boolean');
  check(typeof candidate.manualNotes === 'string', `${at}.manualNotes`, 'must always exist and be a string');
  check(candidate.status === 'needs_review' ? candidate.needsReview === true : candidate.needsReview === false, `${at}.needsReview`, 'must agree with status');
  check(candidate.needsReview ? typeof candidate.needsReviewExplanation === 'string' && candidate.needsReviewExplanation.length > 20 : candidate.needsReviewExplanation === null, `${at}.needsReviewExplanation`, 'must explain review status, otherwise be null');
  check(
    candidate.statusSource.sourceType !== 'discovery_source' || candidate.status !== 'needs_review',
    `${at}.status`,
    'a discovery-only listing remains publicly_announced; source scarcity alone is not a review condition',
  );
}

for (const [index, item] of news.entries()) {
  const at = `news[${index}]${typeof item.id === 'string' ? ` (${item.id})` : ''}`;
  check(typeof item.headline === 'string' && item.headline.length > 10, `${at}.headline`, 'required');
  check(typeof item.publisher === 'string' && item.publisher.length > 1, `${at}.publisher`, 'required');
  checkUrl(item.canonicalUrl, `${at}.canonicalUrl`);
  check(item.publicationDate === null || isDate(item.publicationDate), `${at}.publicationDate`, 'must be YYYY-MM-DD or null when the source is undated');
  check(isDate(item.retrievalDate), `${at}.retrievalDate`, 'must be YYYY-MM-DD');
  check(typeof item.type === 'string' && newsTypes.has(item.type), `${at}.type`, 'invalid news type');
  check(typeof item.summary === 'string' && item.summary.length >= 50, `${at}.summary`, 'must be a neutral one- or two-sentence summary');
  check(Array.isArray(item.candidateIds), `${at}.candidateIds`, 'must be an array');
  if (Array.isArray(item.candidateIds)) item.candidateIds.forEach((id) => check(typeof id === 'string' && candidateIds.has(id), `${at}.candidateIds`, `unknown candidate ${String(id)}`));
  check(Array.isArray(item.topics) && item.topics.every((topic) => typeof topic === 'string' && topicSet.has(topic)), `${at}.topics`, 'contains an invalid topic');
  check(typeof item.limitedAccess === 'boolean', `${at}.limitedAccess`, 'must be boolean');
  check(Array.isArray(item.relatedUrls), `${at}.relatedUrls`, 'must be an array');
  if (Array.isArray(item.relatedUrls)) item.relatedUrls.forEach((url, urlIndex) => checkUrl(url, `${at}.relatedUrls[${urlIndex}]`));
}

for (const candidate of candidates) {
  if (!Array.isArray(candidate.recentNewsIds)) continue;
  candidate.recentNewsIds.forEach((id) => check(typeof id === 'string' && newsIds.has(id), `candidate ${String(candidate.id)}.recentNewsIds`, `unknown news ID ${String(id)}`));
}

for (const [index, change] of changes.entries()) {
  const at = `changes[${index}]${typeof change.id === 'string' ? ` (${change.id})` : ''}`;
  check(isDate(change.date), `${at}.date`, 'must be YYYY-MM-DD');
  check(typeof change.type === 'string' && changeTypes.has(change.type), `${at}.type`, 'invalid change type');
  check(typeof change.summary === 'string' && change.summary.length > 30, `${at}.summary`, 'required');
  check(Array.isArray(change.candidateIds), `${at}.candidateIds`, 'must be an array');
  if (Array.isArray(change.candidateIds)) change.candidateIds.forEach((id) => check(typeof id === 'string' && candidateIds.has(id), `${at}.candidateIds`, `unknown candidate ${String(id)}`));
  check(Array.isArray(change.newsIds), `${at}.newsIds`, 'must be an array');
  if (Array.isArray(change.newsIds)) change.newsIds.forEach((id) => check(typeof id === 'string' && newsIds.has(id), `${at}.newsIds`, `unknown news ID ${String(id)}`));
  checkUrl(change.sourceUrl, `${at}.sourceUrl`);
}

if (isRecord(metaRaw)) {
  check(metaRaw.title === 'Victoria 2026 Candidate Monitor', 'meta.title', 'unexpected title');
  check(metaRaw.jurisdiction === 'City of Victoria, British Columbia', 'meta.jurisdiction', 'must identify Victoria, British Columbia');
  check(metaRaw.electionDate === '2026-10-17', 'meta.electionDate', 'unexpected election date');
  check(isTimestamp(metaRaw.lastVerified), 'meta.lastVerified', 'must be an ISO timestamp');
  check(isDate(metaRaw.nominationsOpen) && isDate(metaRaw.nominationsClose), 'meta nominations', 'must be YYYY-MM-DD dates');
  check(Array.isArray(metaRaw.topics) && metaRaw.topics.length === platformTopics.length && metaRaw.topics.every((topic) => typeof topic === 'string' && topicSet.has(topic)), 'meta.topics', 'must contain the complete topic vocabulary');
  checkUrl(metaRaw.officialElectionUrl, 'meta.officialElectionUrl');
  checkUrl(metaRaw.electionsBcUrl, 'meta.electionsBcUrl');
}

const offices = candidates.reduce<Record<string, number>>((counts, candidate) => {
  if (typeof candidate.office === 'string') counts[candidate.office] = (counts[candidate.office] ?? 0) + 1;
  return counts;
}, {});

if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error${errors.length === 1 ? '' : 's'}:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Data valid: ${candidates.length} candidate records (${offices.mayor ?? 0} mayor, ${offices.councillor ?? 0} council), ${news.length} news records, ${changes.length} change records.`);
