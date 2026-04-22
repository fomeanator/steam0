# Publishing the SDK

This package lives in the main monorepo (`sdk/` directory) but is meant to be
published to npm under `@steam0/sdk` and mirrored to a public GitHub repo
`steam0shop/sdk-js`.

## One-time setup

### 1. Reserve the npm scope

```bash
npm login                       # use a steam0 npm account
npm org create steam0           # creates the @steam0 scope (or skip if it exists)
```

### 2. Create the GitHub repo

Create `steam0shop/sdk-js` (public, MIT). No content yet — we'll push from a
worktree of this directory.

## Push the SDK to its own repo

The `sdk/` directory is self-contained — `package.json`, `tsconfig.json`,
`README.md`, `LICENSE`, source. Easiest way to extract it as a standalone
git history:

```bash
# from the monorepo root
git subtree split --prefix=sdk -b sdk-only
git push git@github.com:steam0shop/sdk-js.git sdk-only:main
git branch -D sdk-only
```

Subsequent updates: same command. Subtree merges cleanly because `sdk/` is
the only path under the prefix.

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
