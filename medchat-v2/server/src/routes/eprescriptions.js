/**
 * E-Prescription Routes
 *
 * Specific paths (/statistics, /doctor/:id, /patient/:id) are registered
 * BEFORE /:id to avoid being captured by the id parameter.
 */

const express = require('express');
const router = express.Router();
const EPrescriptionController = require('../controllers/eprescriptionController');
const { validate } = require('../middleware/validation');
const { authenticate, isDoctor } = require('../middleware/auth');
const {
  createEPrescriptionSchema,
  updateEPrescriptionSchema,
  listEPrescriptionSchema,
  cancelEPrescriptionSchema,
  signEPrescriptionSchema,
} = require('../validators/eprescription');

// All routes require authentication
router.use(authenticate());

// Specific paths first
router.get('/statistics', EPrescriptionController.getStatistics);
router.get('/doctor/:doctorId', isDoctor(), EPrescriptionController.getByDoctor);
router.get('/patient/:patientId', EPrescriptionController.getByPatient);

// CRUD
router.post('/', validate(createEPrescriptionSchema), isDoctor(), EPrescriptionController.create);
router.get('/', validate(listEPrescriptionSchema, 'query'), EPrescriptionController.list);
router.get('/:id', EPrescriptionController.getById);
router.put('/:id', validate(updateEPrescriptionSchema), isDoctor(), EPrescriptionController.update);
router.post('/:id/sign', validate(signEPrescriptionSchema), isDoctor(), EPrescriptionController.sign);
router.post('/:id/cancel', validate(cancelEPrescriptionSchema), isDoctor(), EPrescriptionController.cancel);
router.post('/:id/fulfill', isDoctor(), EPrescriptionController.fulfill);
router.delete('/:id', isDoctor(), EPrescriptionController.delete);

// Document formats
router.get('/:id/pdf', EPrescriptionController.getPDF);
router.get('/:id/print', EPrescriptionController.getPrintable);
router.post('/:id/send', isDoctor(), EPrescriptionController.send);

module.exports = router;
