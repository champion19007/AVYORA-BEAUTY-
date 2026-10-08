/**
 * A real week: seven days, each with an ordered morning and evening.
 *
 * Built from a selection (selection.ts) and the approved knowledge:
 * - Essentials (and owned products filling essential slots) every day in
 *   their sessions: cleanse AM and PM, moisturise AM and PM, protect AM.
 * - An elective treatment only with an approved usage profile that states a
 *   weekly maximum; it is placed on actual, evenly spaced days in its
 *   approved session, at the approved introduction pace when one is set.
 *   Without a stated frequency the treatment is left out: nothing is invented.
 * - At most one optional addition, in the evening, if the step cap allows.
 *
 * Then the whole week is validated (validatePlan): step caps per session,
 * weekly frequency, approved session timing, ordering, irritation limits and
 * same-session ingredient conflicts, owned products included. A treatment
 * that cannot be placed without breaking a rule is tried on other days
 * (at most 7 offsets per treatment) and dropped with a reason if none works.
 *
 * Every edit (move, remove) and every substitution or budget change re-runs
 * selection and planning, and the result is validated again.
 *
 * Pure and bounded: at most 3 treatments x 7 offsets, 14 sessions.
 */
import type { Product } from '@/data/mock-data';
import type { TreatmentClass } from '@/data/product-directions';
import type { Knowledge } from '@/modules/ingredients/formulations';
import type { InteractionRule } from '@/modules/ingredients/interaction-rules';
import type { ExplanationTemplate } from '@/modules/knowledge/records';
import { conflictTier, possibleIngredients, type OwnedItem, type Reason, type SelectionResult, type Slot } from './selection';

export type Session = 'am' | 'pm';
export const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Application order within a session. */
const ROLE_ORDER: Record<string, number> = { cleanse: 10, optional: 20, treatment: 30, moisturise: 40, protect: 50 };

export type PlannedSlot = {
  position: number;
  role: string;
  optional: boolean;
  source: 'owned' | 'catalogue';
  productId?: string;
  skuId?: string;
  ownedItemId?: string;
  label: string;
  /** Approved directions, verbatim, when they exist; never generic text. */
  directions: { frequency: string; text: string } | null;
};

export type PlanDay = { day: number; am: PlannedSlot[]; pm: PlannedSlot[] };

export type PlanContext = {
  products: readonly Product[];
  knowledge: Knowledge;
  interactions: readonly InteractionRule[];
  treatments: Readonly<Record<string, { class: TreatmentClass; electiveIrritating: boolean }>>;
  ownedItems: readonly OwnedItem[];
  currentlyIrritated: 'yes' | 'no' | 'unknown';
  maxDailySteps: number;
  /** Approved explanation templates from the active release only. */
  templates: readonly ExplanationTemplate[];
};

export type Explanation = { templateId: string; variables: Record<string, string>; text: string | null };

export type WeeklyPlan = {
  status: 'complete' | 'partial' | 'no_match';
  days: PlanDay[];
  purchases: SelectionResult['purchases'];
  newSpendPaise: number;
  budgetPaise: number;
  /** Product-level exclusions from selection plus anything the planner had to drop. */
  excluded: { productId: string; reasons: Reason[] }[];
  /** Plain description of what was scheduled, generated from the schedule itself. */
  schedule: string[];
  explanations: Explanation[];
  /** Knowledge whose absence made the plan less complete. */
  missingKnowledge: string[];
  /**
   * Rules the week still breaks. Treatments and optional additions are only
   * placed where they keep this empty; a conflict between essentials the
   * planner cannot move (an owned product and a purchased one, say) is
   * reported here and makes the plan `partial`.
   */
  problems: string[];
};

/* ------------------------------------------------------------ helpers -- */

/** n days spread evenly over the week, shifted by `offset`; deterministic. */
export function spreadDays(n: number, offset = 0): number[] {
  const days = new Set<number>();
  for (let i = 0; i < n; i++) days.add(((Math.floor((i * 7) / n) + offset) % 7) + 1);
  return [...days].sort((a, b) => a - b);
}

