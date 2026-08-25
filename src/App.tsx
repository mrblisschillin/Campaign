import { useEffect, useRef, useState } from 'react';
import candidatesData from './data/candidates.json';
import changesData from './data/changes.json';
import metaData from './data/meta.json';
import newsData from './data/news.json';
import type {
  Candidate,
  CandidateStatus,
  ChangeItem,
  MetaData,
  NewsItem,
  NewsType,
  Office,
  PlatformTopic,
  SourceType,
} from './types';

const candidates = candidatesData as Candidate[];
const news = newsData as NewsItem[];
const changes = changesData as ChangeItem[];
const meta = metaData as MetaData;

type View = 'candidates' | 'news' | 'changes';
type DateRange = 'all' | '30' | '90' | 'older';

const statusLabels: Record<CandidateStatus, string> = {
  publicly_announced: 'Publicly announced',
  nomination_filed: 'Nomination filed',
  declared_candidate: 'Declared candidate',
  ballot_confirmed: 'Ballot confirmed',
  withdrawn: 'Withdrawn',
  needs_review: 'Needs review',
};

const topicLabels: Record<PlatformTopic, string> = {
  housing: 'Housing',
  homelessness_and_health: 'Homelessness & health',
  public_safety: 'Public safety',
  transportation: 'Transportation',
  taxes_and_budget: 'Taxes & budget',
  downtown_and_local_economy: 'Downtown & local economy',
  climate_and_public_realm: 'Climate & public realm',
  governance_and_amalgamation: 'Governance & amalgamation',
  parks: 'Parks',
  arts_and_culture: 'Arts & culture',
  indigenous_relations: 'Indigenous relations',
  other: 'Other',
};

const sourceLabels: Record<SourceType, string> = {
  official_record: 'Official record',
  candidate_website: 'Candidate-stated',
  campaign_release: 'Campaign release',
  interview: 'Interview',
  endorsement: 'Endorsement',
  opinion: 'Opinion',
  independent_reporting: 'Independent reporting',
  discovery_source: 'Discovery source',
};

const newsTypeLabels: Record<NewsType, string> = {
  reporting: 'Reporting',
  interview: 'Interview',
  opinion: 'Opinion',
  endorsement: 'Endorsement',
  campaign_release: 'Campaign release',
  official_notice: 'Official notice',
};

const changeTypeLabels: Record<ChangeItem['type'], string> = {
  new_candidate: 'New candidate',
  status_change: 'Status change',
  withdrawal: 'Withdrawal',
  platform_change: 'Platform change',
  coverage_added: 'Coverage added',
};

const shortDate = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
const longDate = new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });

function formatDate(date: string | null, fallback = 'Undated') {
  if (!date) return fallback;
  return shortDate.format(new Date(`${date}T12:00:00-07:00`));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: meta.timezone,
    timeZoneName: 'short',
  }).format(new Date(value));
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('');
}

function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}<span className="external-mark" aria-hidden="true">↗</span>
    </a>
  );
}

