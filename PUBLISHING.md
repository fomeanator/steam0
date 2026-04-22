# Publishing the SDK

This package lives in the main monorepo (`sdk/` directory) but is meant to be
published to npm under `@steam0/sdk` and mirrored to a public GitHub repo
[`fomeanator/steam0`](https://github.com/fomeanator/steam0).

## One-time setup

### 1. Reserve the npm scope

```bash
npm login                       # use a steam0 npm account
npm org create steam0           # creates the @steam0 scope (or skip if it exists)
```

### 2. The GitHub repo

[`github.com/fomeanator/steam0`](https://github.com/fomeanator/steam0) — public, MIT.
Already created. The mirror command below pushes only the `sdk/` directory
content (no monorepo history leak).

## Push the SDK to its own repo

The `sdk/` directory is self-contained — `package.json`, `tsconfig.json`,
`README.md`, `LICENSE`, source. Easiest way to extract it as a standalone
git history:

```bash
# from the monorepo root
git subtree split --prefix=sdk -b sdk-only
git push https://github.com/fomeanator/steam0.git sdk-only:main --force
git branch -D sdk-only
```

`--force` only on the first push (the GitHub repo starts empty / with a
README that conflicts). After that drop `--force`. Subtree merges cleanly
because `sdk/` is the only path under the prefix.

## Publishing a release

```bash
cd sdk
npm version patch              # bumps 0.1.0 → 0.1.1, creates a tag
npm publish --access=public    # @scope packages need explicit --access
git push --follow-tags
```

CI alternative (`.github/workflows/release.yml`) — publish on tag push:

```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', registry-url: 'https://registry.npmjs.org' }
      - run: npm ci && npm run build
      - run: npm publish --access=public
        env: { NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} }
```

`NPM_TOKEN` — automation token with publish rights, set in repo secrets.

## After publish

- Verify: `npx @steam0/sdk help` from a clean directory should print usage
- Bump README install snippet if the version changed semantics
- Tweet / announce wherever the integrators live (probably the @steam0shop
  Telegram channel)
