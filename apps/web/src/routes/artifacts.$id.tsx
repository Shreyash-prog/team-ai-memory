import type { ReactNode } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import ReactMarkdown from 'react-markdown';
import type { IR } from '@team-ai-memory/shared';
import { useArtifact } from '@/lib/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/artifacts/$id')({
  component: ArtifactDetailPage,
});

function ArtifactDetailPage() {
  const { id } = Route.useParams();
  const { data: artifact, isLoading, isError, error } = useArtifact(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/">← Back to artifacts</Link>
      </Button>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load artifact.'}
        </p>
      )}

      {artifact && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{artifact.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground">
                {artifact.sourcePlatform}
              </span>
              <span>{artifact.createdBy.name}</span>
              <span>·</span>
              <span>{new Date(artifact.createdAt).toLocaleString()}</span>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Primer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{artifact.primer}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>

          <IRSections ir={artifact.ir} />
        </div>
      )}
    </div>
  );
}

function IRSections({ ir }: { ir: IR }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Structured memory (IR)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ListSection title="Factual state" items={ir.factualState} defaultOpen />
        <ListSection title="Open threads" items={ir.openThreads} />
        <Section title="Rejected paths" count={ir.rejectedPaths.length}>
          <ul className="ml-4 list-disc space-y-1 text-sm">
            {ir.rejectedPaths.map((p, i) => (
              <li key={i}>
                <span className="font-medium">{p.tried}</span> — {p.whyFailed}
              </li>
            ))}
          </ul>
        </Section>
        <ListSection title="Preferences" items={ir.preferences} />
        <ListSection title="Constraints" items={ir.constraints} />
        <Section title="Last exchange" count={ir.lastExchange.length}>
          <div className="space-y-2 text-sm">
            {ir.lastExchange.map((turn, i) => (
              <p key={i}>
                <span className="font-medium capitalize">{turn.role}:</span> {turn.content}
              </p>
            ))}
          </div>
        </Section>
      </CardContent>
    </Card>
  );
}

function ListSection({
  title,
  items,
  defaultOpen = false,
}: {
  title: string;
  items: string[];
  defaultOpen?: boolean;
}) {
  return (
    <Section title={title} count={items.length} defaultOpen={defaultOpen}>
      <ul className="ml-4 list-disc space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </Section>
  );
}

function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen && count > 0} className="rounded-md border px-3 py-2">
      <summary className="cursor-pointer select-none text-sm font-medium">
        {title}{' '}
        <span className="font-normal text-muted-foreground">({count})</span>
      </summary>
      <div className="mt-2">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          children
        )}
      </div>
    </details>
  );
}
