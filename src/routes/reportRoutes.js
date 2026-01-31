/**
 * Rutas para gestión de reportes
 */

const express = require('express');
const reportController = require('../controllers/reportController');
const {
    authenticate,
    requireGestorRutas,
    authorize
} = require('../middleware/auth');
const { UserRole } = require('../models/enums')

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * POST /api/reports
 * Crear reporte - Dueño de establecimiento
 * Body: { bote_id, reportero_id, tipo, titulo, descripcion, imagenes_urls? }
 */
router.post('/',
    authorize(UserRole.DUENO_ESTABLECIMIENTO),
    reportController.createReport.bind(reportController)
);

/**
 * GET /api/reports
 * Listar reportes - Todos pueden ver
 * Query: ?tipo=dano_fisico&status=pendiente&bote_id=uuid&limit=50&offset=0
 */
router.get('/', reportController.listReports.bind(reportController));

/**
 * GET /api/reports/pending
 * Obtener reportes pendientes - Solo gestor de rutas
 */
router.get('/pending', requireGestorRutas,
    reportController.getPendingReports.bind(reportController));

/**
 * GET /api/reports/critical
 * Obtener reportes críticos (fallas, daños, vandalismo) - Solo Gestor
 */
router.get('/critical', requireGestorRutas, reportController.getCriticalReports.bind(reportController));

/**
 * GET /api/reports/stats
 * Obtener estadísticas de reportes - Todos pueden ver
 * Query: ?bote_id=uuid&days=30
 */
router.get('/stats', reportController.getReportStats.bind(reportController));

/**
 * GET /api/reports/bin/:boteId
 * Obtener reportes de un bote específico - Todos pueden ver
 * Query: ?limit=20
 */
router.get('/bin/:boteId', reportController.getReportsByBin.bind(reportController));

/**
 * GET /api/reports/:id
 * Obtener reporte por ID - Todos pueden ver
 */
router.get('/:id', reportController.getReportById.bind(reportController));

/**
 * POST /api/reports/:id/attend
 * Atender reporte - Solo gestor de rutas
 * Body: { usuario_id, resolucion?, completar: boolean }
 */
router.post('/:id/attend', requireGestorRutas, reportController.attendReport.bind(reportController));

module.exports = router;