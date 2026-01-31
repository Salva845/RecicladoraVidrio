/**
 * Rutas para gestión de solicitudes
 */

const express = require('express');
const requestController = require('../controllers/requestController');
const {
    authenticate,
    requireGestorRutas,
    requireDuenoEstablecimiento,
    requireEstablecimientoOwnership,
    authorize
} = require('../middleware/auth');
const { UserRole } = require('../models/enums');

const router = express.Router();

/**
 * POST /api/requests
 * Crear nueva solicitud - Solo dueño de establecimiento
 * Body: { establecimiento_id, solicitante_id, tipo, descripcion, datos_adicionales?, bote_id? }
 */
router.post('/',
    authorize(UserRole.DUENO_ESTABLECIMIENTO),
    requestController.createRequest.bind(requestController)
);

/**
 * GET /api/requests
 * Listar solicitudes con filtros
 * - Gestor: ve todas
 * - Dueño: solo las de sus establecimientos
 * Query: ?tipo=instalacion&status=pendiente&establecimiento_id=uuid&limit=50&offset=0
 */
router.get('/', requestController.listRequests.bind(requestController));

/**
 * GET /api/requests/pending
 * Solicitudes pendientes - Solo gestor de rutas
 * Query: ?tipo=retiro
 */
router.get('/pending', requireGestorRutas, requestController.getPendingRequests.bind(requestController));

/**
 * GET /api/requests/stats
 * Estadísticas - Todos pueden ver sus propias stats
 * Query: ?establecimiento_id=uuid&days=30
 */
router.get('/stats', requestController.getRequestStats.bind(requestController));

/**
 * GET /api/requests/:id
 * Obtener solicitud por ID
 */
router.get('/:id', requestController.getRequestById.bind(requestController));

/**
 * POST /api/requests/:id/approve
 * Aprobar solicitud - Solo gestor de rutas
 * Body: { aprobador_id, respuesta? }
 */
router.post('/:id/approve', requireGestorRutas, requestController.approveRequest.bind(requestController));

/**
 * POST /api/requests/:id/complete
 * Completar solicitud - Solo gestor de rutas
 * Body: { usuario_id, notas? }
 */
router.post('/:id/complete', requireGestorRutas, requestController.completeRequest.bind(requestController));

/**
 * POST /api/requests/:id/cancel
 * Cancelar solicitud
 * - Gestor: puede cancelar cualquiera
 * - Dueño: solo las propias
 * Body: { usuario_id, motivo? }
 */
router.post('/:id/cancel', requestController.cancelRequest.bind(requestController));

module.exports = router;