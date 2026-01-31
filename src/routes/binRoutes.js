/**
 * Rutas para gestión de botes
 */

const express = require('express');
const binController = require('../controllers/binController');
const { authenticate, requireGestorRutas, requireGestorOrRecolector } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// CRUD básico - Solo gestor de rutas
router.post('/', requireGestorRutas, binController.createBin.bind(binController));
router.get('/', binController.listBins.bind(binController)); // Todos pueden listar
router.get('/:id', binController.getBinById.bind(binController)); // Todos pueden ver
router.get('/hardware/:hardwareId', binController.getBinByHardwareId.bind(binController));
router.patch('/:id', requireGestorRutas, binController.updateBin.bind(binController));

// Operaciones especiales - Solo gestor de rutas
router.post('/:id/reassign', requireGestorRutas, binController.reassignBin.bind(binController));
router.post('/:id/deactivate', requireGestorRutas, binController.deactivateBin.bind(binController));
router.post('/:id/reactivate', requireGestorRutas, binController.reactivateBin.bind(binController));

// Gestión de estados - Solo gestor de rutas
router.post('/:id/status', requireGestorRutas, binController.changeStatus.bind(binController));
router.get('/:id/history', binController.getStatusHistory.bind(binController)); // Todos pueden ver historial

// Consultas por estado - Todos pueden consultar
router.get('/status/pending', binController.getPendingBins.bind(binController));
router.get('/status/critical', binController.getCriticalBins.bind(binController));

module.exports = router;