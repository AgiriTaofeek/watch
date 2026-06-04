# Threat Model

[security-privacy.md](security-privacy.md) describes the controls Watch ships with. This document is the counterpart: an honest list of what Watch does **not** protect against, so operators can plan compensating controls.

Watch v1 is a self-hosted system. The deploying organization is responsible for the network, database, and OS-level posture of the host. Watch does not replace those layers.

## Compromised ingestion key

Project ingestion keys are public client credentials safe to embed in frontend code. A leaked key allows anyone to submit events to the project.

- **Mitigation provided**: rotation, revocation, rate limiting, origin allowlists, payload size caps, schema validation.
- **Not protected**: abuse window before revocation. Watch cannot distinguish a real-user event from an attacker-crafted event that satisfies validation.

## Origin allowlists

Origin allowlists block casual cross-site embedding of the SDK.

- **Mitigation provided**: rejection of events whose `Origin` header is not on the project's allowlist.
- **Not protected**: replay traffic from an attacker-controlled environment that forges `Origin`. Browsers enforce `Origin`; non-browser clients do not.

## Self-hosting trust boundary

Watch stores raw events in Postgres. Anyone with database, backup, or filesystem access can read every event ever ingested.

- **Mitigation provided**: server-side redaction, default-deny on sensitive fields, configurable retention.
- **Not protected**: confidentiality at rest. Operators must enable encryption at rest, restrict database access, and protect backups.

## SDK supply chain

The browser SDK is a third-party dependency in the deploying team's frontend build.

- **Mitigation provided**: signed releases of the SDK package.
- **Not protected**: the deploying team's npm install, lockfile integrity, or CDN. Use lockfiles, subresource integrity where applicable, and pin SDK versions.

## Source maps

When uploaded, source maps are stored in private artifact storage and used by the worker for stack-trace resolution. Source maps can be used to reverse-engineer minified frontend bundles.

- **Mitigation provided**: artifacts are private to the Dashboard API and not served publicly.
- **Not protected**: read access by any operator with database or storage access. Treat source maps as sensitive.

## Dashboard authentication

V1 uses local accounts with Argon2id-hashed passwords, secure session cookies, and CSRF protection for mutations. OIDC and trusted header auth are future roadmap items, not v1 features.

- **Mitigation provided**: local auth, role-based access control, CSRF, and a user model that can support external identity providers.
- **Not protected**: MFA, SAML, audit-grade session management, or every enterprise SSO requirement in v1. Compensate with network controls, VPN, IP allowlists, or reverse-proxy auth where appropriate.

## Trusted header auth

Trusted header auth is not implemented in v1. When it is added later, it will only be safe when Watch is reachable directly from trusted reverse proxies.

- **Mitigation provided**: trusted proxy CIDR configuration and explicit header names.
- **Not protected**: direct public access where attackers can submit spoofed identity headers. Operators must ensure untrusted clients cannot reach Watch with arbitrary auth headers.

## Monitored app user identity

The monitored frontend app may provide optional pseudonymous user impact metadata, such as `userIdHash`.

- **Mitigation provided**: privacy defaults, SDK guidance, redaction, and allowlisted identity fields.
- **Not protected**: incorrect or unsafe identity data sent by the monitored app. Watch cannot prove that a supplied `userIdHash` represents a real authenticated app user.

## Rate limiting

The ingestion API applies per-key rate limits.

- **Mitigation provided**: protection from accidental flooding by a buggy SDK or runaway client.
- **Not protected**: distributed abuse at scale. Front Watch with a WAF or CDN-level rate limiter if exposed to the public internet.

## Out of scope for the threat model

Watch does not attempt to defend against:

- Insider threats from operators with database or host access.
- Physical access to the host.
- Compromise of the deploying team's frontend build pipeline (a compromised build can leak data before Watch's redaction sees it).
- Side-channel attacks on the host.

Operators evaluating Watch for regulated environments (financial, healthcare, etc.) should pair this threat model with their own organizational controls.
