/**
 * Rutas para gestión de recolección
 */

const express = require('express');
const collectionController = require('../controllers/collectionController');
const {
    authenticate,
    requireRecolector,
    requireGestorOrRecolector
} = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * POST /api/collection/points/:puntoId/complete
 * Marcar punto de ruta como completado - Solo recolector
 * Body: { recolector_id, porcentaje_recolectado?, notas? }
 */
router.post('/points/:puntoId/complete', requireRecolector, collectionController.markPointCompleted.bind(collectionController));

/**
 * POST /api/collection/points/bulk-complete
 * Marcar múltiples puntos como completados - Solo recolector
 * Body: { puntos: [{ punto_id, porcentaje_recolectado?, notas? }], recolector_id }
 */
router.post('/points/bulk-complete', requireRecolector, collectionController.bulkCompletePoints.bind(collectionController));

/**
 * POST /api/collection/bins/:boteId/confirm-retirement
 * Confirmar recolección física de bote pendiente de retiro - Solo recolector
 * Body: { recolector_id, notas? }
 */
router.post('/bins/:boteId/confirm-retirement', requireRecolector, collectionController.confirmBinRetirement.bind(collectionController));

/**
 * POST /api/collection/routes/:rutaId/complete
 * Completar ruta completa - Solo recolector
 * Body: { recolector_id }
 */
router.post('/routes/:rutaId/complete', requireRecolector, collectionController.completeRoute.bind(collectionController));

/**
 * GET /api/collection/routes/:rutaId/progress
 * Obtener progreso de ruta - Gestor y recolector
 */
router.get('/routes/:rutaId/progress', requireGestorOrRecolector, collectionController.getRouteProgress.bind(collectionController));

/**
 * GET /api/collection/stats
 * Obtener estadísticas de recolección - Gestor y recolector
 * Query: ?recolector_id=uuid&days=30
 */
router.get('/stats', requireGestorOrRecolector, collectionController.getCollectionStats.bind(collectionController));

module.exports = router;