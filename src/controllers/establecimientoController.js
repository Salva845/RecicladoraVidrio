/**
 * Controlador para endpoints de gestión de establecimientos
 */

const establecimientoService = require('../services/establecimientoService');
const ApiResponse = require('../utils/response');

class EstablecimientoController {
    /**
     * POST /api/establecimientos
     * Crear establecimiento
     */
    async createEstablecimiento(req, res, next) {
        try {
            const result = await establecimientoService.createEstablecimiento(
                req.body,
                req.user
            );
            return ApiResponse.created(res, result, 'Establecimiento creado exitosamente');
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/establecimientos
     * Listar establecimientos
     */
    async listEstablecimientos(req, res, next) {
        try {
            const { sectorId, propietarioId, isActive, limit, offset } = req.query;

            const result = await establecimientoService.listEstablecimientos(
                {
                    sectorId,
                    propietarioId,
                    isActive: isActive !== undefined ? isActive === 'true' : true,
                    limit: parseInt(limit) || 50,
                    offset: parseInt(offset) || 0
                },
                req.user
            );

            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/establecimientos/:id
     * Obtener establecimiento por ID
     */
    async getEstablecimientoById(req, res, next) {
        try {
            const { id } = req.params;
            const result = await establecimientoService.getEstablecimientoById(id, req.user);
            return ApiResponse.success(res, result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/establecimientos/:id
     * Actualizar establecimiento
     */
    async updateEstablecimiento(req, res, next) {
        try {
            const { id } = req.params;
            const result = await establecimientoService.updateEstablecimiento(
                id,
                req.body,
                req.user
            );
            return ApiResponse.success(res, result, 'Establecimiento actualizado exitosamente');
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/establecimientos/:id/deactivate
     * Desactivar establecimiento
     */
    async deactivateEstablecimiento(req, res, next) {
        try {
            const { id } = req.params;
            const adminId = req.user?.id;
            const result = await establecimientoService.setEstablecimientoActive(
                id,
                false,
                adminId
            );
            return ApiResponse.success(res, result, 'Establecimiento desactivado exitosamente');
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/establecimientos/:id/reactivate
     * Reactivar establecimiento
     */
    async reactivateEstablecimiento(req, res, next) {
        try {
            const { id } = req.params;
            const adminId = req.user?.id;
            const result = await establecimientoService.setEstablecimientoActive(
                id,
                true,
                adminId
            );
            return ApiResponse.success(res, result, 'Establecimiento reactivado exitosamente');
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new EstablecimientoController();
