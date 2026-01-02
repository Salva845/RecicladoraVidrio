/**
 * Controlador para endpoints de gestión de botes
 */

const binService = require('../services/binService');
const statusService = require('../services/statusService');
const ApiResponse = require('../utils/response');

class BinController {
    /**
     * POST /api/bins
     * Crear nuevo bote
     */
    async createBin(req, res, next) {
        try {
            const result = await binService.createBin(req.body);
            return ApiResponse.created(res, result, 'Bote creado exitosamente');
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/bins/:id
     * Obtener bote por ID
     */
    async getBinById(req, res, next) {
        try {
            const { id } = req.params;
            const result = await binService.getBinById(id);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/bins/hardware/:hardwareId
     * Obtener bote por hardware_id
     */
    async getBinByHardwareId(req, res, next) {
        try {
            const { hardwareId } = req.params;
            const result = await binService.getBinByHardwareId(hardwareId);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/bins
     * Listar botes con filtros
     */
    async listBins(req, res, next) {
        try {
            const { sectorId, establecimientoId, status, isActive, limit, offset } = req.query;

            const result = await binService.listBins({
                sectorId,
                establecimientoId,
                status,
                isActive: isActive !== undefined ? isActive === 'true' : true,
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0
            });

            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/bins/:id
     * Actualizar bote
     */
    async updateBin(req, res, next) {
        try {
            const { id } = req.params;
            const result = await binService.updateBin(id, req.body);
            return ApiResponse.success(res, result, 'Bote actualizado exitosamente');
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/bins/:id/reassign
     * Reasignar bote retirado
     */
    async reassignBin(req, res, next) {
        try {
            const { id } = req.params;
            const { establecimiento_id, sector_id } = req.body;
            const adminId = req.user?.id; // Asumiendo middleware de autenticación

            const result = await binService.reassignBin(
                id,
                establecimiento_id,
                sector_id,
                adminId
            );

            return ApiResponse.success(res, result, 'Bote reasignado exitosamente');
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/bins/:id/deactivate
     * Desactivar bote
     */
    async deactivateBin(req, res, next) {
        try {
            const { id } = req.params;
            const { motivo } = req.body;
            const adminId = req.user?.id;

            const result = await binService.deactivateBin(id, motivo, adminId);
            return ApiResponse.success(res, result, 'Bote desactivado exitosamente');
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/bins/:id/reactivate
     * Reactivar bote
     */
    async reactivateBin(req, res, next) {
        try {
            const { id } = req.params;
            const adminId = req.user?.id;

            const result = await binService.reactivateBin(id, adminId);
            return ApiResponse.success(res, result, 'Bote reactivado exitosamente');
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/bins/:id/history
     * Obtener historial de estados
     */
    async getStatusHistory(req, res, next) {
        try {
            const { id } = req.params;
            const { limit } = req.query;

            const result = await statusService.getStatusHistory(
                id,
                parseInt(limit) || 50
            );

            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/bins/status/pending
     * Obtener botes pendientes de recolección
     */
    async getPendingBins(req, res, next) {
        try {
            const { sectorId, limit, offset } = req.query;

            const result = await statusService.getBinsByStatus({
                sectorId,
                nivelMinimo: 60,
                limit: parseInt(limit) || 100,
                offset: parseInt(offset) || 0
            });

            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/bins/status/critical
     * Obtener botes en estado crítico
     */
    async getCriticalBins(req, res, next) {
        try {
            const { sectorId, limit, offset } = req.query;

            const result = await statusService.getBinsByStatus({
                sectorId,
                nivelMinimo: 80,
                limit: parseInt(limit) || 100,
                offset: parseInt(offset) || 0
            });

            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/bins/:id/status
     * Cambiar estado manualmente
     */
    async changeStatus(req, res, next) {
        try {
            const { id } = req.params;
            const { nuevo_estado, motivo } = req.body;
            const usuarioId = req.user?.id;

            const result = await statusService.changeStatus(
                id,
                nuevo_estado,
                usuarioId,
                motivo
            );

            return ApiResponse.success(res, result, 'Estado cambiado exitosamente');
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new BinController();