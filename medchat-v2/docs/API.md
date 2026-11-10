# MedChat API Documentation

## Base URL
```
Production: https://api.medchat.ru/v1
Development: http://localhost:3000/api
```

## Authentication

All API requests require authentication using JWT tokens, except for:
- `/api/auth/*` endpoints
- `/health` endpoint
- `/api-docs` endpoint

### Authentication Flow

1. **Login**: POST `/api/auth/login` - Returns `accessToken` and `refreshToken`
2. **Use Token**: Include `accessToken` in `Authorization` header: `Bearer <token>`
3. **Refresh Token**: When `accessToken` expires, use `refreshToken` to get new tokens

### Headers

```
Authorization: Bearer <accessToken>
Content-Type: application/json
X-Request-ID: <unique-request-id>
```

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "requestId": "unique-request-id",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "details": { ... } // Optional, only in development
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Request data validation failed |
| `AUTHENTICATION_ERROR` | 401 | Authentication failed |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `DUPLICATE_ERROR` | 409 | Resource already exists |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `DATABASE_ERROR` | 503 | Database error |
| `INTERNAL_ERROR` | 500 | Internal server error |

## Rate Limiting

- **Default**: 100 requests per 15 minutes per IP
- **Auth endpoints**: 10 requests per 15 minutes per IP
- **Headers**:
  - `X-RateLimit-Limit`: Total requests allowed
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

## Endpoints

### Authentication

#### POST /api/auth/register
Register new user

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "patient",
  "phone": "+79991234567",
  "clinicCode": "CLINIC123" // Required for doctors
}
```

**Response:**
```json
{
  "user": { ... },
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": "15m"
}
```

#### POST /api/auth/login
Login user

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "user": { ... },
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": "15m"
}
```

#### POST /api/auth/refresh
Refresh access token

**Request:**
```json
{
  "refreshToken": "..."
}
```

**Response:**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": "15m"
}
```

#### POST /api/auth/logout
Logout user

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

#### POST /api/auth/forgot-password
Request password reset

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "If an account exists with this email, a reset link has been sent."
}
```

#### POST /api/auth/reset-password
Reset password

**Request:**
```json
{
  "token": "reset-token",
  "newPassword": "NewSecurePass123!"
}
```

**Response:**
```json
{
  "message": "Password has been reset successfully"
}
```

#### POST /api/auth/change-password
Change password (authenticated)

**Request:**
```json
{
  "currentPassword": "SecurePass123!",
  "newPassword": "NewSecurePass123!"
}
```

**Response:**
```json
{
  "message": "Password has been changed successfully"
}
```

#### GET /api/auth/me
Get current user

**Response:**
```json
{
  "id": "...",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "patient",
  "status": "active",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Clinics

#### GET /api/clinics
List all clinics (paginated)

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `city` (string): Filter by city
- `region` (string): Filter by region
- `verified` (boolean): Filter by verification status
- `search` (string): Search by name

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "code": "CLINIC123",
      "name": "City Hospital",
      "city": "Moscow",
      "region": "Moscow",
      "verified": true,
      "totalDoctors": 10,
      "totalPatients": 100
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### POST /api/clinics
Create new clinic (admin only)

**Request:**
```json
{
  "name": "New Clinic",
  "code": "NEWCLINIC",
  "description": "...",
  "address": "...",
  "city": "Moscow",
  "region": "Moscow",
  "phone": "+79991234567",
  "email": "info@newclinic.com"
}
```

**Response:**
```json
{
  "id": "...",
  "code": "NEWCLINIC",
  "name": "New Clinic",
  "..."
}
```

#### GET /api/clinics/:id
Get clinic details

**Response:**
```json
{
  "id": "...",
  "code": "CLINIC123",
  "name": "City Hospital",
  "description": "...",
  "address": "...",
  "city": "Moscow",
  "region": "Moscow",
  "phone": "+79991234567",
  "email": "info@clinic.com",
  "verified": true,
  "doctors": [ ... ],
  "specialties": [ ... ]
}
```

#### PUT /api/clinics/:id
Update clinic (admin only)

**Request:**
```json
{
  "name": "Updated Clinic",
  "description": "..."
}
```

#### DELETE /api/clinics/:id
Delete clinic (admin only)

### Doctors

#### GET /api/doctors
List all doctors (paginated)

**Query Parameters:**
- `page`, `limit`
- `clinicId`: Filter by clinic
- `specialty`: Filter by specialty
- `verified`: Filter by verification status
- `search`: Search by name

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "userId": "...",
      "clinicId": "...",
      "firstName": "John",
      "lastName": "Doe",
      "specialties": ["..."],
      "averageRating": 4.5,
      "totalReviews": 100,
      "verified": true,
      "isOnline": true
    }
  ],
  "pagination": { ... }
}
```

