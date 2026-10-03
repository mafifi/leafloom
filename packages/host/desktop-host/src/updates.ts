import { z } from 'zod';
const Version = z
  .string()
  .min(1)
  .max(128)
  .regex(/^v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/);
const common = { version: Version, channel: z.enum(['manual', 'signed']) };
export const UpdateStatus = z.discriminatedUnion('status', [
  z.strictObject({
    ...common,
    status: z.literal('disabled'),
    reason: z.literal('release-channel-unconfigured'),
  }),
  z.strictObject({ ...common, status: z.literal('idle') }),
  z.strictObject({ ...common, status: z.literal('checking') }),
  z
    .strictObject({
      ...common,
      status: z.literal('downloading'),
      latestVersion: Version,
      transferred: z.number().int().nonnegative(),
      total: z.number().int().positive().optional(),
      percent: z.number().min(0).max(100),
    })
    .refine(
      (v) => v.total === undefined || v.transferred <= v.total,
      'Progress exceeds package size',
    ),
  z.strictObject({ ...common, status: z.literal('ready'), latestVersion: Version }),
  z.strictObject({ ...common, status: z.literal('installing'), latestVersion: Version }),
  z.strictObject({
    ...common,
    status: z.literal('error'),
    code: z.enum([
      'UPDATE_NETWORK',
      'UPDATE_SIGNATURE',
      'UPDATE_PACKAGE',
      'UPDATE_INSTALL',
      'UPDATE_UNAVAILABLE',
    ]),
  }),
]);
export type UpdateStatusValue = z.infer<typeof UpdateStatus>;
export interface UpdateProvider {
  status(): Promise<UpdateStatusValue>;
  check(): Promise<UpdateStatusValue>;
  /** Install only after a successful durable close; host independently enforces no open leases. */
  installPending(): Promise<{ installed: boolean }>;
  subscribe(listener: (status: UpdateStatusValue) => void): () => void;
}
