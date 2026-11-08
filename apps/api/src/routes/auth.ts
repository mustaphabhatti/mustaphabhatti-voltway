import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config';
import { one, q } from '../db';
import { clearSession, issueSession, loadUser, requireUser, signToken, verifyToken } from '../lib/auth';
import { badRequest, conflict, unauthorized } from '../lib/errors';
import { parse } from '../lib/validate';
import { issueRealtimeToken } from '../realtime/hub';

const phoneRe = /^\+?[0-9]{8,15}$/;

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your name').max(80),
    email: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
    phone: z.string().trim().regex(phoneRe, 'Enter a valid phone number with country code').optional().or(z.literal('').transform(() => undefined)),
    password: z.string().min(8, 'Use at least 8 characters').max(128),
    accountType: z.enum(['driver', 'operator']).default('driver'),
  })
  .refine((v) => v.email || v.phone, { message: 'Provide an email address or phone number', path: ['email'] });

const loginSchema = z.object({ identifier: z.string().trim().min(3), password: z.string().min(1) });

function publicUser(u: Awaited<ReturnType<typeof loadUser>>) {
  return u;
}

async function upsertOAuthUser(provider: 'google' | 'apple', subject: string, email: string | null, name: string) {
  let user = await one<any>('SELECT id FROM users WHERE auth_provider = $1 AND provider_subject = $2', [provider, subject]);
  if (!user && email) {
    user = await one<any>('UPDATE users SET auth_provider = $1, provider_subject = $2 WHERE email = $3 RETURNING id', [provider, subject, email]);
  }
  if (!user) {
    user = await one<any>(
      `INSERT INTO users(email, full_name, auth_provider, provider_subject) VALUES ($1,$2,$3,$4) RETURNING id`,
      [email, name || (email ?? 'Driver'), provider, subject],
    );
    await q('INSERT INTO user_preferences(user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
  }
  await q('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  return user.id as string;
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/providers', async () => ({
    password: true,
    phone: true,
    google: !!(config.google.clientId && config.google.clientSecret),
    apple: !!(config.apple.clientId && config.apple.teamId && config.apple.keyId && config.apple.privateKey),
  }));

  app.post('/auth/register', async (req, reply) => {
    const b = parse(registerSchema, req.body);
    if (b.email && (await one('SELECT 1 FROM users WHERE email = $1', [b.email]))) throw conflict('An account with this email already exists');
    if (b.phone && (await one('SELECT 1 FROM users WHERE phone = $1', [b.phone]))) throw conflict('An account with this phone number already exists');
    const hash = await bcrypt.hash(b.password, 11);
    const u = await one<any>(
      `INSERT INTO users(email, phone, password_hash, full_name, role) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [b.email ?? null, b.phone ?? null, hash, b.fullName, b.accountType],
    );
    await q('INSERT INTO user_preferences(user_id) VALUES ($1)', [u.id]);
    const token = await issueSession(reply, u.id);
    // Browsers use the httpOnly cookie; native apps store the token securely and send it as a Bearer header.
    return { user: publicUser(await loadUser(u.id)), token };
  });

  app.post('/auth/login', async (req, reply) => {
    const b = parse(loginSchema, req.body);
    const id = b.identifier.toLowerCase();
    const u = await one<any>('SELECT id, password_hash, status FROM users WHERE email = $1 OR phone = $2', [id, b.identifier.replace(/\s/g, '')]);
    if (!u?.password_hash || !(await bcrypt.compare(b.password, u.password_hash))) throw unauthorized('Incorrect email/phone or password');
    if (u.status !== 'active') throw unauthorized('This account is suspended. Contact support.');
    await q('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
    const token = await issueSession(reply, u.id);
    return { user: publicUser(await loadUser(u.id)), token };
  });

  app.post('/auth/logout', async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get('/auth/me', async (req) => {
    if (!req.user) return { user: null };
    const prefs = await one<any>('SELECT * FROM user_preferences WHERE user_id = $1', [req.user.id]);
    const companies = await q<any>(
      `SELECT c.id, c.name, c.slug, c.verification_status, cm.member_role FROM company_members cm
         JOIN companies c ON c.id = cm.company_id WHERE cm.user_id = $1`,
      [req.user.id],
    );
    const vehicle = await one<any>('SELECT * FROM user_vehicles WHERE user_id = $1 ORDER BY is_default DESC, created_at LIMIT 1', [req.user.id]);
    return { user: req.user, preferences: prefs, companies, defaultVehicle: vehicle };
  });

  app.patch('/auth/me', async (req) => {
    const u = requireUser(req);
    const b = parse(z.object({ fullName: z.string().trim().min(2).max(80).optional(), phone: z.string().regex(phoneRe).optional() }), req.body);
    if (b.phone && (await one('SELECT 1 FROM users WHERE phone = $1 AND id <> $2', [b.phone, u.id]))) throw conflict('Phone number already in use');
    await q('UPDATE users SET full_name = COALESCE($2, full_name), phone = COALESCE($3, phone) WHERE id = $1', [u.id, b.fullName ?? null, b.phone ?? null]);
    return { user: await loadUser(u.id) };
  });

  app.post('/auth/change-password', async (req) => {
    const u = requireUser(req);
    const b = parse(z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }), req.body);
    const row = await one<any>('SELECT password_hash FROM users WHERE id = $1', [u.id]);
    if (row?.password_hash && !(await bcrypt.compare(b.currentPassword, row.password_hash))) throw badRequest('Current password is incorrect');
    await q('UPDATE users SET password_hash = $2 WHERE id = $1', [u.id, await bcrypt.hash(b.newPassword, 11)]);
    return { ok: true };
  });

  app.get('/realtime/token', async (req) => ({ token: await issueRealtimeToken(req.user?.id ?? null) }));

  // ── Google OAuth 2.0 (authorization code flow) ─────────────────────────────
  app.get('/auth/oauth/google/start', async (req, reply) => {
    if (!config.google.clientId) throw badRequest('Google sign-in is not configured');
    const state = await signToken({ p: 'google', next: (req.query as any)?.next ?? '/' }, '10m', 'oauth');
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: `${config.publicApiUrl}/api/auth/oauth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get('/auth/oauth/google/callback', async (req, reply) => {
    const { code, state } = req.query as any;
    const st = await verifyToken<{ next: string }>(state, 'oauth');
    if (!code || !st) return reply.redirect(`${config.webOrigin}/login?error=oauth`);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: config.google.clientId, client_secret: config.google.clientSecret,
        redirect_uri: `${config.publicApiUrl}/api/auth/oauth/google/callback`, grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return reply.redirect(`${config.webOrigin}/login?error=oauth`);
    const tokens = (await tokenRes.json()) as any;
    const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
    const { payload } = await jwtVerify(tokens.id_token, JWKS, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: config.google.clientId });
    const userId = await upsertOAuthUser('google', String(payload.sub), payload.email_verified ? String(payload.email) : null, String(payload.name ?? ''));
    await issueSession(reply, userId);
    return reply.redirect(`${config.webOrigin}${st.next?.startsWith('/') ? st.next : '/'}`);
  });

  // ── Sign in with Apple ─────────────────────────────────────────────────────
  app.get('/auth/oauth/apple/start', async (req, reply) => {
    if (!config.apple.clientId) throw badRequest('Apple sign-in is not configured');
    const state = await signToken({ p: 'apple', next: (req.query as any)?.next ?? '/' }, '10m', 'oauth');
    const params = new URLSearchParams({
      client_id: config.apple.clientId,
      redirect_uri: `${config.publicApiUrl}/api/auth/oauth/apple/callback`,
      response_type: 'code id_token',
      response_mode: 'form_post',
      scope: 'name email',
      state,
    });
    return reply.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
  });

  app.post('/auth/oauth/apple/callback', async (req, reply) => {
    const body = req.body as any;
    const st = await verifyToken<{ next: string }>(body?.state, 'oauth');
    if (!body?.id_token || !st) return reply.redirect(`${config.webOrigin}/login?error=oauth`);
    // Validate the client secret works (exchanging the code proves the callback came from Apple).
    const key = await importPKCS8(config.apple.privateKey, 'ES256');
    const clientSecret = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.apple.keyId })
      .setIssuer(config.apple.teamId).setIssuedAt().setExpirationTime('5m')
      .setAudience('https://appleid.apple.com').setSubject(config.apple.clientId).sign(key);
    const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.apple.clientId, client_secret: clientSecret, code: body.code, grant_type: 'authorization_code',
        redirect_uri: `${config.publicApiUrl}/api/auth/oauth/apple/callback` }),
    });
    if (!tokenRes.ok) return reply.redirect(`${config.webOrigin}/login?error=oauth`);
    const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
    const { payload } = await jwtVerify(body.id_token, JWKS, { issuer: 'https://appleid.apple.com', audience: config.apple.clientId });
    let name = '';
    try { const u = JSON.parse(body.user ?? '{}'); name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(' '); } catch { /* first login only */ }
    const userId = await upsertOAuthUser('apple', String(payload.sub), payload.email ? String(payload.email) : null, name);
    await issueSession(reply, userId);
    return reply.redirect(`${config.webOrigin}${st.next?.startsWith('/') ? st.next : '/'}`);
  });
}
