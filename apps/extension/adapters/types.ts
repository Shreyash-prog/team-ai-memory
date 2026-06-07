// The shared package only exposes its root barrel (no `/platforms` subpath
// export), so PlatformAdapter is re-exported from the root rather than
// `@team-ai-memory/shared/platforms`.
export type { PlatformAdapter } from '@team-ai-memory/shared';
