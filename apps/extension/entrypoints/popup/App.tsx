import { useEffect, useState } from 'preact/hooks';
import type { Platform } from '@team-ai-memory/shared';
import { getAdapterForUrl } from '../../adapters';
import { requestScrape } from '../../lib/messaging';
import { postExtract } from '../../lib/api';

const WEB_APP_URL = 'https://team-ai-memory.pages.dev';

type PageState =
  | { kind: 'checking' }
  | { kind: 'capturable'; tabId: number; platform: Platform }
  | { kind: 'not-capturable' };

type CaptureState =
  | { kind: 'idle' }
  | { kind: 'capturing' }
  | { kind: 'success'; title: string; artifactId: string }
  | { kind: 'error'; message: string };

export function App() {
  const [page, setPage] = useState<PageState>({ kind: 'checking' });
  const [capture, setCapture] = useState<CaptureState>({ kind: 'idle' });

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      const adapter = tab?.url ? getAdapterForUrl(tab.url) : null;
      if (tab?.id != null && adapter && adapter.canCapture) {
        setPage({ kind: 'capturable', tabId: tab.id, platform: adapter.platform });
      } else {
        setPage({ kind: 'not-capturable' });
      }
    });
  }, []);

  async function onCapture() {
    if (page.kind !== 'capturable') return;
    setCapture({ kind: 'capturing' });
    const scrape = await requestScrape(page.tabId);
    if (!scrape.ok) {
      setCapture({ kind: 'error', message: scrape.error });
      return;
    }
    try {
      const result = await postExtract({
        conversation: scrape.conversation,
        sourcePlatform: page.platform,
      });
      setCapture({ kind: 'success', title: result.title, artifactId: result.artifactId });
    } catch (err) {
      setCapture({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Capture failed.',
      });
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>Team AI Memory</div>

      {page.kind === 'checking' && <p style={styles.muted}>Checking this page…</p>}

      {page.kind === 'not-capturable' && (
        <p style={styles.muted}>
          Open a ChatGPT conversation, then click this icon to capture it into your team's memory.
        </p>
      )}

      {page.kind === 'capturable' && (
        <>
          <p style={styles.muted}>Capture this conversation into your workspace.</p>

          {capture.kind !== 'success' && (
            <button
              style={{ ...styles.button, ...(capture.kind === 'capturing' ? styles.buttonDisabled : {}) }}
              onClick={onCapture}
              disabled={capture.kind === 'capturing'}
            >
              {capture.kind === 'capturing' ? 'Capturing…' : 'Capture conversation'}
            </button>
          )}

          {capture.kind === 'error' && <p style={styles.error}>{capture.message}</p>}

          {capture.kind === 'success' && (
            <div style={styles.success}>
              <p style={{ margin: 0, fontWeight: 600 }}>Saved ✓</p>
              <p style={{ margin: '4px 0 8px' }}>{capture.title}</p>
              <a
                style={styles.link}
                href={`${WEB_APP_URL}/artifacts/${capture.artifactId}`}
                target="_blank"
                rel="noreferrer"
              >
                View in web app →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, preact.JSX.CSSProperties> = {
  container: {
    width: 320,
    padding: 16,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    color: '#18181b',
  },
  header: { fontWeight: 700, fontSize: 16, marginBottom: 8 },
  muted: { color: '#71717a', marginTop: 0 },
  button: {
    width: '100%',
    padding: '8px 12px',
    background: '#18181b',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
  },
  buttonDisabled: { opacity: 0.6, cursor: 'default' },
  error: { color: '#dc2626', marginBottom: 0 },
  success: { background: '#f4f4f5', borderRadius: 6, padding: 12 },
  link: { color: '#2563eb', textDecoration: 'none' },
};
