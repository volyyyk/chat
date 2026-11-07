/**
 * Test data seed: creates demo clinic, clinic admin, doctor and two patients
 * so every side of MedChat (clinic admin, doctor, patient) can be tested
 * immediately after starting the server.
 *
 * Usage:
 *   cd medchat-v2/server
 *   npm run seed:test
 *
 * Test accounts created (password for all: Test1234!):
 *   admin@medchat.test    - clinic administrator (clinic TESTCLINIC)
 *   doctor@medchat.test   - verified doctor
 *   patient1@medchat.test - patient, last visit 5 days ago  (free messages, balance 200)
 *   patient2@medchat.test - patient, last visit 40 days ago (paid messages, balance 1000)
 */

require('dotenv').config();

const bcrypt = require('bcrypt');
const models = require('../models');
const cryptoService = require('../services/cryptoService');

const PASSWORD = 'Test1234!';
const CLINIC_CODE = 'TESTCLINIC';

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function ensureUser(email, phone, role, firstName, lastName, extra = {}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const keyPair = cryptoService.generateX25519KeyPair();

  let user = await models.User.findOne({ where: { email } });
  const base = {
    email,
    phone,
    role,
    firstName,
    lastName,
    passwordHash,
    status: 'active',
    emailVerified: true,
    consentGiven: true,
    consentDate: new Date(),
    consentVersion: '1.0',
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    ...extra,
  };

  if (user) {
    await user.update(base);
  } else {
    user = await models.User.create(base);
  }
  return user;
}

async function ensureChat(chatId, doctor, patient, clinic, title) {
  let chat = await models.Chat.findOne({ where: { chatId } });
  if (!chat) {
    chat = await models.Chat.create({
      chatId,
      doctorId: doctor.id,
      patientId: patient.id,
      clinicId: clinic.id,
      title,
      status: 'active',
      createdBy: 'patient',
    });
  }
  return chat;
}

async function ensureParticipant(chat, userId, role) {
  const existing = await models.ChatParticipant.findOne({
    where: { chatId: chat.id, userId },
  });
  if (!existing) {
    await models.ChatParticipant.create({
      chatId: chat.id,
      userId,
      role,
      isActive: true,
    });
  }
}

async function ensureBalance(user, amount) {
  const currency = 'RUB';
  let balance = await models.Balance.findOne({ where: { userId: user.id, currency } });
  if (!balance) {
    balance = await models.Balance.create({
      userId: user.id,
      currency,
      amount,
      available: amount,
      reserved: 0,
      isTest: true,
    });
  } else {
    await balance.update({ amount, available: amount, reserved: 0, isTest: true });
  }
  return balance;
}

async function ensureAppointment(doctor, patient, clinic, createdByUser, start, type) {
  const existing = await models.Appointment.findOne({
    where: { doctorId: doctor.id, patientId: patient.id, startTime: start },
  });
  if (!existing) {
    await models.Appointment.create({
      doctorId: doctor.id,
      patientId: patient.id,
      clinicId: clinic.id,
      startTime: start,
      endTime: new Date(start.getTime() + 30 * 60000),
      type: type || 'in_person',
      status: 'completed',
      reason: 'Плановый прием',
      reminderMinutes: 0,
      createdBy: createdByUser.id,
    });
  }
}

async function seedMessage(chat, sender, receiver, content, opts = {}) {
  const existing = await models.Message.count({ where: { chatId: chat.id, content } });
  if (existing === 0) {
    await models.Message.create({
      chatId: chat.id,
      senderId: sender.id,
      receiverId: receiver.id,
      content,
      type: 'text',
      status: 'read',
      isFree: opts.isFree !== undefined ? opts.isFree : true,
      isPaid: opts.isPaid || false,
      paymentAmount: opts.paymentAmount || 0,
      freeMessageReason: opts.isFree === false ? null : 'within_30_days',
    });
  }
}

