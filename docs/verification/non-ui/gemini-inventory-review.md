Requested: ag/gemini-3.8-flash-high
Returned: gemini-3.8-flash-n

**Missing Security/Operational Gates:**

1. **Pre-Migration Rollback Drill Gate (Pre-N06):** 
   While N06 mandates a backup before DB migration, it lacks an explicit gate requiring an automated dry-run restore and schema rollback verification in a scratch environment *prior* to applying migrations to the active runtime database.

2. **SSRF & Egress Isolation Gate (Pre-N04 / Pre-N13):** 
   Running Dify on loopback adjacent to backend services requires an explicit network namespace/firewall gate. Outbound egress for Dify workers and the SymPy sandbox must be locked down to prevent Server-Side Request Forgery (SSRF) into local internal ports, DB listeners, or host metadata.

3. **Secret Scrubbing & Artifact Sanitization Gate (Between N05 and N07):** 
   DSL export/import (N05) and credential validation (N04) require an automated audit gate ensuring API tokens, 9Router credentials, and runtime state are completely scrubbed from unversioned directories, exported payloads, debug logs, and backup staging before proceeding to multi-account smoke tests.