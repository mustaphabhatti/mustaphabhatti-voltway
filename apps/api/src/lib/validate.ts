import { z } from 'zod';
import { badRequest } from './errors';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest(issues[0] ? `${issues[0].path ? issues[0].path + ': ' : ''}${issues[0].message}` : 'Invalid input', issues);
  }
  return r.data;
}

export const zCsv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v == null ? [] : (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean)));

export const zNum = z.coerce.number();
export const zUuid = z.string().uuid();
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
