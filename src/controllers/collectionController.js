/**
 * Controlador de recolección
 */

const collectionService = require('../services/collectionService');
const ApiResponse = require('../utils/response');

class CollectionController {
    async markPointCompleted(req, res, next) {
        try {
            const { recolector_id, porcentaje_recolectado, notas } = req.body;

            const punto = await collectionService.markPointAsCompleted(
                req.params.puntoId,
                recolector_id,
                porcentaje_recolectado,
                notas
            );

            return ApiResponse.success(res, punto, 'Punto marcado como completado');
        } catch (error) {
            next(error);
        }
    }

    async confirmBinRetirement(req, res, next) {
        try {
            const { recolector_id, notas } = req.body;

            const result = await collectionService.confirmBinRetirement(
                req.params.boteId,
                recolector_id,
                notas
            );

            return ApiResponse.success(res, result, 'Recolección confirmada');
        } catch (error) {
            next(error);
        }
    }

    async completeRoute(req, res, next) {
        try {
            const { recolector_id } = req.body;

            const ruta = await collectionService.completeRoute(
                req.params.rutaId,
                recolector_id
            );

            return ApiResponse.success(res, ruta, 'Ruta completada exitosamente');
        } catch (error) {
            next(error);
        }
    }

    async bulkCompletePoints(req, res, next) {
        try {
            const { puntos, recolector_id } = req.body;

            const result = await collectionService.bulkCompletePoints(
                puntos,
                recolector_id
            );

            return ApiResponse.success(
                res,
                result,
                `${result.exitosos}/${result.total} puntos completados`
            );
        } catch (error) {
            next(error);
        }
    }

    async getRouteProgress(req, res, next) {
        try {
            const progress = await collectionService.getRouteProgress(req.params.rutaId);
            return ApiResponse.success(res, progress);
        } catch (error) {
            next(error);
        }
    }

    async getCollectionStats(req, res, next) {
        try {
            const filters = {
                recolectorId: req.query.recolector_id,
                days: parseInt(req.query.days) || 30
            };

            const stats = await collectionService.getCollectionStats(filters);
            return ApiResponse.success(res, stats);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new CollectionController();