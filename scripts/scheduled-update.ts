import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  Candidate,
  CandidateStatus,
  ChangeItem,
  ChangeType,
  NewsItem,
  PlatformPosition,
} from '../src/types.js';

type SourceType = 'official' | 'secondary';

interface SourceCheckConfig {
  id: string;
  label: string;
  url: string;
  sourceType: SourceType;
  mustContain: string[];
  disallowTerms: string[];
}

interface SourceResult {
  id: string;
  label: string;
  url: string;
  sourceType: SourceType;
  statusCode: number | null;
  status: 'ok' | 'inaccessible' | 'blocked';
  error: string | null;
  fetchedAt: string;
  jurisdictionMatched: boolean;
}

interface UpdateManifest {
  candidates?: Candidate[];
  news?: NewsItem[];
  changes?: ChangeItem[];
  notes?: string[];
}

interface RunReport {
  scanTimestamp: string;
  candidatesAddedOrChanged: {
    candidateId: string;
    changeType: 'added' | 'updated' | 'status_change';
    before?: string;
    after?: string;
    supportingLinks: string[];
  }[];
  statusAndPlatformChanges: {
    candidateId: string;
    changeType: 'status_change' | 'platform_change';
    before?: string;
    after?: string;
    supportingLinks: string[];
  }[];
  newsItemsAdded: { id: string; headline: string; canonicalUrl: string; candidateIds: string[] }[];
  duplicatesRejected: { type: 'candidate' | 'news' | 'change'; identifier: string; reason: string; sourceUrl: string }[];
  itemsRequiringReview: string[];
  inaccessibleOrFailedSources: SourceResult[];
  validation: { command: string; passed: boolean; error?: string };
  build: { command: string; passed: boolean; error?: string };
  filesTouched: string[];
  directSupportingLinks: string[];
  summary: {
    candidatesExamined: number;
    newsAdded: number;
    changesAdded: number;
    sourcesChecked: number;
  };
}

interface CliArgs {
  manifestPath?: string;
  reportPath?: string;
}

interface Snapshot {
  candidates: Candidate[];
  news: NewsItem[];
  changes: ChangeItem[];
  meta: {
    electionDate: string;
    nominationsOpen: string;
    nominationsClose: string;
    lastVerified: string;
    [key: string]: unknown;
  };
}

const root = process.cwd();
const scanTimestamp = new Date().toISOString();
const defaultReportDir = resolve(root, '.dashboard-update-reports');

const dataPaths = {
  candidates: resolve(root, 'src/data/candidates.json'),
  news: resolve(root, 'src/data/news.json'),
  changes: resolve(root, 'src/data/changes.json'),
  meta: resolve(root, 'src/data/meta.json'),
  sources: resolve(root, 'scripts/update-sources.json'),
};

const report: RunReport = {
  scanTimestamp,
  candidatesAddedOrChanged: [],
  statusAndPlatformChanges: [],
  newsItemsAdded: [],
  duplicatesRejected: [],
  itemsRequiringReview: [],
  inaccessibleOrFailedSources: [],
  validation: { command: 'npm run validate:data', passed: false },
  build: { command: 'npm run build', passed: false },
  filesTouched: [],
  directSupportingLinks: [],
  summary: {
    candidatesExamined: 0,
    newsAdded: 0,
    changesAdded: 0,
    sourcesChecked: 0,
  },
};

const statusPriority: CandidateStatus[] = [
  'publicly_announced',
  'nomination_filed',
  'declared_candidate',
  'ballot_confirmed',
  'withdrawn',
  'needs_review',
];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--manifest') {
      args.manifestPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (argv[i] === '--report') {
      args.reportPath = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return args;
}

function parseJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeUrl(raw: string): string {
  const parsed = new URL(raw);
  const params = parsed.searchParams;
  [...params.keys()].forEach((key) => {
    if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
      params.delete(key);
    }
  });
  parsed.search = params.toString();
  parsed.hash = '';
  const noTrailingSlash = parsed.toString().replace(/\/$/, '');
  return noTrailingSlash;
}

