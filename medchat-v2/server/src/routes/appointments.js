/**
 * Appointment Routes
 *
 * Specific paths (/my, /calendar, /statistics, /doctor/:id, /patient/:id)
 * are registered BEFORE /:id to avoid being captured by the id parameter.
 */

const express = require('express');
const router = express.Router();
const AppointmentController = require('../controllers/appointmentController');
const { validate } = require('../middleware/validation');
const { authenticate, isDoctor } = require('../middleware/auth');
const {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentSchema,
  cancelAppointmentSchema,
  confirmAppointmentSchema,
  rescheduleAppointmentSchema,
} = require('../validators/appointment');

// All routes require authentication
router.use(authenticate());

// Specific paths first
router.get('/my', AppointmentController.getMyAppointments);
router.get('/calendar', AppointmentController.getCalendar);
router.get('/statistics', AppointmentController.getStatistics);
router.get('/doctor/:doctorId', isDoctor(), AppointmentController.getByDoctor);
router.get('/patient/:patientId', AppointmentController.getByPatient);

// CRUD
router.post('/', validate(createAppointmentSchema), AppointmentController.create);
router.get('/', validate(listAppointmentSchema, 'query'), AppointmentController.list);
router.get('/:id', AppointmentController.getById);
router.put('/:id', validate(updateAppointmentSchema), AppointmentController.update);
router.post('/:id/confirm', validate(confirmAppointmentSchema), isDoctor(), AppointmentController.confirm);
router.post('/:id/cancel', validate(cancelAppointmentSchema), AppointmentController.cancel);
router.post('/:id/reschedule', validate(rescheduleAppointmentSchema), AppointmentController.reschedule);
router.post('/:id/complete', isDoctor(), AppointmentController.complete);
router.delete('/:id', AppointmentController.delete);

module.exports = router;
