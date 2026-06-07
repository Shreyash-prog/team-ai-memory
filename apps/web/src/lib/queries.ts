import { useQuery } from '@tanstack/react-query';
import { fetchArtifact, fetchArtifacts } from './api';

export function useArtifacts(query?: string) {
  return useQuery({
    queryKey: ['artifacts', query ?? ''],
    queryFn: () => fetchArtifacts(query),
  });
}

export function useArtifact(id: string) {
  return useQuery({
    queryKey: ['artifact', id],
    queryFn: () => fetchArtifact(id),
    enabled: Boolean(id),
  });
}
