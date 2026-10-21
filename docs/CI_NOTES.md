# CI integration notes

The first hosted validation exposed a collision between browser DOM globals and `@cloudflare/workers-types` (its HTMLRewriter `Element` polluted browser element methods). The client tsconfig now uses DOM + Node + Vinext types; Cloudflare tooling obtains its own runtime types from its packages. Full-project TypeScript checking and the production Vinext build passed after this separation.

`npm run lint` covers application code, domain code, tests, scripts, and the Vite/Next configuration. `npm run lint:all` retains the original whole-repository command. The unchanged shadcn component scaffold and `hooks/use-mobile.ts` have pre-existing accessibility-style/compiler lint findings; this PR does not rewrite unused third-party-style primitives to make their baseline disappear. They remain included in full-project TypeScript checking, and the primitives used by the application are exercised by the workflow tests. No application lint rules have been disabled.

The workflow tests run the **built Worker locally with Wrangler**, without deploying or creating Cloudflare resources. This also avoids an IPv4/IPv6 localhost-binding mismatch encountered when the initial test runner targeted the development server. The standalone browser harness remains useful for deterministic raster/worker tests, but does not substitute for testing the bundled application.

The clean dependency installation also reported 14 advisories in the unchanged dependency graph (1 low, 4 moderate, 9 high). Those counts are an npm audit observation, not a demonstrated exploit in Paper Globe. Review `npm audit` and dependency updates separately before broad release; this PR does not run `npm audit fix --force` or silently change framework versions.

See the PR checks for the latest integration result. The physical print/assembly and cross-browser acceptance checklist in `HARDENING.md` still applies even when CI passes.
