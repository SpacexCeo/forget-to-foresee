# The competitor field in `games` and `nfts` (NEAR Hackathon 2026)

Read on 2026-11-08 (UTC), 17:47 UTC. Juror notes feeding `docs/jury/rubric.md`. Snapshot; the directory changes until the deadline.

## Summary for the rubric
- (in progress)

## How the directory was read
- https://nearhackathon.com/ (read 2026-11-08): the landing page; the "Submissions" directory is a client-rendered table fed by `/api/projects`.
- https://nearhackathon.com/api/projects?track=games&page=1..4 and `?track=nfts&page=1..3` (read 2026-11-08 17:47 UTC): fixed `pageSize=8` (the `pageSize` query parameter is ignored), supports `page`, `track` and `q`. `total` was 311 overall, 27 in `games` (two more than the 25 seen at 15:00 UTC), 21 in `nfts`.
- Each record carries only `id`, `project_name`, `tracks[]`, `demo_url`. There is no description, repo URL, team or contract field in the public API, and the page JS (`/_next/static/chunks/app/page-*.js`, read 2026-11-08) renders exactly those three columns. `/projects`, `/catalog`, `/submissions`, `/directory`, `/api/applications/public` and `/api/projects/<id>` return 404; `/api/applications` exists but is the authenticated submission endpoint.
- Consequence: the "idea as published" column below is taken from the linked demo post or site when it could be read, and from the project's own public repo/site found by web search otherwise. For 26 of 27 `games` and 19 of 21 `nfts` entries the only published link is an x.com post; x.com is not readable from this environment, so for those the idea is marked "not readable" unless a public repo or site was found by search.
