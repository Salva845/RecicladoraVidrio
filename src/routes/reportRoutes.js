/**
 * Rutas para gestión de reportes
 */

const express = require('express');
const reportController = require('../controllers/reportController');

const router = express.Router();

/**
 * POST /api/reports
 * Crear nuevo reporte
 * Body: { bote_id, reportero_id, tipo, titulo, descripcion, imagenes_urls? }
 */
router.post('/', reportController.createReport.bind(reportController));

/**
 * GET /api/reports
 * Listar reportes con filtros
 * Query: ?tipo=dano_fisico&status=pendiente&bote_id=uuid&limit=50&offset=0
 */
router.get('/', reportController.listReports.bind(reportController));

/**
 * GET /api/reports/pending
 * Obtener reportes pendientes
 */
router.get('/pending', reportController.getPendingReports.bind(reportController));

/**
 * GET /api/reports/critical
 * Obtener reportes críticos (fallas, daños, vandalismo)
 */
router.get('/critical', reportController.getCriticalReports.bind(reportController));

/**
 * GET /api/reports/stats
 * Obtener estadísticas de reportes
 * Query: ?bote_id=uuid&days=30
 */
router.get('/stats', reportController.getReportStats.bind(reportController));

/**
 * GET /api/reports/bin/:boteId
 * Obtener reportes de un bote específico
 * Query: ?limit=20
 */
router.get('/bin/:boteId', reportController.getReportsByBin.bind(reportController));

/**
 * GET /api/reports/:id
 * Obtener reporte por ID
 */
router.get('/:id', reportController.getReportById.bind(reportController));

/**
 * POST /api/reports/:id/attend
 * Atender reporte
 * Body: { usuario_id, resolucion?, completar: boolean }
 */
router.post('/:id/attend', reportController.attendReport.bind(reportController));

module.exports = router;