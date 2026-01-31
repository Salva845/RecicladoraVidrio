/**
 * Controlador de autenticación
 */

const authService = require('../services/authService');
const ApiResponse = require('../utils/response');

class AuthController {

    /**
     * POST /api/auth/register
     * Registrar nuevo usuario
     * - Si no hay usuarios en el sistema: cualquiera puede crear el PRIMER usuario (debe ser gestor_rutas)
     * - Si ya hay usuarios: solo gestor_rutas autenticado puede crear nuevos usuarios
     */
    async register(req, res, next) {
        try {
            // El creatorId viene de req.user si está autenticado
            const creatorId = req.user ? req.user.id : null;

            const result = await authService.registerUser(req.body, creatorId);

            if (result.is_first_user) {
                return ApiResponse.created(
                    res,
                    result,
                    '🎉 Primer usuario del sistema creado exitosamente. ¡Bienvenido administrador!'
                );
            }

            return ApiResponse.created(
                res,
                result,
                'Usuario registrado exitosamente'
            );
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/login
     * Iniciar sesión con Telegram ID
     */
    async login(req, res, next) {
        try {
            const { telegram_id } = req.body;

            if (!telegram_id) {
                return ApiResponse.badRequest(
                    res,
                    'telegram_id es requerido',
                    [{ field: 'telegram_id', message: 'Campo requerido' }]
                );
            }

            const result = await authService.login(telegram_id);

            return ApiResponse.success(res, result, 'Login exitoso');
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/auth/me
     * Obtener información del usuario autenticado
     */
    async getMe(req, res, next) {
        try {
            const user = await authService.getUserById(req.user.id);
            return ApiResponse.success(res, { user });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/auth/me
     * Actualizar perfil del usuario autenticado
     */
    async updateMe(req, res, next) {
        try {
            const user = await authService.updateProfile(req.user.id, req.body);
            return ApiResponse.success(res, { user }, 'Perfil actualizado');
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/auth/users
     * Listar todos los usuarios (solo gestor de rutas)
     */
    async listUsers(req, res, next) {
        try {
            const role = req.query.role || null;
            const isActive = req.query.is_active !== undefined
                ? req.query.is_active === 'true'
                : true;

            let users;
            if (role) {
                users = await authService.getUsersByRole(role, isActive);
            } else {
                // Implementar listado completo si es necesario
                users = [];
            }

            return ApiResponse.success(res, { users });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/auth/users/:id
     * Obtener usuario por ID (solo gestor de rutas)
     */
    async getUserById(req, res, next) {
        try {
            const user = await authService.getUserById(req.params.id);
            return ApiResponse.success(res, { user });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/users/:id/deactivate
     * Desactivar usuario (solo gestor de rutas)
     */
    async deactivateUser(req, res, next) {
        try {
            const user = await authService.deactivateUser(
                req.params.id,
                req.user.id
            );
            return ApiResponse.success(res, { user }, 'Usuario desactivado');
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/users/:id/reactivate
     * Reactivar usuario (solo gestor de rutas)
     */
    async reactivateUser(req, res, next) {
        try {
            const user = await authService.reactivateUser(
                req.params.id,
                req.user.id
            );
            return ApiResponse.success(res, { user }, 'Usuario reactivado');
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/verify
     * Verificar token
     */
    async verifyToken(req, res, next) {
        try {
            const { token } = req.body;

            if (!token) {
                return ApiResponse.badRequest(
                    res,
                    'Token es requerido',
                    [{ field: 'token', message: 'Campo requerido' }]
                );
            }

            const decoded = await authService.verifyToken(token);
            const user = await authService.getUserById(decoded.userId);

            return ApiResponse.success(res, {
                valid: true,
                user,
                decoded
            });
        } catch (error) {
            return ApiResponse.success(res, {
                valid: false,
                error: error.message
            });
        }
    }
}

module.exports = new AuthController();