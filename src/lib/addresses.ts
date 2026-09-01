import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { addresses } from '@/db/schema';
import type { AddressInput } from '@/lib/address-schema';

// Validation and the state list live in address-schema.ts, which imports no
// database code, so the client form can use them without bundling the driver.
export { INDIAN_STATES, addressSchema, type AddressInput } from '@/lib/address-schema';

/**
 * Saved delivery addresses.
 *
 * Addresses were being written at checkout and never read back — a customer
 * retyped their address on every order. This is the book: list, add, edit,
 * remove, and choose a default.
 *
 * Every function here takes a `userId` and scopes its query by it. That is
 * deliberate and load-bearing: an address row holds a person's home address
 * and phone number, so an id alone must never be enough to read or change one.
 * A caller cannot forget to pass it, because there is no overload without it.
 */

export type Address = typeof addresses.$inferSelect;

/** Every address for a user. The default sorts first, then newest. */
export async function listAddresses(userId: string): Promise<Address[]> {
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}

/** One address, but only if it belongs to this user. */
export async function getAddress(userId: string, id: string): Promise<Address | null> {
  const [row] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .limit(1);

  return row ?? null;
}

/** The address to pre-select at checkout, or show in the header. */
export async function getDefaultAddress(userId: string): Promise<Address | null> {
  const [row] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
    .limit(1);

  if (row) return row;

  // No explicit default: fall back to the most recent, so a customer with one
  // saved address never sees an empty "deliver to".
  const [newest] = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.createdAt))
    .limit(1);

  return newest ?? null;
}

export async function createAddress(userId: string, input: AddressInput): Promise<Address> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .limit(1);

    // The first address a customer saves is their default whether they asked
    // for it or not — otherwise checkout has nothing to pre-select.
    const isDefault = input.isDefault || !existing;

    if (isDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, userId));
    }

    const [row] = await tx
      .insert(addresses)
      .values({
        userId,
        fullName: input.fullName,
        phone: input.phone,
        postalCode: input.postalCode,
        line1: input.line1,
        line2: input.line2 || null,
        landmark: input.landmark || null,
        city: input.city,
        state: input.state,
        country: 'IN',
        isDefault,
      })
      .returning();

    return row!;
  });
}

/** Updates an address in place. Returns null if it is not this user's. */
export async function updateAddress(
  userId: string,
  id: string,
  input: AddressInput
): Promise<Address | null> {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: addresses.id, isDefault: addresses.isDefault })
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .limit(1);

    if (!owned) return null;

    if (input.isDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(and(eq(addresses.userId, userId), ne(addresses.id, id)));
    }

    const [row] = await tx
      .update(addresses)
      .set({
        fullName: input.fullName,
        phone: input.phone,
        postalCode: input.postalCode,
        line1: input.line1,
        line2: input.line2 || null,
        landmark: input.landmark || null,
        city: input.city,
        state: input.state,
        // Un-ticking the box on the current default would leave the customer
        // with none, so a default can only be moved, never simply removed.
        isDefault: input.isDefault || owned.isDefault,
      })
      .where(eq(addresses.id, id))
      .returning();

    return row ?? null;
  });
}

/** Promotes one address to default and demotes the rest. */
export async function setDefaultAddress(userId: string, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .limit(1);

    if (!owned) return false;

    await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, id));
    return true;
  });
}

/**
 * Removes an address.
 *
 * Deleting the default hands the badge to whatever remains, so a customer who
 * removes their default is not left without one.
 */
export async function deleteAddress(userId: string, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: addresses.id, isDefault: addresses.isDefault })
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .limit(1);

    if (!owned) return false;

    await tx.delete(addresses).where(eq(addresses.id, id));

    if (owned.isDefault) {
      const [next] = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .where(eq(addresses.userId, userId))
        .orderBy(desc(addresses.createdAt))
        .limit(1);

      if (next) {
        await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
      }
    }

    return true;
  });
}

/** Compact one-line form for the header's "deliver to" indicator. */
export function shortAddressLabel(address: Address): string {
  return `${address.city} ${address.postalCode}`;
}
