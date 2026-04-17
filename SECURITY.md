# Security Policy

If you discover a security issue in Zerant Browser, please do not open a public
issue with exploit details.

## Reporting

Use GitHub private vulnerability reporting when it is enabled for the repository.
If that is not available yet, open a minimal issue without exploit details and
request a private contact channel from the maintainers.

Include:

- a clear description or the issue
- affected version or commit
- reproduction steps
- impact assessment
- any suggested mitigation if available

## Scope

Security issues or particular interest include:

- local API exposure or auth bypass
- Electron sandbox or isolation breaks
- extension privilege escalation
- stealth or fingerprinting regressions that create a unique browser signature
- credential leakage or insecure local storage
- unsafe defaults around localhost services, agent bridges, or automation

## What Helps Triage

Strong reports usually include:

- whether the issue requires local machine access or can be triggered by a web page
- whether it affects only macOS, only Linux, or both
- whether OpenClaw integration is required for reproduction
- whether the issue leaks data, breaks containment, or creates a detectable fingerprint

## Disclosure

Please allow time for triage and a fix before public disclosure.
