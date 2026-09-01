import { z } from 'zod';

/**
 * Address validation and constants — deliberately free of database imports.
 *
 * The add/edit form is a client component and needs the state list and the
 * schema. When these lived alongside the queries in `lib/addresses.ts`, that
 * one import pulled `db`, and with it the `postgres` driver, into the browser
 * bundle: the build failed trying to resolve `tls`, `fs` and `perf_hooks` for
 * the client. Splitting the pure values out keeps the driver on the server.
 *
 * Nothing here may import from `@/db`.
 */

/** The 28 states and 8 union territories, as couriers expect them. */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

/**
 * Validation for an Indian delivery address.
 *
 * Rules are strict where delivery actually depends on them — a PIN code is six
 * digits and never starts with zero, a mobile number is ten digits starting
 * 6-9 — and lenient everywhere else. Rejecting a legitimate address is worse
 * than accepting an odd one: the courier still has the PIN and the phone.
 *
 * The phone transform accepts what people actually type — `+91 98765-43210`,
 * `098765 43210` — and stores ten bare digits.
 */
export const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(120),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number')),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  line1: z.string().trim().min(3, 'Enter the flat, house or building').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  landmark: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the town or city').max(100),
  state: z.enum(INDIAN_STATES, { message: 'Choose a state' }),
  isDefault: z.boolean().optional().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;
