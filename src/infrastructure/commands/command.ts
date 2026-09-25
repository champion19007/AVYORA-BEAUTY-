import type { z } from 'zod';
import { db } from '@/db';
import {
  IdempotencyKeyReusedError,
  withIdempotency,
  type Tx,
} from '@/infrastructure/idempotency/idempotency';
import { reportError } from '@/lib/observability';

/**
 * The boundary every important mutation passes through.
 *
 *     input ─▶ validate ─▶ authorise ─▶ idempotency ─▶ transaction ─▶ result
 *                                                       │
 *                                                       ├ the change itself
 *                                                       ├ domain event
 *                                                       └ audit row
 *
 * The order is fixed and the steps are not optional, so a new command cannot
 * forget to authorise, or authorise after it has already written something.
 * Everything inside `run` shares one transaction: the change, the event that
 * announces it and the audit row that records who made it commit together or
 * not at all.
 *
 * `run` signals an expected refusal — a stale version, a missing record — by
 * throwing `CommandError`. That becomes a typed result the caller can show.
 * Anything else is a fault: it is reported and rethrown.
 */

export type CommandActor = {
  /** Staff username, customer id, or `system` for scheduled work. */
  id: string;
  role: string | null;
};

export type CommandFailureCode =
  | 'invalid'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'key_reused';

export type CommandResult<O> =
  | { ok: true; value: O; replayed: boolean }
  | { ok: false; code: CommandFailureCode; message: string };

export class CommandError extends Error {
  constructor(
    readonly code: Exclude<CommandFailureCode, 'invalid' | 'forbidden' | 'key_reused'>,
    message: string
  ) {
    super(message);
  }
}

export type CommandDefinition<S extends z.ZodTypeAny, O> = {
  /** Dotted, e.g. `pricing.set`. Also the idempotency scope. */
  name: string;
  schema: S;
  authorize: (actor: CommandActor, input: z.infer<S>) => boolean;
  /**
   * A key that identifies one logical request, when retries of this command
   * must not repeat it. Omit for commands that are naturally safe to repeat.
   */
  idempotencyKey?: (input: z.infer<S>) => string | null;
  run: (input: z.infer<S>, actor: CommandActor, tx: Tx) => Promise<O>;
};

export function defineCommand<S extends z.ZodTypeAny, O>(definition: CommandDefinition<S, O>) {
  return async function execute(
    raw: unknown,
    actor: CommandActor | null
  ): Promise<CommandResult<O>> {
    const parsed = definition.schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        code: 'invalid',
        message: parsed.error.issues[0]?.message ?? 'That request is not valid.',
      };
    }

    const input = parsed.data as z.infer<S>;

    if (!actor || !definition.authorize(actor, input)) {
      return { ok: false, code: 'forbidden', message: 'You do not have permission to do that.' };
    }

    try {
      const key = definition.idempotencyKey?.(input) ?? null;

      if (key) {
        const outcome = await withIdempotency<O>(
          { scope: definition.name, key, payload: input },
          (tx) => definition.run(input, actor, tx)
        );
        return { ok: true, value: outcome.result, replayed: outcome.replayed };
      }

      const value = await db.transaction((tx) => definition.run(input, actor, tx));
      return { ok: true, value, replayed: false };
    } catch (err) {
      if (err instanceof CommandError) {
        return { ok: false, code: err.code, message: err.message };
      }
      if (err instanceof IdempotencyKeyReusedError) {
        return { ok: false, code: 'key_reused', message: err.message };
      }
      reportError(err, { scope: `command.${definition.name}` });
      throw err;
    }
  };
}
