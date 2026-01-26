/**
 * Controlador de reportes
 */

const reportService = require('../services/reportService');
const ApiResponse = require('../utils/response');

class ReportController {
    async createReport(req, res, next) {
        try {
            const reporte = await reportService.createReport(req.body);
            return ApiResponse.created(res, reporte, 'Reporte creado exitosamente');
        } catch (error) {
            next(error);
        }
    }

    async getReportById(req, res, next) {
        try {
            const reporte = await reportService.getReportById(req.params.id);
            return ApiResponse.success(res, reporte);
        } catch (error) {
            next(error);
        }
    }

    async listReports(req, res, next) {
        try {
            const filters = {
                tipo: req.query.tipo,
                status: req.query.status,
                boteId: req.query.bote_id,
                reporteroId: req.query.reportero_id,
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0
            };

            const result = await reportService.listReports(filters);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    async attendReport(req, res, next) {
        try {
            const { usuario_id, resolucion, completar } = req.body;

            const reporte = await reportService.attendReport(
                req.params.id,
                usuario_id,
                resolucion,
                completar || false
            );

            return ApiResponse.success(res, reporte, 'Reporte atendido exitosamente');
        } catch (error) {
            next(error);
        }
    }

    async getPendingReports(req, res, next) {
        try {
            const result = await reportService.getPendingReports();
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    async getCriticalReports(req, res, next) {
        try {
            const reportes = await reportService.getCriticalReports();
            return ApiResponse.success(res, { reportes });
        } catch (error) {
            next(error);
        }
    }

    async getReportStats(req, res, next) {
        try {
            const filters = {
                boteId: req.query.bote_id,
                days: parseInt(req.query.days) || 30
            };

            const stats = await reportService.getReportStats(filters);
            return ApiResponse.success(res, stats);
        } catch (error) {
            next(error);
        }
    }

    async getReportsByBin(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 20;
            const result = await reportService.getReportsByBin(req.params.boteId, limit);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ReportController();