/**
 * Servicio de recolección
 * Maneja la confirmación de recolección física y actualización de estados
 */

const { getPostgresConnection } = require('../config/database');
const { RouteStatus, BinStatus } = require('../models/enums');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');
const statusService = require('./statusService');

class CollectionService {
    /**
     * Marcar punto de ruta como completado
     */
    async markPointAsCompleted(puntoId, recolectorId, porcentajeRecolectado = null, notas = null) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Obtener punto y ruta
            const puntoQuery = `
                SELECT 
                    p.*,
                    r.recolector_asignado_id,
                    r.status as ruta_status,
                    b.status as bote_status
                FROM puntos_ruta p
                JOIN rutas r ON p.ruta_id = r.id
                JOIN botes b ON p.bote_id = b.id
                WHERE p.id = $1
            `;
            const puntoResult = await pgClient.query(puntoQuery, [puntoId]);

            if (puntoResult.rows.length === 0) {
                throw new NotFoundError('Punto de ruta no encontrado');
            }

            const punto = puntoResult.rows[0];

            // Validar que el recolector es el asignado
            if (punto.recolector_asignado_id !== recolectorId) {
                throw new ValidationError('Este punto no está asignado a este recolector');
            }

            // Validar que la ruta está en progreso
            if (punto.ruta_status !== RouteStatus.EN_PROGRESO) {
                throw new ConflictError(
                    `La ruta debe estar en progreso. Estado actual: ${punto.ruta_status}`
                );
            }

            // Validar que el punto no está ya completado
            if (punto.completado) {
                throw new ConflictError('Este punto ya fue marcado como completado');
            }

            // Marcar punto como completado
            const updatePuntoQuery = `
                UPDATE puntos_ruta
                SET 
                    completado = TRUE,
                    porcentaje_al_recolectar = $1,
                    notas = COALESCE($2, notas),
                    completado_at = CURRENT_TIMESTAMP
                WHERE id = $3
                RETURNING *
            `;

            const puntoUpdated = await pgClient.query(updatePuntoQuery, [
                porcentajeRecolectado,
                notas,
                puntoId
            ]);

            // Si el bote está en estado activo, resetear su porcentaje
            if (punto.bote_status === BinStatus.ACTIVO) {
                const updateBoteQuery = `
                    UPDATE botes
                    SET 
                        ultimo_porcentaje = 0,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `;
                await pgClient.query(updateBoteQuery, [punto.bote_id]);

                // Registrar en historial
                const historialQuery = `
                    INSERT INTO historial_estados_bote (
                        bote_id,
                        usuario_id,
                        estado_anterior,
                        estado_nuevo,
                        porcentaje_llenado,
                        motivo
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                `;
                await pgClient.query(historialQuery, [
                    punto.bote_id,
                    recolectorId,
                    BinStatus.ACTIVO,
                    BinStatus.ACTIVO,
                    0,
                    `Bote recolectado en ruta. Porcentaje anterior: ${porcentajeRecolectado || 'N/A'}%`
                ]);
            }

            await pgClient.query('COMMIT');
            return puntoUpdated.rows[0];

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Confirmar recolección física de bote pendiente de retiro
     */
    async confirmBinRetirement(boteId, recolectorId, notas = null) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que el bote está pendiente de retiro
            const boteQuery = `
                SELECT id, status, establecimiento_id
                FROM botes
                WHERE id = $1 AND is_active = TRUE
            `;
            const boteResult = await pgClient.query(boteQuery, [boteId]);

            if (boteResult.rows.length === 0) {
                throw new NotFoundError('Bote no encontrado o inactivo');
            }

            const bote = boteResult.rows[0];

            if (bote.status !== BinStatus.PENDIENTE_RETIRO) {
                throw new ConflictError(
                    `El bote debe estar en estado pendiente_retiro. Estado actual: ${bote.status}`
                );
            }

            // Marcar bote como retirado
            await statusService.confirmCollection(boteId, recolectorId, { pgClient });

            // Buscar y completar solicitud de retiro asociada
            const solicitudQuery = `
                UPDATE solicitudes
                SET 
                    status = 'completada',
                    respuesta_admin = $1,
                    completada_at = CURRENT_TIMESTAMP
                WHERE bote_id = $2 
                AND tipo = 'retiro' 
                AND status = 'aprobada'
                RETURNING *
            `;
            await pgClient.query(solicitudQuery, [
                notas || 'Recolección física confirmada',
                boteId
            ]);

            await pgClient.query('COMMIT');

            return {
                success: true,
                bote_id: boteId,
                mensaje: 'Recolección confirmada. Bote marcado como retirado'
            };

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Completar ruta completa (marcar todos los puntos)
     */
    async completeRoute(rutaId, recolectorId) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar ruta
            const rutaQuery = `
                SELECT * FROM rutas 
                WHERE id = $1 
                AND recolector_asignado_id = $2
            `;
            const rutaResult = await pgClient.query(rutaQuery, [rutaId, recolectorId]);

