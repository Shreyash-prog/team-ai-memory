import {
  ArtifactDetailSchema,
  ListArtifactsResponseSchema,
} from '@team-ai-memory/shared';
import type { ArtifactDetail, ArtifactSummary } from '@team-ai-memory/shared';
import { API_BASE_URL, PLACEHOLDER_WORKSPACE_ID } from './constants';

/** Typed fetch wrapper — every response is Zod-parsed against the shared schemas
 * before it reaches the UI (architecture §7.2). */

export async function fetchArtifacts(query?: string): Promise<ArtifactSummary[]> {
  const url = new URL('/artifacts', API_BASE_URL);
  url.searchParams.set('workspaceId', PLACEHOLDER_WORKSPACE_ID);
  if (query && query.trim()) url.searchParams.set('q', query.trim());

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load artifacts (HTTP ${res.status})`);
  return ListArtifactsResponseSchema.parse(await res.json()).artifacts;
}

export async function fetchArtifact(id: string): Promise<ArtifactDetail> {
  const url = new URL(`/artifacts/${id}`, API_BASE_URL);

  const res = await fetch(url);
  if (res.status === 404) throw new Error('Artifact not found');
  if (!res.ok) throw new Error(`Failed to load artifact (HTTP ${res.status})`);
  return ArtifactDetailSchema.parse(await res.json());
}
