/**
 * Servicio de gestión de reportes
 * Maneja reportes de daños, fallas de sensores, vandalismo y otros problemas
 */

const { getPostgresConnection } = require('../config/database');
const { reporteSchema } = require('../models/validators');
const { ReportType, RequestStatus } = require('../models/enums');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

class ReportService {
    /**
     * Crear nuevo reporte
     */
    async createReport(reportData) {
        // Validar datos
        const { error, value } = reporteSchema.validate(reportData);
        if (error) {
            throw new ValidationError('Datos de reporte inválidos', error.details);
        }

        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que el bote existe
            const boteQuery = `
                SELECT id, hardware_id, establecimiento_id, is_active
                FROM botes
                WHERE id = $1
            `;
            const boteResult = await pgClient.query(boteQuery, [value.bote_id]);

            if (boteResult.rows.length === 0) {
                throw new NotFoundError('Bote no encontrado');
            }

            // Insertar reporte
            const insertQuery = `
                INSERT INTO reportes (
                    bote_id,
                    reportero_id,
                    tipo,
                    titulo,
                    descripcion,
                    imagenes_urls,
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;

            const result = await pgClient.query(insertQuery, [
                value.bote_id,
                value.reportero_id,
                value.tipo,
                value.titulo,
                value.descripcion,
                value.imagenes_urls || null,
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
     * Atender reporte (marcar como en proceso o completado)
     */
    async attendReport(reportId, userId, resolucion = null, completar = false) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que el reporte existe
            const getQuery = 'SELECT * FROM reportes WHERE id = $1';
            const getResult = await pgClient.query(getQuery, [reportId]);

            if (getResult.rows.length === 0) {
                throw new NotFoundError('Reporte no encontrado');
            }

            const reporte = getResult.rows[0];

            if (reporte.status === RequestStatus.COMPLETADA) {
                throw new ValidationError('El reporte ya está completado');
            }

            // Actualizar reporte
            const status = completar ? RequestStatus.COMPLETADA : RequestStatus.APROBADA;
            const updateQuery = `
                UPDATE reportes
                SET 
                    status = $1,
                    atendido_por_id = $2,
                    resolucion = $3,
                    atendido_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [
                status,
                userId,
                resolucion,
                reportId
            ]);

