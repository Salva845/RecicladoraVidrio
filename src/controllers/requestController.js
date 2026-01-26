/**
 * Controlador de solicitudes
 */

const requestService = require('../services/requestService');
const ApiResponse = require('../utils/response');

class RequestController {
    async createRequest(req, res, next) {
        try {
            const solicitud = await requestService.createRequest(req.body);
            return ApiResponse.created(res, solicitud, 'Solicitud creada exitosamente');
        } catch (error) {
            next(error);
        }
    }

    async getRequestById(req, res, next) {
        try {
            const solicitud = await requestService.getRequestById(req.params.id);
            return ApiResponse.success(res, solicitud);
        } catch (error) {
            next(error);
        }
    }

    async listRequests(req, res, next) {
        try {
            const filters = {
                tipo: req.query.tipo,
                status: req.query.status,
                establecimientoId: req.query.establecimiento_id,
                solicitanteId: req.query.solicitante_id,
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0
            };

            const result = await requestService.listRequests(filters);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    async approveRequest(req, res, next) {
        try {
            const { aprobador_id, respuesta } = req.body;

            const solicitud = await requestService.approveRequest(
                req.params.id,
                aprobador_id,
                respuesta
            );

            return ApiResponse.success(res, solicitud, 'Solicitud aprobada exitosamente');
        } catch (error) {
            next(error);
        }
    }

    async completeRequest(req, res, next) {
        try {
            const { usuario_id, notas } = req.body;

            const solicitud = await requestService.completeRequest(
                req.params.id,
                usuario_id,
                notas
            );

            return ApiResponse.success(res, solicitud, 'Solicitud completada exitosamente');
        } catch (error) {
            next(error);
        }
    }

    async cancelRequest(req, res, next) {
        try {
            const { usuario_id, motivo } = req.body;

            const solicitud = await requestService.cancelRequest(
                req.params.id,
                usuario_id,
                motivo
            );

            return ApiResponse.success(res, solicitud, 'Solicitud cancelada');
        } catch (error) {
            next(error);
        }
    }

    async getPendingRequests(req, res, next) {
        try {
            const tipo = req.query.tipo || null;
            const result = await requestService.getPendingRequests(tipo);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    async getRequestStats(req, res, next) {
        try {
            const filters = {
                establecimientoId: req.query.establecimiento_id,
                days: parseInt(req.query.days) || 30
            };

            const stats = await requestService.getRequestStats(filters);
            return ApiResponse.success(res, stats);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new RequestController();