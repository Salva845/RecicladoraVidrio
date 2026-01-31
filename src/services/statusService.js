/**
 * Servicio de gestión de estados de botes
 * Implementa la máquina de estados: activo → pendiente_retiro → retirado
 */

const { getPostgresConnection } = require('../config/database');
const { BinStatus, clasificarNivelLlenado } = require('../models/enums');
const { ValidationError, ConflictError, NotFoundError } = require('../middleware/errorHandler');

class StatusService {
    /**
     * Cambiar estado de un bote con validación de transiciones
     */
    async changeStatus(boteId, nuevoEstado, usuarioId = null, motivo = null, options = {}) {
        const { pgClient: externalClient = null } = options;
        const pgClient = externalClient || await getPostgresConnection();
        const manageTransaction = !externalClient;

        try {
            if (manageTransaction) {
                await pgClient.query('BEGIN');
            }

            // Obtener estado actual
            const getBoteQuery = `
                SELECT id, hardware_id, status, ultimo_porcentaje, establecimiento_id
                FROM botes
                WHERE id = $1 AND is_active = TRUE
                FOR UPDATE
            `;
            const boteResult = await pgClient.query(getBoteQuery, [boteId]);

            if (boteResult.rows.length === 0) {
                throw new NotFoundError('Bote no encontrado o inactivo');
            }

            const bote = boteResult.rows[0];
            const estadoActual = bote.status;

            // Validar transición de estado
            this._validateStateTransition(estadoActual, nuevoEstado);

            // Actualizar estado
            const updateQuery = `
                UPDATE botes
                SET 
                    status = $1,
                    updated_at = CURRENT_TIMESTAMP,
                    retirado_at = CASE WHEN $1 = 'retirado' THEN CURRENT_TIMESTAMP ELSE retirado_at END
                WHERE id = $2
                RETURNING *
            `;
            const updateResult = await pgClient.query(updateQuery, [nuevoEstado, boteId]);

            // Registrar en historial con contexto de usuario
            const historialQuery = `
                INSERT INTO historial_estados_bote (
                    bote_id,
                    usuario_id,
                    estado_anterior,
                    estado_nuevo,
                    porcentaje_llenado,
                    motivo
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            await pgClient.query(historialQuery, [
                boteId,
                usuarioId,
                estadoActual,
                nuevoEstado,
                bote.ultimo_porcentaje,
                motivo || this._getDefaultMotivo(nuevoEstado)
            ]);

            if (manageTransaction) {
                await pgClient.query('COMMIT');
            }

            return updateResult.rows[0];

        } catch (error) {
            if (manageTransaction) {
                await pgClient.query('ROLLBACK');
            }
            throw error;
        } finally {
            if (manageTransaction) {
                pgClient.release();
            }
        }
    }

    /**
     * Marcar bote como pendiente de retiro
     * Solo puede hacerse si hay una solicitud aprobada
     */
    async markAsPendingRetirement(boteId, solicitudId, usuarioId, options = {}) {
        const { pgClient: externalClient = null } = options;
        const pgClient = externalClient || await getPostgresConnection();
        const manageTransaction = !externalClient;

        try {
            if (manageTransaction) {
                await pgClient.query('BEGIN');
            }

            // Verificar que existe solicitud aprobada
            const solicitudQuery = `
                SELECT id, status, tipo
                FROM solicitudes
                WHERE id = $1 AND bote_id = $2 AND tipo = 'retiro'
            `;
            const solicitudResult = await pgClient.query(solicitudQuery, [solicitudId, boteId]);

            if (solicitudResult.rows.length === 0) {
                throw new NotFoundError('Solicitud de retiro no encontrada para este bote');
            }

            if (solicitudResult.rows[0].status !== 'aprobada') {
                throw new ConflictError('La solicitud debe estar aprobada para marcar el bote como pendiente');
            }

            // Cambiar estado
            const result = await this.changeStatus(
                boteId,
                BinStatus.PENDIENTE_RETIRO,
                usuarioId,
                `Solicitud de retiro aprobada: ${solicitudId}`,
                { pgClient }
            );

            if (manageTransaction) {
                await pgClient.query('COMMIT');
            }
            return result;

        } catch (error) {
            if (manageTransaction) {
                await pgClient.query('ROLLBACK');
            }
            throw error;
        } finally {
            if (manageTransaction) {
                pgClient.release();
            }
        }
    }

    /**
     * Confirmar recolección física (marca como retirado)
     */
    async confirmCollection(boteId, recolectorId, options = {}) {
        return this.changeStatus(
            boteId,
            BinStatus.RETIRADO,
            recolectorId,
            'Recolección física confirmada por recolector',
            options
        );
    }

    /**
     * Reactivar bote (después de reasignación)
     */
    async reactivateBin(boteId, administradorId, options = {}) {
        return this.changeStatus(
            boteId,
            BinStatus.ACTIVO,
            administradorId,
            'Bote reasignado y reactivado',
            options
        );
    }

    /**
     * Obtener historial de cambios de estado
     */
    async getStatusHistory(boteId, limit = 50) {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT 
                    h.*,
                    u.first_name,
                    u.last_name,
                    u.role
                FROM historial_estados_bote h
                LEFT JOIN users u ON h.usuario_id = u.id
                WHERE h.bote_id = $1
                ORDER BY h.created_at DESC
                LIMIT $2
            `;
            const result = await pgClient.query(query, [boteId, limit]);
            return result.rows;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener botes por estado y clasificación de llenado
     */
    async getBinsByStatus(filters = {}) {
        const {
            status = null,
            sectorId = null,
            establecimientoId = null,
            nivelMinimo = 60, // Por defecto, solo botes pendientes o críticos
            limit = 100,
            offset = 0
        } = filters;

        const pgClient = await getPostgresConnection();

        try {
            let conditions = ['b.is_active = TRUE'];
            let params = [];
            let paramCount = 1;

            if (status) {
                conditions.push(`b.status = $${paramCount}`);
                params.push(status);
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

            conditions.push(`b.ultimo_porcentaje >= $${paramCount}`);
            params.push(nivelMinimo);
            paramCount++;

            const query = `
                SELECT 
                    b.*,
                    s.nombre as sector_nombre,
                    s.codigo as sector_codigo,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion,
                    CASE
                        WHEN b.ultimo_porcentaje >= 80 THEN 'CRITICO'
                        WHEN b.ultimo_porcentaje >= 60 THEN 'PENDIENTE'
                        ELSE 'NORMAL'
                    END as nivel_clasificacion
                FROM botes b
                JOIN sectores s ON b.sector_id = s.id
                LEFT JOIN establecimientos e ON b.establecimiento_id = e.id
                WHERE ${conditions.join(' AND ')}
                ORDER BY b.ultimo_porcentaje DESC, b.ultima_lectura DESC
                LIMIT $${paramCount} OFFSET $${paramCount + 1}
            `;

            params.push(limit, offset);

            const result = await pgClient.query(query, params);

            // Contar total
            const countQuery = `
                SELECT COUNT(*) as total
                FROM botes b
                WHERE ${conditions.join(' AND ')}
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
     * Validar transición de estados
     */
    _validateStateTransition(estadoActual, estadoNuevo) {
        const transicionesValidas = {
            [BinStatus.ACTIVO]: [BinStatus.PENDIENTE_RETIRO],
            [BinStatus.PENDIENTE_RETIRO]: [BinStatus.RETIRADO, BinStatus.ACTIVO], // Puede volver a activo si se cancela
            [BinStatus.RETIRADO]: [BinStatus.ACTIVO] // Solo para reasignación
        };

        const permitido = transicionesValidas[estadoActual]?.includes(estadoNuevo);

        if (!permitido) {
            throw new ConflictError(
                `Transición de estado no permitida: ${estadoActual} → ${estadoNuevo}`,
                { estadoActual, estadoNuevo, transicionesPermitidas: transicionesValidas[estadoActual] }
            );
        }
    }

    /**
     * Obtener motivo por defecto según el nuevo estado
     */
    _getDefaultMotivo(nuevoEstado) {
        const motivos = {
            [BinStatus.ACTIVO]: 'Bote activado',
            [BinStatus.PENDIENTE_RETIRO]: 'Solicitud de retiro aprobada',
            [BinStatus.RETIRADO]: 'Recolección física confirmada'
        };
        return motivos[nuevoEstado] || 'Cambio de estado';
    }
}

module.exports = new StatusService();
