# Trier OS maintenance policy

Copyright © 2026 Doug Trier. Licensed under the [MIT License](../LICENSE).

Trier OS **3.7.2 is feature complete and feature frozen**. Stability and low operator cognitive load are intentional. Maintenance is limited to confirmed break/fix, confirmed security maintenance and necessary compatibility maintenance. There are no planned new product features or architectural rewrites merely for elegance or modernization.

Every proposed product change must identify the specific reproducible defect or realistic risk it removes, establish severity and blast radius, and preserve proven operator behavior. Audit and diagnosis precede remediation. Prefer the smallest compatible fix. Existing Playwright and Doug's physical scanner/phone validation are a functional baseline; a theoretical cleaner design is not evidence that a working domain needs replacement.

Security maintenance considers runtime reachability, deployment configuration, dependency advisories and changed threat models. Apply targeted compatible dependency patches and related regressions; do not use blanket forced upgrades. Advisory inventory does not count demonstrated application exploits.

Documentation-only changes require documentation validation, including links, commands, factual consistency and protected-file checks. Run targeted tests for a narrow executable change; broaden validation when its risk and affected paths justify it. A future release still requires the release gate in [AGENTS.md](../AGENTS.md). No release is authorized by a documentation edit.

Only the current maintained release receives security maintenance unless Doug Trier explicitly documents additional supported releases. See [SECURITY.md](../SECURITY.md) and [validation evidence and limits](SECURITY_MAINTENANCE_VALIDATION.md).

Older phase specifications and completed roadmaps describe design history, not commitments to add functionality. Unvalidated recovery scenarios remain engineering limits to assess against deployment needs, not grounds for speculative rewrites.
