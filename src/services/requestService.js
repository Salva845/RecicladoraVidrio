/**
 * Servicio de gestión de solicitudes
 * Maneja instalación, retiro, recolección manual y asistencia
 */

const { getPostgresConnection } = require('../config/database');
const { solicitudSchema } = require('../models/validators');
const { RequestType, RequestStatus, BinStatus } = require('../models/enums');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

class RequestService {
    /**
     * Crear nueva solicitud
     */
    async createRequest(requestData) {
        // Validar datos
        const { error, value } = solicitudSchema.validate(requestData);
        if (error) {
            throw new ValidationError('Datos de solicitud inválidos', error.details);
        }

        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que el establecimiento existe y pertenece al solicitante
            const estQuery = `
                SELECT e.id, e.propietario_id, e.is_active
                FROM establecimientos e
                WHERE e.id = $1
            `;
            const estResult = await pgClient.query(estQuery, [value.establecimiento_id]);

            if (estResult.rows.length === 0) {
                throw new NotFoundError('Establecimiento no encontrado');
            }

            if (!estResult.rows[0].is_active) {
                throw new ValidationError('El establecimiento está inactivo');
            }

            // Si es solicitud de retiro, verificar que el bote existe y pertenece al establecimiento
            if (value.tipo === RequestType.RETIRO) {
                if (!value.bote_id) {
                    throw new ValidationError('El bote_id es requerido para solicitudes de retiro');
                }

                const boteQuery = `
                    SELECT id, establecimiento_id, status
                    FROM botes
                    WHERE id = $1 AND is_active = TRUE
                `;
                const boteResult = await pgClient.query(boteQuery, [value.bote_id]);

                if (boteResult.rows.length === 0) {
                    throw new NotFoundError('Bote no encontrado o inactivo');
                }

                if (boteResult.rows[0].establecimiento_id !== value.establecimiento_id) {
                    throw new ConflictError('El bote no pertenece a este establecimiento');
                }

                if (boteResult.rows[0].status !== BinStatus.ACTIVO) {
                    throw new ConflictError(
                        `No se puede solicitar retiro de un bote en estado: ${boteResult.rows[0].status}`
                    );
                }

                // Verificar que no existe otra solicitud de retiro pendiente o aprobada
                const existingQuery = `
                    SELECT id, status
                    FROM solicitudes
                    WHERE bote_id = $1 
                    AND tipo = 'retiro' 
                    AND status IN ('pendiente', 'aprobada')
                `;
                const existingResult = await pgClient.query(existingQuery, [value.bote_id]);

                if (existingResult.rows.length > 0) {
                    throw new ConflictError(
                        'Ya existe una solicitud de retiro activa para este bote'
                    );
                }
            }

            // Insertar solicitud
            const insertQuery = `
                INSERT INTO solicitudes (
                    establecimiento_id,
                    solicitante_id,
                    tipo,
                    descripcion,
                    datos_adicionales,
                    bote_id,
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;

            const result = await pgClient.query(insertQuery, [
                value.establecimiento_id,
                value.solicitante_id,
                value.tipo,
                value.descripcion,
                value.datos_adicionales || null,
                value.bote_id || null,
                RequestStatus.PENDIENTE
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
     * Aprobar solicitud (solo gestor de rutas)
     */
    async approveRequest(requestId, approverId, respuesta = null) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Obtener solicitud
            const getQuery = `
                SELECT s.*, b.status as bote_status
                FROM solicitudes s
                LEFT JOIN botes b ON s.bote_id = b.id
                WHERE s.id = $1
            `;
            const getResult = await pgClient.query(getQuery, [requestId]);

            if (getResult.rows.length === 0) {
                throw new NotFoundError('Solicitud no encontrada');
            }

            const solicitud = getResult.rows[0];

            if (solicitud.status !== RequestStatus.PENDIENTE) {
                throw new ConflictError(
                    `No se puede aprobar una solicitud en estado: ${solicitud.status}`
                );
            }

            // Actualizar solicitud
            const updateQuery = `
                UPDATE solicitudes
                SET 
                    status = $1,
                    aprobador_id = $2,
                    respuesta_admin = $3,
                    aprobada_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [
                RequestStatus.APROBADA,
                approverId,
                respuesta,
                requestId
            ]);

