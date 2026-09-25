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
clawhub inspect skill-for-ragflow --files
```

Interpret the result like this:

- `Skill not found`: the slug is available
- existing skill metadata: the slug already exists, so confirm the owner is correct

## Dry run

Run a dry sync from the skill root:

```powershell
clawhub sync --root .\skill-for-ragflow --dry-run
```

Do not hardcode an expected file count in this document. The exact count changes as the skill evolves. Instead, verify that the dry run includes the current core files listed above and does not include `.env`.

## Publish

Example publish command:

```powershell
clawhub publish .\skill-for-ragflow --slug skill-for-ragflow --name "RAGFlow Skill" --version <release-version> --tags latest --changelog "<release notes>"
```

After publishing, record the returned release ID somewhere durable.

## Post-publish verification

Inspect the published skill:

```powershell
clawhub inspect skill-for-ragflow --files
```

Optional follow-up checks:

```powershell
clawhub inspect skill-for-ragflow --json --files
clawhub inspect skill-for-ragflow --file SKILL.md
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

## Latest verified release: v3.0.0

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
