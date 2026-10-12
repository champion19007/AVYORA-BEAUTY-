import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

/** Tests substitute a fake; otherwise built once from ANTHROPIC_API_KEY. */
export function setChatClient(c: Anthropic | null): void {
  client = c;
}

/** The configured client, or null when no key is set (the chat is then switched off). */
export function chatClient(): Anthropic | null {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return (client = new Anthropic());
}
