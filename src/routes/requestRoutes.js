/**
 * Rutas para gestión de solicitudes
 */

const express = require('express');
const requestController = require('../controllers/requestController');

const router = express.Router();

/**
 * POST /api/requests
 * Crear nueva solicitud
 * Body: { establecimiento_id, solicitante_id, tipo, descripcion, datos_adicionales?, bote_id? }
 */
router.post('/', requestController.createRequest.bind(requestController));

/**
 * GET /api/requests
 * Listar solicitudes con filtros
 * Query: ?tipo=instalacion&status=pendiente&establecimiento_id=uuid&limit=50&offset=0
 */
router.get('/', requestController.listRequests.bind(requestController));

/**
 * GET /api/requests/pending
 * Obtener solicitudes pendientes
 * Query: ?tipo=retiro
 */
router.get('/pending', requestController.getPendingRequests.bind(requestController));

/**
 * GET /api/requests/stats
 * Obtener estadísticas de solicitudes
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
 * Aprobar solicitud (solo gestor)
 * Body: { aprobador_id, respuesta? }
 */
router.post('/:id/approve', requestController.approveRequest.bind(requestController));

/**
 * POST /api/requests/:id/complete
 * Completar solicitud
 * Body: { usuario_id, notas? }
 */
router.post('/:id/complete', requestController.completeRequest.bind(requestController));

/**
 * POST /api/requests/:id/cancel
 * Cancelar solicitud
 * Body: { usuario_id, motivo? }
 */
router.post('/:id/cancel', requestController.cancelRequest.bind(requestController));

module.exports = router;