function Portrait({ candidate, large = false }: { candidate: Candidate; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(candidate.photo.url) && !failed;
  return (
    <div className={`portrait${large ? ' portrait-large' : ''}${showImage ? '' : ' initials'}`}>
      {showImage ? <img src={candidate.photo.url!} alt={candidate.photo.alt} onError={() => setFailed(true)} /> : <span aria-label={candidate.photo.alt}>{initials(candidate.name)}</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: CandidateStatus }) {
  return <span className={`status status-${status}`}>{statusLabels[status]}</span>;
}

function CandidateCard({ candidate, onOpen }: { candidate: Candidate; onOpen: (candidate: Candidate) => void }) {
  const latest = candidate.recentNewsIds
    .map((id) => news.find((item) => item.id === id))
    .filter((item): item is NewsItem => Boolean(item))
    .sort((a, b) => (b.publicationDate ?? b.retrievalDate).localeCompare(a.publicationDate ?? a.retrievalDate))[0];

  return (
    <article className={`candidate-card${candidate.needsReview ? ' review-card' : ''}`}>
      <Portrait candidate={candidate} />
      <div className="candidate-copy">
        <div className="candidate-topline">
          <StatusBadge status={candidate.status} />
          {candidate.incumbent && <span>Incumbent {candidate.office === 'mayor' ? 'mayor' : 'councillor'}</span>}
          {candidate.affiliation && <span>{candidate.affiliation.name}</span>}
        </div>
        <h3>{candidate.name}</h3>
        <p>{candidate.biography}</p>
        {candidate.needsReview && candidate.needsReviewExplanation && <div className="review-note"><strong>Verification pending.</strong> {candidate.needsReviewExplanation}</div>}
        {candidate.platform.length > 0 ? (
          <div className="position-preview">
            {candidate.platform.slice(0, 2).map((position) => (
              <div key={position.id}><span>{topicLabels[position.topic]}</span><p>{position.summary}</p></div>
            ))}
          </div>
        ) : !candidate.needsReview ? <p className="muted-empty">No sourced platform positions entered yet.</p> : null}
        {latest && <div className="latest-line"><span>Latest</span><ExternalLink href={latest.canonicalUrl}>{latest.headline}</ExternalLink></div>}
      </div>
      <button className="view-button" type="button" onClick={() => onOpen(candidate)} aria-label={`Open ${candidate.name} profile`}>
        View profile <span aria-hidden="true">→</span>
      </button>
    </article>
  );
}

function CandidateGroup({ title, description, group, onOpen }: { title: string; description: string; group: Candidate[]; onOpen: (candidate: Candidate) => void }) {
  if (group.length === 0) return null;
  return (
    <div className="candidate-group">
      <div className="group-heading"><div><h3>{title}</h3><p>{description}</p></div><span>{group.length}</span></div>
      <div className="candidate-list">{group.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} onOpen={onOpen} />)}</div>
    </div>
  );
}

function CandidateSection({ office, filtered, onOpen }: { office: Office; filtered: Candidate[]; onOpen: (candidate: Candidate) => void }) {
  const group = filtered.filter((candidate) => candidate.office === office);
  if (group.length === 0) return null;
  const announced = group.filter((candidate) => candidate.status === 'publicly_announced');
  const official = group.filter((candidate) => ['nomination_filed', 'declared_candidate', 'ballot_confirmed'].includes(candidate.status));
  const withdrawn = group.filter((candidate) => candidate.status === 'withdrawn');
  return (
    <section className="office-section" aria-labelledby={`${office}-heading`}>
      <div className="section-heading">
        <div><span className="eyebrow crimson">Office</span><h2 id={`${office}-heading`}>{office === 'mayor' ? 'Mayor' : 'Council'}</h2></div>
        <span className="result-count">{group.length} record{group.length === 1 ? '' : 's'}</span>
      </div>
      <CandidateGroup title="Publicly announced" description="Direct campaign announcement or adequately corroborated local reporting." group={announced} onOpen={onOpen} />
      <CandidateGroup title="Official election status" description="Nomination or ballot status confirmed by the City of Victoria." group={official} onOpen={onOpen} />
      <CandidateGroup title="Withdrawn" description="Previously tracked candidates with a sourced withdrawal." group={withdrawn} onOpen={onOpen} />
    </section>
  );
}

