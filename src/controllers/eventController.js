/**
 * Controlador para endpoints de eventos de sensores
 */

const eventService = require('../services/eventService');
const ApiResponse = require('../utils/response');

class EventController {
    /**
     * POST /api/events
     * Recibir evento del hardware
     */
    async receiveEvent(req, res, next) {
        try {
            const result = await eventService.receiveEvent(req.body);
            return ApiResponse.created(res, result, 'Evento recibido correctamente');
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/events/bin/:hardwareId
     * Obtener historial de eventos de un bote
     */
    async getBinHistory(req, res, next) {
        try {
            const { hardwareId } = req.params;
            const { limit, skip, startDate, endDate } = req.query;

            const result = await eventService.getBinEventHistory(hardwareId, {
                limit: parseInt(limit) || 100,
                skip: parseInt(skip) || 0,
                startDate,
                endDate
            });

            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/events/bin/:hardwareId/last
     * Obtener último evento de un bote
     */
    async getLastEvent(req, res, next) {
        try {
            const { hardwareId } = req.params;
            const result = await eventService.getLastEvent(hardwareId);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/events/bin/:hardwareId/stats
     * Obtener estadísticas de eventos
     */
    async getEventStats(req, res, next) {
        try {
            const { hardwareId } = req.params;
            const { days } = req.query;

            const result = await eventService.getEventStats(
                hardwareId,
                parseInt(days) || 7
            );

            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/events/unprocessed
     * Obtener eventos pendientes de procesar
     */
    async getUnprocessedEvents(req, res, next) {
        try {
            const { limit } = req.query;
            const result = await eventService.getUnprocessedEvents(parseInt(limit) || 100);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/events/critical
     * Obtener eventos críticos recientes
     */
    async getCriticalEvents(req, res, next) {
        try {
            const { hours, limit } = req.query;
            const result = await eventService.getCriticalEvents(
                parseInt(hours) || 24,
                parseInt(limit) || 50
            );
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/events/glass-type/:type
     * Obtener eventos por tipo de vidrio
     */
    async getByGlassType(req, res, next) {
        try {
            const { type } = req.params;
            const { limit, skip, startDate, endDate } = req.query;

            const result = await eventService.getEventsByGlassType(type, {
                limit: parseInt(limit) || 100,
                skip: parseInt(skip) || 0,
                startDate,
                endDate
            });

            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/events/stats/global
     * Obtener estadísticas globales del sistema
     */
    async getGlobalStats(req, res, next) {
        try {
            const { days } = req.query;
            const result = await eventService.getGlobalStats(parseInt(days) || 30);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new EventController();