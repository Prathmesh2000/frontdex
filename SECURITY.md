# Security policy

## Reporting a vulnerability

Do not open a public issue. Report it privately, either way:

- GitHub: **Security → Report a vulnerability** on this repository (private advisory), or
- email **prathmeshagrawal2000@gmail.com** with "frontdex security" in the subject.

Include the version, how to reproduce it, and the impact you see. You will get a reply within 7 days. Once a fix is released, the advisory is published with credit to you unless you ask otherwise.

## Supported versions

Only the latest minor release gets security fixes.

## Scope

frontdex reads source code and runs on developer machines and CI. Things that matter most:

- the local HTTP server (`frontdex serve`, the Vite plugin): its API answers only requests from this machine with a `localhost` Host header (unless `FRONTDEX_HOST` opts into LAN access), and running tests is loopback-only in every case;
- the test runner started from the UI: it runs without a shell and E2E runs need confirmation;
- files written outside the project (`frontdex agents --user-config`);
- anything that executes or evaluates code from the scanned project (frontdex parses, it should never execute it).
