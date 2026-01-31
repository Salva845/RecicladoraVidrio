/**
 * Servicio de gestión CRUD de establecimientos
 */

const { getPostgresConnection } = require('../config/database');
const { establecimientoSchema } = require('../models/validators');
const { UserRole } = require('../models/enums');
const { ValidationError, NotFoundError, UnauthorizedError } = require('../middleware/errorHandler');

class EstablecimientoService {
    /**
     * Crear establecimiento
     */
    async createEstablecimiento(establecimientoData, requester) {
        const { error, value } = establecimientoSchema.validate(establecimientoData);
        if (error) {
            throw new ValidationError('Datos de establecimiento inválidos', error.details);
        }

        if (!requester) {
            throw new UnauthorizedError('Usuario no autenticado');
        }

        const isDueno = requester.role === UserRole.DUENO_ESTABLECIMIENTO;
        const isGestor = requester.role === UserRole.GESTOR_RUTAS;

        if (!isDueno && !isGestor) {
            throw new UnauthorizedError('No tienes permisos para crear establecimientos');
        }

        if (isDueno && value.propietario_id && value.propietario_id !== requester.id) {
            throw new UnauthorizedError('Solo puedes crear establecimientos para tu propio usuario');
        }

        const propietarioId = value.propietario_id || (isDueno ? requester.id : null);

        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            const sectorQuery = 'SELECT id FROM sectores WHERE id = $1 AND is_active = TRUE';
            const sectorResult = await pgClient.query(sectorQuery, [value.sector_id]);

            if (sectorResult.rows.length === 0) {
                throw new ValidationError('Sector no encontrado o inactivo');
            }

            if (propietarioId) {
                const ownerQuery = 'SELECT id, role, is_active FROM users WHERE id = $1';
                const ownerResult = await pgClient.query(ownerQuery, [propietarioId]);

                if (ownerResult.rows.length === 0 || !ownerResult.rows[0].is_active) {
                    throw new ValidationError('Propietario no encontrado o inactivo');
                }

                if (ownerResult.rows[0].role !== UserRole.DUENO_ESTABLECIMIENTO) {
                    throw new ValidationError('El propietario debe tener rol dueno_establecimiento');
                }
            }

            const insertQuery = `
                INSERT INTO establecimientos (
                    sector_id,
                    propietario_id,
                    nombre,
                    tipo,
                    direccion,
                    referencias,
                    telefono_contacto,
                    email_contacto,
                    is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `;

            const result = await pgClient.query(insertQuery, [
                value.sector_id,
                propietarioId,
                value.nombre,
                value.tipo || null,
                value.direccion,
                value.referencias || null,
                value.telefono_contacto || null,
                value.email_contacto || null,
                value.is_active ?? true
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
     * Listar establecimientos
     */
    async listEstablecimientos(filters = {}, requester) {
        if (!requester) {
            throw new UnauthorizedError('Usuario no autenticado');
        }

        const isDueno = requester.role === UserRole.DUENO_ESTABLECIMIENTO;
        const isGestor = requester.role === UserRole.GESTOR_RUTAS;

        if (!isDueno && !isGestor) {
            throw new UnauthorizedError('No tienes permisos para ver establecimientos');
        }

        const {
            sectorId = null,
            propietarioId = null,
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
                conditions.push(`e.is_active = $${paramCount}`);
                params.push(isActive);
                paramCount++;
            }

            if (sectorId) {
                conditions.push(`e.sector_id = $${paramCount}`);
                params.push(sectorId);
                paramCount++;
            }

            if (isDueno) {
                conditions.push(`e.propietario_id = $${paramCount}`);
                params.push(requester.id);
                paramCount++;
            } else if (propietarioId) {
                conditions.push(`e.propietario_id = $${paramCount}`);
                params.push(propietarioId);
                paramCount++;
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            const query = `
                SELECT 
                    e.*,
                    s.nombre as sector_nombre,
                    s.codigo as sector_codigo,
                    u.first_name as propietario_nombre,
                    u.last_name as propietario_apellido
                FROM establecimientos e
                JOIN sectores s ON e.sector_id = s.id
                LEFT JOIN users u ON e.propietario_id = u.id
                ${whereClause}
                ORDER BY e.created_at DESC
                LIMIT $${paramCount} OFFSET $${paramCount + 1}
            `;

            params.push(limit, offset);
            const result = await pgClient.query(query, params);

            const countQuery = `
                SELECT COUNT(*) as total
                FROM establecimientos e
                ${whereClause}
            `;
            const countResult = await pgClient.query(countQuery, params.slice(0, -2));

            return {
                establecimientos: result.rows,
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
     * Obtener establecimiento por ID
     */
    async getEstablecimientoById(id, requester) {
        if (!requester) {
            throw new UnauthorizedError('Usuario no autenticado');
        }

        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT 
                    e.*,
                    s.nombre as sector_nombre,
                    s.codigo as sector_codigo,
                    u.first_name as propietario_nombre,
                    u.last_name as propietario_apellido
                FROM establecimientos e
                JOIN sectores s ON e.sector_id = s.id
                LEFT JOIN users u ON e.propietario_id = u.id
                WHERE e.id = $1
            `;
            const result = await pgClient.query(query, [id]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Establecimiento no encontrado');
            }

            const establecimiento = result.rows[0];

            if (requester.role === UserRole.DUENO_ESTABLECIMIENTO &&
                establecimiento.propietario_id !== requester.id) {
                throw new UnauthorizedError('No tienes permisos para ver este establecimiento');
            }

            return establecimiento;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Actualizar establecimiento
     */
    async updateEstablecimiento(id, updateData, requester) {
        if (!requester) {
            throw new UnauthorizedError('Usuario no autenticado');
        }

        const isDueno = requester.role === UserRole.DUENO_ESTABLECIMIENTO;
        const isGestor = requester.role === UserRole.GESTOR_RUTAS;

        if (!isDueno && !isGestor) {
            throw new UnauthorizedError('No tienes permisos para actualizar establecimientos');
        }

        const allowedFields = isGestor
            ? [
                'sector_id',
                'propietario_id',
                'nombre',
                'tipo',
                'direccion',
                'referencias',
                'telefono_contacto',
                'email_contacto',
                'is_active'
            ]
            : [
                'nombre',
                'tipo',
                'direccion',
                'referencias',
                'telefono_contacto',
                'email_contacto'
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

        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            const existingQuery = 'SELECT id, propietario_id FROM establecimientos WHERE id = $1';
            const existingResult = await pgClient.query(existingQuery, [id]);

            if (existingResult.rows.length === 0) {
                throw new NotFoundError('Establecimiento no encontrado');
            }

            if (isDueno && existingResult.rows[0].propietario_id !== requester.id) {
                throw new UnauthorizedError('No tienes permisos para actualizar este establecimiento');
            }

            const updateQuery = `
                UPDATE establecimientos
                SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramCount}
                RETURNING *
            `;

            values.push(id);
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
     * Activar o desactivar establecimiento
     */
    async setEstablecimientoActive(id, isActive, adminId) {
        if (!adminId) {
            throw new UnauthorizedError('Usuario no autenticado');
        }

        const pgClient = await getPostgresConnection();

        try {
            const updateQuery = `
                UPDATE establecimientos
                SET is_active = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `;
            const result = await pgClient.query(updateQuery, [isActive, id]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Establecimiento no encontrado');
            }

            return result.rows[0];
        } finally {
            pgClient.release();
        }
    }
}

module.exports = new EstablecimientoService();