#### POST /api/doctors
Register as doctor

**Request:**
```json
{
  "email": "doctor@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "clinicCode": "CLINIC123",
  "specialties": ["therapist", "cardiologist"],
  "licenseNumber": "DOC12345",
  "bio": "..."
}
```

#### GET /api/doctors/:id
Get doctor details

**Response:**
```json
{
  "id": "...",
  "userId": "...",
  "clinicId": "...",
  "firstName": "John",
  "lastName": "Doe",
  "specialties": [ ... ],
  "licenseNumber": "DOC12345",
  "experienceYears": 10,
  "averageRating": 4.5,
  "totalReviews": 100,
  "verified": true,
  "consultationPrice": 1000,
  "consultationDuration": 30,
  "workingHours": [ ... ],
  "convenientResponseTime": "Отвечаю в течение 2 часов",
  "isOnline": true
}
```

#### PUT /api/doctors/:id
Update doctor profile

#### POST /api/doctors/:id/verify
Verify doctor (clinic admin only)

**Request:**
```json
{
  "verified": true,
  "notes": "..."
}
```

### Patients

#### GET /api/patients
List all patients (doctor/clinic admin only)

**Query Parameters:**
- `page`, `limit`
- `doctorId`: Filter by doctor
- `clinicId`: Filter by clinic
- `search`: Search by name

#### POST /api/patients
Create patient profile

#### GET /api/patients/:id
Get patient details

**Response:**
```json
{
  "id": "...",
  "userId": "...",
  "doctorId": "...",
  "clinicId": "...",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "phone": "+79991234567",
  "email": "patient@example.com",
  "medicalHistory": "...",
  "allergies": "...",
  "bloodType": "A+",
  "lastAppointmentDate": "2024-01-01",
  "nextAppointmentDate": "2024-02-01"
}
```

### Chats

#### GET /api/chats
List all chats

**Query Parameters:**
- `page`, `limit`
- `type`: Filter by chat type
- `status`: Filter by status
- `search`: Search by title

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "chatId": "CHAT123",
      "title": "Dr. John Doe - Patient",
      "doctorId": "...",
      "patientId": "...",
      "clinicId": "...",
      "status": "active",
      "type": "individual",
      "priority": "normal",
      "lastMessage": {
        "text": "Hello doctor!",
        "senderId": "...",
        "createdAt": "..."
      },
      "unreadCount": 5,
      "createdAt": "..."
    }
  ],
  "pagination": { ... }
}
```

#### POST /api/chats
Create new chat

**Request:**
```json
{
  "doctorId": "...",
  "patientId": "...",
  "clinicId": "...",
  "type": "individual",
  "priority": "normal"
}
```

**Response:**
```json
{
  "id": "...",
  "chatId": "CHAT123",
  "title": "...",
  "..."
}
```

#### GET /api/chats/:id
Get chat details

**Response:**
```json
{
  "id": "...",
  "chatId": "CHAT123",
  "title": "...",
  "doctor": { ... },
  "patient": { ... },
  "clinic": { ... },
  "status": "active",
  "type": "individual",
  "priority": "normal",
  "settings": { ... },
  "totalMessages": 100,
  "totalFiles": 10,
  "createdAt": "...",
  "updatedAt": "..."
}
```

#### PUT /api/chats/:id
Update chat settings

#### DELETE /api/chats/:id
Delete chat

### Guest Access (QR-приглашения, вход без регистрации)

Вход пациента по QR-приглашению: врач создаёт одноразовый инвайт, пациент
сканирует QR и попадает на страницу /connect фронтенда, даёт согласие на
обработку персональных данных и сразу попадает в чат с врачом.

#### Создать приглашение (врач)

```http
POST /api/chats/invites
Authorization: Bearer <doctor_token>
Content-Type: application/json

{ "expiresInDays": 7 }
```

Ответ 201:

```json
{
  "token": "<64 hex-символа>",
  "inviteUrl": "https://medchat.ru/connect?token=<64 hex-символа>",
  "qrImage": "data:image/png;base64,...",
  "expiresAt": "2026-11-17T12:00:00.000Z",
  "doctor": { "id": "...", "fullName": "Иванов И. И.", "clinic": { "id": "...", "name": "..." } }
}
```

У врача один активный инвайт: создание нового отзывает предыдущие
неиспользованные. Срок жизни: 1..90 дней, по умолчанию 7.

#### Превью приглашения (публично)

```http
GET /api/guest/invites/:token
```

Ответ 200:

```json
{
  "valid": true,
  "expired": false,
  "alreadyUsed": false,
  "doctor": { "fullName": "Иванов И. И.", "clinic": { "name": "..." }, "specialties": ["..."] }
}
```

#### Гостевой вход (публично)

```http
POST /api/guest/join
Content-Type: application/json

