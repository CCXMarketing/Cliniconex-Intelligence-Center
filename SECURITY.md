# CIC Security Practices

## Secret management

All API credentials and tokens live in **Cloudflare Worker Secrets** (`wrangler secret put`). They are never stored in the repo, `config.js`, or any frontend file.

`config.js` contains only non-sensitive configuration (URLs, IDs, thresholds). It is gitignored. A template is provided at `config.example.js`.

## Pre-commit hook (gitleaks)

This repo uses [gitleaks](https://github.com/gitleaks/gitleaks) to scan every commit for accidental secret exposure.

### Setup

```bash
# Install pre-commit (Python tool)
pip install pre-commit

# Install hooks into this repo
pre-commit install
```

After setup, every `git commit` automatically runs gitleaks. If a secret pattern is detected, the commit is blocked.

### Configuration

- `.gitleaks.toml` — Custom rules tuned for AC API tokens (40-char hex), Google OAuth refresh tokens (`1//` prefix), Anthropic keys (`sk-ant-`), Gemini keys (`AIza`), generic JWTs, and AWS keys.
- `.pre-commit-config.yaml` — Invokes gitleaks on every commit.

### Bypassing (false positives only)

If gitleaks flags a genuine false positive (e.g., a test fixture or documentation example):

```bash
git commit --no-verify -m "your message"
```

Use sparingly. If you need to bypass, consider whether the flagged string should be in an allowlist instead.

## If a key is accidentally committed

**Priority order: revoke first, clean second, push never.**

1. **Revoke the exposed credential immediately** — rotate the key in the source system (AC admin, Google Cloud Console, etc.). Do this before anything else.
2. **Remove the secret from the working tree** — update the file to remove the credential.
3. **Clean history** — use `git filter-repo` to remove the file or redact the string from all historical commits.
4. **Force-push** — push the rewritten history to all remotes.
5. **Request GitHub cache expiry** — contact GitHub Support to expire cached views and unreferenced commits for the repo.
6. **Document** — note what was exposed, when it was revoked, and the cleanup steps taken.

**Never** push a commit containing a live credential, even if you plan to immediately follow it with a removal commit. The original commit remains in history and is publicly accessible.

## History cleanup record

- **Date:** 2026-04-30
- **Tool:** `git filter-repo --path js/config.js --invert-paths`
- **Scope:** Removed `js/config.js` from all historical commits. This file contained AC API tokens, Google Ads OAuth credentials, and Gemini API keys in earlier commits.
- **Credentials revoked:** AC API token rotated, Google OAuth refresh token regenerated.
- **GitHub cache expiry:** Request submitted to GitHub Support.
- **Verification:** `git log --all --full-history -- js/config.js` returns empty on a fresh clone.

## Worker Secrets inventory

| Secret name | Source system | Set via |
|---|---|---|
| `AC_API_TOKEN` | ActiveCampaign | `wrangler secret put AC_API_TOKEN` |
| `GEMINI_API_KEY` | Google AI Studio | `wrangler secret put GEMINI_API_KEY` |
| `GOOGLE_ADS_CLIENT_ID` | Google Cloud Console | `wrangler secret put GOOGLE_ADS_CLIENT_ID` |
| `GOOGLE_ADS_CLIENT_SECRET` | Google Cloud Console | `wrangler secret put GOOGLE_ADS_CLIENT_SECRET` |
| `GOOGLE_ADS_REFRESH_TOKEN` | Google OAuth | `wrangler secret put GOOGLE_ADS_REFRESH_TOKEN` |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads API Center | `wrangler secret put GOOGLE_ADS_DEVELOPER_TOKEN` |
