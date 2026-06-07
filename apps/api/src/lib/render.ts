import type { IR } from '@team-ai-memory/shared';

/**
 * Render an IR into a markdown primer (Standard length, ~400 words) using
 * continuous-user framing — written in the user's own voice as a recap to paste
 * into a fresh AI chat, not as the AI's third-person memory. See team-spec §8
 * and architecture §6.
 *
 * Pure: the same IR always produces the same markdown. Empty layers are omitted
 * entirely so the output never has a dangling section header with no content.
 */
export function renderPrimer(ir: IR): string {
  const blocks: string[] = [];

  blocks.push('Quick recap before we keep going:');

  const topic = softLowerFirst(ir.source.inferredTopic.trim()) || 'this';
  if (ir.factualState.length > 0) {
    blocks.push(`I'm working on ${topic}. Here's where things stand:`);
    blocks.push(bulletList(ir.factualState));
  } else {
    blocks.push(`I'm working on ${topic}.`);
  }

  if (ir.openThreads.length > 0) {
    blocks.push("A few things still open:");
    blocks.push(bulletList(ir.openThreads));
  }

  if (ir.rejectedPaths.length > 0) {
    blocks.push("Some things we've already ruled out (let's not retread these):");
    blocks.push(
      bulletList(
        ir.rejectedPaths.map(
          (p) =>
            `We tried ${stripPeriod(p.tried)}, but ${softLowerFirst(stripPeriod(p.whyFailed))} — so let's not go back there.`
        )
      )
    );
  }

  if (ir.preferences.length > 0) {
    blocks.push('A few preferences to keep in mind:');
    blocks.push(bulletList(ir.preferences));
  }

  if (ir.constraints.length > 0) {
    blocks.push('Constraints to respect:');
    blocks.push(bulletList(ir.constraints));
  }

  if (ir.lastExchange.length > 0) {
    blocks.push('Where we left off:');
    blocks.push(
      ir.lastExchange
        .map((turn) => `> **${turn.role === 'user' ? 'Me' : 'Assistant'}:** ${turn.content.trim()}`)
        .join('\n>\n')
    );
  }

  blocks.push("Let's pick up from here.");

  return blocks.join('\n\n') + '\n';
}

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item.trim()}`).join('\n');
}

function stripPeriod(text: string): string {
  return text.trim().replace(/\.+$/, '');
}

/**
 * Lowercase the first character only when it reads as an ordinary capitalized
 * word (second char is a lowercase letter). Leaves acronyms ("API", "GIN") and
 * hyphenated/identifier starts ("B-tree") untouched, so inlining a field into
 * mid-sentence prose doesn't mangle it.
 */
function softLowerFirst(text: string): string {
  if (text.length >= 2 && /[a-z]/.test(text[1]!)) {
    return text[0]!.toLowerCase() + text.slice(1);
  }
  return text;
}
