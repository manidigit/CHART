# Security Policy

## 1. Supported Versions

| Version | Supported |
|---|---|
| `1.24.x` | :white_check_mark: Active |
| `< 1.24` | :x: End of Life |

---

## 2. Security Design Principles

- **No Secrets in Source:** Real API keys, MariaDB passwords, and cPanel UAPI tokens are strictly forbidden in repository code and commits.
- **Client-Side Secret Shielding:** The web frontend runs completely client-side and never receives or stores administrative database credentials.
- **Backend Sanitization:** Server-side PHP scripts utilize prepared statements with PDO for all database queries to prevent SQL injection.
- **Personal Owner Authentication:** First-time setup creates an owner account with hashed credentials using standard salt and hashing algorithms.

---

## 3. Reporting a Vulnerability

If you discover a security vulnerability within CHART, please follow responsible disclosure:
1. Do **not** open a public GitHub issue.
2. Email the project maintainer directly or submit a private security advisory through GitHub.
3. Include details of the potential vulnerability, steps to reproduce, and impact assessment.
4. Maintainers will review and respond within 48 hours.