            // Si el reporte es de falla de sensor o daño físico crítico, 
            // marcar bote como inactivo automáticamente
            if (completar &&
                (reporte.tipo === ReportType.SENSOR_FALLA ||
                    reporte.tipo === ReportType.DANO_FISICO)) {

                const binService = require('./binService');
                try {
                    await binService.deactivateBin(
                        reporte.bote_id,
                        `Desactivado por reporte: ${reporte.titulo}`,
                        userId
                    );
                } catch (err) {
                    // No fallar si el bote ya está inactivo
                    console.warn('No se pudo desactivar bote:', err.message);
                }
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
     * Listar reportes con filtros
     */
    async listReports(filters = {}) {
        const {
            tipo = null,
            status = null,
            boteId = null,
            reporteroId = null,
            limit = 50,
            offset = 0
        } = filters;

        const pgClient = await getPostgresConnection();

        try {
            let conditions = [];
            let params = [];
            let paramCount = 1;

            if (tipo) {
                conditions.push(`r.tipo = $${paramCount}`);
                params.push(tipo);
                paramCount++;
            }

            if (status) {
                conditions.push(`r.status = $${paramCount}`);
                params.push(status);
                paramCount++;
            }

            if (boteId) {
                conditions.push(`r.bote_id = $${paramCount}`);
                params.push(boteId);
                paramCount++;
            }

            if (reporteroId) {
                conditions.push(`r.reportero_id = $${paramCount}`);
                params.push(reporteroId);
                paramCount++;
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            const query = `
                SELECT 
                    r.*,
                    b.hardware_id as bote_hardware_id,
                    b.ultimo_porcentaje as bote_porcentaje,
                    b.status as bote_status,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion,
                    u1.first_name as reportero_nombre,
                    u1.last_name as reportero_apellido,
                    u2.first_name as atendido_por_nombre,
                    u2.last_name as atendido_por_apellido
                FROM reportes r
                JOIN botes b ON r.bote_id = b.id
                JOIN establecimientos e ON b.establecimiento_id = e.id
                JOIN users u1 ON r.reportero_id = u1.id
                LEFT JOIN users u2 ON r.atendido_por_id = u2.id
                ${whereClause}
                ORDER BY r.created_at DESC
                LIMIT $${paramCount} OFFSET $${paramCount + 1}
            `;

            params.push(limit, offset);
            const result = await pgClient.query(query, params);

            // Contar total
            const countQuery = `
                SELECT COUNT(*) as total
                FROM reportes r
                ${whereClause}
            `;
            const countResult = await pgClient.query(countQuery, params.slice(0, -2));

            return {
                reportes: result.rows,
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
     * Obtener reporte por ID
     */
    async getReportById(id) {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT 
                    r.*,
                    b.hardware_id as bote_hardware_id,
                    b.ultimo_porcentaje as bote_porcentaje,
                    b.status as bote_status,
                    b.capacidad_litros as bote_capacidad,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion,
                    e.telefono_contacto as establecimiento_telefono,
                    u1.first_name as reportero_nombre,
                    u1.last_name as reportero_apellido,
                    u1.phone_number as reportero_telefono,
                    u2.first_name as atendido_por_nombre,
                    u2.last_name as atendido_por_apellido
                FROM reportes r
                JOIN botes b ON r.bote_id = b.id
                JOIN establecimientos e ON b.establecimiento_id = e.id
                JOIN users u1 ON r.reportero_id = u1.id
                LEFT JOIN users u2 ON r.atendido_por_id = u2.id
                WHERE r.id = $1
            `;
            const result = await pgClient.query(query, [id]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Reporte no encontrado');
            }

            return result.rows[0];
        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener reportes pendientes
     */
    async getPendingReports() {
        return this.listReports({
            status: RequestStatus.PENDIENTE,
            limit: 100,
            offset: 0
        });
    }

    /**
     * Obtener reportes críticos (sensor_falla, dano_fisico, vandalismo)
     */
    async getCriticalReports() {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT 
                    r.*,
                    b.hardware_id as bote_hardware_id,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion
                FROM reportes r
                JOIN botes b ON r.bote_id = b.id
                JOIN establecimientos e ON b.establecimiento_id = e.id
                WHERE r.status = 'pendiente'
                AND r.tipo IN ('sensor_falla', 'dano_fisico', 'vandalismo')
                ORDER BY r.created_at DESC
                LIMIT 50
            `;
            const result = await pgClient.query(query);

            return result.rows;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener estadísticas de reportes
     */
    async getReportStats(filters = {}) {
        const { boteId = null, days = 30 } = filters;

        const pgClient = await getPostgresConnection();

        try {
            let conditions = ['r.created_at >= NOW() - INTERVAL \'1 day\' * $1'];
            let params = [days];
            let paramCount = 2;

            if (boteId) {
                conditions.push(`r.bote_id = $${paramCount}`);
                params.push(boteId);
                paramCount++;
            }

            const query = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE r.status = 'pendiente') as pendientes,
                    COUNT(*) FILTER (WHERE r.status = 'aprobada') as en_atencion,
                    COUNT(*) FILTER (WHERE r.status = 'completada') as completados,
                    COUNT(*) FILTER (WHERE r.tipo = 'dano_fisico') as danos_fisicos,
                    COUNT(*) FILTER (WHERE r.tipo = 'sensor_falla') as fallas_sensor,
                    COUNT(*) FILTER (WHERE r.tipo = 'vandalismo') as vandalismos,
                    COUNT(*) FILTER (WHERE r.tipo = 'otro') as otros,
                    AVG(EXTRACT(EPOCH FROM (r.atendido_at - r.created_at))/3600)::NUMERIC(10,2) 
                        FILTER (WHERE r.atendido_at IS NOT NULL) as tiempo_promedio_atencion_horas
                FROM reportes r
                WHERE ${conditions.join(' AND ')}
            `;

            const result = await pgClient.query(query, params);
            return result.rows[0];

        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener reportes por bote
     */
    async getReportsByBin(boteId, limit = 20) {
        return this.listReports({
            boteId: boteId,
            limit: limit,
            offset: 0
        });
    }
}

module.exports = new ReportService();