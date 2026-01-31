/**
 * Rutas para gestión de rutas de recolección
 */

const express = require('express');
const routeController = require('../controllers/routeController');
const {
    authenticate,
    requireGestorRutas,
    requireRecolector,
    requireGestorOrRecolector
} = require('../middleware/auth')

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * POST /api/routes
 * Crear ruta manualmente - Solo gestor
 * Body: { sector_id, creador_id, nombre, descripcion?, fecha_planificada?, hora_inicio?, hora_fin? }
 */
router.post('/', requireGestorRutas, routeController.createRoute.bind(routeController));

/**
 * POST /api/routes/generate
 * Generar ruta automáticamente por sector - Solo gestor
 * Body: { sector_id, creador_id, config: { nombre?, nivelMinimo?, maxPuntos?, tipoVidrio?, fechaPlanificada? } }
 */
router.post('/generate', requireGestorRutas, routeController.generateRoute.bind(routeController));

/**
 * GET /api/routes
 * Listar rutas con filtros - Gestor y recolector
 * Query: ?sector_id=uuid&status=planificada&recolector_id=uuid&fecha_desde=2024-01-01&limit=50
 */
router.get('/', requireGestorOrRecolector, routeController.listRoutes.bind(routeController));

/**
 * GET /api/routes/available
 * Obtener rutas disponibles (planificadas o asignadas) - Gestor y recolector
 * Query: ?sector_id=uuid
 */
router.get('/available', requireGestorOrRecolector, routeController.getAvailableRoutes.bind(routeController));

/**
 * GET /api/routes/:id
 * Obtener ruta por ID con detalles completos - Gestor y recolector
 */
router.get('/:id', requireGestorOrRecolector, routeController.getRouteById.bind(routeController));

/**
 * POST /api/routes/:id/points
 * Agregar punto a ruta - Solo gestor
 * Body: { bote_id, notas? }
 */
router.post('/:id/points', requireGestorRutas, routeController.addPointToRoute.bind(routeController));

/**
 * POST /api/routes/:id/assign
 * Asignar ruta a recolector - Solo gestor
 * Body: { recolector_id }
 */
router.post('/:id/assign', requireGestorRutas, routeController.assignRoute.bind(routeController));

/**
 * POST /api/routes/:id/start
 * Iniciar ruta (cambiar a en_progreso) - Solo recolector
 * Body: { recolector_id }
 */
router.post('/:id/start', requireRecolector, routeController.startRoute.bind(routeController));

/**
 * POST /api/routes/:id/cancel
 * Cancelar ruta - Solo gestor
 * Body: { usuario_id, motivo? }
 */
router.post('/:id/cancel', requireGestorRutas, routeController.cancelRoute.bind(routeController));

module.exports = router;