function jurisdictionContains(content: string, needles: string[]): boolean {
  const text = content.toLowerCase();
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

function isBlockedUrl(url: string): boolean {
  return (
    /victorian state/i.test(url) ||
    /vec\.vic\.gov\.au/i.test(url) ||
    /\.au\//i.test(url) ||
    /\bmelbourne\b|\bgeelong\b/i.test(url) ||
    /\b(saanich|esquimalt|oak bay|langford|view royal|sidney|sooke|central saanich|north saanich)\b/i.test(url.toLowerCase())
  );
}

function needsReviewForStatus(candidate: Candidate, snapshot: Snapshot): string[] {
  const notes: string[] = [];
  const current = new Date(scanTimestamp);
  const nominationsOpen = new Date(`${snapshot.meta.nominationsOpen}T00:00:00`);
  const nominationsClose = new Date(`${snapshot.meta.nominationsClose}T00:00:00`);
  const statusUrl = candidate.statusSource.url.toLowerCase();
  const isOfficial = statusUrl.includes('victoria.ca') || statusUrl.includes('elections.bc.ca');

  if (!isOfficial && candidate.status !== 'publicly_announced') {
    notes.push(`Candidate ${candidate.id}: non-official status source ${candidate.statusSource.url} for ${candidate.status}.`);
  }
  if (candidate.status === 'nomination_filed' && current < nominationsOpen && isOfficial === false) {
    notes.push(`Candidate ${candidate.id}: status_nomination_filed before September 1 without confirmed official evidence.`);
  }
  if ((candidate.status === 'declared_candidate' || candidate.status === 'ballot_confirmed') && current < nominationsClose) {
    notes.push(`Candidate ${candidate.id}: official declaration status before nominations close needs a stronger source.`);
  }
  if (candidate.needsReview && !candidate.needsReviewExplanation) {
    notes.push(`Candidate ${candidate.id}: needsReview is true with missing explanation.`);
  }
  if (candidate.status === 'needs_review' && candidate.needsReview !== true) {
    notes.push(`Candidate ${candidate.id}: status is needs_review but needsReview flag is false.`);
  }
  return notes;
}

async function scanSources(sources: SourceCheckConfig[]): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  for (const source of sources) {
    report.summary.sourcesChecked += 1;
    const check: SourceResult = {
      id: source.id,
      label: source.label,
      url: source.url,
      sourceType: source.sourceType,
      statusCode: null,
      status: 'blocked',
      error: null,
      fetchedAt: scanTimestamp,
      jurisdictionMatched: false,
    };

    if (isBlockedUrl(source.url)) {
      check.status = 'blocked';
      check.error = 'Blocked by jurisdiction safety rule set.';
      results.push(check);
      report.inaccessibleOrFailedSources.push(check);
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(source.url, {
        method: 'GET',
        headers: { 'user-agent': 'Victoria-election-dashboard-update/1.0' },
        signal: controller.signal,
      });
      check.statusCode = response.status;
      if (!response.ok) {
        check.status = 'inaccessible';
        check.error = `${response.status} ${response.statusText}`;
        results.push(check);
        report.inaccessibleOrFailedSources.push(check);
        continue;
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      const body = Buffer.from(await response.arrayBuffer());
      let text = '';
      if (contentType.includes('application/pdf')) {
        if (source.mustContain.length === 0) {
          check.jurisdictionMatched = true;
          check.status = 'ok';
          results.push(check);
          continue;
        }
        const extracted = spawnSync('pdftotext', ['-', '-'], {
          input: body,
          encoding: 'utf8',
          maxBuffer: 12 * 1024 * 1024,
        });
        text = extracted.status === 0 ? extracted.stdout?.toString() ?? '' : '';
        if (!text) {
          check.status = 'inaccessible';
          check.error = 'PDF text extraction failed; source could not be checked.';
          results.push(check);
          report.inaccessibleOrFailedSources.push(check);
          continue;
        }
      } else {
        text = new TextDecoder().decode(body);
      }
      check.jurisdictionMatched =
        source.mustContain.every((term) => jurisdictionContains(text, [term]));
      if (!check.jurisdictionMatched) {
        check.status = 'blocked';
        check.error = `Source does not confirm required Victoria election context: ${source.label}.`;
      } else if (source.disallowTerms.some((term) => text.toLowerCase().includes(term.toLowerCase()))) {
        check.status = 'blocked';
        check.error = `Source contains blocked terms for ${source.label}.`;
      } else {
        check.status = 'ok';
      }
      results.push(check);
      if (check.status !== 'ok') {
        report.inaccessibleOrFailedSources.push(check);
      }
    } catch (error) {
      check.status = 'inaccessible';
      check.error = error instanceof Error ? error.message : String(error);
      results.push(check);
      report.inaccessibleOrFailedSources.push(check);
    } finally {
      clearTimeout(timeout);
    }
  }
  return results;
}

function findPlatformDiff(before: PlatformPosition[], after: PlatformPosition[]): string[] {
  const beforeMap = new Map(before.map((position) => [position.id, position]));
  const afterMap = new Map(after.map((position) => [position.id, position]));
  const changes: string[] = [];

  for (const [id, afterPosition] of afterMap) {
    const beforePosition = beforeMap.get(id);
    if (!beforePosition) {
      changes.push(`added ${afterPosition.topic} (${id})`);
      continue;
    }
    if (
      beforePosition.topic !== afterPosition.topic ||
      beforePosition.summary !== afterPosition.summary ||
      beforePosition.sourceUrl !== afterPosition.sourceUrl ||
      beforePosition.verifiedDate !== afterPosition.verifiedDate
    ) {
      changes.push(`updated ${afterPosition.topic} (${id})`);
    }
  }

  for (const id of beforeMap.keys()) {
    if (!afterMap.has(id)) {
      changes.push(`removed ${id}`);
    }
  }
  return changes;
}

function manifestNotes(manifest: UpdateManifest | null): string[] {
  if (!manifest || !manifest.notes) return [];
  return manifest.notes.filter((note) => typeof note === 'string' && note.trim().length > 0);
}

function runCommand(command: string, args: string[]): { passed: boolean; error?: string } {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 12 * 1024 * 1024,
  });
  if (result.status === 0) {
    return { passed: true };
  }
  return {
    passed: false,
    error: `${result.stdout?.toString()}\n${result.stderr?.toString()}`.trim(),
  };
}

