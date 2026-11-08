import { pool, type Queryable } from '../db';

export async function audit(actorId: string | null, action: string, entity: string, entityId: string | null, details: object = {}, db: Queryable = pool) {
  await db.query('INSERT INTO audit_log(actor_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)', [actorId, action, entity, entityId, details]);
}