            if (rutaResult.rows.length === 0) {
                throw new NotFoundError('Ruta no encontrada o no asignada a este recolector');
            }

            const ruta = rutaResult.rows[0];

            if (ruta.status !== RouteStatus.EN_PROGRESO) {
                throw new ConflictError(
                    `La ruta debe estar en progreso. Estado actual: ${ruta.status}`
                );
            }

            // Verificar que todos los puntos están completados
            const puntosQuery = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE completado = TRUE) as completados
                FROM puntos_ruta
                WHERE ruta_id = $1
            `;
            const puntosResult = await pgClient.query(puntosQuery, [rutaId]);
            const { total, completados } = puntosResult.rows[0];

            if (parseInt(completados) < parseInt(total)) {
                throw new ValidationError(
                    `No todos los puntos están completados. Completados: ${completados}/${total}`
                );
            }

            // Marcar ruta como completada
            const updateQuery = `
                UPDATE rutas
                SET 
                    status = $1,
                    completada_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [
                RouteStatus.COMPLETADA,
                rutaId
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
     * Marcar múltiples puntos como completados
     */
    async bulkCompletePoints(puntosData, recolectorId) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            const results = [];
            const errors = [];

            for (const data of puntosData) {
                try {
                    const result = await this.markPointAsCompleted(
                        data.punto_id,
                        recolectorId,
                        data.porcentaje_recolectado || null,
                        data.notas || null
                    );
                    results.push(result);
                } catch (error) {
                    errors.push({
                        punto_id: data.punto_id,
                        error: error.message
                    });
                }
            }

            if (errors.length > 0 && results.length === 0) {
                throw new ValidationError('No se pudo completar ningún punto', errors);
            }

            await pgClient.query('COMMIT');

            return {
                completados: results,
                errores: errors,
                total: puntosData.length,
                exitosos: results.length,
                fallidos: errors.length
            };

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener progreso de ruta
     */
    async getRouteProgress(rutaId) {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT 
                    r.id,
                    r.nombre,
                    r.status,
                    r.total_puntos,
                    r.puntos_completados,
                    r.iniciada_at,
                    ROUND((r.puntos_completados::NUMERIC / NULLIF(r.total_puntos, 0)) * 100, 2) as porcentaje_completado,
                    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r.iniciada_at))/3600 as horas_transcurridas
                FROM rutas r
                WHERE r.id = $1
            `;
            const result = await pgClient.query(query, [rutaId]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Ruta no encontrada');
            }

            const ruta = result.rows[0];

            // Obtener puntos pendientes y completados
            const puntosQuery = `
                SELECT 
                    p.id,
                    p.orden,
                    p.completado,
                    p.completado_at,
                    b.hardware_id,
                    b.ultimo_porcentaje,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion
                FROM puntos_ruta p
                JOIN botes b ON p.bote_id = b.id
                JOIN establecimientos e ON b.establecimiento_id = e.id
                WHERE p.ruta_id = $1
                ORDER BY p.orden ASC
            `;
            const puntosResult = await pgClient.query(puntosQuery, [rutaId]);

            return {
                ...ruta,
                puntos: puntosResult.rows,
                puntos_pendientes: puntosResult.rows.filter(p => !p.completado),
                puntos_completados: puntosResult.rows.filter(p => p.completado)
            };

        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener estadísticas de recolección
     */
    async getCollectionStats(filters = {}) {
        const { recolectorId = null, days = 30 } = filters;

        const pgClient = await getPostgresConnection();

        try {
            let conditions = ['r.completada_at >= NOW() - INTERVAL \'1 day\' * $1'];
            let params = [days];
            let paramCount = 2;

            if (recolectorId) {
                conditions.push(`r.recolector_asignado_id = $${paramCount}`);
                params.push(recolectorId);
                paramCount++;
            }

            const query = `
                SELECT 
                    COUNT(*) as rutas_completadas,
                    SUM(r.total_puntos) as total_puntos_recolectados,
                    AVG(EXTRACT(EPOCH FROM (r.completada_at - r.iniciada_at))/3600)::NUMERIC(10,2) as tiempo_promedio_horas,
                    COUNT(DISTINCT r.sector_id) as sectores_atendidos
                FROM rutas r
                WHERE ${conditions.join(' AND ')}
                AND r.status = 'completada'
            `;

            const result = await pgClient.query(query, params);

            // Botes retirados en el período
            const retiradosQuery = `
                SELECT COUNT(*) as botes_retirados
                FROM botes
                WHERE status = 'retirado'
                AND retirado_at >= NOW() - INTERVAL '1 day' * $1
            `;
            const retiradosResult = await pgClient.query(retiradosQuery, [days]);

            return {
                ...result.rows[0],
                botes_retirados: parseInt(retiradosResult.rows[0].botes_retirados),
                periodo_dias: days
            };

        } finally {
            pgClient.release();
        }
    }
}

module.exports = new CollectionService();