function makeChangeId(prefix: string, type: ChangeType, candidateId: string, index = 0): string {
  const clean = `${type}-${candidateId}-${prefix}-${index}`.replace(/[^a-z0-9-]/gi, '-');
  return clean.replace(/-+/g, '-');
}

function toDate(dateTime: string): string {
  return dateTime.includes('T') ? dateTime.split('T')[0] : dateTime;
}

function dedupeNews(existingNews: NewsItem[], incomingNews: NewsItem[]): {
  acceptedNews: NewsItem[];
  duplicateIds: string[];
} {
  const acceptedNews: NewsItem[] = [];
  const duplicateIds: string[] = [];
  const canonicalMap = new Map<string, string>(existingNews.map((item) => [normalizeUrl(item.canonicalUrl), item.id]));
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  for (const item of incomingNews) {
    if (!item.id || !/^([a-z0-9-]+)$/.test(item.id)) {
      report.itemsRequiringReview.push(`News item missing valid ID was skipped: ${item.id ?? '(missing)'}`);
      duplicateIds.push(item.id ?? '(missing id)');
      continue;
    }
    if (seenIds.has(item.id)) {
      report.duplicatesRejected.push({
        type: 'news',
        identifier: item.id,
        reason: 'Duplicate ID in manifest news entries.',
        sourceUrl: item.canonicalUrl,
      });
      duplicateIds.push(item.id);
      continue;
    }
    seenIds.add(item.id);
    const canonical = normalizeUrl(item.canonicalUrl);
    const existingMatch = canonicalMap.get(canonical);
    if (existingMatch || seen.has(canonical)) {
      report.duplicatesRejected.push({
        type: 'news',
        identifier: item.id,
        reason: `Duplicate canonical URL with existing/accepted item (${existingMatch ?? item.id}).`,
        sourceUrl: item.canonicalUrl,
      });
      duplicateIds.push(item.id);
      continue;
    }
    if (isBlockedUrl(item.canonicalUrl)) {
      report.itemsRequiringReview.push(`News item ${item.id} source URL triggered jurisdiction safeguards: ${item.canonicalUrl}`);
    }
    seen.add(canonical);
    acceptedNews.push(item);
    report.newsItemsAdded.push({
      id: item.id,
      headline: item.headline,
      canonicalUrl: item.canonicalUrl,
      candidateIds: item.candidateIds,
    });
    report.directSupportingLinks.push(item.canonicalUrl);
  }
  return { acceptedNews, duplicateIds };
}