            // Si es solicitud de retiro, marcar bote como pendiente_retiro
            if (solicitud.tipo === RequestType.RETIRO && solicitud.bote_id) {
                const statusService = require('./statusService');
                await statusService.markAsPendingRetirement(
                    solicitud.bote_id,
                    requestId,
                    approverId,
                    { pgClient }
                );
            }

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
     * Completar solicitud
     */
    async completeRequest(requestId, userId, notas = null) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que la solicitud existe y está aprobada
            const getQuery = 'SELECT * FROM solicitudes WHERE id = $1';
            const getResult = await pgClient.query(getQuery, [requestId]);

            if (getResult.rows.length === 0) {
                throw new NotFoundError('Solicitud no encontrada');
            }

            const solicitud = getResult.rows[0];

            if (solicitud.status !== RequestStatus.APROBADA) {
                throw new ConflictError(
                    `Solo se pueden completar solicitudes aprobadas. Estado actual: ${solicitud.status}`
                );
            }

            // Actualizar solicitud
            const updateQuery = `
                UPDATE solicitudes
                SET 
                    status = $1,
                    respuesta_admin = COALESCE($2, respuesta_admin),
                    completada_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [
                RequestStatus.COMPLETADA,
                notas,
                requestId
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
     * Cancelar solicitud
     */
    async cancelRequest(requestId, userId, motivo = null) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que la solicitud existe
            const getQuery = 'SELECT * FROM solicitudes WHERE id = $1';
            const getResult = await pgClient.query(getQuery, [requestId]);

            if (getResult.rows.length === 0) {
                throw new NotFoundError('Solicitud no encontrada');
            }

            const solicitud = getResult.rows[0];

            if (solicitud.status === RequestStatus.COMPLETADA) {
                throw new ConflictError('No se puede cancelar una solicitud completada');
            }

            // Si era solicitud de retiro aprobada, revertir estado del bote
            if (solicitud.tipo === RequestType.RETIRO &&
                solicitud.status === RequestStatus.APROBADA &&
                solicitud.bote_id) {

                const revertQuery = `
                    UPDATE botes
                    SET status = $1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2 AND status = $3
                `;
                await pgClient.query(revertQuery, [
                    BinStatus.ACTIVO,
                    solicitud.bote_id,
                    BinStatus.PENDIENTE_RETIRO
                ]);
            }

            // Cancelar solicitud
            const updateQuery = `
                UPDATE solicitudes
                SET 
                    status = $1,
                    respuesta_admin = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [
                RequestStatus.CANCELADA,
                motivo || 'Solicitud cancelada',
                requestId
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
     * Listar solicitudes con filtros
     */
    async listRequests(filters = {}) {
        const {
            tipo = null,
            status = null,
            establecimientoId = null,
            solicitanteId = null,
            limit = 50,
            offset = 0
        } = filters;

        const pgClient = await getPostgresConnection();

        try {
            let conditions = [];
            let params = [];
            let paramCount = 1;

            if (tipo) {
                conditions.push(`s.tipo = $${paramCount}`);
                params.push(tipo);
                paramCount++;
            }

            if (status) {
                conditions.push(`s.status = $${paramCount}`);
                params.push(status);
                paramCount++;
            }

            if (establecimientoId) {
                conditions.push(`s.establecimiento_id = $${paramCount}`);
                params.push(establecimientoId);
                paramCount++;
            }

            if (solicitanteId) {
                conditions.push(`s.solicitante_id = $${paramCount}`);
                params.push(solicitanteId);
                paramCount++;
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            const query = `
                SELECT 
                    s.*,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion,
                    u1.first_name as solicitante_nombre,
                    u1.last_name as solicitante_apellido,
                    u2.first_name as aprobador_nombre,
                    u2.last_name as aprobador_apellido,
                    b.hardware_id as bote_hardware_id,
                    b.ultimo_porcentaje as bote_porcentaje
                FROM solicitudes s
                JOIN establecimientos e ON s.establecimiento_id = e.id
                JOIN users u1 ON s.solicitante_id = u1.id
                LEFT JOIN users u2 ON s.aprobador_id = u2.id
                LEFT JOIN botes b ON s.bote_id = b.id
                ${whereClause}
                ORDER BY s.created_at DESC
                LIMIT $${paramCount} OFFSET $${paramCount + 1}
            `;

            params.push(limit, offset);
            const result = await pgClient.query(query, params);

            // Contar total
            const countQuery = `
                SELECT COUNT(*) as total
                FROM solicitudes s
                ${whereClause}
            `;
            const countResult = await pgClient.query(countQuery, params.slice(0, -2));

            return {
                solicitudes: result.rows,
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
     * Obtener solicitud por ID
     */
    async getRequestById(id) {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT 
                    s.*,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion,
                    e.telefono_contacto as establecimiento_telefono,
                    u1.first_name as solicitante_nombre,
                    u1.last_name as solicitante_apellido,
                    u1.phone_number as solicitante_telefono,
                    u2.first_name as aprobador_nombre,
                    u2.last_name as aprobador_apellido,
                    b.hardware_id as bote_hardware_id,
                    b.status as bote_status,
                    b.ultimo_porcentaje as bote_porcentaje
                FROM solicitudes s
                JOIN establecimientos e ON s.establecimiento_id = e.id
                JOIN users u1 ON s.solicitante_id = u1.id
                LEFT JOIN users u2 ON s.aprobador_id = u2.id
                LEFT JOIN botes b ON s.bote_id = b.id
                WHERE s.id = $1
            `;
            const result = await pgClient.query(query, [id]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Solicitud no encontrada');
            }

            return result.rows[0];
        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener solicitudes pendientes por tipo
     */
    async getPendingRequests(tipo = null) {
        return this.listRequests({
            status: RequestStatus.PENDIENTE,
            tipo: tipo,
            limit: 100,
            offset: 0
        });
    }

    /**
     * Obtener estadísticas de solicitudes
     */
    async getRequestStats(filters = {}) {
        const { establecimientoId = null, days = 30 } = filters;

        const pgClient = await getPostgresConnection();

        try {
            let conditions = ['s.created_at >= NOW() - INTERVAL \'1 day\' * $1'];
            let params = [days];
            let paramCount = 2;

            if (establecimientoId) {
                conditions.push(`s.establecimiento_id = $${paramCount}`);
                params.push(establecimientoId);
                paramCount++;
            }

            const query = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE s.status = 'pendiente') as pendientes,
                    COUNT(*) FILTER (WHERE s.status = 'aprobada') as aprobadas,
                    COUNT(*) FILTER (WHERE s.status = 'completada') as completadas,
                    COUNT(*) FILTER (WHERE s.status = 'cancelada') as canceladas,
                    COUNT(*) FILTER (WHERE s.tipo = 'instalacion') as instalaciones,
                    COUNT(*) FILTER (WHERE s.tipo = 'retiro') as retiros,
                    COUNT(*) FILTER (WHERE s.tipo = 'recoleccion_manual') as recolecciones_manuales,
                    COUNT(*) FILTER (WHERE s.tipo = 'asistencia') as asistencias
                FROM solicitudes s
                WHERE ${conditions.join(' AND ')}
            `;

            const result = await pgClient.query(query, params);
            return result.rows[0];

        } finally {
            pgClient.release();
        }
    }
}

module.exports = new RequestService();
