import { SignJWT, jwtVerify } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@voltway/shared';
import { config } from '../config';
import { one } from '../db';
import { forbidden, unauthorized } from './errors';

const secret = new TextEncoder().encode(config.jwtSecret);
export const SESSION_COOKIE = 'vw_session';
const SESSION_TTL_DAYS = 14;

export interface AuthUser {
  id: string;
  role: Role;
  email: string | null;
  phone: string | null;
  fullName: string;
  companyIds: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export async function signToken(payload: Record<string, unknown>, ttl: string, audience = 'session') {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(ttl).setAudience(audience).sign(secret);
}

export async function verifyToken<T = any>(token: string, audience = 'session'): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience });
    return payload as T;
  } catch {
    return null;
  }
}

export async function issueSession(reply: FastifyReply, userId: string) {
  const token = await signToken({ sub: userId }, `${SESSION_TTL_DAYS}d`);
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: SESSION_TTL_DAYS * 86400,
  });
  return token;
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function loadUser(userId: string): Promise<AuthUser | null> {
  const u = await one<any>(
    `SELECT u.id, u.role, u.email, u.phone, u.full_name, u.status,
            COALESCE(array_agg(cm.company_id) FILTER (WHERE cm.company_id IS NOT NULL), '{}') AS company_ids
       FROM users u LEFT JOIN company_members cm ON cm.user_id = u.id
      WHERE u.id = $1 GROUP BY u.id`,
    [userId],
  );
  if (!u || u.status !== 'active') return null;
  return { id: u.id, role: u.role, email: u.email, phone: u.phone, fullName: u.full_name, companyIds: u.company_ids };
}

/** onRequest hook: resolves the user from the session cookie or a Bearer token. */
export async function resolveUser(req: FastifyRequest) {
  req.user = null;
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.[SESSION_COOKIE];
  if (!token) return;
  const payload = await verifyToken<{ sub: string }>(token);
  if (payload?.sub) req.user = await loadUser(payload.sub);
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireRole(req: FastifyRequest, ...roles: Role[]): AuthUser {
  const u = requireUser(req);
  if (!roles.includes(u.role)) throw forbidden();
  return u;
}

/** Operators may only touch their own company's resources; admins may touch everything. */
export function assertCompanyAccess(user: AuthUser, companyId: string) {
  if (user.role === 'admin') return;
  if (!user.companyIds.includes(companyId)) throw forbidden('This resource belongs to another company');
}
