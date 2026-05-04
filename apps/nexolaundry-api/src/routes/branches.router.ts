import { Router } from 'express';
import { sql } from 'drizzle-orm';

export function createBranchesRouter(): Router {
  const router = Router();

  // GET /api/v1/branches — sucursales activas del tenant
  router.get('/', async (req, res, next) => {
    try {
      const result = await req.db!.execute(
        sql`SELECT branch_id, name, address, phone, active FROM branches WHERE active = true ORDER BY name`,
      );
      res.json(result.rows);
    } catch (err) { next(err); }
  });

  // GET /api/v1/branches/:branchId/terminals — terminales activos de la sucursal
  router.get('/:branchId/terminals', async (req, res, next) => {
    try {
      const result = await req.db!.execute(
        sql`SELECT terminal_id, branch_id, name, device_fingerprint, active
            FROM terminals
            WHERE branch_id = ${req.params.branchId}::uuid AND active = true
            ORDER BY name`,
      );
      res.json(result.rows);
    } catch (err) { next(err); }
  });

  return router;
}
