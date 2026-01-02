/**
 * Servicio de gestión CRUD de botes
 */

const { getPostgresConnection } = require('../config/database');
const { boteSchema } = require('../models/validators');
const { BinStatus } = require('../models/enums');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

class BinService {
    /**
     * Crear nuevo bote
     */
    async createBin(binData) {
        // Validar datos
        const { error, value } = boteSchema.validate(binData);
        if (error) {
            throw new ValidationError('Datos de bote inválidos', error.details);
        }

        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que hardware_id no existe
            const checkQuery = 'SELECT id FROM botes WHERE hardware_id = $1';
            const checkResult = await pgClient.query(checkQuery, [value.hardware_id]);

            if (checkResult.rows.length > 0) {
                throw new ConflictError(
                    `Ya existe un bote con hardware_id: ${value.hardware_id}`,
                    [{ field: 'hardware_id', message: 'Hardware ID duplicado' }]
                );
            }

            // Verificar que el sector existe
            const sectorQuery = 'SELECT id FROM sectores WHERE id = $1 AND is_active = TRUE';
            const sectorResult = await pgClient.query(sectorQuery, [value.sector_id]);

            if (sectorResult.rows.length === 0) {
                throw new ValidationError('Sector no encontrado o inactivo');
            }

            // Si hay establecimiento, verificar que existe
            if (value.establecimiento_id) {
                const estQuery = 'SELECT id FROM establecimientos WHERE id = $1 AND is_active = TRUE';
                const estResult = await pgClient.query(estQuery, [value.establecimiento_id]);

                if (estResult.rows.length === 0) {
                    throw new ValidationError('Establecimiento no encontrado o inactivo');
                }
            }

            // Insertar bote
            const insertQuery = `
                INSERT INTO botes (
                    hardware_id,
                    establecimiento_id,
                    sector_id,
                    capacidad_litros,
                    tipo_vidrio,
                    status,
                    is_active,
                    instalado_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                RETURNING *
            `;

            const result = await pgClient.query(insertQuery, [
                value.hardware_id,
                value.establecimiento_id || null,
                value.sector_id,
                value.capacidad_litros,
                value.tipo_vidrio || 'mixto',
                value.status || BinStatus.ACTIVO,
                true
            ]);

            await pgClient.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener bote por ID
     */
    async getBinById(id) {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT 
                    b.*,
                    s.nombre as sector_nombre,
                    s.codigo as sector_codigo,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion,
                    e.telefono_contacto as establecimiento_telefono,
                    u.first_name as propietario_nombre,
                    u.last_name as propietario_apellido,
                    u.phone_number as propietario_telefono
                FROM botes b
                JOIN sectores s ON b.sector_id = s.id
                LEFT JOIN establecimientos e ON b.establecimiento_id = e.id
                LEFT JOIN users u ON e.propietario_id = u.id
                WHERE b.id = $1
            `;
            const result = await pgClient.query(query, [id]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Bote no encontrado');
            }

            return result.rows[0];
        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener bote por hardware_id
     */
    async getBinByHardwareId(hardwareId) {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT 
                    b.*,
                    s.nombre as sector_nombre,
                    e.nombre as establecimiento_nombre
                FROM botes b
                JOIN sectores s ON b.sector_id = s.id
                LEFT JOIN establecimientos e ON b.establecimiento_id = e.id
                WHERE b.hardware_id = $1
            `;
            const result = await pgClient.query(query, [hardwareId]);

            if (result.rows.length === 0) {
                throw new NotFoundError(`Bote no encontrado: ${hardwareId}`);
            }

            return result.rows[0];
        } finally {
            pgClient.release();
        }
    }

