# INFRASTRUCTURE INVENTORY

**Project:** Chart Intelligence  
**Document status:** Public-safe infrastructure inventory — partially verified  
**Last updated:** 2026-11-06  
**Source:** Hosting account's cPanel Server Information, Statistics, Processor Information and Service Status screens, supplied by the project owner.  
**Purpose:** Provide a shared infrastructure reference for ChatGPT, other AI assistants and developers. This document records observed infrastructure facts, distinguishes them from assumptions, and lists items that still require verification.

> **Security rule:** This file must never contain actual passwords, API keys, access tokens, private keys, database credentials or other secrets. It may contain non-secret hostnames, service names, variable names and instructions for obtaining credentials from an approved secret store.

## 1. Current hosting account

| Item | Reported value | Notes |
|---|---|---|
| Hosting package | Shared hosting plan (public identifier redacted) | Shared hosting account; confirm exact resource policy with provider |
| Server name | Redacted | Internal provider label omitted from public repository |
| Control panel | cPanel `138.0 (build 19)` | Reported by cPanel |
| Web server | Apache `2.4.69` | Service reported up |
| Operating system | Linux | Kernel `6.8.0-142-generic`; architecture `x86_64` |
| Database server | MariaDB `10.6.28` | Service reported up |
| Shared IP address | Redacted / not published | Public repository does not need the account's shared IP address |
| Sendmail path | `/usr/sbin/sendmail` | Reported path |
| Perl path/version | `/usr/bin/perl`, `5.26.3` | Reported by cPanel |

## 2. Host hardware and account limits

### 2.1 Reported host processor

- Total processors displayed: 56
- CPU model: Intel Xeon E5-2680 v4 @ 2.40 GHz
- Architecture: x86_64
- Reported cache: 35,840 KB

**Important interpretation:** The displayed 56 processors describe the host/server environment and do not establish that all 56 CPU cores are dedicated or available to this shared-hosting account. Account-level resource limits and actual provider policy take precedence.

### 2.2 Reported account resource limits

| Resource | Reported usage | Reported limit |
|---|---:|---:|
| Disk usage | 97.59 MB | 5 GB |
| Database disk usage | 95.49 MB | 5 GB |
| Bandwidth | 996.55 KB | 100 GB |
| CPU usage | 0 | 100 |
| Entry processes | 0 | 20 |
| Physical memory | 0 bytes | 2 GB |
| I/O usage | 0 bytes/s | 200 MB/s |
| Number of processes | 0 | 150 |
| Databases | 1 | Unlimited shown |
| Subdomains | 0 | Unlimited shown |
| Addon domains | 0 | 0 |
| Alias domains | 0 | Unlimited shown |
| Email accounts | 1 | Unlimited shown |

These are the values displayed in the supplied account snapshot. Zero usage is a point-in-time reading, not evidence of guaranteed capacity or sustained headroom. The provider's resource definitions, throttling rules and fair-use policy still need confirmation.

## 3. Service status reported by cPanel

| Service | Version (if shown) | Reported status |
|---|---|---|
| clamd | 1.5.4-1.cp130~el8 | up |
| cpanel_php_fpm | — | up |
| cpanellogd | — | up |
| cpsrvd | — | up |
| crond | 1.5.2-10 | up |
| dnsadmin | — | up |
| exim | 4.100.1-1.cp130~el8 | up |
| httpd | 2.4 | up |
| imap | 2.4 | up |
| imunify360 | — | up |
| ipaliases | — | up |
| jetbackup5d | — | down |
| jetmongod | — | up |
| lfd | — | up |
| lmtp | 2.4 | up |
| mailman | 2.2.0.43-1.cp130~el8 | up |
| mariadb | 10.6 | up |
| nscd | 2.28-251 | up |
| p0f | 0 | up |
| pop | 2.4 | up |
| powerdns | 5.1.4-1.cp138~el8 | up |
| pureftpd | 1.0 | up |
| queueprocd | — | up |
| rsyslogd | 8.2102.0-15 | up |
| spamd | 4.0 | up |
| sshd | 8.0p1-34 | up |

