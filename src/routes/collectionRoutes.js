/**
 * Rutas para gestión de recolección
 */

const express = require('express');
const collectionController = require('../controllers/collectionController');

const router = express.Router();

/**
 * POST /api/collection/points/:puntoId/complete
 * Marcar punto de ruta como completado
 * Body: { recolector_id, porcentaje_recolectado?, notas? }
 */
router.post('/points/:puntoId/complete', collectionController.markPointCompleted.bind(collectionController));

/**
 * POST /api/collection/points/bulk-complete
 * Marcar múltiples puntos como completados
 * Body: { puntos: [{ punto_id, porcentaje_recolectado?, notas? }], recolector_id }
 */
router.post('/points/bulk-complete', collectionController.bulkCompletePoints.bind(collectionController));

/**
 * POST /api/collection/bins/:boteId/confirm-retirement
 * Confirmar recolección física de bote pendiente de retiro
 * Body: { recolector_id, notas? }
 */
router.post('/bins/:boteId/confirm-retirement', collectionController.confirmBinRetirement.bind(collectionController));

/**
 * POST /api/collection/routes/:rutaId/complete
 * Completar ruta completa
 * Body: { recolector_id }
 */
router.post('/routes/:rutaId/complete', collectionController.completeRoute.bind(collectionController));

/**
 * GET /api/collection/routes/:rutaId/progress
 * Obtener progreso de ruta
 */
router.get('/routes/:rutaId/progress', collectionController.getRouteProgress.bind(collectionController));

/**
 * GET /api/collection/stats
 * Obtener estadísticas de recolección
 * Query: ?recolector_id=uuid&days=30
 */
router.get('/stats', collectionController.getCollectionStats.bind(collectionController));

module.exports = router;