{ "token": "<64 hex-символа>", "consent": true, "firstName": "Имя", "lastName": "Фамилия" }
```

- `consent: true` обязателен (согласие на обработку ПД, 152-ФЗ), иначе 403 CONSENT_REQUIRED.
- Первый вход создаёт гостевого пользователя (email-заглушка @guest.medchat.local,
  парольный вход невозможен), пациента и чат с врачом; ответ:
  `{ token, refreshToken, user, patient, chat }`.
- Повторный скан того же QR тем же гостем даёт повторный вход (новые JWT, без дублей);
  новый гость по использованному инвайту не пройдёт.
- Ошибки: 400 VALIDATION_ERROR, 403 CONSENT_REQUIRED, 404 NOT_FOUND,
  410 INVITE_EXPIRED / INVITE_REVOKED / DOCTOR_INACTIVE / GUEST_INACTIVE.

Для промышленной эксплуатации рекомендуется SMS-верификация гостя
(149-ФЗ ст. 10.1), см. LEGAL.md §5.

#### Слить чаты пациента (врач)

Объединяет гостевой чат с предыдущим чатом того же пациента: сообщения и
файлы переносятся в целевой чат, счётчики суммируются, источник закрывается
(status=closed, metadata.mergedIntoChatId/mergedAt). Участники источника
отсоединяются. Socket.IO: события chatMerged и chatUpdated.

```http
POST /api/chats/:id/merge
Authorization: Bearer <doctor_token>
Content-Type: application/json

{ "sourceChatId": "<uuid исходного чата>" }
```

Ответ 200: обновлённый целевой чат (как GET /api/chats/:id).
Ошибки: 400 VALIDATION_ERROR / SAME_CHAT, 403 (не врач или не участник), 404 NOT_FOUND.

#### Создать аккаунт из гостевого (пациент)

Закрепляет гостевой профиль за настоящим аккаунтом: email + пароль, история
чатов и файлы остаются за тем же userId. Только для гостей
(@guest.medchat.local), иначе 403 NOT_GUEST.

```http
POST /api/guest/upgrade
Authorization: Bearer <guest_token>
Content-Type: application/json

{ "email": "patient@example.com", "password": "SecurePass123!" }
```

Ответ 200: `{ token, refreshToken, user }` (новые JWT уже для аккаунта).
Ошибки: 400 VALIDATION_ERROR, 403 NOT_GUEST, 409 EMAIL_TAKEN.

#### Перенос данных на другое устройство

Одноразовый перенос профиля (сессия + приватные E2E-ключи) со старого
устройства на новое. Модель доверия E2E: сервер хранит только шифротекст
blob'а (nacl.secretbox), ключ шифрования передаётся ТОЛЬКО внутри QR между
устройствами. Токен 256 бит, живёт 10 минут, одноразовый, blob стирается
после потребления. Модель: DataTransfer (таблица data_transfers).

##### Инициировать перенос (со старого устройства)

```http
POST /api/guest/transfer/init
Authorization: Bearer <token>
```

Ответ 201:

```json
{ "token": "<64 hex-символа>", "expiresAt": "2026-11-10T12:10:00.000Z" }
```

Новый init гасит предыдущие незавершённые токены пользователя.

##### Загрузить blob (со старого устройства)

```http
POST /api/guest/transfer/:token/blob
Authorization: Bearer <token>
Content-Type: application/json

{ "payload": "<base64: nonce || secretbox-шифротекст>" }
```

Только владелец токена (record.userId === user.id), иначе 404. Лимит 200KB.

##### Потребить перенос (на новом устройстве, публично)

```http
POST /api/guest/transfer/consume
Content-Type: application/json