    /**
     * Listar botes con filtros
     */
    async listBins(filters = {}) {
        const {
            sectorId = null,
            establecimientoId = null,
            status = null,
            isActive = true,
            limit = 50,
            offset = 0
        } = filters;

        const pgClient = await getPostgresConnection();

        try {
            let conditions = [];
            let params = [];
            let paramCount = 1;

            if (isActive !== null) {
                conditions.push(`b.is_active = $${paramCount}`);
                params.push(isActive);
                paramCount++;
            }

            if (sectorId) {
                conditions.push(`b.sector_id = $${paramCount}`);
                params.push(sectorId);
                paramCount++;
            }

            if (establecimientoId) {
                conditions.push(`b.establecimiento_id = $${paramCount}`);
                params.push(establecimientoId);
                paramCount++;
            }

            if (status) {
                conditions.push(`b.status = $${paramCount}`);
                params.push(status);
                paramCount++;
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            const query = `
                SELECT 
                    b.*,
                    s.nombre as sector_nombre,
                    s.codigo as sector_codigo,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion
                FROM botes b
                JOIN sectores s ON b.sector_id = s.id
                LEFT JOIN establecimientos e ON b.establecimiento_id = e.id
                ${whereClause}
                ORDER BY b.created_at DESC
                LIMIT $${paramCount} OFFSET $${paramCount + 1}
            `;

            params.push(limit, offset);
            const result = await pgClient.query(query, params);

            // Contar total
            const countQuery = `
                SELECT COUNT(*) as total
                FROM botes b
                ${whereClause}
            `;
            const countResult = await pgClient.query(countQuery, params.slice(0, -2));

            return {
                botes: result.rows,
                pagination: {
                    total: parseInt(countResult.rows[0].total),
                    limit,
                    offset,
                    hasMore: parseInt(countResult.rows[0].total) > (offset + limit)
                }
            };

        } finally {
            pgClient.release();
        }
    }

    /**
     * Actualizar bote
     */
    async updateBin(id, updateData) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que el bote existe
            const checkQuery = 'SELECT id, status FROM botes WHERE id = $1';
            const checkResult = await pgClient.query(checkQuery, [id]);

            if (checkResult.rows.length === 0) {
                throw new NotFoundError('Bote no encontrado');
            }

            // Construir query de actualización dinámico
            const allowedFields = [
                'establecimiento_id',
                'sector_id',
                'capacidad_litros',
                'tipo_vidrio',
                'firmware_version',
                'motivo_inactividad'
            ];

            const updates = [];
            const values = [];
            let paramCount = 1;

            for (const field of allowedFields) {
                if (updateData[field] !== undefined) {
                    updates.push(`${field} = $${paramCount}`);
                    values.push(updateData[field]);
                    paramCount++;
                }
            }

            if (updates.length === 0) {
                throw new ValidationError('No hay campos para actualizar');
            }

            values.push(id);

            const updateQuery = `
                UPDATE botes
                SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, values);

            await pgClient.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Reasignar bote retirado a nuevo establecimiento
     */
    async reassignBin(id, nuevoEstablecimientoId, nuevoSectorId, adminId) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que el bote está retirado
            const boteQuery = 'SELECT id, status, hardware_id FROM botes WHERE id = $1';
            const boteResult = await pgClient.query(boteQuery, [id]);

            if (boteResult.rows.length === 0) {
                throw new NotFoundError('Bote no encontrado');
            }

            if (boteResult.rows[0].status !== BinStatus.RETIRADO) {
                throw new ConflictError(
                    'Solo se pueden reasignar botes en estado "retirado"',
                    { estadoActual: boteResult.rows[0].status }
                );
            }

            // Verificar nuevo establecimiento
            const estQuery = 'SELECT id FROM establecimientos WHERE id = $1 AND is_active = TRUE';
            const estResult = await pgClient.query(estQuery, [nuevoEstablecimientoId]);

            if (estResult.rows.length === 0) {
                throw new ValidationError('Establecimiento no encontrado o inactivo');
            }

            // Actualizar asignación
            const updateQuery = `
                UPDATE botes
                SET 
                    establecimiento_id = $1,
                    sector_id = $2,
                    status = $3,
                    ultimo_porcentaje = 0,
                    instalado_at = CURRENT_TIMESTAMP,
                    retirado_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [
                nuevoEstablecimientoId,
                nuevoSectorId,
                BinStatus.ACTIVO,
                id
            ]);

            // Registrar en historial
            const historialQuery = `
                INSERT INTO historial_estados_bote (
                    bote_id,
                    usuario_id,
                    estado_anterior,
                    estado_nuevo,
                    motivo
                ) VALUES ($1, $2, $3, $4, $5)
            `;

            await pgClient.query(historialQuery, [
                id,
                adminId,
                BinStatus.RETIRADO,
                BinStatus.ACTIVO,
                `Bote reasignado a establecimiento ${nuevoEstablecimientoId}`
            ]);

            await pgClient.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Marcar bote como inactivo (falla técnica, no retiro normal)
     */
    async deactivateBin(id, motivo, adminId) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            const updateQuery = `
                UPDATE botes
                SET 
                    is_active = FALSE,
                    motivo_inactividad = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [motivo, id]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Bote no encontrado');
            }

            // Registrar en historial
            const historialQuery = `
                INSERT INTO historial_estados_bote (
                    bote_id,
                    usuario_id,
                    estado_anterior,
                    estado_nuevo,
                    motivo
                ) VALUES ($1, $2, $3, $4, $5)
            `;

            await pgClient.query(historialQuery, [
                id,
                adminId,
                result.rows[0].status,
                result.rows[0].status,
                `Bote desactivado: ${motivo}`
            ]);

            await pgClient.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Reactivar bote desactivado
     */
    async reactivateBin(id, adminId) {
        const pgClient = await getPostgresConnection();

        try {
            const updateQuery = `
                UPDATE botes
                SET 
                    is_active = TRUE,
                    motivo_inactividad = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [id]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Bote no encontrado');
            }

            return result.rows[0];
        } finally {
            pgClient.release();
        }
    }

    /**
     * Eliminar bote (soft delete)
     */
    async deleteBin(id) {
        // En este sistema, preferimos desactivar en lugar de eliminar
        return this.deactivateBin(id, 'Eliminación administrativa', null);
    }
}

module.exports = new BinService();