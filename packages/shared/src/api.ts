import { z } from 'zod';
import { IRSchema, PlatformSchema, ExchangeTurnSchema } from './ir';

// ===== Capture / Extract =====

export const ExtractRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  conversation: z.array(ExchangeTurnSchema).min(1),
  sourcePlatform: PlatformSchema,
  userProvidedTitle: z.string().min(1).max(200).optional(),
});

export const ExtractResponseSchema = z.object({
  artifactId: z.string().uuid(),
  title: z.string(),
  summaryLine: z.string(),
  primer: z.string(),
  ir: IRSchema,
  meta: z.object({
    latencyMs: z.number(),
    provider: z.string(),
    truncated: z.boolean(),
  }),
});

export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

// ===== Artifacts =====

export const ArtifactSummarySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  createdBy: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
  }),
  sourcePlatform: PlatformSchema,
  title: z.string(),
  summaryLine: z.string(),
  createdAt: z.string().datetime(),
});

export const ArtifactDetailSchema = ArtifactSummarySchema.extend({
  primer: z.string(),
  ir: IRSchema,
});

export const ListArtifactsRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const ListArtifactsResponseSchema = z.object({
  artifacts: z.array(ArtifactSummarySchema),
  nextCursor: z.string().nullable(),
});

export type ArtifactSummary = z.infer<typeof ArtifactSummarySchema>;
export type ArtifactDetail = z.infer<typeof ArtifactDetailSchema>;

// ===== Teams & Workspaces =====

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

export const TeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

export const CreateWorkspaceRequestSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const InviteMemberRequestSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
  workspaceIds: z.array(z.string().uuid()).optional(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Team = z.infer<typeof TeamSchema>;