{ "token": "<64 hex-символа>" }
```

Аутентификация не нужна: 256-битный токен сам является секретом. Ответ 200:
`{ token, refreshToken, user, payload }`. Токен гасится, blob уничтожается.
Ошибки: 409 TRANSFER_NOT_READY (blob ещё не загружен), 410 TRANSFER_USED /
TRANSFER_EXPIRED.

> Изоляция файлов (security-фикс): доступ к файлу теперь единый
> (utils/chatAccess): владелец, public, или файл в чате, к которому есть
> доступ (canAccessChat). Раньше файлы visibility 'shared' мог скачать любой
> авторизованный по id - утечка между гостями закрыта
> (tests/security/fileAccess.test.js).


### Messages

#### GET /api/chats/:chatId/messages
Get chat messages

**Query Parameters:**
- `page`, `limit`
- `before`: Get messages before this ID
- `after": Get messages after this ID

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "chatId": "...",
      "senderId": "...",
      "receiverId": "...",
      "content": "Hello!",
      "type": "text",
      "status": "read",
      "isEncrypted": true,
      "attachments": [ ... ],
      "isPaid": false,
      "isFree": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": { ... }
}
```

#### POST /api/chats/:chatId/messages
Send message

**Request:**
```json
{
  "content": "Hello doctor!",
  "type": "text",
  "attachments": ["file1", "file2"]
}
```

**Response:**
```json
{
  "id": "...",
  "chatId": "...",
  "senderId": "...",
  "content": "...",
  "type": "text",
  "status": "sent",
  "isEncrypted": true,
  "isPaid": false,
  "isFree": true,
  "createdAt": "..."
}
```

#### GET /api/messages/:id
Get message details

#### PUT /api/messages/:id
Update message (edit)

#### DELETE /api/messages/:id
Delete message

#### POST /api/messages/:id/read
Mark message as read

### Files

#### POST /api/files/upload
Upload file

**Request:**
- Multipart form data with file
- `chatId`: Chat ID
- `type`: File type (doctor_upload, patient_upload)
- `category`: File category
- `description`: File description

**Response:**
```json
{
  "id": "...",
  "filename": "...",
  "originalFilename": "...",
  "size": 1024,
  "mimeType": "image/jpeg",
  "url": "http://...",
  "chatId": "...",
  "uploaderId": "...",
  "visibility": "shared",
  "category": "medical_record",
  "createdAt": "..."
}
```

#### GET /api/files/:id
Get file details

**Response:**
```json
{
  "id": "...",
  "filename": "...",
  "originalFilename": "...",
  "size": 1024,
  "mimeType": "image/jpeg",
  "url": "http://...",
  "chatId": "...",
  "uploaderId": "...",
  "uploader": { ... },
  "visibility": "shared",
  "category": "medical_record",
  "deleteAt": "2024-01-04T00:00:00.000Z",
  "createdAt": "..."
}
```

#### GET /api/files/:id/download
Download file

**Response:** File download

#### DELETE /api/files/:id
Delete file

### Payments

#### POST /api/payments/initiate
Initiate payment for message

**Request:**
```json
{
  "messageId": "...",
  "chatId": "...",
  "amount": 50,
  "currency": "RUB",
  "paymentMethod": "yoo_money"
}
```

**Response:**
```json
{
  "id": "...",
  "paymentUrl": "https://yookassa.ru/...",
  "status": "pending",
  "amount": 50,
  "currency": "RUB",
  "createdAt": "..."
}
```

#### GET /api/payments/:id
Get payment status

**Response:**
```json
{
  "id": "...",
  "messageId": "...",
  "chatId": "...",
  "amount": 50,
  "currency": "RUB",
  "status": "completed",
  "paymentMethod": "yoo_money",
  "providerTransactionId": "...",
  "completedAt": "..."
}
```

#### POST /api/payments/webhook/yookassa
YooMoney webhook handler

#### POST /api/payments/webhook/tinkoff
Tinkoff webhook handler

### Transactions

#### GET /api/transactions
List transactions

**Query Parameters:**
- `page`, `limit`
- `type`: Filter by type
- `status`: Filter by status
- `userId`: Filter by user
- `doctorId`: Filter by doctor
- `patientId`: Filter by patient
- `clinicId`: Filter by clinic

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "type": "message_payment",
      "amount": 50,
      "currency": "RUB",
      "status": "completed",
      "paymentMethod": "yoo_money",
      "messageId": "...",
      "chatId": "...",
      "doctorId": "...",
      "patientId": "...",
      "clinicId": "...",
      "doctorShare": 40,
      "clinicShare": 10,
      "createdAt": "...",
      "completedAt": "..."
    }
  ],
  "pagination": { ... }
}
```

#### GET /api/transactions/:id
Get transaction details

### Specialties

#### GET /api/specialties
List all specialties

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "name": "Therapist",
      "code": "THERAPIST",
      "category": "primary_care",
      "description": "...",
      "icon": "...",
      "color": "..."
    }
  ]
}
```

#### POST /api/specialties
Create specialty (admin only)

### Reviews

#### GET /api/reviews
List reviews

**Query Parameters:**
- `page`, `limit`
- `doctorId`: Filter by doctor
- `clinicId`: Filter by clinic
- `rating`: Filter by rating

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "authorId": "...",
      "author": { ... },
      "doctorId": "...",
      "clinicId": "...",
      "rating": 5,
      "comment": "Great doctor!",
      "createdAt": "..."
    }
  ],
  "pagination": { ... }
}
```