const nameOf = (ctx: PlanContext, slot: PlannedSlot) =>
  slot.source === 'owned' ? slot.label : (ctx.products.find((p) => p.id === slot.productId)?.name ?? slot.productId ?? 'A product');

function ingredientsOf(ctx: PlanContext, slot: PlannedSlot): string[] {
  if (slot.source === 'owned') return ctx.ownedItems.find((o) => o.id === slot.ownedItemId)?.ingredientIds ?? [];
  const product = ctx.products.find((p) => p.id === slot.productId);
  return product ? possibleIngredients(product, ctx.knowledge).ids : [];
}

function reorder(session: PlannedSlot[]): PlannedSlot[] {
  return [...session]
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99) || (a.productId ?? a.ownedItemId ?? '').localeCompare(b.productId ?? b.ownedItemId ?? ''))
    .map((s, i) => ({ ...s, position: i + 1 }));
}

/* --------------------------------------------------------- validation -- */

/** Every rule the week breaks. Empty means valid. Used after planning and after every edit. */
export function validatePlan(days: readonly PlanDay[], ctx: PlanContext): string[] {
  const problems: string[] = [];
  const uses = new Map<string, number>();
  if (days.length !== 7) problems.push(`A week has 7 days, not ${days.length}`);

  for (const d of days) {
    for (const session of ['am', 'pm'] as const) {
      const slots = d[session];
      const where = `${DAY_NAMES[d.day]} ${session.toUpperCase()}`;
      if (slots.length > ctx.maxDailySteps) problems.push(`${where}: ${slots.length} steps, limit ${ctx.maxDailySteps}`);
      slots.forEach((s, i) => {
        if (s.position !== i + 1) problems.push(`${where}: positions out of sequence`);
        if (i > 0 && (ROLE_ORDER[slots[i - 1].role] ?? 99) > (ROLE_ORDER[s.role] ?? 99)) problems.push(`${where}: ${s.role} applied before ${slots[i - 1].role}`);
      });

      const actives = slots.filter((s) => s.productId && ctx.treatments[s.productId]);
      for (const s of actives) {
        const id = s.productId!;
        uses.set(id, (uses.get(id) ?? 0) + 1);
        const d2 = ctx.knowledge.directions[id];
        if (!d2 || d2.maxWeeklyUses === null) problems.push(`${where}: ${id} has no approved weekly frequency`);
        else if (d2.session !== 'am_or_pm' && d2.session !== session) problems.push(`${where}: ${id} is approved for ${d2.session.toUpperCase()} only`);
        if (ctx.currentlyIrritated !== 'no' && ctx.treatments[id].electiveIrritating) {
          problems.push(`${where}: ${id} is an irritating active while irritation is ${ctx.currentlyIrritated}`);
        }
      }
      if (actives.filter((s) => ctx.treatments[s.productId!].electiveIrritating).length > 1) {
        problems.push(`${where}: two irritating actives in one session`);
      }
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const tier = conflictTier(ingredientsOf(ctx, slots[i]), ingredientsOf(ctx, slots[j]), ctx.interactions);
          if (tier !== null) problems.push(`${where}: ${nameOf(ctx, slots[i])} and ${nameOf(ctx, slots[j])} conflict (tier ${tier})`);
        }
      }
    }
  }
  for (const [id, n] of uses) {
    const max = ctx.knowledge.directions[id]?.maxWeeklyUses;
    if (max != null && n > max) problems.push(`${id}: ${n} uses this week, approved maximum ${max}`);
  }
  return problems;
}

/* ----------------------------------------------------------- planning -- */

function fromSelection(s: Slot, optional: boolean, ctx: PlanContext): PlannedSlot | null {
  if (s.source === 'unfilled') return null;
  if (s.source === 'owned') {
    return { position: 0, role: s.role, optional, source: 'owned', ownedItemId: s.ownedItemId, label: s.label, directions: null };
  }
  const d = ctx.knowledge.directions[s.productId];
  return {
    position: 0,
    role: s.role,
    optional,
    source: 'catalogue',
    productId: s.productId,
    skuId: s.skuId,
    label: ctx.products.find((p) => p.id === s.productId)?.name ?? s.productId,
    directions: d ? { frequency: d.frequency, text: d.text } : null,
  };
}

