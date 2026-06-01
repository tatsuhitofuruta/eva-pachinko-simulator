# Security Policy

## Reporting a Vulnerability

Please report suspected vulnerabilities privately through GitHub Security Advisories:

https://github.com/tatsuhitofuruta/pachinko-simulator/security/advisories/new

Do not open a public issue for security-sensitive reports. Include the affected surface, reproduction steps, expected impact, and any suggested fix if available.

## Supported Scope

The maintained surfaces are:

- `index.html` static web simulator
- `eva_simulator.py` Python CLI simulator
- GitHub Actions and release automation in `.github/`

This project is a simulator and does not intentionally collect server-side user data. The web UI stores local play/session history in the browser's `localStorage`.