#### POST /api/reviews
Create review

**Request:**
```json
{
  "doctorId": "...",
  "clinicId": "...",
  "rating": 5,
  "comment": "Great doctor!"
}
```

### Appointments

#### GET /api/appointments
List appointments

**Query Parameters:**
- `page`, `limit`
- `doctorId`: Filter by doctor
- `patientId`: Filter by patient
- `clinicId`: Filter by clinic
- `status`: Filter by status
- `dateFrom`: Filter by start date
- `dateTo`: Filter by end date

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "doctorId": "...",
      "patientId": "...",
      "clinicId": "...",
      "title": "Consultation",
      "description": "...",
      "startTime": "2024-01-01T10:00:00.000Z",
      "endTime": "2024-01-01T10:30:00.000Z",
      "duration": 30,
      "status": "confirmed",
      "price": 1000,
      "currency": "RUB",
      "createdAt": "..."
    }
  ],
  "pagination": { ... }
}
```

#### POST /api/appointments
Create appointment

**Request:**
```json
{
  "doctorId": "...",
  "patientId": "...",
  "clinicId": "...",
  "title": "Consultation",
  "description": "...",
  "startTime": "2024-01-01T10:00:00.000Z",
  "duration": 30,
  "price": 1000
}
```

#### PUT /api/appointments/:id
Update appointment

#### DELETE /api/appointments/:id
Delete appointment

### E-Prescriptions

#### GET /api/eprescriptions
List prescriptions

**Query Parameters:**
- `page`, `limit`
- `doctorId`: Filter by doctor
- `patientId`: Filter by patient
- `status`: Filter by status

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "doctorId": "...",
      "patientId": "...",
      "chatId": "...",
      "diagnosis": "...",
      "medications": [
        {
          "name": "Medication",
          "dosage": "1 tablet",
          "frequency": "2 times a day",
          "duration": "7 days"
        }
      ],
      "instructions": "...",
      "status": "active",
      "validFrom": "2024-01-01",
      "validTo": "2024-01-08",
      "createdAt": "..."
    }
  ],
  "pagination": { ... }
}
```

#### POST /api/eprescriptions
Create prescription

**Request:**
```json
{
  "patientId": "...",
  "chatId": "...",
  "diagnosis": "...",
  "medications": [ ... ],
  "instructions": "...",
  "validFrom": "2024-01-01",
  "validTo": "2024-01-08"
}
```

#### GET /api/eprescriptions/:id
Get prescription details

#### PUT /api/eprescriptions/:id
Update prescription

#### DELETE /api/eprescriptions/:id
Delete prescription

### Reminders

#### GET /api/reminders
List reminders

