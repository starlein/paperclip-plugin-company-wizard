# Security Policy

## Supported Versions

Only the latest published release on the `main` branch and npm / GitHub Packages receives active security updates and patches. Please ensure you are running the latest version before reporting an issue.

| Version | Supported          |
| ------- | ------------------ |
| Latest (`main` / latest tag) | :white_check_mark: |
| Older releases | :x: |

## Reporting a Vulnerability

We take the security of `paperclip-plugin-company-wizard` seriously. **Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

### Preferred Reporting Method: GitHub Private Vulnerability Reporting
Please submit vulnerability reports directly via GitHub's built-in **Private Vulnerability Reporting** feature:
1. Navigate to the **Security** tab of [starlein/paperclip-plugin-company-wizard](https://github.com/starlein/paperclip-plugin-company-wizard/security).
2. Click **Report a vulnerability** to open a private security advisory draft.

### Alternative Contact
If you are unable to use GitHub Security Advisories, you can send your report via email to **[DEINE-PRIVATE-EMAIL]**.

### What to Include in Your Report
To help triage and reproduce the issue quickly, please include:
* A clear description of the vulnerability and its potential impact.
* Affected component(s) (e.g., `BrowserAuthGate`, API client, worker runtime, build pipeline, or agent skill/prompt templates).
* Step-by-step instructions or a minimal proof-of-concept (PoC) to reproduce the issue.
* The exact version or commit SHA tested.

## Response & Disclosure Timeline

As an actively maintained open-source project, security reports are handled according to the following target timeline:
* **Initial Acknowledgment:** Within **48 hours** of receiving the report.
* **Triage & Severity Assessment:** Within **5 business days**.
* **Remediation & Patch Release:** Depending on complexity, critical and high-severity issues are prioritized for an immediate patch release, typically within **7–30 days**.
* **Coordinated Disclosure:** Once a fix is published, we will publish a GitHub Security Advisory (and request a CVE if applicable), crediting the reporter unless anonymity is preferred.

## Security Scope

### In Scope
* Authentication, authorization, and session handling (including `BrowserAuthGate` and board/API action flows).
* Worker execution logic (`src/worker.ts`) and API client request handling (`src/api/client.js`).
* Cross-Site Scripting (XSS), injection vulnerabilities, or unsafe template/config parsing in the wizard UI (`src/ui/`).
* Prompt injection or privilege escalation vectors within bundled agent modules, routines, and bootstrap templates (`templates/`).
* Supply-chain or dependency vulnerabilities affecting production runtime packages.

### Out of Scope
* Vulnerabilities residing exclusively in the upstream host platform (Paperclip core) rather than this plugin.
* Issues limited to development-only dependencies (`devDependencies`) with no impact on the distributed package or CI/CD integrity.
* Automated scanner output without a validated reproduction path or demonstrable impact.
* Denial-of-service (DoS) attacks requiring pre-existing administrative access to the host environment.

## Safe Harbor

Good-faith security research conducted on local installations and isolated test environments in accordance with this policy is expressly authorized. Please refrain from testing against third-party instances you do not own or have explicit permission to test.
