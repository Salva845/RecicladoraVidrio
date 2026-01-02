/**
 * Rutas para gestión de botes
 */

const express = require('express');
const binController = require('../controllers/binController');

const router = express.Router();

// CRUD básico
router.post('/', binController.createBin.bind(binController));
router.get('/', binController.listBins.bind(binController));
router.get('/:id', binController.getBinById.bind(binController));
router.get('/hardware/:hardwareId', binController.getBinByHardwareId.bind(binController));
router.patch('/:id', binController.updateBin.bind(binController));

// Operaciones especiales
router.post('/:id/reassign', binController.reassignBin.bind(binController));
router.post('/:id/deactivate', binController.deactivateBin.bind(binController));
router.post('/:id/reactivate', binController.reactivateBin.bind(binController));

// Gestión de estados
router.post('/:id/status', binController.changeStatus.bind(binController));
router.get('/:id/history', binController.getStatusHistory.bind(binController));

// Consultas por estado
router.get('/status/pending', binController.getPendingBins.bind(binController));
router.get('/status/critical', binController.getCriticalBins.bind(binController));

module.exports = router;