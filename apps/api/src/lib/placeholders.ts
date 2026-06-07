// M1 placeholder identity. Real auth (Better Auth) lands in M2; until then the
// /extract route attributes every artifact to this fixed user. It MUST be a
// valid UUID because memory_artifacts.created_by is a uuid FK to users.id — the
// spec's "m1-placeholder-user" string can't satisfy that column. Run
// `tsx src/lib/seed.ts` to ensure the matching users row exists.
export const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-0000000000a1';