function hasObjectChanges(previous: Candidate, next: Candidate): boolean {
  const previousComparable = { ...previous, manualNotes: '' };
  const nextComparable = { ...next, manualNotes: '' };
  return JSON.stringify(previousComparable) !== JSON.stringify(nextComparable);
}

function toComparableStatus(status: CandidateStatus): number {
  return statusPriority.indexOf(status);
}

const cliArgs = parseArgs(process.argv.slice(2));
const manifestPath = cliArgs.manifestPath ? resolve(cliArgs.manifestPath) : '';
const reportPath = cliArgs.reportPath ? resolve(cliArgs.reportPath) : '';

const snapshot: Snapshot = {
  candidates: parseJson<Candidate[]>(dataPaths.candidates),
  news: parseJson<NewsItem[]>(dataPaths.news),
  changes: parseJson<ChangeItem[]>(dataPaths.changes),
  meta: parseJson<{
    electionDate: string;
    nominationsOpen: string;
    nominationsClose: string;
    lastVerified: string;
    [key: string]: unknown;
  }>(dataPaths.meta),
};
const sourceConfig = parseJson<{ sources: SourceCheckConfig[] }>(dataPaths.sources);

readFileSync(resolve(root, 'README.md'), 'utf8');

const manifest: UpdateManifest | null = manifestPath ? parseJson<UpdateManifest>(manifestPath) : null;
report.summary.candidatesExamined = snapshot.candidates.length;

const sourceChecks = await scanSources(sourceConfig.sources);
const okSources = sourceChecks.filter((result) => result.status === 'ok');
const officialSourceCount = okSources.filter((result) => result.sourceType === 'official').length;
if (officialSourceCount < 1) {
  report.itemsRequiringReview.push('Official source sweep did not return any confirmed official sources in this run.');
}

const candidatesById = new Map(snapshot.candidates.map((candidate) => [candidate.id, candidate]));
const candidateUpdates = [...snapshot.candidates];
const newsUpdates = [...snapshot.news];
const changeUpdates = [...snapshot.changes];
let candidatesChanged = false;
let newsChanged = false;
let changesChanged = false;

