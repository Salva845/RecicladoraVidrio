/**
 * Rutas para gestión de rutas de recolección
 */

const express = require('express');
const routeController = require('../controllers/routeController');

const router = express.Router();

/**
 * POST /api/routes
 * Crear ruta manualmente
 * Body: { sector_id, creador_id, nombre, descripcion?, fecha_planificada?, hora_inicio?, hora_fin? }
 */
router.post('/', routeController.createRoute.bind(routeController));

/**
 * POST /api/routes/generate
 * Generar ruta automáticamente por sector
 * Body: { sector_id, creador_id, config: { nombre?, nivelMinimo?, maxPuntos?, tipoVidrio?, fechaPlanificada? } }
 */
router.post('/generate', routeController.generateRoute.bind(routeController));

/**
 * GET /api/routes
 * Listar rutas con filtros
 * Query: ?sector_id=uuid&status=planificada&recolector_id=uuid&fecha_desde=2024-01-01&limit=50
 */
router.get('/', routeController.listRoutes.bind(routeController));

/**
 * GET /api/routes/available
 * Obtener rutas disponibles (planificadas o asignadas)
 * Query: ?sector_id=uuid
 */
router.get('/available', routeController.getAvailableRoutes.bind(routeController));

/**
 * GET /api/routes/:id
 * Obtener ruta por ID con detalles completos
 */
router.get('/:id', routeController.getRouteById.bind(routeController));

/**
 * POST /api/routes/:id/points
 * Agregar punto a ruta
 * Body: { bote_id, notas? }
 */
router.post('/:id/points', routeController.addPointToRoute.bind(routeController));

/**
 * POST /api/routes/:id/assign
 * Asignar ruta a recolector
 * Body: { recolector_id }
 */
router.post('/:id/assign', routeController.assignRoute.bind(routeController));

/**
 * POST /api/routes/:id/start
 * Iniciar ruta (cambiar a en_progreso)
 * Body: { recolector_id }
 */
router.post('/:id/start', routeController.startRoute.bind(routeController));

/**
 * POST /api/routes/:id/cancel
 * Cancelar ruta
 * Body: { usuario_id, motivo? }
 */
router.post('/:id/cancel', routeController.cancelRoute.bind(routeController));

module.exports = router;