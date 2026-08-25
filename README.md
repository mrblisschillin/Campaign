# Victoria 2026 Candidate Monitor

Static internal research dashboard for candidates seeking the mayoralty or one of eight councillor positions in the October 17, 2026 City of Victoria, British Columbia general local election.

## Run locally

```bash
npm install
npm run validate:data
npm run dev
npm run build
```

The app is a client-side Vite/React/TypeScript project. It has no authentication, database, scraper, CMS, paid API or model integration.

## Research files

- `src/data/candidates.json` — identity, office, sourced status and incumbency, affiliation, neutral biography, campaign links, attributed photo metadata, sourced platform positions, linked coverage, verification state and `manualNotes`.
- `src/data/news.json` — canonical coverage and official notices, dates, type, neutral summary, associated candidates/topics, access note and related versions.
- `src/data/changes.json` — dated candidate, status, withdrawal, platform and coverage changes.
- `src/data/meta.json` — election dates, scope, topic vocabulary and monitor verification timestamp.
- `src/types.ts` — TypeScript schema shared by the interface and data validator.

`publicationDate: null` means the source page is undated; `retrievalDate` records when it was inspected. Where an announcement page is undated, `statusDate` records the first monitor verification date. Automated update work must preserve every candidate's `manualNotes` value exactly.

## Source hierarchy

Research should prefer, in order: City of Victoria election information and official notices; Elections BC local-election information; authenticated candidate-owned campaign sources; Times Colonist, CHEK News, Victoria News, Capital Daily, CBC British Columbia, CTV Vancouver Island and Victoria Buzz. Livable CRD, VoteMate and Island Social Trends may supply a public candidate listing when stronger evidence is unavailable, but the source type must remain visible and can never confer official nomination or ballot status.

Source pages must be opened and read. Search snippets are not evidence. Canonical URLs should have tracking parameters removed, syndicated items should be consolidated, and newsroom images must not be copied or rehosted without permission.

## Candidate statuses

- `publicly_announced` — a current public candidate listing supported by the best available source; this is not official filing status.
- `nomination_filed` — filing confirmed through an official election source.
- `declared_candidate` — formally declared by the City after nominations close.
- `ballot_confirmed` — confirmed on the final election-by-voting or acclamation notice.
- `withdrawn` — a sourced withdrawal.
- `needs_review` — conflicting, weak or incomplete evidence. These records are visually and editorially separated from announced candidates.

The absence of a candidate-owned website or qualifying local coverage is not, by itself, a review condition. A current listing from Livable CRD, VoteMate or Island Social Trends supports `publicly_announced` when stronger evidence is unavailable. Do not demote an existing listing or use `needs_review` solely because its evidence is discovery-only; reserve review status for affirmative conflicts involving identity, office, jurisdiction, withdrawal or candidacy, and cite the conflicting evidence.

The City of Victoria controls nomination and final-ballot status; Elections BC is secondary confirmation. Do not assume an incumbent is running, infer a platform position from silence or describe a person who is only considering a run as a candidate.

## Daily update process

1. Check the City election page and official notices, then Elections BC. After nominations open, update official status only from those sources.
2. Review candidate-owned pages and authenticated public accounts, then the listed local outlets. Inspect each full source page and record its retrieval date.
3. Add or amend candidate, news and change records together. Preserve stable IDs and `manualNotes`, distinguish candidate-stated material from independent reporting, and flag unresolved evidence rather than filling gaps.
4. Keep the 30-day news window substantive; retain only the newest relevant older item needed to establish a candidacy or major position. Remove tracking parameters and consolidate duplicates.
5. Update `meta.json`'s `lastVerified`, run `npm run validate:data`, then run `npm run build`.

The monitor excludes school trustee and CRD director contests, other municipalities, provincial/federal politics, private addresses and irrelevant personal information. It also excludes Victoria, Australia results.
