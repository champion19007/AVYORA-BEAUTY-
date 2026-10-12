import { chatClient } from '@/modules/skin-chat/client';
import { auth } from '@/auth';
import { limit, limitResponse } from '@/lib/rate-limit';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { logEvent, reportError } from '@/lib/observability';
import {
  CHAT_MODEL,
  MAX_REPLY_TOKENS,
  SYSTEM_PROMPT,
  chatRequestSchema,
  replyCostPaise,
  trimHistory,
} from '@/modules/skin-chat/chat';
import { redFlags, urgentNotice } from '@/modules/skin-chat/red-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNAVAILABLE = 'Sorry, the skin chat is unavailable right now. Please try again in a little while.';
const DECLINED =
  'I can’t help with that one. I’m happy to talk about skin concerns and everyday skincare: tell me what you’re noticing.';

/**
 * The AI skin chat. Streams the reply as plain text.
 *
 * Nothing is stored: the conversation lives in the visitor's browser tab and
 * is sent back with each message. Only token counts are logged, for cost.
 * Limits run before the model is called: per person per minute, a per-person
 * daily spend budget (₹0.50, charged from each reply's real token usage), and
 * one global daily cap so a scripted flood cannot run up the bill.
 * Urgent symptoms are detected here, not left to the model, and the "see a
 * doctor" notice is sent first whatever the model then says.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const anthropic = chatClient();
  if (!anthropic) {
    return Response.json({ error: 'The skin chat is not switched on yet.' }, { status: 503 });
  }

  const read = await readBoundedJson(request, BODY_LIMITS.chat);
  if (!read.ok) return read.response;
  const parsed = chatRequestSchema.safeParse(read.json);
  if (!parsed.success) return Response.json({ error: 'Invalid conversation.' }, { status: 400 });

  // Signed-in customers only: the daily budget is per account, which a new IP address cannot reset.
  const session = await auth().catch(() => null);
  if (!session?.user?.id) return Response.json({ error: 'Please sign in to use the skin chat.' }, { status: 401 });
  const who = { kind: 'user', id: session.user.id } as const;
  const limited = await limit([
    { policy: 'chatMinute', subject: who },
    // Checks today's spend without adding to it; the reply's real cost is charged after.
    // ponytail: a person can overshoot ₹0.50 by one reply (a few paise); reserve worst-case up front if that matters.
    { policy: 'chatSpendDay', subject: who, units: 0 },
    { policy: 'chatGlobalDay', subject: { kind: 'identifier', value: 'chat:global' } },
  ]);
  if (!limited.allowed) return limitResponse(limited);

  const messages = trimHistory(parsed.data.messages);
  const latest = messages.at(-1)!.content;
  const flag = redFlags(latest);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      if (flag) send(urgentNotice(flag));
      try {
        const stream = anthropic.messages.stream(
          {
            model: CHAT_MODEL,
            max_tokens: MAX_REPLY_TOKENS,
            // Frozen instructions first and cached: repeat messages read them at the cached rate.
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            thinking: { type: 'adaptive' },
            output_config: { effort: 'low' },
            messages,
          },
          { signal: request.signal }
        );
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') send(event.delta.text);
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') send(DECLINED);
        const paise = replyCostPaise(final.usage);
        await limit([{ policy: 'chatSpendDay', subject: who, units: paise }]);
        logEvent('chat', 'reply', {
          paise,
          model: CHAT_MODEL,
          input: final.usage.input_tokens,
          cacheRead: final.usage.cache_read_input_tokens ?? 0,
          output: final.usage.output_tokens,
          stop: final.stop_reason,
          urgent: Boolean(flag),
        });
      } catch (err) {
        if (!request.signal.aborted) {
          reportError(err, { scope: 'chat.reply' });
          send(`\n\n${UNAVAILABLE}`);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
