# Publishing to ClawHub

This document is for maintainers of this repository. It describes how to publish the inner `skill-for-ragflow/` package to ClawHub and how to verify that the published package still matches the repo state.

## What gets published

Publish the inner skill folder, not the repository root:

```powershell
skill-for-ragflow/
```

That folder must contain:

- `SKILL.md`
- `agents/openai.yaml`
- `lib/api.js`
- `scripts/ragflow.js`
- `scripts/repro-delete-chunks.js`
- `references/`

The published package should also include the minimal agent examples under `references/examples/agents/`.

Keep the final release receipt in this document, outside `skill-for-ragflow/`. Remove temporary scan reports and audit artifacts after verification; do not include or link to maintainer records from the published package.

## Current metadata

Keep these values aligned before publishing:

- Skill slug: `skill-for-ragflow`
- Display name: `RAGFlow Skill`
- Package root: `skill-for-ragflow/`
- Homepage: `https://github.com/LunarCache/ragflow-skill`

The authoritative release version is the newest heading under `README.md` → **Update Notes**. Bump that heading before each release; keep RAGFlow compatibility in `SKILL.md`'s description and requirements.

## Select the RAGFlow baseline

Read the official release list and release description, and select the highest published `vMAJOR.MINOR.PATCH` tag without a prerelease suffix. Exclude drafts, prereleases, nightly/dev tags, and `-rc`, alpha, or beta tags even if GitHub marks them `prerelease: false` or `latest`.

Fetch upstream branches and tags, then inspect the selected tag's source on a local `codex/stable-<tag>` branch. Pin the commit SHA when reviewing routes and payloads. Only change the Skill baseline when a newer stable release exists; do not migrate it to a candidate release as part of a stable update.

