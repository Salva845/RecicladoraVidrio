/**
 * Rutas para gestión de eventos de sensores
 */

const express = require('express');
const eventController = require('../controllers/eventController');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/events
 * Endpoint para recibir eventos del hardware
 * Body: { hardware_id, porcentaje_llenado, tipo_vidrio?, nivel_bateria?, ... }
 * SIN AUTENTICACIÓN - Hardware envia eventos directamente
 */
router.post('/', eventController.receiveEvent.bind(eventController));


// Las siguientes rutas requieren autenticación
router.use(authenticate)


/**
 * GET /api/events/bin/:hardwareId
 * Obtener historial de eventos de un bote específico
 * Query params: ?limit=100&skip=0&startDate=2024-01-01&endDate=2024-12-31&procesado=true
 */
router.get('/bin/:hardwareId', eventController.getBinHistory.bind(eventController));

/**
 * GET /api/events/bin/:hardwareId/last
 * Obtener el último evento registrado de un bote
 */
router.get('/bin/:hardwareId/last', eventController.getLastEvent.bind(eventController));

/**
 * GET /api/events/bin/:hardwareId/stats
 * Obtener estadísticas de eventos de un bote
 * Query params: ?days=7
 */
router.get('/bin/:hardwareId/stats', eventController.getEventStats.bind(eventController));

/**
 * GET /api/events/unprocessed
 * Obtener eventos pendientes de procesar
 * Query params: ?limit=100
 */
router.get('/unprocessed', eventController.getUnprocessedEvents.bind(eventController));

/**
 * GET /api/events/critical
 * Obtener eventos críticos recientes (porcentaje >= 80%)
 * Query params: ?hours=24&limit=50
 */
router.get('/critical', eventController.getCriticalEvents.bind(eventController));

/**
 * GET /api/events/glass-type/:type
 * Obtener eventos por tipo de vidrio
 * Params: type = transparente|verde|ambar|mixto
 * Query params: ?limit=100&skip=0&startDate=2024-01-01&endDate=2024-12-31
 */
router.get('/glass-type/:type', eventController.getByGlassType.bind(eventController));

/**
 * GET /api/events/stats/global
 * Obtener estadísticas globales del sistema
 * Query params: ?days=30
 */
router.get('/stats/global', eventController.getGlobalStats.bind(eventController));

module.exports = router;