function CandidateDetail({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const candidateNews = candidate.recentNewsIds.map((id) => news.find((item) => item.id === id)).filter((item): item is NewsItem => Boolean(item));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="candidate-detail-title">
        <button ref={closeRef} className="close-button" type="button" onClick={onClose} aria-label="Close candidate profile">×</button>
        <div className="detail-hero">
          <Portrait candidate={candidate} large />
          <div>
            <span className="eyebrow crimson">{candidate.office === 'mayor' ? 'Candidate for mayor' : 'Candidate for council'}</span>
            <h2 id="candidate-detail-title">{candidate.name}</h2>
            <div className="candidate-topline detail-status"><StatusBadge status={candidate.status} />{candidate.incumbent && <span>Incumbent</span>}{candidate.affiliation && <span>{candidate.affiliation.name}</span>}</div>
          </div>
        </div>

        {candidate.needsReview && candidate.needsReviewExplanation && <div className="review-banner"><strong>Needs review</strong><p>{candidate.needsReviewExplanation}</p></div>}

        <div className="detail-section">
          <h3>Profile</h3>
          <p>{candidate.biography}</p>
          <dl className="fact-list">
            <div><dt>Status date</dt><dd>{formatDate(candidate.statusDate)}</dd></div>
            <div><dt>Affiliation</dt><dd>{candidate.affiliation?.name ?? 'No sourced affiliation published'}</dd></div>
            <div><dt>Last verified</dt><dd>{formatTimestamp(candidate.lastVerified)}</dd></div>
            <div><dt>Aliases</dt><dd>{candidate.aliases.length ? candidate.aliases.join(', ') : 'None recorded'}</dd></div>
          </dl>
          <div className="link-row">
            <ExternalLink href={candidate.statusSource.url}>{candidate.statusSource.label}</ExternalLink>
            {candidate.campaignWebsite && <ExternalLink href={candidate.campaignWebsite}>Official campaign site</ExternalLink>}
            {candidate.incumbencySourceUrl && <ExternalLink href={candidate.incumbencySourceUrl}>Incumbency source</ExternalLink>}
            {candidate.affiliation && <ExternalLink href={candidate.affiliation.sourceUrl}>Affiliation source</ExternalLink>}
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title"><h3>Platform positions</h3><span>{candidate.platform.length} sourced item{candidate.platform.length === 1 ? '' : 's'}</span></div>
          {candidate.platform.length ? (
            <div className="platform-list">
              {candidate.platform.map((position) => (
                <article key={position.id}>
                  <div className="platform-meta"><span className="topic-pill">{topicLabels[position.topic]}</span><span>{sourceLabels[position.sourceType]}</span></div>
                  <p>{position.summary}</p>
                  <div className="source-line"><span>Verified {formatDate(position.verifiedDate)}</span><ExternalLink href={position.sourceUrl}>Open source</ExternalLink></div>
                </article>
              ))}
            </div>
          ) : <div className="empty-inline">No platform position is recorded. Silence is not interpreted as a position.</div>}
        </div>

        <div className="detail-section">
          <div className="detail-section-title"><h3>Recent coverage</h3><span>{candidateNews.length}</span></div>
          {candidateNews.length ? candidateNews.map((item) => (
            <div className="detail-news" key={item.id}><span>{formatDate(item.publicationDate, 'Undated')} · {item.publisher}</span><ExternalLink href={item.canonicalUrl}>{item.headline}</ExternalLink></div>
          )) : <div className="empty-inline">No substantive coverage is attached to this record.</div>}
        </div>

        {candidate.photo.url && <div className="photo-credit">Photo: {candidate.photo.credit}. <ExternalLink href={candidate.photo.sourceUrl!}>Image source</ExternalLink></div>}
      </section>
    </div>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="filter-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function CandidatesView({ onOpen }: { onOpen: (candidate: Candidate) => void }) {
  return (
    <>
      <CandidateSection office="mayor" filtered={candidates} onOpen={onOpen} />
      <CandidateSection office="councillor" filtered={candidates} onOpen={onOpen} />
    </>
  );
}

function NewsView({ onOpenCandidate }: { onOpenCandidate: (candidate: Candidate) => void }) {
  const [candidateId, setCandidateId] = useState('all');
  const [range, setRange] = useState<DateRange>('all');
  const [topic, setTopic] = useState<'all' | PlatformTopic>('all');
  const [type, setType] = useState<'all' | NewsType>('all');
  const anchorDate = new Date(meta.lastVerified);
  const filtered = news.filter((item) => {
    const itemDate = new Date(`${item.publicationDate ?? item.retrievalDate}T12:00:00-07:00`);
    const age = Math.floor((anchorDate.getTime() - itemDate.getTime()) / 86_400_000);
    return (candidateId === 'all' || item.candidateIds.includes(candidateId)) && (topic === 'all' || item.topics.includes(topic)) && (type === 'all' || item.type === type) && (range === 'all' || (range === '30' && age <= 30) || (range === '90' && age <= 90) || (range === 'older' && age > 90));
  }).sort((a, b) => (b.publicationDate ?? b.retrievalDate).localeCompare(a.publicationDate ?? a.retrievalDate));

  return (
    <>
      <div className="view-intro"><div><span className="eyebrow crimson">Source log</span><h2>Recent news</h2></div><p>Substantive recent coverage plus the newest older source needed to establish each candidacy or major position.</p></div>
      <section className="filter-panel compact-filters" aria-label="News filters">
        <SelectField label="Candidate" value={candidateId} onChange={setCandidateId}><option value="all">All candidates</option>{[...candidates].sort((a, b) => a.name.localeCompare(b.name)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</SelectField>
        <SelectField label="Date" value={range} onChange={(value) => setRange(value as DateRange)}><option value="all">All dates</option><option value="30">Past 30 days</option><option value="90">Past 90 days</option><option value="older">Older items</option></SelectField>
        <SelectField label="Topic" value={topic} onChange={(value) => setTopic(value as 'all' | PlatformTopic)}><option value="all">All topics</option>{meta.topics.map((value) => <option key={value} value={value}>{topicLabels[value]}</option>)}</SelectField>
        <SelectField label="Source type" value={type} onChange={(value) => setType(value as 'all' | NewsType)}><option value="all">All source types</option>{Object.entries(newsTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
        <div className="filter-summary"><strong>{filtered.length}</strong> item{filtered.length === 1 ? '' : 's'}</div>
      </section>
      <div className="news-feed" aria-live="polite">
        {filtered.length ? filtered.map((item) => (
          <article className="news-item" key={item.id}>
            <div className="news-date"><span>{item.publicationDate ? formatDate(item.publicationDate) : 'Undated source'}</span><small>Retrieved {formatDate(item.retrievalDate)}</small></div>
            <div className="news-copy">
              <div className="news-kicker"><span>{newsTypeLabels[item.type]}</span><span>{item.publisher}</span>{item.limitedAccess && <span className="limited">Limited access</span>}</div>
              <h3><ExternalLink href={item.canonicalUrl}>{item.headline}</ExternalLink></h3><p>{item.summary}</p>
              <div className="topic-row">{item.topics.map((itemTopic) => <span key={itemTopic}>{topicLabels[itemTopic]}</span>)}</div>
              {item.candidateIds.length > 0 && <div className="associated-row"><span>Associated</span>{item.candidateIds.map((id) => { const candidate = candidates.find((record) => record.id === id); return candidate ? <button type="button" key={id} onClick={() => onOpenCandidate(candidate)}>{candidate.name}</button> : null; })}</div>}
              {item.relatedUrls.length > 0 && <details><summary>{item.relatedUrls.length} related source{item.relatedUrls.length === 1 ? '' : 's'}</summary>{item.relatedUrls.map((url) => <ExternalLink key={url} href={url}>{new URL(url).hostname.replace('www.', '')}</ExternalLink>)}</details>}
            </div>
          </article>
        )) : <div className="empty-state"><strong>No news matches these filters</strong><p>Expand the date range or reset one of the source filters.</p></div>}
      </div>
    </>
  );
}

function ChangesView({ onOpenCandidate }: { onOpenCandidate: (candidate: Candidate) => void }) {
  const [type, setType] = useState<'all' | ChangeItem['type']>('all');
  const filtered = changes.filter((change) => type === 'all' || change.type === type);
  return (
    <>
      <div className="view-intro"><div><span className="eyebrow crimson">Audit trail</span><h2>Changes</h2></div><p>Chronological record of candidate additions, status movements, withdrawals, platform changes and coverage additions.</p></div>
      <div className="change-toolbar"><SelectField label="Change type" value={type} onChange={(value) => setType(value as 'all' | ChangeItem['type'])}><option value="all">All changes</option>{Object.entries(changeTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField><span>{filtered.length} entries</span></div>
      <ol className="change-list">
        {filtered.map((change) => (
          <li key={change.id}><div className="change-marker" aria-hidden="true" /><div className="change-date">{formatDate(change.date)}</div><article><span className={`change-label change-${change.type}`}>{changeTypeLabels[change.type]}</span><p>{change.summary}</p><div className="associated-row">{change.candidateIds.map((id) => { const candidate = candidates.find((record) => record.id === id); return candidate ? <button type="button" key={id} onClick={() => onOpenCandidate(candidate)}>{candidate.name}</button> : null; })}<ExternalLink href={change.sourceUrl}>Source</ExternalLink></div></article></li>
        ))}
      </ol>
      {!filtered.length && <div className="empty-state"><strong>No changes in this category</strong><p>No matching entries are present in the current research snapshot.</p></div>}
    </>
  );
}

function App() {
  const [view, setView] = useState<View>('candidates');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const electionDate = new Date(`${meta.electionDate}T00:00:00-07:00`);
  const days = Math.max(0, Math.ceil((electionDate.getTime() - Date.now()) / 86_400_000));
  const count = (status: CandidateStatus) => candidates.filter((candidate) => candidate.status === status).length;
  const officialCount = count('nomination_filed') + count('declared_candidate') + count('ballot_confirmed');
  const switchView = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  if (!Array.isArray(candidatesData) || !Array.isArray(newsData) || !Array.isArray(changesData)) {
    return <main className="loading-state" role="status"><strong>Research data could not be loaded.</strong><span>Run npm run validate:data to inspect the files.</span></main>;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="masthead">
        <div className="brand-lockup"><span className="eyebrow">Internal research desk · Victoria, B.C.</span><h1>Victoria 2026<br />Candidate Monitor</h1></div>
        <div className="election-brief"><span className="eyebrow">General voting day</span><strong>{longDate.format(electionDate)}</strong><span>{days} day{days === 1 ? '' : 's'} remaining</span></div>
      </header>
      <div className="workspace">
        <aside className="sidebar" aria-label="Dashboard navigation">
          <nav>
            <button type="button" className={`nav-item${view === 'candidates' ? ' active' : ''}`} aria-current={view === 'candidates' ? 'page' : undefined} onClick={() => switchView('candidates')}>Candidates <span>{candidates.length}</span></button>
            <button type="button" className={`nav-item${view === 'news' ? ' active' : ''}`} aria-current={view === 'news' ? 'page' : undefined} onClick={() => switchView('news')}>Recent news <span>{news.length}</span></button>
            <button type="button" className={`nav-item${view === 'changes' ? ' active' : ''}`} aria-current={view === 'changes' ? 'page' : undefined} onClick={() => switchView('changes')}>Changes <span>{changes.length}</span></button>
          </nav>
          <div className="sidebar-bottom"><div className="source-note"><span className="signal-dot" /><div><strong>Research current</strong><small>{formatTimestamp(meta.lastVerified)}</small></div></div><p>{meta.scopeNote}</p><ExternalLink href={meta.officialElectionUrl}>Official City election page</ExternalLink></div>
        </aside>
        <main className="main-content" id="main-content">
          <section className="overview-row" aria-label="Candidate status summary">
            <div><span>Publicly announced</span><strong>{count('publicly_announced')}</strong></div><div><span>Nomination filed</span><strong>{count('nomination_filed')}</strong></div><div><span>Declared / ballot</span><strong>{count('declared_candidate') + count('ballot_confirmed')}</strong></div><div><span>Withdrawn</span><strong>{count('withdrawn')}</strong></div>
          </section>
          <div className="official-note"><strong>{officialCount === 0 ? 'No official candidate filings yet.' : `${officialCount} records have official City status.`}</strong><span>Nominations run {formatDate(meta.nominationsOpen)}–{formatDate(meta.nominationsClose)}. The City of Victoria controls nomination and ballot status.</span></div>
          {view === 'candidates' && <CandidatesView onOpen={setSelectedCandidate} />}{view === 'news' && <NewsView onOpenCandidate={setSelectedCandidate} />}{view === 'changes' && <ChangesView onOpenCandidate={setSelectedCandidate} />}
        </main>
      </div>
      {selectedCandidate && <CandidateDetail candidate={selectedCandidate} onClose={() => setSelectedCandidate(null)} />}
    </div>
  );
}

export default App;
