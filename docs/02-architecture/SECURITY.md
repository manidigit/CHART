# Security Policy

## 1. Supported Versions

| Version | Supported |
|---|---|
| `1.38.x` | :white_check_mark: Active |
| `< 1.38` | :x: End of Life |

---

## 2. Security Design Principles

- **No Secrets in Source:** Real API keys, MariaDB passwords, and cPanel UAPI tokens are strictly forbidden in repository code and commits. All server credentials reside exclusively in GitHub Actions Repository Secrets and server-side local config outside public HTML access.
- **Zero Plain-Text Credential Persistence:** Both Web (`apiService.js`) and Android (`WorkspaceRepository.kt`) never persist plain-text owner passwords; authentication relies on SHA-256 salted password hashes and server-issued session tokens.
- **Strict BYOK Isolation:** Personal API keys (Twelve Data, Stooq, Alpha Vantage, Finnhub) are stored exclusively on-device (`localStorage` / `SharedPreferences`), are omitted from `workspace_sync.php` cloud payloads, and are transmitted only via the `X-Provider-Api-Key` request header when syncing that provider.
- **Backend SQL & HTML Sanitization:** Server-side PHP scripts utilize prepared PDO statements for all database queries; web templates sanitize dynamic text via `escapeHtml()`.
- **No Trading Account Access:** No broker account connectors, order execution APIs, or user trading account credentials are permitted in the architecture.

---

## 3. Reporting a Vulnerability

If you discover a security vulnerability within CHART, please follow responsible disclosure:
1. Do **not** open a public GitHub issue.
2. Contact the project maintainer directly or submit a private security advisory through GitHub.
3. Include details of the potential vulnerability, steps to reproduce, and impact assessment.
4. Maintainers will review and respond within 48 hours.
