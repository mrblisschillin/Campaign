export const candidateStatuses = [
  'publicly_announced',
  'nomination_filed',
  'declared_candidate',
  'ballot_confirmed',
  'withdrawn',
  'needs_review',
] as const;

export const platformTopics = [
  'housing',
  'homelessness_and_health',
  'public_safety',
  'transportation',
  'taxes_and_budget',
  'downtown_and_local_economy',
  'climate_and_public_realm',
  'governance_and_amalgamation',
  'parks',
  'arts_and_culture',
  'indigenous_relations',
  'other',
] as const;

export type CandidateStatus = (typeof candidateStatuses)[number];
export type PlatformTopic = (typeof platformTopics)[number];
export type Office = 'mayor' | 'councillor';
export type SourceType =
  | 'official_record'
  | 'candidate_website'
  | 'campaign_release'
  | 'interview'
  | 'endorsement'
  | 'opinion'
  | 'independent_reporting'
  | 'discovery_source';

export interface SourceRef {
  url: string;
  label: string;
  sourceType: SourceType;
}

export interface Affiliation {
  name: string;
  type: 'elector_organization' | 'slate' | 'other';
  sourceUrl: string;
}

export interface CandidateLink {
  label: string;
  url: string;
  type: 'website' | 'facebook' | 'instagram' | 'linkedin' | 'bluesky' | 'other';
}

export interface CandidatePhoto {
  url: string | null;
  sourceUrl: string | null;
  credit: string | null;
  alt: string;
}

export interface PlatformPosition {
  id: string;
  topic: PlatformTopic;
  summary: string;
  sourceUrl: string;
  sourceType: SourceType;
  verifiedDate: string;
}

export interface Candidate {
  id: string;
  name: string;
  aliases: string[];
  office: Office;
  status: CandidateStatus;
  statusDate: string;
  statusSource: SourceRef;
  incumbent: boolean;
  incumbencySourceUrl: string | null;
  affiliation: Affiliation | null;
  biography: string;
  campaignWebsite: string | null;
  campaignLinks: CandidateLink[];
  photo: CandidatePhoto;
  platform: PlatformPosition[];
  recentNewsIds: string[];
  lastVerified: string;
  needsReview: boolean;
  needsReviewExplanation: string | null;
  manualNotes: string;
}

export type NewsType =
  | 'reporting'
  | 'interview'
  | 'opinion'
  | 'endorsement'
  | 'campaign_release'
  | 'official_notice';

export interface NewsItem {
  id: string;
  headline: string;
  publisher: string;
  canonicalUrl: string;
  publicationDate: string | null;
  retrievalDate: string;
  type: NewsType;
  summary: string;
  candidateIds: string[];
  topics: PlatformTopic[];
  limitedAccess: boolean;
  relatedUrls: string[];
}

export type ChangeType =
  | 'new_candidate'
  | 'status_change'
  | 'withdrawal'
  | 'platform_change'
  | 'coverage_added';

export interface ChangeItem {
  id: string;
  date: string;
  type: ChangeType;
  summary: string;
  candidateIds: string[];
  newsIds: string[];
  sourceUrl: string;
}

export interface MetaData {
  title: string;
  jurisdiction: string;
  offices: { mayor: number; councillor: number };
  electionDate: string;
  timezone: string;
  lastVerified: string;
  nominationsOpen: string;
  nominationsClose: string;
  scopeNote: string;
  officialElectionUrl: string;
  electionsBcUrl: string;
  topics: PlatformTopic[];
}
