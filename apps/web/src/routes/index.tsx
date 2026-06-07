import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ArtifactSummary } from '@team-ai-memory/shared';
import { useArtifacts } from '@/lib/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/')({
  component: ArtifactListPage,
});

function ArtifactListPage() {
  const [search, setSearch] = useState('');
  const { data: artifacts, isLoading, isError, error } = useArtifacts(search || undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Memory artifacts</h1>
        <p className="text-sm text-muted-foreground">
          Captured conversations from your workspace.
        </p>
      </div>

      <Input
        type="search"
        placeholder="Search artifacts…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load artifacts.'}
        </p>
      )}
      {artifacts && artifacts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {search ? 'No artifacts match your search.' : 'No artifacts yet.'}
        </p>
      )}

      <div className="grid gap-4">
        {artifacts?.map((artifact) => (
          <ArtifactCard key={artifact.id} artifact={artifact} />
        ))}
      </div>
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: ArtifactSummary }) {
  return (
    <Link to="/artifacts/$id" params={{ id: artifact.id }} className="block">
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader>
          <CardTitle className="text-base">{artifact.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{artifact.summaryLine}</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground">
              {artifact.sourcePlatform}
            </span>
            <span>{artifact.createdBy.name}</span>
            <span>·</span>
            <span>{new Date(artifact.createdAt).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
