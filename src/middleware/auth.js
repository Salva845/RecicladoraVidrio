/**
 * Middleware de autenticación y autorización
 */

const authService = require('../services/authService');
const { UnauthorizedError } = require('./errorHandler');
const { UserRole } = require('../models/enums');
const { register } = require('../controllers/authController');

/**
 * Middleware para verificar token de autenticación
 */
async function authenticate(req, res, next) {
    try {
        // Obtener token del header Authorization
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('Token de autenticación no proporcionado');
        }

        const token = authHeader.substring(7); // Remover "Bearer "

        // Verificar token
        const decoded = await authService.verifyToken(token);

        // Adjuntar información del usuario al request
        req.user = {
            id: decoded.userId,
            telegramId: decoded.telegramId,
            role: decoded.role
        };

        next();

    } catch (error) {
        next(error);
    }
}

/**
 * Middleware para verificar roles específicos
 * @param {string[]} allowedRoles - Array de roles permitidos
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return next(new UnauthorizedError('Usuario no autenticado'));
        }

        if (!allowedRoles.includes(req.user.role)) {
            return next(new UnauthorizedError(
                `Acceso denegado. Roles permitidos: ${allowedRoles.join(', ')}`
            ));
        }

        next();
    };
}

/**
 * Middleware para verificar que el usuario es gestor de rutas
 */
const requireGestorRutas = authorize(UserRole.GESTOR_RUTAS);

/**
 * Middleware para verificar que el usuario es dueño de establecimiento
 */
const requireDuenoEstablecimiento = authorize(UserRole.DUENO_ESTABLECIMIENTO);

/**
 * Middleware para verificar que el usuario es recolector
 */
const requireRecolector = authorize(UserRole.RECOLECTOR);

/**
 * Middleware para verificar que el usuario es gestor o recolector
 */
const requireGestorOrRecolector = authorize(
    UserRole.GESTOR_RUTAS,
    UserRole.RECOLECTOR
);

/**
 * Verificar que el establecimiento pertenece al usuario
 */
async function requireEstablecimientoOwnership(req, res, next) {
    try {
        if (!req.user) {
            return next(new UnauthorizedError('Usuario no autenticado'));
        }

        // Gestor de rutas tiene acceso a todos los establecimientos
        if (req.user.role === UserRole.GESTOR_RUTAS) {
            return next();
        }

        const establecimientoId = req.params.establecimientoId ||
            req.params.id ||
            req.body.establecimiento_id ||
            req.query.establecimiento_id;

        if (!establecimientoId) {
            return next(new UnauthorizedError('ID de establecimiento no proporcionado'));
        }

        const { getPostgresConnection } = require('../config/database');
        const pgClient = await getPostgresConnection();

        try {
            const query = `
                SELECT propietario_id 
                FROM establecimientos 
                WHERE id = $1 AND is_active = TRUE
            `;
            const result = await pgClient.query(query, [establecimientoId]);

            if (result.rows.length === 0) {
                return next(new UnauthorizedError('Establecimiento no encontrado'));
            }

            if (result.rows[0].propietario_id !== req.user.id) {
                return next(new UnauthorizedError('No tienes permiso para acceder a este establecimiento'));
            }

            next();

        } finally {
            pgClient.release();
        }

    } catch (error) {
        next(error);
    }
}

/**
 * Middleware opcional de autenticación (no requiere token pero lo verifica si existe)
 */
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = await authService.verifyToken(token);

            req.user = {
                id: decoded.userId,
                telegramId: decoded.telegramId,
                role: decoded.role
            };
        }

        next();

    } catch (error) {
        // Si el token es inválido, continuar sin usuario
        next();
    }
}

/**
 * Middleware para registro de usuarios
 * Permite el primer usuario sin autenticación
 * Requiere autenticación de gestor para usuarios subsecuentes
 */

/**
 * Middleware para registro de usuarios
 * Permite el primer usuario sin autenticación
 * Requiere autenticación de gestor para usuarios subsecuentes
 */
async function registerAuth(req, res, next) {
    try {
        const { getPostgresConnection } = require('../config/database');
        const pgClient = await getPostgresConnection();

        try {
            // Verificar si ya hay usuarios
            const countQuery = 'SELECT COUNT(*) as total FROM users';
            const result = await pgClient.query(countQuery);
            const userCount = parseInt(result.rows[0].total);

            // Si no hay usuarios, permitir registro sin autenticación
            if (userCount === 0) {
                console.log('⚠️  No hay usuarios. Permitiendo creación del primer gestor.');
                return next();
            }

            // Si ya hay usuarios, requerir autenticación
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                throw new UnauthorizedError('Solo un gestor de rutas puede crear nuevos usuarios. Se requiere token de autenticación.');
            }

            const token = authHeader.substring(7);

            // Verificar token
            const authService = require('../services/authService');
            const decoded = await authService.verifyToken(token);

            // Adjuntar usuario al request
            req.user = {
                id: decoded.userId,
                telegramId: decoded.telegramId,
                role: decoded.role
            };

            // Verificar que es gestor de rutas
            if (req.user.role !== UserRole.GESTOR_RUTAS) {
                throw new UnauthorizedError(
                    'Solo los gestores de rutas pueden crear nuevos usuarios'
                );
            }

            next();

        } finally {
            pgClient.release();
        }

    } catch (error) {
        next(error);
    }
}

module.exports = {
    authenticate,
    authorize,
    requireGestorRutas,
    requireDuenoEstablecimiento,
    requireRecolector,
    requireGestorOrRecolector,
    requireEstablecimientoOwnership,
    optionalAuth,
    registerAuth
};
