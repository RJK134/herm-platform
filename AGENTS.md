# Agent setup

This repository is a TypeScript npm workspace targeting Node 20.

Cursor Cloud Agents use `.cursor/environment.json` to run the setup command:

```sh
npm ci --cache .npm --prefer-offline --no-audit && npm run db:generate
```

Common verification commands:

- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- `npm run db:generate`
