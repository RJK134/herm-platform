// Backward-compat re-export. New code should import from `./vendor-profiles/index`.
// The monolithic implementation was split into:
//   - types.ts
//   - profiles-data.ts
//   - research-items-data.ts
//   - scoring-methodology-data.ts
//   - upsert.ts (per-entity upsert helpers)
//   - index.ts (orchestrator)
export { seedVendorProfiles } from './vendor-profiles/index';