**Caution:** A service showing as `up` at server level does not prove that this hosting account has permission to use it. In particular, `sshd` being up does not prove that account-level SSH access is enabled. Likewise, `crond` being up does not prove that every required cron configuration or execution interval is permitted.

**Backup risk — unresolved, production-blocking:** The `jetbackup5d` service was reported as `down` in the supplied cPanel snapshot. This does not prove that account backups are absent, but it also provides no evidence that usable backups exist. Until the hosting provider confirms the account-level backup schedule, retention, off-site location and a successful restore test, treat backup availability as **NOT VERIFIED** and do not rely on JetBackup for recovery. Record the last successful backup and restore-test date once verified.

## 4. Initial architectural assessment

Based only on the supplied information:

| Component / workload | Initial position | Reason / condition |
|---|---|---|
| PHP web/API layer | Candidate to remain on current hosting | Apache and PHP-FPM are reported up; PHP version, extensions and account policy remain unverified |
| MariaDB operational database | Candidate to remain on current hosting | MariaDB 10.6.28 is reported up and one database currently exists |
| Lightweight scheduled tasks | Potentially suitable | Cron daemon is up; account-level cron permissions, frequency and runtime limits must be checked |
| Python analysis worker | Not yet approved for this host | Python version, package installation, CPU/RAM/runtime limits and long-running process policy are unknown |
| Persistent WebSocket/data-ingestion worker | Do not assume it can run here | Shared-hosting providers commonly restrict persistent background processes; provider confirmation required |
| Heavy analytics / model inference | Do not allocate here without testing | The displayed account limits do not establish sustained compute capacity |
| Static web frontend / browser chart rendering | Can be hosted separately or alongside PHP | Final hosting choice is not yet decided |
| Research and backtesting environment | Keep separate from production runtime | Research workloads should not compete with the live application |

This is an initial assessment, not a final hosting decision. The product remains a web-based chart analysis system, not an automated trading or order-execution system.

## 5. Required verification before making hosting decisions

The following items have not been established by the supplied screenshots/data:

1. Exact PHP version, enabled extensions, PHP-FPM configuration and per-account PHP limits. The product's current target is PHP 8.3; the cPanel observation that PHP-FPM is `up` does not establish that PHP 8.3 is installed, selected for this account, or used by the web/API runtime. Mark PHP 8.3 as **TO VERIFY** until an account-level runtime check confirms the web SAPI and CLI versions separately.
2. Whether account-level SSH access is enabled and which shell is available.
3. Python availability, exact version, virtual-environment support and ability to install required packages.
4. Whether background processes are permitted, their maximum runtime and whether processes are terminated when they exceed policy.
5. Cron configuration permissions, minimum interval, runtime limits and logging behavior.
6. Outbound HTTPS, DNS and WebSocket connectivity from the account.
7. MariaDB database name, database user, grants, maximum connections, remote-access policy and backup/restore procedure.
8. Whether database access is restricted to localhost or can be securely exposed to selected services.
9. Actual backup schedule, retention, off-site status and a tested restore path; do not infer backup availability from the JetBackup daemon status alone. Until verified, backup/restore is a production-blocking risk. Confirm whether a separate provider backup mechanism exists even while `jetbackup5d` is down.
10. Provider definitions for CPU units, physical memory, I/O and process limits, including throttling and suspension thresholds.
11. Whether the account permits Node.js applications or other application runtimes, if these become relevant.
12. Disk inode limits and any separate limits on database size, file count or outbound traffic.

## 5.1 Verification priority and acceptance evidence

The following are release gates, not administrative notes:

| Priority | Item | Required evidence before production reliance |
|---|---|---|
| P0 | Backup and restore | Provider confirmation of schedule/retention/off-site copy plus a successful restore test with timestamp and scope |
| P0 | PHP 8.3 target | Account-level web runtime and CLI version checks; required extensions and limits recorded |
| P0 | Secret exposure | Confirm no credentials or private endpoints are committed; rotate any secret found in repository history |
| P1 | Cron | A real account-level test proving allowed cadence, execution time, lock behavior and logs |
| P1 | Python/Worker | Runtime/version, package installation, process lifetime, memory/CPU and outbound network verified by a test job |
| P1 | Database | Least-privilege grants, connection limits, backup inclusion and restore verified |
| P1 | Network | Outbound HTTPS/DNS and any required provider connectivity tested from the actual account/runtime |

