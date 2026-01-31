/**
 * Servicio de autenticación y autorización
 * Maneja registro, login y validación de usuarios
 */

const { getPostgresConnection } = require('../config/database');
const { userSchema } = require('../models/validators');
const { UserRole } = require('../models/enums');
const { ValidationError, NotFoundError, UnauthorizedError } = require('../middleware/errorHandler');
const crypto = require('crypto');

class AuthService {
    /**
     * Registrar nuevo usuario
     * @param {Object} userData - Datos del usuario
     * @param {number} userData.telegram_id - ID único de Telegram
     * @param {string} userData.role - Rol del usuario
     * @param {string} userData.first_name - Nombre
     * @param {string} [userData.last_name] - Apellido
     * @param {string} [userData.username] - Username de Telegram
     * @param {string} [userData.phone_number] - Teléfono
     * @param {string} [userData.email] - Email
     */

    /**
 * Registrar nuevo usuario
 * SOLO puede ser llamado por:
 * - El primer usuario (bootstrap) que debe ser gestor_rutas
 * - Un gestor de rutas existente (para crear otros usuarios)
 */
    async registerUser(userData, creatorId = null) {
        // Validar datos
        const { error, value } = userSchema.validate(userData);
        if (error) {
            throw new ValidationError('Datos de usuario inválidos', error.details);
        }

        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Verificar si ya existe algún usuario en el sistema
            const countQuery = 'SELECT COUNT(*) as total FROM users';
            const countResult = await pgClient.query(countQuery);
            const userCount = parseInt(countResult.rows[0].total);

            // Si es el PRIMER usuario del sistema
            if (userCount === 0) {
                // DEBE ser gestor_rutas
                if (value.role !== UserRole.GESTOR_RUTAS) {
                    throw new ValidationError(
                        'El primer usuario del sistema debe ser gestor_rutas',
                        [{ field: 'role', message: 'Primer usuario debe ser administrador' }]
                    );
                }
                console.log('🎉 Creando primer usuario del sistema (bootstrap)');
            } else {
                // Ya hay usuarios, verificar permisos del creador
                if (!creatorId) {
                    throw new UnauthorizedError(
                        'Solo un gestor de rutas puede crear nuevos usuarios'
                    );
                }

                // Verificar que el creador es gestor de rutas
                const creatorQuery = `
                SELECT id, role, is_active 
                FROM users 
                WHERE id = $1
            `;
                const creatorResult = await pgClient.query(creatorQuery, [creatorId]);

                if (creatorResult.rows.length === 0) {
                    throw new UnauthorizedError('Usuario creador no encontrado');
                }

                const creator = creatorResult.rows[0];

                if (!creator.is_active) {
                    throw new UnauthorizedError('Usuario creador está inactivo');
                }

                if (creator.role !== UserRole.GESTOR_RUTAS) {
                    throw new UnauthorizedError(
                        'Solo los gestores de rutas pueden crear nuevos usuarios'
                    );
                }
            }

            // Verificar que el telegram_id no existe
            const checkQuery = 'SELECT id FROM users WHERE telegram_id = $1';
            const checkResult = await pgClient.query(checkQuery, [value.telegram_id]);

            if (checkResult.rows.length > 0) {
                throw new ValidationError(
                    `El usuario de Telegram ${value.telegram_id} ya está registrado`,
                    [{ field: 'telegram_id', message: 'Usuario ya existe' }]
                );
            }

            // Insertar usuario
            const insertQuery = `
            INSERT INTO users (
                telegram_id,
                username,
                first_name,
                last_name,
                role,
                phone_number,
                email,
                is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

            const result = await pgClient.query(insertQuery, [
                value.telegram_id,
                value.username || null,
                value.first_name,
                value.last_name || null,
                value.role,
                value.phone_number || null,
                value.email || null,
                true
            ]);

            await pgClient.query('COMMIT');

            const user = result.rows[0];

            // Generar token de sesión
            const token = this._generateToken(user.id, user.telegram_id, user.role);

            return {
                user: this._sanitizeUser(user),
                token,
                is_first_user: userCount === 0
            };

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Iniciar sesión con Telegram ID
     */
    async login(telegramId) {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT * FROM users 
                WHERE telegram_id = $1 AND is_active = TRUE
            `;
            const result = await pgClient.query(query, [telegramId]);

            if (result.rows.length === 0) {
                throw new UnauthorizedError('Usuario no encontrado o inactivo');
            }

            const user = result.rows[0];

            // Actualizar last_login
            await pgClient.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
                [user.id]
            );

            // Generar token
            const token = this._generateToken(user.id, user.telegram_id, user.role);

