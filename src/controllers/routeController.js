/**
 * Controlador de rutas
 */

const routeService = require('../services/routeService');
const ApiResponse = require('../utils/response');

class RouteController {
    async createRoute(req, res, next) {
        try {
            const ruta = await routeService.createRoute(req.body);
            return ApiResponse.created(res, ruta, 'Ruta creada exitosamente');
        } catch (error) {
            next(error);
        }
    }

    async generateRoute(req, res, next) {
        try {
            const { sector_id, creador_id, config } = req.body;

            const ruta = await routeService.generateRoute(
                sector_id,
                creador_id,
                config || {}
            );

            return ApiResponse.created(
                res,
                ruta,
                `Ruta generada con ${ruta.puntos.length} puntos`
            );
        } catch (error) {
            next(error);
        }
    }

    async getRouteById(req, res, next) {
        try {
            const ruta = await routeService.getRouteById(req.params.id);
            return ApiResponse.success(res, ruta);
        } catch (error) {
            next(error);
        }
    }

    async listRoutes(req, res, next) {
        try {
            const filters = {
                sectorId: req.query.sector_id,
                status: req.query.status,
                recolectorId: req.query.recolector_id,
                fechaDesde: req.query.fecha_desde,
                fechaHasta: req.query.fecha_hasta,
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0
            };

            const result = await routeService.listRoutes(filters);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    async addPointToRoute(req, res, next) {
        try {
            const { bote_id, notas } = req.body;

            const punto = await routeService.addPointToRoute(
                req.params.id,
                bote_id,
                notas
            );

            return ApiResponse.success(res, punto, 'Punto agregado a la ruta');
        } catch (error) {
            next(error);
        }
    }

    async assignRoute(req, res, next) {
        try {
            const { recolector_id } = req.body;

            const ruta = await routeService.assignRoute(
                req.params.id,
                recolector_id
            );

            return ApiResponse.success(res, ruta, 'Ruta asignada exitosamente');
        } catch (error) {
            next(error);
        }
    }

    async startRoute(req, res, next) {
        try {
            const { recolector_id } = req.body;

            const ruta = await routeService.startRoute(
                req.params.id,
                recolector_id
            );

            return ApiResponse.success(res, ruta, 'Ruta iniciada');
        } catch (error) {
            next(error);
        }
    }

    async cancelRoute(req, res, next) {
        try {
            const { usuario_id, motivo } = req.body;

            const ruta = await routeService.cancelRoute(
                req.params.id,
                usuario_id,
                motivo
            );

            return ApiResponse.success(res, ruta, 'Ruta cancelada');
        } catch (error) {
            next(error);
        }
    }

    async getAvailableRoutes(req, res, next) {
        try {
            const sectorId = req.query.sector_id || null;
            const result = await routeService.getAvailableRoutes(sectorId);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new RouteController();