const empty = (): PlanDay[] => DAYS.map((day) => ({ day, am: [], pm: [] }));
const withSlot = (days: PlanDay[], day: number, session: Session, slot: PlannedSlot): PlanDay[] =>
  days.map((d) => (d.day === day ? { ...d, [session]: reorder([...d[session], slot]) } : d));

function render(template: ExplanationTemplate | undefined, variables: Record<string, string>): string | null {
  if (!template || template.review.status !== 'approved') return null;
  return template.text.replace(/\{(\w+)\}/g, (_, k: string) => variables[k] ?? `{${k}}`);
}

export function planWeek(selection: SelectionResult, ctx: PlanContext): WeeklyPlan {
  const excluded = selection.excluded.map((e) => ({ ...e, reasons: [...e.reasons] }));
  const missing = new Set<string>();
  let days = empty();

  // Essentials, every day, in their sessions.
  for (const s of selection.essentials) {
    const slot = fromSelection(s, false, ctx);
    if (!slot || s.source === 'unfilled') continue;
    for (const day of DAYS) for (const session of s.session) days = withSlot(days, day, session, slot);
    if (slot.source === 'catalogue' && !slot.directions) missing.add(`Approved directions for ${slot.label} (essential; scheduled by its role, with pack directions)`);
  }

  // Treatments: approved weekly frequency required; spread, then backtrack over offsets.
  for (const s of selection.treatments) {
    const slot = fromSelection(s, false, ctx);
    if (!slot || slot.source !== 'catalogue') continue;
    const d = ctx.knowledge.directions[slot.productId!];
    if (!d || d.maxWeeklyUses === null) {
      excluded.push({
        productId: slot.productId!,
        reasons: [{ code: 'frequency_missing', ruleId: 'builtin:usage-profile', message: 'No approved weekly frequency, so it cannot be scheduled.' }],
      });
      missing.add(`Approved weekly frequency for ${slot.label}`);
      continue;
    }
    const uses = Math.min(d.introductionWeeklyUses ?? d.maxWeeklyUses, d.maxWeeklyUses, 7);
    const session: Session = d.session === 'am' ? 'am' : 'pm';
    let placed: PlanDay[] | null = null;
    for (let offset = 0; offset < 7 && !placed; offset++) {
      let attempt = days;
      for (const day of spreadDays(uses, offset)) attempt = withSlot(attempt, day, session, slot);
      if (validatePlan(attempt, ctx).length === 0) placed = attempt;
    }
    if (placed) days = placed;
    else {
      excluded.push({
        productId: slot.productId!,
        reasons: [{ code: 'cannot_schedule', ruleId: 'builtin:planner', message: 'It could not be placed on any day without breaking a step limit, conflict or frequency rule.' }],
      });
    }
  }

  // One optional addition, evenings, only where it fits.
  for (const s of selection.optional) {
    const slot = fromSelection(s, true, ctx);
    if (!slot) continue;
    let attempt = days;
    for (const day of DAYS) attempt = withSlot(attempt, day, 'pm', slot);
    if (validatePlan(attempt, ctx).length === 0) days = attempt;
  }

  // Purchases: only what is actually scheduled.
  const scheduled = new Set(days.flatMap((d) => [...d.am, ...d.pm]).flatMap((s) => (s.skuId ? [s.skuId] : [])));
  const purchases = selection.purchases.filter((p) => scheduled.has(p.skuId));
  const newSpendPaise = purchases.reduce((n, p) => n + p.pricePaise, 0);

  const schedule = describeSchedule(days, ctx);
  const explanations = explain(excluded, ctx);
  for (const e of explanations) if (e.text === null) missing.add(`Approved explanation template ${e.templateId}`);

  const problems = validatePlan(days, ctx);
  const essentialsFilled = selection.essentials.filter((s) => s.source !== 'unfilled').length;
  const status =
    essentialsFilled === 0 ? 'no_match' : essentialsFilled === 3 && selection.status === 'complete' && problems.length === 0 ? 'complete' : 'partial';

  return {
    status,
    days,
    purchases,
    newSpendPaise,
    budgetPaise: selection.budgetPaise,
    excluded,
    schedule,
    explanations,
    missingKnowledge: [...missing].sort(),
    problems,
  };
}