Verified on 2026-11-01: stable baseline is [v0.27.3](https://github.com/infiniflow/ragflow/releases/tag/v0.27.3), commit `8090ffd8ba6098813d7f7ec2c4b8774f36c8423a`, released 2026-10-23. GitHub's latest release [v1.0.0-rc3](https://github.com/infiniflow/ragflow/releases/tag/v1.0.0-rc3) remains a release candidate despite `prerelease: false`.

## Pre-publish checks

1. Confirm the CLI still starts:

```powershell
node skill-for-ragflow\scripts\ragflow.js --help
```

2. Run the fast local suite:

```powershell
node --test test/ragflow-agent-guide.test.js test/ragflow-api.test.js test/ragflow-cli.test.js test/ragflow-docs.test.js test/ragflow-e2e.test.js
```

3. If a live RAGFlow environment is available, run the opt-in live checks:

```powershell
$env:RAGFLOW_LIVE_TEST='1'
node --test test/live-agent-create.test.js test/live-delete-chunks.test.js
```

4. Make sure `skill-for-ragflow/.env` is not published.

Recommended `.clawhubignore`:

```gitignore
.env
.clawhub/
node_modules/
*.log
npm-debug.log*
coverage/
.nyc_output/
tmp/
temp/
*.tmp
.DS_Store
Thumbs.db
```

## Inspect the target slug

Before publishing, inspect the slug:

```powershell
npx --yes clawhub@0.25.0 inspect @lunarcache/skill-for-ragflow --files
```

Interpret the result like this:

- `Skill not found`: the slug is available
- existing skill metadata: the slug already exists, so confirm the owner is correct

## Dry run

Use the current canonical skill command with an explicit owner and version:

```powershell
npx --yes clawhub@0.25.0 skill publish .\skill-for-ragflow --slug skill-for-ragflow --owner lunarcache --version <release-version> --dry-run --json
```

Do not hardcode an expected file count in this document. The exact count changes as the skill evolves. Instead, verify that the dry run includes the current core files listed above and does not include `.env`.

## Publish

Example publish command:

```powershell
npx --yes clawhub@0.25.0 skill publish .\skill-for-ragflow --slug skill-for-ragflow --name "RAGFlow Skill" --owner lunarcache --version <release-version> --tags latest --changelog "<release notes>" --json
```

After publishing, record the returned release ID somewhere durable.

### Upload failures and exact-version status

The verified npm CLI on 2026-11-01 is `0.25.0`; `skill publish` is the canonical command. The old `publish` spelling remains an alias and is not itself the cause of storage errors. See the official [publishing guide](https://github.com/openclaw/clawhub/blob/0a3dfec7b2a0c6a2e47ae05422922dfc101f0dd9/docs/publishing.md).

Use owner-qualified reads to select this publisher. If a release is not public, an authenticated owner can read `GET /api/v1/skills/skill-for-ragflow/versions/<version>/publication?ownerHandle=lunarcache`. A retained pending upload must be checked before submitting another version. Public `404` alone does not prove that no pending version exists.

CLI 0.25.0 identifies upload-ticket, file-body, and final-publication failures. `Too many writes in a short period of time` indicates backend write pressure; stop repeated uploads and check the upstream [storage upload incident](https://github.com/openclaw/clawhub/issues/4182). Never log bearer tokens, signed upload URLs, or upload tickets.

## Post-publish verification

Inspect the published skill:

```powershell
npx --yes clawhub@0.25.0 inspect @lunarcache/skill-for-ragflow --files
```

Optional follow-up checks:

```powershell
npx --yes clawhub@0.25.0 inspect @lunarcache/skill-for-ragflow --json --files
npx --yes clawhub@0.25.0 inspect @lunarcache/skill-for-ragflow --file SKILL.md
```

Verify that:

- the latest version matches the newest `README.md` Update Notes heading
- the published file list includes the current agent guide and examples
- the security scan completes successfully

## Known warnings

Some warnings are expected:

- `RAGFLOW_API_KEY` is a sensitive credential
- `RAGFLOW_URL` points to a live RAGFlow deployment that may receive uploaded files
- the diagnostic script may create and delete temporary RAGFlow resources

These warnings are not failures by themselves. They become a problem only if the published metadata claims fewer privileges than the package actually needs.

## Release discipline

Use version bumps consistently:

- patch: doc fixes, small bug fixes, compatibility improvements
- minor: new commands, new optional features, additive API support
- major: breaking CLI changes, changed required environment variables, incompatible behavior changes

## v4.0.0 release status

- GitHub published: 2026-11-01, tag `v4.0.0`, source commit `eae5f19877c57f1f6dc9831f7f9c8b7713802d7f`.
- Release: https://github.com/LunarCache/ragflow-skill/releases/tag/v4.0.0
- RAGFlow baseline: `v0.27.3`.
- Validation: 69 tests passed, 2 live-server tests skipped; Skill validator and whitespace checks passed.
- ClawHub dry run: 15 files, fingerprint `c949e00253b871fa66eb4146998ddfc340a6086448b9e99a8611c7d16633b871`.
- ClawHub upload deferred at the maintainer's request on 2026-11-01 after repeated backend write-pressure errors. No v4.0.0 publication receipt or completed security scan has been verified. Check the exact-version publication status before resuming manually.

## Latest verified ClawHub release: v3.0.0

- Published: 2026-09-25; public latest verified as `3.0.0`.
- Version ID: `k9751zbncyhe1w5047frb3b8t98f3c2n`
- Publication attempt ID: `zx7a68vnzcen278a4wc5rprs858f3aar`
- Package fingerprint: `1fa4e6819ef38577852cd3a2a91432aaa5f425907c639d77c97c0ecf8295d7a6`
- All 15 remote file SHA-256 hashes matched the local package; no maintenance reports were included.
- Validation: 65 tests passed, 2 live tests skipped; subsequent CLI run passed 26 tests including an additional origin-validation regression. Skill validator and whitespace checks passed.
- Breaking change: destructive operations require explicit CLI or dedicated-client opt-in.
- Static analysis: `clean`, no findings.
- Clawscan: `clean`, verdict `benign`, confidence `high`.
- Registry moderation: `clean`, `isSuspicious: false`, `isMalwareBlocked: false`.
