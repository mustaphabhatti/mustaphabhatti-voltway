import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { mkdirSync } from 'node:fs';
import { ZodError } from 'zod';
import { config } from './config';
import { pool } from './db';
import { resolveUser } from './lib/auth';
import { HttpError } from './lib/errors';
import { registerRealtime } from './realtime/hub';
import { registerOcpp } from './integrations/charging/ocpp16';
import { startSimulator } from './integrations/charging/simulator';
import { startScheduler } from './jobs/scheduler';
import { authRoutes } from './routes/auth';
import { stationRoutes } from './routes/stations';
import { routingRoutes } from './routes/routing';
import { driverRoutes } from './routes/driver';
import { operatorRoutes, UPLOAD_DIR } from './routes/operator';
import { adminRoutes, publicSettingsRoutes } from './routes/admin';

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info', transport: undefined },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cors, { origin: [config.webOrigin], credentials: true });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
  await app.register(websocket, {
    options: {
      maxPayload: 1024 * 1024,
      handleProtocols: (protocols: Set<string>) => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
    },
  });
  mkdirSync(UPLOAD_DIR, { recursive: true });
  await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/api/uploads/', decorateReply: false });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    await resolveUser(req);
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.message, details: err.details });
    if (err instanceof ZodError) return reply.status(400).send({ error: 'Invalid input', details: err.issues });
    if (err.validation) return reply.status(400).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
    if (err.code === '22P02') return reply.status(400).send({ error: 'Invalid identifier' });
    req.log.error(err);
    return reply.status(500).send({ error: 'Something went wrong on our side. Please try again.' });
  });

  app.get('/api/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true, time: new Date().toISOString() };
  });

  await registerRealtime(app);
  await registerOcpp(app);
  await app.register(
    async (api) => {
      await authRoutes(api);
      await stationRoutes(api);
      await routingRoutes(api);
      await driverRoutes(api);
      await operatorRoutes(api);
      await adminRoutes(api);
      await publicSettingsRoutes(api);
    },
    { prefix: '/api' },
  );
  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  const log = (m: string) => app.log.info(m);
  await startSimulator(log);
  startScheduler(log);
  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