            return {
                user: this._sanitizeUser(user),
                token
            };

        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener usuario por ID
     */
    async getUserById(userId) {
        const pgClient = await getPostgresConnection();

        try {
            const query = 'SELECT * FROM users WHERE id = $1';
            const result = await pgClient.query(query, [userId]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Usuario no encontrado');
            }

            return this._sanitizeUser(result.rows[0]);

        } finally {
            pgClient.release();
        }
    }

    /**
     * Obtener usuario por Telegram ID
     */
    async getUserByTelegramId(telegramId) {
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT * FROM users 
                WHERE telegram_id = $1
            `;
            const result = await pgClient.query(query, [telegramId]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Usuario no encontrado');
            }

            return this._sanitizeUser(result.rows[0]);

        } finally {
            pgClient.release();
        }
    }

    /**
     * Verificar y decodificar token
     */
    async verifyToken(token) {
        try {
            const decoded = this._decodeToken(token);

            // Verificar que el usuario aún existe y está activo
            const user = await this.getUserById(decoded.userId);

            if (!user.is_active) {
                throw new UnauthorizedError('Usuario inactivo');
            }

            return {
                userId: decoded.userId,
                telegramId: decoded.telegramId,
                role: decoded.role
            };

        } catch (error) {
            throw new UnauthorizedError('Token inválido o expirado');
        }
    }

    /**
     * Actualizar perfil de usuario
     */
    async updateProfile(userId, updateData) {
        const pgClient = await getPostgresConnection();

        try {
            await pgClient.query('BEGIN');

            // Campos permitidos para actualización
            const allowedFields = ['username', 'first_name', 'last_name', 'phone_number', 'email'];

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

            values.push(userId);

            const updateQuery = `
                UPDATE users
                SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, values);

            if (result.rows.length === 0) {
                throw new NotFoundError('Usuario no encontrado');
            }

            await pgClient.query('COMMIT');
            return this._sanitizeUser(result.rows[0]);

        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        } finally {
            pgClient.release();
        }
    }

    /**
     * Listar usuarios por rol
     */
    async getUsersByRole(role, isActive = true) {
        const pgClient = await getPostgresConnection();

        try {
            let query = 'SELECT * FROM users WHERE role = $1';
            const params = [role];

            if (isActive !== null) {
                query += ' AND is_active = $2';
                params.push(isActive);
            }

            query += ' ORDER BY created_at DESC';

            const result = await pgClient.query(query, params);

            return result.rows.map(user => this._sanitizeUser(user));

        } finally {
            pgClient.release();
        }
    }

    /**
     * Desactivar usuario (soft delete)
     */
    async deactivateUser(userId, adminId) {
        const pgClient = await getPostgresConnection();

        try {
            const updateQuery = `
                UPDATE users
                SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [userId]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Usuario no encontrado');
            }

            return this._sanitizeUser(result.rows[0]);

        } finally {
            pgClient.release();
        }
    }

    /**
     * Reactivar usuario
     */
    async reactivateUser(userId, adminId) {
        const pgClient = await getPostgresConnection();

        try {
            const updateQuery = `
                UPDATE users
                SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `;

            const result = await pgClient.query(updateQuery, [userId]);

            if (result.rows.length === 0) {
                throw new NotFoundError('Usuario no encontrado');
            }

            return this._sanitizeUser(result.rows[0]);

        } finally {
            pgClient.release();
        }
    }

    /**
     * Generar token de sesión (JWT simple)
     */
    _generateToken(userId, telegramId, role) {
        const payload = {
            userId,
            telegramId,
            role,
            iat: Date.now(),
            exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 días
        };

        const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
        const body = Buffer.from(JSON.stringify(payload)).toString('base64');

        const signature = crypto
            .createHmac('sha256', secret)
            .update(`${header}.${body}`)
            .digest('base64');

        return `${header}.${body}.${signature}`;
    }

    /**
     * Decodificar token
     */
    _decodeToken(token) {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Token inválido');
        }

        const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
        const [header, body, signature] = parts;

        // Verificar firma
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(`${header}.${body}`)
            .digest('base64');

        if (signature !== expectedSignature) {
            throw new Error('Firma de token inválida');
        }

        // Decodificar payload
        const payload = JSON.parse(Buffer.from(body, 'base64').toString());

        // Verificar expiración
        if (payload.exp && payload.exp < Date.now()) {
            throw new Error('Token expirado');
        }

        return payload;
    }

    /**
     * Sanitizar datos de usuario (remover campos sensibles)
     */
    _sanitizeUser(user) {
        const sanitized = { ...user };
        return sanitized;
    }
}

module.exports = new AuthService();