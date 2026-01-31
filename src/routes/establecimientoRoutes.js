/**
 * Rutas para gestión de establecimientos
 */

const express = require('express');
const establecimientoController = require('../controllers/establecimientoController');
const {
    authenticate,
    requireGestorRutas,
    authorize,
    requireEstablecimientoOwnership
} = require('../middleware/auth');
const { UserRole } = require('../models/enums');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * POST /api/establecimientos
 * Crear establecimiento - Gestor o dueño
 * Body: { sector_id, propietario_id?, nombre, tipo?, direccion, referencias?, telefono_contacto?, email_contacto? }
 */
router.post(
    '/',
    authorize(UserRole.GESTOR_RUTAS, UserRole.DUENO_ESTABLECIMIENTO),
    establecimientoController.createEstablecimiento.bind(establecimientoController)
);

/**
 * GET /api/establecimientos
 * Listar establecimientos - Gestor o dueño
 * Query: ?sectorId=uuid&propietarioId=uuid&isActive=true&limit=50&offset=0
 */
router.get(
    '/',
    authorize(UserRole.GESTOR_RUTAS, UserRole.DUENO_ESTABLECIMIENTO),
    establecimientoController.listEstablecimientos.bind(establecimientoController)
);

/**
 * GET /api/establecimientos/:id
 * Obtener establecimiento por ID - Gestor o dueño (si es propietario)
 */
router.get(
    '/:id',
    authorize(UserRole.GESTOR_RUTAS, UserRole.DUENO_ESTABLECIMIENTO),
    requireEstablecimientoOwnership,
    establecimientoController.getEstablecimientoById.bind(establecimientoController)
);

/**
 * PATCH /api/establecimientos/:id
 * Actualizar establecimiento - Gestor o dueño (si es propietario)
 */
router.patch(
    '/:id',
    authorize(UserRole.GESTOR_RUTAS, UserRole.DUENO_ESTABLECIMIENTO),
    requireEstablecimientoOwnership,
    establecimientoController.updateEstablecimiento.bind(establecimientoController)
);

/**
 * POST /api/establecimientos/:id/deactivate
 * Desactivar establecimiento - Solo gestor
 */
router.post(
    '/:id/deactivate',
    requireGestorRutas,
    establecimientoController.deactivateEstablecimiento.bind(establecimientoController)
);

/**
 * POST /api/establecimientos/:id/reactivate
 * Reactivar establecimiento - Solo gestor
 */
router.post(
    '/:id/reactivate',
    requireGestorRutas,
    establecimientoController.reactivateEstablecimiento.bind(establecimientoController)
);

module.exports = router;
