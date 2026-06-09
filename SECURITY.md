# Security Policy

Orion is an AI-assisted developer tool with a desktop app, terminal workflows, local
workspace access, and optional third-party AI providers. Please report security issues
privately so users have time to update before details are public.

## Supported Versions

| Version | Supported |
|---|---|
| 2.x | Yes |
| 1.x | No |

## Reporting a Vulnerability

Do not open a public GitHub issue for security-sensitive reports.

Send reports to `team@orion-ide.dev` with:

- A short summary of the vulnerability.
- Affected version, commit, platform, and install method.
- Steps to reproduce with the smallest safe proof of concept.
- Impact assessment, including required privileges and affected data.
- Any logs, screenshots, or crash traces with secrets removed.

We aim to acknowledge reports within 48 hours. If the report is valid, we will coordinate
a fix and publish release notes once users can upgrade safely.

## Scope

In scope:

- Arbitrary command execution not clearly initiated by the user.
- Path traversal, unsafe file writes, or workspace boundary bypasses.
- Secret exposure through logs, UI, crash reports, or generated artifacts.
- Unsafe Electron navigation, preload, IPC, or shell-open behavior.
- Provider credential leakage or unintended transmission of workspace content.
- Package, update, or release workflow weaknesses that could compromise users.

Out of scope:

- Social engineering, phishing, or physical attacks.
- Issues that require a compromised local machine.
- Denial of service without a meaningful security impact.
- Vulnerabilities in third-party services unless Orion exposes users to additional risk.
- Reports based only on missing headers for non-production local development servers.

## Handling Secrets

- Never include real API keys, tokens, cookies, SSH keys, or private certificates in a report.
- Redact local usernames, private repository names, and absolute local paths when they are not required.
- If a proof of concept requires a secret-like value, use a clearly fake placeholder.

## Disclosure

Please do not publicly disclose details until a fix is available and maintainers have had
reasonable time to publish an update. We will credit reporters in release notes when they
request it and when disclosure is safe.

## Security Expectations for Contributors

- Keep file-system, terminal, clipboard, Git, and shell integrations behind explicit user intent.
- Treat renderer input, IPC payloads, file paths, URLs, and model/provider responses as untrusted.
- Avoid logging secrets, prompts containing credentials, full environment dumps, or private paths.
- Prefer narrow validation helpers in `shared/` or `electron/ipc/` over ad hoc checks.
- Document new security-sensitive behavior in PR descriptions and tests.