**Query Parameters:**
- `page`, `limit`
- `userId`: Filter by user
- `type`: Filter by type
- `status`: Filter by status

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "userId": "...",
      "doctorId": "...",
      "patientId": "...",
      "type": "appointment",
      "title": "Appointment Reminder",
      "message": "You have an appointment with Dr. John Doe",
      "scheduledAt": "2024-01-01T09:00:00.000Z",
      "triggerAt": "2024-01-01T08:30:00.000Z",
      "status": "pending",
      "relatedId": "...",
      "relatedType": "appointment",
      "createdAt": "..."
    }
  ],
  "pagination": { ... }
}
```

#### POST /api/reminders
Create reminder

**Request:**
```json
{
  "userId": "...",
  "type": "appointment",
  "title": "Appointment Reminder",
  "message": "You have an appointment with Dr. John Doe",
  "scheduledAt": "2024-01-01T10:00:00.000Z",
  "triggerAt": "2024-01-01T08:30:00.000Z",
  "relatedId": "...",
  "relatedType": "appointment"
}
```

#### PUT /api/reminders/:id
Update reminder

#### DELETE /api/reminders/:id
Delete reminder

## WebSocket API

### Connection
```
ws://localhost:3001
wss://api.medchat.ru
```

### Authentication
Send token in query parameters or headers:
```
ws://localhost:3001?token=<accessToken>
```

### Events

#### Connection Events

- **`connect`**: Connection established
- **`disconnect`**: Connection closed
- **`error`**: Connection error

#### Chat Events

- **`joinChat`**: Join a chat room
  ```json
  {
    "event": "joinChat",
    "data": {
      "chatId": "CHAT123"
    }
  }
  ```

- **`leaveChat`**: Leave a chat room
  ```json
  {
    "event": "leaveChat",
    "data": {
      "chatId": "CHAT123"
    }
  }
  ```

- **`newMessage`**: New message in chat
  ```json
  {
    "event": "newMessage",
    "data": {
      "chatId": "CHAT123",
      "message": { ... }
    }
  }
  ```

- **`messageRead`**: Message read receipt
  ```json
  {
    "event": "messageRead",
    "data": {
      "chatId": "CHAT123",
      "messageId": "MSG123",
      "userId": "USER123"
    }
  }
  ```

- **`userTyping`**: User is typing
  ```json
  {
    "event": "userTyping",
    "data": {
      "chatId": "CHAT123",
      "userId": "USER123",
      "isTyping": true
    }
  }
  ```

#### Notification Events

- **`notification`**: New notification
  ```json
  {
    "event": "notification",
    "data": {
      "id": "NOTIF123",
      "type": "message",
      "title": "New Message",
      "message": "You have a new message",
      "data": { ... }
    }
  }
  ```

## Data Models

### User
- `id` (UUID)
- `email` (string, unique)
- `phone` (string, unique, optional)
- `passwordHash` (string)
- `firstName` (string)
- `lastName` (string)
- `middleName` (string, optional)
- `role` (enum: clinic_admin, doctor, patient, system_admin)
- `status` (enum: active, inactive, pending, banned, deleted)
- `emailVerified` (boolean)
- `phoneVerified` (boolean)
- `avatar` (string, URL)
- `publicKey` (string)
- `privateKey` (string)
- `notificationSettings` (JSON)
- `consentGiven` (boolean)
- `consentDate` (date)
- `consentVersion` (string)
- `lastLoginAt` (date)
- `lastActivityAt` (date)
- `ipAddress` (string)
- `userAgent` (string)
- `createdAt` (date)
- `updatedAt` (date)

### Clinic
- `id` (UUID)
- `code` (string, unique)
- `name` (string)
- `shortName` (string, optional)
- `description` (text, optional)
- `address` (text, optional)
- `city` (string, optional)
- `region` (string, optional)
- `postalCode` (string, optional)
- `country` (string, default: Россия)
- `phone` (string, optional)
- `email` (string, optional)
- `website` (string, optional)
- `legalEntityName` (string, optional)
- `inn` (string, optional)
- `kpp` (string, optional)
- `ogrn` (string, optional)
- `licenseNumber` (string, optional)
- `licenseIssuer` (string, optional)
- `licenseDate` (date, optional)
- `workingHours` (JSON)
- `logo` (string, URL, optional)
- `banner` (string, URL, optional)
- `status` (enum: active, inactive, pending, suspended, deleted)
- `verified` (boolean)
- `subscriptionPlan` (enum: free, basic, pro, enterprise)
- `subscriptionExpiresAt` (date, optional)
- `doctorSharePercent` (integer, default: 80)
- `clinicSharePercent` (integer, default: 20)
- `yooMoneyEnabled` (boolean, default: false)
- `tinkoffEnabled` (boolean, default: false)
- `stripeEnabled` (boolean, default: false)
- `adminId` (UUID, foreign key)
- `createdAt` (date)
- `updatedAt` (date)

### Doctor
- `id` (UUID)
- `userId` (UUID, foreign key)
- `clinicId` (UUID, foreign key)
- `licenseNumber` (string, optional)
- `licenseIssuer` (string, optional)
- `licenseDate` (date, optional)
- `licenseExpiry` (date, optional)
- `specialties` (array of UUIDs)
- `primarySpecialtyId` (UUID, optional)
- `degree` (string, optional)
- `title` (string, optional)
- `experienceYears` (integer, default: 0)
- `bio` (text, optional)
- `consultationPrice` (decimal, default: 0)
- `consultationDuration` (integer, default: 30)
- `isAvailable` (boolean, default: true)
- `workingHours` (JSON)
- `convenientResponseTime` (string, optional)
- `isOnline` (boolean, default: false)
- `lastOnlineAt` (date, optional)
- `averageRating` (decimal, default: 0)
- `totalReviews` (integer, default: 0)
- `verified` (boolean, default: false)
- `verificationDate` (date, optional)
- `verifiedBy` (UUID, optional)
- `verificationNotes` (text, optional)
- `clinicCode` (string, optional)
- `invitationStatus` (enum: pending, accepted, rejected, revoked)
- `invitedAt` (date, optional)
- `totalPatients` (integer, default: 0)
- `totalMessages` (bigint, default: 0)
- `totalConsultations` (integer, default: 0)
- `totalRevenue` (decimal, default: 0)
- `notificationSettings` (JSON)
- `fileRetentionDays` (integer, default: 3)
- `category` (enum)
- `doctorNumber` (string, optional)
- `createdAt` (date)
- `updatedAt` (date)

### Patient
- `id` (UUID)
- `userId` (UUID, foreign key)
- `doctorId` (UUID, foreign key, optional)
- `clinicId` (UUID, foreign key, optional)
- `patientNumber` (string, optional)
- `dateOfBirth` (date, optional)
- `gender` (enum: male, female, other)
- `age` (virtual, calculated)
- `medicalHistory` (text, optional)
- `allergies` (text, optional)
- `chronicConditions` (text, optional)
- `bloodType` (string, optional)
- `emergencyContactName` (string, optional)
- `emergencyContactPhone` (string, optional)
- `emergencyContactRelationship` (string, optional)
- `insuranceCompany` (string, optional)
- `insurancePolicyNumber` (string, optional)
- `insuranceExpiry` (date, optional)
- `preferredLanguage` (string, default: ru)
- `preferredCommunication` (array of strings)
- `notificationSettings` (JSON)
- `lastAppointmentDate` (date, optional)
- `nextAppointmentDate` (date, optional)
- `chatCreatedAt` (date, optional)
- `addedBy` (enum: clinic, doctor, patient, system)
- `status` (enum: active, inactive, archived, blocked, deleted)
- `totalMessages` (bigint, default: 0)
- `totalAppointments` (integer, default: 0)
- `totalFiles` (integer, default: 0)
- `totalSpent` (decimal, default: 0)
- `lastFreeMessageDate` (date, optional)
- `freeMessagesRemaining` (integer, default: 0)
- `publicKey` (string, optional)
- `privateKey` (string, optional)
- `createdAt` (date)
- `updatedAt` (date)

### Chat
- `id` (UUID)
- `chatId` (string, unique)
- `doctorId` (UUID, foreign key)
- `patientId` (UUID, foreign key)
- `clinicId` (UUID, foreign key, optional)
- `title` (string, optional)
- `status` (enum: active, archived, closed, blocked, deleted)
- `type` (enum: individual, group, consultation, followup)
- `priority` (enum: low, normal, high, urgent)
- `settings` (JSON)
- `lastMessageId` (UUID, optional)
- `lastMessageText` (text, optional)
- `lastMessageSenderId` (UUID, optional)
- `lastMessageAt` (date, optional)
- `unreadCountDoctor` (integer, default: 0)
- `unreadCountPatient` (integer, default: 0)
- `totalMessages` (bigint, default: 0)
- `totalFiles` (integer, default: 0)
- `firstMessageAt` (date, optional)
- `createdBy` (enum: doctor, patient, clinic, system)
- `encryptionKey` (text, optional)
- `isEncrypted` (boolean, default: true)
- `fileRetentionDays` (integer, default: 3)
- `lastPaidMessageAt` (date, optional)
- `totalPaidMessages` (integer, default: 0)
- `totalFreeMessages` (integer, default: 0)
- `metadata` (JSON)
- `createdAt` (date)
- `updatedAt` (date)

### Message
- `id` (UUID)
- `chatId` (UUID, foreign key)
- `senderId` (UUID, foreign key)
- `receiverId` (UUID, foreign key, optional)
- `content` (text, optional)
- `type` (enum: text, image, video, audio, file, system, payment, prescription, appointment, reminder)
- `status` (enum: sending, sent, delivered, read, failed, deleted)
- `isEncrypted` (boolean, default: true)
- `encryptionKeyId` (string, optional)
- `attachments` (JSON, array)
- `replyToId` (UUID, optional)
- `forwardedFromId` (UUID, optional)
- `metadata` (JSON)
- `readBy` (array of UUIDs)
- `deliveredTo` (array of UUIDs)
- `priority` (enum: low, normal, high, urgent)
- `isPaid` (boolean, default: false)
- `paymentAmount` (decimal, default: 0)
- `paymentCurrency` (string, default: RUB)
- `paymentTransactionId` (UUID, optional)
- `isFree` (boolean, default: true)
- `freeMessageReason` (enum: within_30_days, first_message, doctor_initiated, promotional, system)
- `sentiment` (enum: positive, neutral, negative)
- `isFlagged` (boolean, default: false)
- `flagReason` (string, optional)
- `flaggedBy` (UUID, optional)
- `flaggedAt` (date, optional)
- `size` (integer, optional)
- `clientType` (enum: mobile, web, desktop)
- `clientVersion` (string, optional)
- `createdAt` (date)
- `updatedAt` (date)

### File
- `id` (UUID)
- `filename` (string)
- `originalFilename` (string)
- `storagePath` (string)
- `storageBucket` (string, optional)
- `fileType` (enum: image, video, audio, document, archive, other)
- `mimeType` (string)
- `extension` (string, optional)
- `size` (bigint)
- `width` (integer, optional)
- `height` (integer, optional)
- `duration` (integer, optional)
- `ownerType` (enum: doctor, patient, clinic, system)
- `ownerId` (UUID)
- `uploaderId` (UUID, optional)
- `visibility` (enum: private, doctor_only, patient_only, shared, public)
- `category` (enum: medical_record, analysis, prescription, referral, certificate, photo, video, audio, document, other)
- `status` (enum: uploading, active, processing, failed, deleted, expired)
- `isEncrypted` (boolean, default: true)
- `encryptionKey` (text, optional)
- `metadata` (JSON)
- `description` (text, optional)
- `tags` (array of strings)
- `downloadCount` (integer, default: 0)
- `lastDownloadedAt` (date, optional)
- `autoDelete` (boolean, default: false)
- `deleteAfterDays` (integer, default: 3)
- `deleteAt` (date, optional)
- `checksum` (string, optional)
- `virusScanStatus` (enum: pending, clean, infected, error)
- `virusScanResult` (text, optional)
- `url` (virtual, string)
- `thumbnailUrl` (string, optional)
- `previewUrl` (string, optional)
- `chatId` (UUID, foreign key, optional)
- `messageId` (UUID, foreign key, optional)
- `doctorId` (UUID, foreign key, optional)
- `patientId` (UUID, foreign key, optional)
- `createdAt` (date)
- `updatedAt` (date)

### Transaction
- `id` (UUID)
- `userId` (UUID, foreign key, optional)
- `doctorId` (UUID, foreign key, optional)
- `patientId` (UUID, foreign key, optional)
- `clinicId` (UUID, foreign key, optional)
- `type` (enum: message_payment, consultation_payment, subscription_payment, refund, withdrawal, deposit, payout, other)
- `status` (enum: pending, completed, failed, cancelled, refunded, disputed)
- `amount` (decimal)
- `currency` (string)
- `paymentMethod` (enum: yoo_money, tinkoff, stripe, bank_card, bank_transfer, mobile_balance, cryptocurrency, other)
- `providerTransactionId` (string, optional)
- `provider` (string, optional)
- `description` (text, optional)
- `messageId` (UUID, optional)
- `chatId` (UUID, optional)
- `appointmentId` (UUID, optional)
- `subscriptionId` (UUID, optional)
- `doctorShare` (decimal, default: 0)
- `clinicShare` (decimal, default: 0)
- `platformShare` (decimal, default: 0)
- `feeAmount` (decimal, default: 0)
- `feePercentage` (decimal, default: 0)
- `netAmount` (decimal, default: 0)
- `isRefundable` (boolean, default: true)
- `refundReason` (text, optional)
- `refundedAt` (date, optional)
- `refundedBy` (UUID, optional)
- `paymentDetails` (JSON)
- `billingAddress` (JSON)
- `invoiceNumber` (string, optional)
- `invoiceDate` (date, optional)
- `receiptNumber` (string, optional)
- `receiptDate` (date, optional)
- `taxAmount` (decimal, default: 0)
- `taxRate` (decimal, default: 0)
- `metadata` (JSON)
- `ipAddress` (string, optional)
- `userAgent` (text, optional)
- `createdAt` (date)
- `updatedAt` (date)

## Security Considerations

1. **HTTPS**: All API requests must be made over HTTPS in production
2. **Input Validation**: All inputs are validated on the server
3. **Rate Limiting**: Implemented to prevent abuse
4. **CORS**: Configured to allow only trusted origins
5. **Helmet**: Security headers are set
6. **CSRF Protection**: Recommended for web clients
7. **XSS Protection**: Implemented through proper escaping
8. **SQL Injection**: Prevented through ORM usage

## Performance Considerations

1. **Pagination**: Use pagination for large datasets
2. **Caching**: Redis caching for frequently accessed data
3. **Database Indexes**: Proper indexes on frequently queried fields
4. **Connection Pooling**: Database connection pooling enabled
5. **Compression**: Response compression enabled

## Versioning

The API uses semantic versioning:
- `v1`: Current version
- Future versions will be released as `v2`, `v3`, etc.
- Breaking changes will be announced in advance