if (manifest && (manifest.candidates?.length || manifest.news?.length || manifest.changes?.length)) {
  if (manifest.candidates && manifest.candidates.length > 0) {
    const manifestIds = new Set<string>();
    for (const incoming of manifest.candidates) {
      if (!incoming?.id || typeof incoming.id !== 'string') {
        report.itemsRequiringReview.push('Manifest candidate entry missing candidate ID.');
        continue;
      }
      if (manifestIds.has(incoming.id)) {
        report.duplicatesRejected.push({
          type: 'candidate',
          identifier: incoming.id,
          reason: 'Duplicate candidate ID in manifest.',
          sourceUrl: incoming.statusSource?.url ?? '',
        });
        continue;
      }
      manifestIds.add(incoming.id);

      const existing = candidatesById.get(incoming.id);
      const beforeStatus = existing?.status;
      const existingIndex = existing ? candidateUpdates.findIndex((item) => item.id === incoming.id) : -1;
      const previousStatusRank = existing ? toComparableStatus(existing.status) : -1;
      const incomingStatusRank = toComparableStatus(incoming.status);
      if (incomingStatusRank < previousStatusRank && existing?.status !== incoming.status) {
        report.itemsRequiringReview.push(`Candidate ${incoming.id} status moved backwards from ${existing.status} to ${incoming.status}.`);
      }

      const merged: Candidate = existing
        ? { ...existing, ...incoming, id: existing.id, manualNotes: existing.manualNotes }
        : { ...incoming, manualNotes: incoming.manualNotes ?? '' };
      report.directSupportingLinks.push(merged.statusSource?.url);

      if (existing) {
        if (hasObjectChanges(existing, merged)) {
          candidatesChanged = true;
          candidateUpdates[existingIndex] = merged;
          candidatesById.set(merged.id, merged);
          if (beforeStatus !== merged.status) {
            report.statusAndPlatformChanges.push({
              candidateId: merged.id,
              changeType: 'status_change',
              before: beforeStatus,
              after: merged.status,
              supportingLinks: [merged.statusSource.url],
            });
          }
          const platformDelta = findPlatformDiff(existing.platform, merged.platform);
          if (platformDelta.length > 0) {
            report.statusAndPlatformChanges.push({
              candidateId: merged.id,
              changeType: 'platform_change',
              before: `${platformDelta.slice(0, 3).join('; ')}`,
              after: `${platformDelta.slice(0, 3).join('; ')}`,
              supportingLinks: merged.platform.map((position) => position.sourceUrl),
            });
          }
          report.candidatesAddedOrChanged.push({
            candidateId: merged.id,
            changeType: 'updated',
            before: `${existing.name} (${existing.office})`,
            after: `${merged.name} (${merged.office})`,
            supportingLinks: [merged.statusSource.url],
          });
        }
      } else {
        candidatesChanged = true;
        candidateUpdates.push(merged);
        candidatesById.set(merged.id, merged);
        report.candidatesAddedOrChanged.push({
          candidateId: merged.id,
          changeType: 'added',
          after: `${merged.name} (${merged.office})`,
          supportingLinks: [merged.statusSource.url],
        });
      }

      report.itemsRequiringReview.push(...needsReviewForStatus(merged, snapshot));
      if (isBlockedUrl(merged.statusSource.url)) {
        report.itemsRequiringReview.push(`Candidate ${merged.id} status source blocked by safety checks: ${merged.statusSource.url}`);
      }
    }
  }

  if (manifest.news && manifest.news.length > 0) {
    const deduped = dedupeNews(newsUpdates, manifest.news);
    if (deduped.acceptedNews.length > 0) {
      newsUpdates.push(...deduped.acceptedNews);
      newsChanged = true;
      deduped.acceptedNews.forEach((item) => {
        const unknownIds = item.candidateIds.filter((id) => !candidatesById.has(id));
        if (unknownIds.length > 0) {
          report.itemsRequiringReview.push(`News ${item.id} references unknown candidates: ${unknownIds.join(', ')}.`);
        }
      });
    }
  }

  if (manifest.changes && manifest.changes.length > 0) {
    const manifestChangeIds = new Set(changeUpdates.map((change) => change.id));
    for (const incoming of manifest.changes) {
      if (manifestChangeIds.has(incoming.id)) {
        report.duplicatesRejected.push({
          type: 'change',
          identifier: incoming.id,
          reason: 'Change ID already present.',
          sourceUrl: incoming.sourceUrl,
        });
        continue;
      }
      if (!/^([a-z0-9-]+)$/.test(incoming.id)) {
        report.itemsRequiringReview.push(`Manifest change has invalid ID and was skipped: ${incoming.id}`);
        continue;
      }
      changeUpdates.push(incoming);
      changesChanged = true;
      report.directSupportingLinks.push(incoming.sourceUrl);
    }
  }
}

report.itemsRequiringReview.push(...manifestNotes(manifest));

