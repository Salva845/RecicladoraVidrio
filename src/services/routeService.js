/**
 * Servicio de gestión de rutas de recolección
 * Maneja creación, asignación y optimización de rutas
 */

const { getPostgresConnection } = require('../config/database');
const { rutaSchema, puntoRutaSchema } = require('../models/validators');
const { RouteStatus, BinStatus } = require('../models/enums');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

class RouteService {
    /**
     * Crear nueva ruta
     */
    async createRoute(routeData) {
        // Validar datos básicos
        const { error, value } = rutaSchema.validate(routeData);
        if (error) {
            throw new ValidationError('Datos de ruta inválidos', error.details);
        }

        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar que el sector existe
            const sectorQuery = 'SELECT id FROM sectores WHERE id = $1 AND is_active = TRUE';
            const sectorResult = await pgClient.query(sectorQuery, [value.sector_id]);

            if (sectorResult.rows.length === 0) {
                throw new NotFoundError('Sector no encontrado o inactivo');
            }

            // Insertar ruta
            const insertQuery = `
                INSERT INTO rutas (
                    sector_id,
                    creador_id,
                    nombre,
                    descripcion,
                    fecha_planificada,
                    hora_inicio,
                    hora_fin,
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `;

            const result = await pgClient.query(insertQuery, [
                value.sector_id,
                value.creador_id,
                value.nombre,
                value.descripcion || null,
                value.fecha_planificada || null,
                value.hora_inicio || null,
                value.hora_fin || null,
                RouteStatus.PLANIFICADA
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
     * Generar ruta automáticamente por sector
     * Incluye botes con porcentaje >= nivelMinimo
     */
    async generateRoute(sectorId, creadorId, config = {}) {
        const {
            nombre = null,
            nivelMinimo = 60,
            maxPuntos = 50,
            tipoVidrio = null,
            fechaPlanificada = null
        } = config;

        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar sector
            const sectorQuery = `
                SELECT id, nombre, codigo 
                FROM sectores 
                WHERE id = $1 AND is_active = TRUE
            `;
            const sectorResult = await pgClient.query(sectorQuery, [sectorId]);

            if (sectorResult.rows.length === 0) {
                throw new NotFoundError('Sector no encontrado');
            }

            const sector = sectorResult.rows[0];

            // Buscar botes elegibles
            let boteConditions = [
                'b.sector_id = $1',
                'b.is_active = TRUE',
                'b.status = $2',
                'b.ultimo_porcentaje >= $3'
            ];
            let boteParams = [sectorId, BinStatus.ACTIVO, nivelMinimo];
            let paramCount = 4;

            if (tipoVidrio) {
                boteConditions.push(`b.tipo_vidrio = $${paramCount}`);
                boteParams.push(tipoVidrio);
                paramCount++;
            }

            const botesQuery = `
                SELECT 
                    b.id,
                    b.hardware_id,
                    b.ultimo_porcentaje,
                    b.tipo_vidrio,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion,
                    e.ubicacion
                FROM botes b
                JOIN establecimientos e ON b.establecimiento_id = e.id
                WHERE ${boteConditions.join(' AND ')}
                ORDER BY b.ultimo_porcentaje DESC, b.ultima_lectura ASC
                LIMIT $${paramCount}
            `;
            boteParams.push(maxPuntos);

            const botesResult = await pgClient.query(botesQuery, boteParams);

            if (botesResult.rows.length === 0) {
                throw new ValidationError('No hay botes elegibles para crear ruta en este sector');
            }

            // Crear ruta
            const nombreRuta = nombre ||
                `Ruta ${sector.codigo} - ${new Date().toISOString().split('T')[0]}`;

            const rutaQuery = `
                INSERT INTO rutas (
                    sector_id,
                    creador_id,
                    nombre,
                    descripcion,
                    fecha_planificada,
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;

            const rutaResult = await pgClient.query(rutaQuery, [
                sectorId,
                creadorId,
                nombreRuta,
                `Ruta generada automáticamente con ${botesResult.rows.length} puntos`,
                fechaPlanificada || new Date().toISOString().split('T')[0],
                RouteStatus.PLANIFICADA
            ]);

            const ruta = rutaResult.rows[0];

            // Agregar puntos a la ruta
            const puntos = [];
            for (let i = 0; i < botesResult.rows.length; i++) {
                const bote = botesResult.rows[i];
                const puntoQuery = `
                    INSERT INTO puntos_ruta (
                        ruta_id,
                        bote_id,
                        orden,
                        notas
                    ) VALUES ($1, $2, $3, $4)
                    RETURNING *
                `;

                const puntoResult = await pgClient.query(puntoQuery, [
                    ruta.id,
                    bote.id,
                    i + 1,
                    `${bote.establecimiento_nombre} - ${bote.ultimo_porcentaje}%`
                ]);

                puntos.push({
                    ...puntoResult.rows[0],
                    bote: bote
                });
            }

            await pgClient.query('COMMIT');

            return {
                ...ruta,
                puntos: puntos,
                total_puntos: puntos.length
            };

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Agregar punto a ruta existente
     */
    async addPointToRoute(rutaId, boteId, notas = null) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar ruta
            const rutaQuery = 'SELECT * FROM rutas WHERE id = $1';
            const rutaResult = await pgClient.query(rutaQuery, [rutaId]);

            if (rutaResult.rows.length === 0) {
                throw new NotFoundError('Ruta no encontrada');
            }

            const ruta = rutaResult.rows[0];

            if (ruta.status === RouteStatus.COMPLETADA || ruta.status === RouteStatus.CANCELADA) {
                throw new ConflictError(`No se pueden agregar puntos a una ruta ${ruta.status}`);
            }

            // Verificar que el bote existe y está activo
            const boteQuery = `
                SELECT id, sector_id, status 
                FROM botes 
                WHERE id = $1 AND is_active = TRUE
            `;
            const boteResult = await pgClient.query(boteQuery, [boteId]);

            if (boteResult.rows.length === 0) {
                throw new NotFoundError('Bote no encontrado o inactivo');
            }

            // Verificar que el bote pertenece al mismo sector
            if (boteResult.rows[0].sector_id !== ruta.sector_id) {
                throw new ConflictError('El bote no pertenece al sector de la ruta');
            }

            // Verificar que el bote no está ya en la ruta
            const existeQuery = `
                SELECT id FROM puntos_ruta 
                WHERE ruta_id = $1 AND bote_id = $2
            `;
            const existeResult = await pgClient.query(existeQuery, [rutaId, boteId]);

            if (existeResult.rows.length > 0) {
                throw new ConflictError('El bote ya está incluido en esta ruta');
            }

            // Obtener el siguiente orden
            const ordenQuery = `
                SELECT COALESCE(MAX(orden), 0) + 1 as siguiente_orden
                FROM puntos_ruta
                WHERE ruta_id = $1
            `;
            const ordenResult = await pgClient.query(ordenQuery, [rutaId]);
            const orden = ordenResult.rows[0].siguiente_orden;

            // Insertar punto
            const insertQuery = `
                INSERT INTO puntos_ruta (
                    ruta_id,
                    bote_id,
                    orden,
                    notas
                ) VALUES ($1, $2, $3, $4)
                RETURNING *
            `;

            const result = await pgClient.query(insertQuery, [rutaId, boteId, orden, notas]);

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
     * Asignar ruta a recolector
     */
    async assignRoute(rutaId, recolectorId) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar ruta
            const rutaQuery = 'SELECT * FROM rutas WHERE id = $1';
            const rutaResult = await pgClient.query(rutaQuery, [rutaId]);

            if (rutaResult.rows.length === 0) {
                throw new NotFoundError('Ruta no encontrada');
            }

            const ruta = rutaResult.rows[0];

            if (ruta.status !== RouteStatus.PLANIFICADA) {
                throw new ConflictError(
                    `Solo se pueden asignar rutas planificadas. Estado actual: ${ruta.status}`
                );
            }

            // Verificar que el recolector existe
            const userQuery = `
                SELECT id, role 
                FROM users 
                WHERE id = $1 AND is_active = TRUE
            `;
            const userResult = await pgClient.query(userQuery, [recolectorId]);

            if (userResult.rows.length === 0) {
                throw new NotFoundError('Recolector no encontrado o inactivo');
            }

            // Actualizar ruta
            const updateQuery = `
                UPDATE rutas
                SET 
                    recolector_asignado_id = $1,
                    status = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [
                recolectorId,
                RouteStatus.ASIGNADA,
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
     * Iniciar ruta (cambiar a en_progreso)
     */
    async startRoute(rutaId, recolectorId) {
        const pgClient = await getPostgresConnection();

        try {
            const updateQuery = `
                UPDATE rutas
                SET 
                    status = $1,
                    iniciada_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 
                AND recolector_asignado_id = $3
                AND status = $4
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [
                RouteStatus.EN_PROGRESO,
                rutaId,
                recolectorId,
                RouteStatus.ASIGNADA
            ]);

            if (result.rows.length === 0) {
                throw new ConflictError('No se puede iniciar la ruta. Verifique estado y asignación');
            }

            return result.rows[0];

        } finally {
            pgClient.release();
        }
    }

    /**
     * Cancelar ruta
     */
    async cancelRoute(rutaId, userId, motivo = null) {
        const pgClient = await getPostgresConnection();

        try {
            const updateQuery = `
                UPDATE rutas
                SET 
                    status = $1,
                    descripcion = COALESCE($2, descripcion),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3 
                AND status IN ($4, $5)
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [
                RouteStatus.CANCELADA,
                motivo,
                rutaId,
                RouteStatus.PLANIFICADA,
                RouteStatus.ASIGNADA
            ]);

            if (result.rows.length === 0) {
                throw new ConflictError(
                    'Solo se pueden cancelar rutas planificadas o asignadas'
                );
            }

            return result.rows[0];

        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener ruta con detalles completos
     */
    async getRouteById(id) {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT 
                    r.*,
                    s.nombre as sector_nombre,
                    s.codigo as sector_codigo,
                    u1.first_name as creador_nombre,
                    u1.last_name as creador_apellido,
                    u2.first_name as recolector_nombre,
                    u2.last_name as recolector_apellido,
                    u2.phone_number as recolector_telefono
                FROM rutas r
                JOIN sectores s ON r.sector_id = s.id
                JOIN users u1 ON r.creador_id = u1.id
                LEFT JOIN users u2 ON r.recolector_asignado_id = u2.id
                WHERE r.id = $1
            `;
            const result = await pgClient.query(query, [id]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Ruta no encontrada');
            }

            const ruta = result.rows[0];

            // Obtener puntos de la ruta
            const puntosQuery = `
                SELECT 
                    p.*,
                    b.hardware_id,
                    b.ultimo_porcentaje,
                    b.tipo_vidrio,
                    b.status as bote_status,
                    e.nombre as establecimiento_nombre,
                    e.direccion as establecimiento_direccion,
                    e.telefono_contacto as establecimiento_telefono
                FROM puntos_ruta p
                JOIN botes b ON p.bote_id = b.id
                JOIN establecimientos e ON b.establecimiento_id = e.id
                WHERE p.ruta_id = $1
                ORDER BY p.orden ASC
            `;
            const puntosResult = await pgClient.query(puntosQuery, [id]);

            return {
                ...ruta,
                puntos: puntosResult.rows
            };

        } finally {
            pgClient.release();
        }
    }

    /**
     * Listar rutas con filtros
     */
    async listRoutes(filters = {}) {
        const {
            sectorId = null,
            status = null,
            recolectorId = null,
            fechaDesde = null,
            fechaHasta = null,
            limit = 50,
            offset = 0
        } = filters;

        const pgClient = await getPostgresConnection();

        try {
            let conditions = [];
            let params = [];
            let paramCount = 1;

            if (sectorId) {
                conditions.push(`r.sector_id = $${paramCount}`);
                params.push(sectorId);
                paramCount++;
            }

            if (status) {
                conditions.push(`r.status = $${paramCount}`);
                params.push(status);
                paramCount++;
            }

            if (recolectorId) {
                conditions.push(`r.recolector_asignado_id = $${paramCount}`);
                params.push(recolectorId);
                paramCount++;
            }

            if (fechaDesde) {
                conditions.push(`r.fecha_planificada >= $${paramCount}`);
                params.push(fechaDesde);
                paramCount++;
            }

            if (fechaHasta) {
                conditions.push(`r.fecha_planificada <= $${paramCount}`);
                params.push(fechaHasta);
                paramCount++;
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            const query = `
                SELECT 
                    r.*,
                    s.nombre as sector_nombre,
                    s.codigo as sector_codigo,
                    u1.first_name as creador_nombre,
                    u2.first_name as recolector_nombre
                FROM rutas r
                JOIN sectores s ON r.sector_id = s.id
                JOIN users u1 ON r.creador_id = u1.id
                LEFT JOIN users u2 ON r.recolector_asignado_id = u2.id
                ${whereClause}
                ORDER BY r.fecha_planificada DESC, r.created_at DESC
                LIMIT $${paramCount} OFFSET $${paramCount + 1}
            `;

            params.push(limit, offset);
            const result = await pgClient.query(query, params);

            // Contar total
            const countQuery = `
                SELECT COUNT(*) as total
                FROM rutas r
                ${whereClause}
            `;
            const countResult = await pgClient.query(countQuery, params.slice(0, -2));

            return {
                rutas: result.rows,
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
     * Obtener rutas disponibles (planificadas o asignadas)
     */
    async getAvailableRoutes(sectorId = null) {
        return this.listRoutes({
            sectorId: sectorId,
            status: null,
            limit: 100,
            offset: 0
        });
    }
}

module.exports = new RouteService();