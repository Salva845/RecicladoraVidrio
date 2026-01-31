/**
 * Rutas de autenticación
 */

const express = require('express');
const authController = require('../controllers/authController');
const { authenticate, requireGestorRutas, registerAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Registrar nuevo usuario
 * Body: { telegram_id, role, first_name, last_name?, username?, phone_number?, email? }
 */
router.post('/register', registerAuth, authController.register.bind(authController));

/**
 * POST /api/auth/login
 * Iniciar sesión
 * Body: { telegram_id }
 */
router.post('/login', authController.login.bind(authController));

/**
 * POST /api/auth/verify
 * Verificar token
 * Body: { token }
 */
router.post('/verify', authController.verifyToken.bind(authController));

/**
 * GET /api/auth/me
 * Obtener perfil del usuario autenticado
 * Requiere: Token válido
 */
router.get('/me', authenticate, authController.getMe.bind(authController));

/**
 * PATCH /api/auth/me
 * Actualizar perfil del usuario autenticado
 * Requiere: Token válido
 * Body: { username?, first_name?, last_name?, phone_number?, email? }
 */
router.patch('/me', authenticate, authController.updateMe.bind(authController));

/**
 * GET /api/auth/users
 * Listar usuarios (solo gestor de rutas)
 * Requiere: Token válido + rol gestor_rutas
 * Query: ?role=gestor_rutas&is_active=true
 */
router.get('/users', authenticate, requireGestorRutas, authController.listUsers.bind(authController));

/**
 * GET /api/auth/users/:id
 * Obtener usuario por ID (solo gestor de rutas)
 * Requiere: Token válido + rol gestor_rutas
 */
router.get('/users/:id', authenticate, requireGestorRutas, authController.getUserById.bind(authController));

/**
 * POST /api/auth/users/:id/deactivate
 * Desactivar usuario (solo gestor de rutas)
 * Requiere: Token válido + rol gestor_rutas
 */
router.post('/users/:id/deactivate', authenticate, requireGestorRutas, authController.deactivateUser.bind(authController));

/**
 * POST /api/auth/users/:id/reactivate
 * Reactivar usuario (solo gestor de rutas)
 * Requiere: Token válido + rol gestor_rutas
 */
router.post('/users/:id/reactivate', authenticate, requireGestorRutas, authController.reactivateUser.bind(authController));

module.exports = router;