const changeItemsAdded: ChangeItem[] = [];
if (candidatesChanged || newsChanged || changesChanged) {
  const runDate = toDate(scanTimestamp);
  for (const entry of report.candidatesAddedOrChanged) {
    if (entry.changeType === 'added') {
      changeItemsAdded.push({
        id: makeChangeId(runDate, 'new_candidate', entry.candidateId, changeItemsAdded.length),
        date: runDate,
        type: 'new_candidate',
        summary: `Candidate added for ${entry.after ?? entry.candidateId}.`,
        candidateIds: [entry.candidateId],
        newsIds: [],
        sourceUrl: entry.supportingLinks[0] ?? '',
      });
    }
  }
  for (const entry of report.statusAndPlatformChanges) {
    if (entry.changeType === 'status_change') {
      changeItemsAdded.push({
        id: makeChangeId(runDate, 'status_change', entry.candidateId, changeItemsAdded.length),
        date: runDate,
        type: 'status_change',
        summary: `Candidate ${entry.candidateId} status changed: ${entry.before ?? '(missing)'} -> ${entry.after ?? '(missing)'}`,
        candidateIds: [entry.candidateId],
        newsIds: report.newsItemsAdded.map((news) => news.id),
        sourceUrl: entry.supportingLinks[0] ?? '',
      });
    }
    if (entry.changeType === 'platform_change') {
      changeItemsAdded.push({
        id: makeChangeId(runDate, 'platform_change', entry.candidateId, changeItemsAdded.length),
        date: runDate,
        type: 'platform_change',
        summary: `Platform updated for ${entry.candidateId}: ${entry.before ?? ''} ${entry.after ?? ''}`.trim(),
        candidateIds: [entry.candidateId],
        newsIds: report.newsItemsAdded.map((news) => news.id),
        sourceUrl: entry.supportingLinks[0] ?? '',
      });
    }
  }
  const uniqueChangeIds = new Set(changeUpdates.map((change) => change.id));
  for (const item of changeItemsAdded) {
    if (!uniqueChangeIds.has(item.id)) {
      changeUpdates.push(item);
      uniqueChangeIds.add(item.id);
      changesChanged = true;
      report.directSupportingLinks.push(item.sourceUrl);
    }
  }
}

if (candidatesChanged || newsChanged || changesChanged) {
  snapshot.meta.lastVerified = scanTimestamp;
  const updatedSnapshot = {
    candidates: candidateUpdates.sort((a, b) => a.id.localeCompare(b.id)),
    news: newsUpdates.sort((a, b) => a.id.localeCompare(b.id)),
    changes: changeUpdates.sort((a, b) => b.date.localeCompare(a.date)),
    meta: snapshot.meta,
  };

  if (candidatesChanged) {
    writeJson(dataPaths.candidates, updatedSnapshot.candidates);
  }
  if (newsChanged) {
    writeJson(dataPaths.news, updatedSnapshot.news);
  }
  if (changesChanged) {
    writeJson(dataPaths.changes, updatedSnapshot.changes);
  }
  if (candidatesChanged || newsChanged || changesChanged) {
    writeJson(dataPaths.meta, updatedSnapshot.meta);
    if (candidatesChanged) {
      report.filesTouched.push(dataPaths.candidates);
    }
    if (newsChanged) {
      report.filesTouched.push(dataPaths.news);
    }
    if (changesChanged) {
      report.filesTouched.push(dataPaths.changes);
    }
    report.filesTouched.push(dataPaths.meta);
  }

  report.summary.changesAdded = changeUpdates.length - snapshot.changes.length;
  report.summary.newsAdded = report.newsItemsAdded.length;
}

const validation = runCommand('npm', ['run', 'validate:data']);
report.validation = { ...report.validation, ...validation };
const build = runCommand('npm', ['run', 'build']);
report.build = { ...report.build, ...build };

const outputPath = reportPath
  ? resolve(reportPath)
  : resolve(defaultReportDir, `victoria-dashboard-update-${scanTimestamp.replace(/[:.]/g, '-')}.json`);
mkdirSync(resolve(outputPath, '..'), { recursive: true });
writeJson(outputPath, report);

console.log(JSON.stringify(report, null, 2));

if (!report.validation.passed || !report.build.passed) {
  process.exitCode = 1;
}