/** One sentence per product: what the generated week actually does. */
export function describeSchedule(days: readonly PlanDay[], ctx: PlanContext): string[] {
  const where = new Map<string, { label: string; am: number[]; pm: number[] }>();
  for (const d of days) {
    for (const session of ['am', 'pm'] as const) {
      for (const s of d[session]) {
        const key = s.productId ?? s.ownedItemId ?? s.label;
        const entry = where.get(key) ?? { label: nameOf(ctx, s), am: [], pm: [] };
        entry[session].push(d.day);
        where.set(key, entry);
      }
    }
  }
  const when = (ds: number[], part: string) =>
    ds.length === 7 ? `every ${part}` : `${ds.map((d) => DAY_NAMES[d]).join(', ')} ${part}s`;
  return [...where.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((e) => {
      const parts = [e.am.length ? when(e.am, 'morning') : null, e.pm.length ? when(e.pm, 'evening') : null].filter(Boolean);
      return `${e.label}: ${parts.join(' and ')}.`;
    });
}

/** Reasons from the decision trace, rendered only through approved templates. */
function explain(excluded: WeeklyPlan['excluded'], ctx: PlanContext): Explanation[] {
  const byCode: Record<string, string> = {
    irritated: 'reason_irritated',
    very_reactive: 'reason_very_reactive',
    pregnancy_or_nursing: 'reason_pregnancy',
    age: 'reason_under18',
  };
  const out: Explanation[] = [];
  for (const e of [...excluded].sort((a, b) => a.productId.localeCompare(b.productId))) {
    if (ctx.treatments[e.productId] === undefined) continue;
    for (const r of e.reasons) {
      const templateId = byCode[r.code];
      if (!templateId) continue;
      const variables = { productName: ctx.products.find((p) => p.id === e.productId)?.name ?? e.productId };
      out.push({ templateId, variables, text: render(ctx.templates.find((t) => t.id === templateId), variables) });
    }
  }
  return out;
}

/* --------------------------------------------------------------- edits -- */

export type PlanEdit =
  | { kind: 'remove'; day: number; session: Session; position: number }
  | { kind: 'move'; productId: string; fromDay: number; toDay: number; session: Session };

/**
 * Applies a customer's edit and revalidates the whole week. An edit that
 * would break a rule is refused with the problems, leaving the plan as it was.
 * (Substitutions and budget changes go back through selectProducts and planWeek.)
 */
export function applyEdit(days: readonly PlanDay[], edit: PlanEdit, ctx: PlanContext): { ok: true; days: PlanDay[] } | { ok: false; problems: string[] } {
  let next: PlanDay[] = days.map((d) => ({ ...d, am: [...d.am], pm: [...d.pm] }));
  if (edit.kind === 'remove') {
    next = next.map((d) => (d.day === edit.day ? { ...d, [edit.session]: reorder(d[edit.session].filter((s) => s.position !== edit.position)) } : d));
  } else {
    const from = next.find((d) => d.day === edit.fromDay)?.[edit.session].find((s) => s.productId === edit.productId);
    if (!from) return { ok: false, problems: [`${edit.productId} is not scheduled on ${DAY_NAMES[edit.fromDay]}`] };
    next = next.map((d) =>
      d.day === edit.fromDay ? { ...d, [edit.session]: reorder(d[edit.session].filter((s) => s.productId !== edit.productId)) } : d
    );
    if (next.find((d) => d.day === edit.toDay)?.[edit.session].some((s) => s.productId === edit.productId)) {
      return { ok: false, problems: [`${edit.productId} is already scheduled on ${DAY_NAMES[edit.toDay]}`] };
    }
    next = withSlot(next, edit.toDay, edit.session, from);
  }
  const problems = validatePlan(next, ctx);
  return problems.length ? { ok: false, problems } : { ok: true, days: next };
}