async function main() {
  console.log('Seeding MedChat test data...');

  await models.sequelize.sync();

  // 1. Clinic
  let clinic = await models.Clinic.findOne({ where: { code: CLINIC_CODE } });
  if (!clinic) {
    clinic = await models.Clinic.create({
      code: CLINIC_CODE,
      name: 'Тестовая клиника «Здоровье»',
      shortName: 'Здоровье',
      address: 'г. Москва, ул. Тестовая, 1',
      city: 'Москва',
      phone: '+74951234567',
      email: 'clinic@medchat.test',
      status: 'active',
      verified: true,
      verificationDate: new Date(),
      doctorSharePercent: 80,
      clinicSharePercent: 20,
      workingHours: [
        { day: 1, start: '08:00', end: '20:00' },
        { day: 2, start: '08:00', end: '20:00' },
        { day: 3, start: '08:00', end: '20:00' },
        { day: 4, start: '08:00', end: '20:00' },
        { day: 5, start: '08:00', end: '20:00' },
        { day: 6, start: '09:00', end: '15:00' },
      ],
    });
  } else {
    await clinic.update({ status: 'active', verified: true });
  }

  // 2. Clinic administrator
  const adminUser = await ensureUser(
    'admin@medchat.test',
    '+79001234570',
    'clinic_admin',
    'Анна',
    'Администраторова',
    { clinicId: clinic.id }
  );
  await clinic.update({ adminId: adminUser.id });

  // 3. Doctor
  const doctorUser = await ensureUser(
    'doctor@medchat.test',
    '+79001234567',
    'doctor',
    'Иван',
    'Иванов'
  );
  let doctor = await models.Doctor.findOne({ where: { userId: doctorUser.id } });
  if (!doctor) {
    doctor = await models.Doctor.create({
      userId: doctorUser.id,
      clinicId: clinic.id,
      clinicCode: CLINIC_CODE,
      category: 'therapist',
      degree: 'Высшая категория',
      title: 'Терапевт',
      experienceYears: 15,
      consultationPrice: 100,
      convenientResponseTime: 'Отвечаю в течение 2 часов с 9:00 до 18:00 (пн-пт)',
      workingHours: [
        { day: 1, start: '09:00', end: '18:00' },
        { day: 2, start: '09:00', end: '18:00' },
        { day: 3, start: '09:00', end: '18:00' },
        { day: 4, start: '09:00', end: '18:00' },
        { day: 5, start: '09:00', end: '18:00' },
      ],
      invitationStatus: 'accepted',
      verified: true,
      verificationDate: new Date(),
      fileRetentionDays: 3,
      isAvailable: true,
    });
  } else {
    await doctor.update({ invitationStatus: 'accepted', verified: true, clinicId: clinic.id });
  }

  // 4. Patient 1: recent visit -> free messages
  const patient1User = await ensureUser(
    'patient1@medchat.test',
    '+79001234568',
    'patient',
    'Петр',
    'Петров'
  );
  let patient1 = await models.Patient.findOne({ where: { userId: patient1User.id } });
  if (!patient1) {
    patient1 = await models.Patient.create({
      userId: patient1User.id,
      patientNumber: 'P-0001',
      doctorId: doctor.id,
      clinicId: clinic.id,
      addedBy: 'patient',
      status: 'active',
      dateOfBirth: '1990-05-15',
      gender: 'male',
      lastAppointmentDate: daysAgo(5),
      chatCreatedAt: daysAgo(5),
    });
  } else {
    await patient1.update({ doctorId: doctor.id, clinicId: clinic.id, lastAppointmentDate: daysAgo(5) });
  }

  // 5. Patient 2: visit was long ago -> paid messages (for payment flow testing)
  const patient2User = await ensureUser(
    'patient2@medchat.test',
    '+79001234569',
    'patient',
    'Мария',
    'Сидорова'
  );
  let patient2 = await models.Patient.findOne({ where: { userId: patient2User.id } });
  if (!patient2) {
    patient2 = await models.Patient.create({
      userId: patient2User.id,
      patientNumber: 'P-0002',
      doctorId: doctor.id,
      clinicId: clinic.id,
      addedBy: 'patient',
      status: 'active',
      dateOfBirth: '1985-11-20',
      gender: 'female',
      lastAppointmentDate: daysAgo(40),
      chatCreatedAt: daysAgo(40),
    });
  } else {
    await patient2.update({ doctorId: doctor.id, clinicId: clinic.id, lastAppointmentDate: daysAgo(40) });
  }

  // 6. Completed appointments (drive the free/paid message window)
  await ensureAppointment(doctor, patient1, clinic, doctorUser, daysAgo(5), 'in_person');
  await ensureAppointment(doctor, patient2, clinic, doctorUser, daysAgo(40), 'in_person');

  // 7. Chats + participants
  const chat1 = await ensureChat(
    'test-chat-0001',
    doctor,
    patient1,
    clinic,
    'Иванов Иван (терапевт) — Петров Петр'
  );
  const chat2 = await ensureChat(
    'test-chat-0002',
    doctor,
    patient2,
    clinic,
    'Иванов Иван (терапевт) — Сидорова Мария'
  );

  await ensureParticipant(chat1, doctorUser.id, 'doctor');
  await ensureParticipant(chat1, patient1User.id, 'patient');
  await ensureParticipant(chat2, doctorUser.id, 'doctor');
  await ensureParticipant(chat2, patient2User.id, 'patient');

  // 8. Demo messages
  await seedMessage(
    chat1,
    doctorUser,
    patient1User,
    'Здравствуйте, Петр! Как вы себя чувствуете после приема? Напомню: принимать лекарство нужно ежедневно в 14:00.'
  );
  await seedMessage(chat1, patient1User, doctorUser, 'Здравствуйте, доктор! Чувствую себя хорошо, спасибо!');
  await seedMessage(
    chat2,
    patient2User,
    doctorUser,
    'Добрый день! Подскажите, пожалуйста, по результатам анализов.',
    { isFree: false, isPaid: true, paymentAmount: 100 }
  );

  // 9. Test balances (test money only, no real gateways)
  await ensureBalance(adminUser, 0);
  await ensureBalance(doctorUser, 0);
  await ensureBalance(patient1User, 200);
  await ensureBalance(patient2User, 1000);

  console.log('');
  console.log('==============================================');
  console.log('  Тестовые данные MedChat созданы / обновлены');
  console.log('==============================================');
  console.log('Клиника: ' + clinic.name + '  код: ' + CLINIC_CODE);
  console.log('');
  console.log('АДМИНИСТРАТОР КЛИНИКИ:');
  console.log('  email:    admin@medchat.test');
  console.log('');
  console.log('ВРАЧ (вход по email + пароль):');
  console.log('  email:    doctor@medchat.test');
  console.log('  код клиники: ' + CLINIC_CODE);
  console.log('');
  console.log('ПАЦИЕНТ 1 (бесплатные сообщения, прием был 5 дней назад, баланс 200):');
  console.log('  email:    patient1@medchat.test');
  console.log('');
  console.log('ПАЦИЕНТ 2 (платные сообщения, прием был 40 дней назад, баланс 1000):');
  console.log('  email:    patient2@medchat.test');
  console.log('');
  console.log('Пароль для всех аккаунтов: ' + PASSWORD);
  console.log('==============================================');

  await models.sequelize.close();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  try {
    await models.sequelize.close();
  } catch (e) {
    // ignore
  }
  process.exit(1);
});
