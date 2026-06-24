---
'create-foldkit-app': patch
---

Fix scrambled and misplaced dependencies in scaffolded projects.

Projects built their `package.json` by running two `pnpm add` commands (runtime dependencies, then devDependencies). The second command could non-deterministically move already-installed runtime dependencies into `devDependencies` and overwrite their version specs with unrelated ones, so `effect` and `@effect/platform-browser` sometimes landed in `devDependencies` pinned to a dev tool's version, leaving the generated project un-reinstallable.

The scaffold now resolves every dependency in code (third-party versions kept as the example declares them, Foldkit packages pinned to the latest published version), writes `dependencies` and `devDependencies` into `package.json` directly, and runs a single install.