Evidence must include verification date, method, observed result and responsible operator. A server-level service status is not sufficient evidence for account-level capability.

## 6. Secrets and environment configuration

This inventory intentionally does not contain secret values.

For every application secret, the project must document:
- The exact environment-variable name expected by the application.
- Which component needs it (web/API, ingestion worker, analysis worker, etc.).
- The approved storage location (for example, hosting-panel environment configuration, deployment-platform secrets, or GitHub Actions Secrets for CI only).
- Which authorized role can provision or rotate it.
- How to request access if it is missing.

Actual values must be supplied through the approved secret store or deployment environment, never committed to Git, pasted into source files, or placed in public project documentation. GitHub documentation should tell an authorized operator where to configure or retrieve each secret without exposing its value.


## 7. Current status and decision log

- **Known:** Shared cPanel hosting account with Apache, PHP-FPM service, MariaDB 10.6.28 and cron daemon reported up.
- **Known:** Account dashboard reports 2 GB physical memory limit, 5 GB disk, 100 GB bandwidth, 20 entry processes and 150 processes.
- **TO VERIFY / P0:** Product target PHP 8.3 has not yet been confirmed on the account's web runtime or CLI.
- **TO VERIFY / P0:** Backup availability is not established; `jetbackup5d` was reported down and no successful restore evidence is recorded.
- **Public-repository rule:** Account-specific shared IP, provider server label and internal package identifier are intentionally redacted from this public inventory. Keep operational identifiers in a private approved store if genuinely needed.
- **Not established:** Whether Python analysis, persistent workers, WebSockets, account-level SSH or external database connections are permitted.
- **Not decided:** Whether any workload should move to Railway, Render, Fly.io, a VPS, or another managed service.
- **Not decided:** Whether DuckDB, MotherDuck or another analytical storage option will be used.
- **Rule:** Do not provision additional paid infrastructure until the existing hosting capabilities have been checked and workload requirements are clear.
- **Rule:** No paid TradingView subscription is available or planned for the project; product operation must not depend on one.
- **Rule:** The project does not purchase or centrally fund paid market-data APIs. Free/legal data access and file/manual import are the default priorities.
- **Rule:** A user may optionally connect their own paid market-data API using their own credential (BYOK). Any resulting subscription, usage charge and provider limits belong solely to that user. No automatic upgrade or charge is permitted.
- **Rule:** Product core functionality must remain usable without a paid API key. A user's paid key is optional and isolated to that user's chart/access context.
- **Rule:** No production infrastructure or paid provider subscription may be provisioned without explicit owner approval.


## 8. Instructions for AI assistants and developers

1. Read this inventory before proposing hosting, database or deployment changes.
2. Treat values in Sections 1–3 as owner-supplied cPanel observations, not independently verified guarantees.
3. Treat items in Section 5 as unknown until verified.
4. Never invent credentials, hostnames, database names, API endpoints or secret values.
5. If a required secret is missing, identify its environment-variable name and ask the project owner to configure it in the approved secret store.
6. Do not request that secrets be committed to GitHub.
7. Do not create paid services, migrate data, change DNS, expose database ports or modify production infrastructure without explicit owner approval.
8. Preserve the product boundary: analysis and decision support only; no automatic order execution.
9. Keep user-supplied API credentials isolated by user and provider. Never expose a key to another user, return it in API responses, log it, or commit it to the repository.
10. Paid provider APIs are optional BYOK integrations only; the product must not require or centrally fund them.
11. Do not interpret `jetbackup5d: down` as proof of either backup failure or backup success. Until restore evidence is recorded, treat recovery capability as unverified and production-blocking.
12. Do not mark PHP 8.3 as available based only on PHP-FPM service status; verify the actual account-level web and CLI runtimes.
13. Keep account identifiers, shared IPs and provider-internal labels out of this public repository unless a documented operational need and explicit owner approval justify publication.
