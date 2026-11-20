# Security Policy

Security is a primary design pillar of **LAAP (League Account Access Platform)**. Because LAAP manages authenticated gaming profiles, strict boundaries are enforced to prevent account compromise, credential theft, and unauthorized access.

---

## Supported Versions

| Version | Supported          | Status |
| ------- | ------------------ | ------ |
| 0.2.x   | :white_check_mark: | Active |
| 0.1.x   | :x:                | Deprecated |

---

## Reporting a Vulnerability

If you discover a security vulnerability in LAAP, **please DO NOT open a public GitHub issue**.

Instead, report it through one of the following channels:
1. **GitHub Security Advisory**: Submit a private report via [Security Advisories](https://github.com/Kingof3O/laap/security/advisories/new).
2. **Direct Security Contact**: Email the maintainers with:
   - Clear description of the vulnerability
   - Proof of Concept (PoC) or reproduction steps
   - Assessment of potential impact

We will acknowledge receipt within **48 hours** and coordinate a fix and coordinated disclosure timeline.

---

## Security design

See the [security and storage model](docs/SECURITY_MODEL.md) for local Riot sessions, native update checks, device-bound Pro leases, and presence.
