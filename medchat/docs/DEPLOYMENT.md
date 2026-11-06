# Развертывание MedChat

## Обзор

MedChat состоит из двух основных компонентов:
1. **Сервер-маршрутизатор** - Node.js приложение для маршрутизации сообщений
2. **Мобильное приложение** - React Native приложение для Android и iOS

## Требования

### Сервер

- Node.js 18+ (рекомендуется LTS версия)
- npm или yarn
- SSL/TLS сертификат (для производственной среды)
- Доменное имя (опционально, но рекомендуется)
- Порт 443 (для wss://) или 3000 (для разработки)

### Мобильное приложение

- Node.js 18+
- npm или yarn
- React Native CLI
- Android Studio (для Android)
- Xcode (для iOS)
- Java Development Kit (JDK) 11+ (для Android)

## Развертывание сервера

### 1. Установка зависимостей

```bash
cd server
npm install
```

### 2. Конфигурация

Создайте файл `server/config.js`:

```javascript
module.exports = {
  // Порт сервера
  port: process.env.PORT || 3000,
  
  // Настройки WebSocket
  ws: {
    path: '/ws',
    maxPayload: 1024 * 1024 * 10, // 10MB
    clientTracking: true,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024
      }
    }
  },
  
  // Настройки TLS (для производственной среды)
  tls: {
    enabled: process.env.NODE_ENV === 'production',
    key: process.env.SSL_KEY || './certs/server.key',
    cert: process.env.SSL_CERT || './certs/server.cert',
    minVersion: 'TLSv1.2'
  },
  
  // Ограничения
  limits: {
    maxConnections: 10000,
    maxMessagesPerMinute: 100,
    maxConnectionsPerIP: 100
  },
  
  // Логирование
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/server.log'
  },
  
  // CORS (для разработки)
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
};
```

### 3. Получение SSL/TLS сертификата

#### Вариант 1: Let's Encrypt (рекомендуется)

```bash
# Установите certbot
sudo apt-get install certbot

# Получите сертификат
sudo certbot certonly --standalone -d yourdomain.com

# Создайте папку для сертификатов
mkdir -p server/certs

# Скопируйте сертификаты
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem server/certs/server.key
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem server/certs/server.cert

# Настройте автоматическое обновление
sudo certbot renew --dry-run
```

#### Вариант 2: Самостоятельно подписанный сертификат (для разработки)

```bash
# Сгенерируйте ключ и сертификат
openssl req -x509 -newkey rsa:4096 -keyout server/certs/server.key -out server/certs/server.cert -days 365 -nodes

# Сгенерируйте корневой сертификат (для тестирования)
openssl req -x509 -new -key server/certs/server.key -out server/certs/ca.crt -days 365
```

### 4. Запуск сервера

#### Для разработки (без TLS):

```bash
npm run dev
# или
node src/index.js
```

Сервер будет доступен на `ws://localhost:3000`

#### Для производственной среды (с TLS):

```bash
NODE_ENV=production npm start
```

Сервер будет доступен на `wss://yourdomain.com`

#### С использованием PM2 (рекомендуется для production):

```bash
# Установите PM2
npm install -g pm2

# Запустите сервер
pm2 start src/index.js --name medchat-server

# Сохраните список процессов
pm2 save

# Настройте автозапуск
pm2 startup
```

### 5. Настройка firewall

```bash
# Разрешите порт 443 (HTTPS)
sudo ufw allow 443/tcp

# Разрешите порт 80 (HTTP, для редиректа)
sudo ufw allow 80/tcp

# Разрешите порт 3000 (для разработки)
sudo ufw allow 3000/tcp

# Включите firewall
sudo ufw enable
```

### 6. Настройка Nginx (опционально)

Создайте файл `/etc/nginx/sites-available/medchat`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Включите конфигурацию:

```bash
sudo ln -s /etc/nginx/sites-available/medchat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Развертывание мобильного приложения

### 1. Установка зависимостей

```bash
cd mobile
npm install
```

### 2. Конфигурация

Создайте файл `mobile/src/config.js`:

```javascript
export default {
  // Адрес сервера
  serverUrl: process.env.SERVER_URL || 'wss://yourdomain.com/ws',
  
  // Настройки приложения
  app: {
    name: 'MedChat',
    version: '1.0.0',
    doctorMode: false // Режим врача (устанавливается при запуске)
  },
  
  // Настройки шифрования
  crypto: {
    algorithm: 'XChaCha20-Poly1305',
    keyExchange: 'X25519',
    hash: 'SHA-256'
  },
  
  // Настройки хранения
  storage: {
    database: 'medchat.db',
    encryptionKey: 'your_encryption_key' // Должен быть уникальным для каждого устройства
  },
  
  // Настройки уведомлений
  notifications: {
    enabled: true,
    sound: true,
    vibration: true
  },
  
  // Логирование
  logging: {
    enabled: __DEV__,
    level: 'debug'
  }
};
```

### 3. Сборка приложения

#### Для Android:

```bash
# Установите Android SDK и настройте переменные окружения
# Создайте файл keystore для подписи
keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000

# Создайте файл android/local.properties
sdk.dir=/path/to/android/sdk

# Сборка APK
npx react-native run-android --variant=release

# или сборка bundle
cd android
./gradlew bundleRelease

# APK будет в android/app/build/outputs/apk/release/
# Bundle будет в android/app/build/outputs/bundle/release/
```

#### Для iOS:

```bash
# Установите Xcode и настройте проект
cd ios
pod install

# Сборка для симулятора
npx react-native run-ios

# Сборка для устройства
npx react-native run-ios --device

# Сборка для App Store
# Откройте проект в Xcode и настройте схему Release
# Archive -> Distribute App
```

### 4. Настройка переменных окружения

Создайте файл `.env` в корне проекта mobile:

```bash
# server/.env
SERVER_URL=wss://yourdomain.com/ws
NODE_ENV=production

# mobile/.env
SERVER_URL=wss://yourdomain.com/ws
```

### 5. Публикация в магазинах

#### Google Play Store:

1. Создайте аккаунт разработчика: https://play.google.com/console/
2. Создайте новое приложение
3. Загрузите APK или App Bundle
4. Заполните metadata:
   - Название
   - Описание
   - Иконки
   - Скриншоты
   - Категория (Медицина)
   - Возрастной рейтинг
5. Заполните анкету для медицинских приложений
6. Отправьте на ревью

#### Apple App Store:

1. Создайте аккаунт разработчика: https://developer.apple.com/
2. Создайте новое приложение в App Store Connect
3. Загрузите архив через Xcode
4. Заполните metadata:
   - Название
   - Описание
   - Иконки
   - Скриншоты
   - Категория (Медицина)
   - Возрастной рейтинг
5. Заполните анкету для медицинских приложений
6. Отправьте на ревью

## Docker развертывание (опционально)

### 1. Создайте Dockerfile для сервера

```dockerfile
# server/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src/ ./src/
COPY config.js ./

EXPOSE 3000

CMD ["node", "src/index.js"]
```

### 2. Создайте docker-compose.yml

```yaml
version: '3.8'

services:
  medchat-server:
    build: ./server
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - ./server/certs:/app/certs
      - ./server/logs:/app/logs
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./certs:/etc/nginx/certs
    depends_on:
      - medchat-server
    restart: unless-stopped
```

### 3. Запустите контейнеры

```bash
docker-compose build
docker-compose up -d
```

## Мониторинг и логирование

### Логи сервера

Логи сохраняются в `server/logs/server.log`

Для просмотра логов в реальном времени:

```bash
tail -f server/logs/server.log
```

### Логи мобильного приложения

Для Android:

```bash
adb logcat | grep MedChat
```

Для iOS:

```bash
# Подключите устройство и используйте Xcode
# или
idevicesyslog | grep MedChat
```

### Мониторинг сервера

Используйте PM2 для мониторинга:

```bash
pm2 monit
pm2 logs medchat-server
pm2 list
```

## Масштабирование

### Горизонтальное масштабирование сервера

Для масштабирования сервера используйте:

1. **Redis** для синхронизации состояний между нодами
2. **Nginx** или **HAProxy** для балансировки нагрузки
3. **Docker Swarm** или **Kubernetes** для оркестрации

Пример конфигурации Nginx для балансировки:

```nginx
upstream medchat_servers {
    server server1:3000;
    server server2:3000;
    server server3:3000;
    ip_hash;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    location /ws {
        proxy_pass http://medchat_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Вертикальное масштабирование

- Увеличьте количество ядер CPU
- Увеличьте количество оперативной памяти
- Используйте более быстрые диски (SSD NVMe)

## Обновление приложения

### Обновление сервера

```bash
# Остановите сервер
pm2 stop medchat-server

# Обновите код
git pull

# Установите зависимости
npm install --production

# Запустите сервер
pm2 start medchat-server
```

### Обновление мобильного приложения

1. Обновите код приложения
2. Увеличьте номер версии в `package.json` и `android/app/build.gradle` / `ios/Info.plist`
3. Соберите новые версии
4. Загрузите в магазины

## Резервное копирование

### Резервное копирование сервера

```bash
# Резервное копирование конфигурации
cp -r server/config.js server/config.backup

# Резервное копирование сертификатов
cp -r server/certs server/certs.backup

# Резервное копирование логов
cp -r server/logs server/logs.backup
```

### Резервное копирование базы данных (если используется)

Поскольку MedChat не использует центральную базу данных, резервное копирование не требуется. Данные хранятся локально на устройствах пользователей.

## Восстановление после сбоя

### Восстановление сервера

1. Установите Node.js и зависимости
2. Восстановите конфигурацию из резервной копии
3. Восстановите сертификаты из резервной копии
4. Запустите сервер

### Восстановление мобильного приложения

Поскольку данные хранятся локально на устройствах, восстановление приложения не требует восстановления данных. Пользователи могут:
1. Удалить приложение
2. Установить новое
3. Подключиться к врачу через QR-код

## Заключение

Развертывание MedChat включает:
1. ✅ Развертывание сервера-маршрутизатора
2. ✅ Настройку SSL/TLS сертификатов
3. ✅ Сборку мобильного приложения
4. ✅ Публикацию в магазинах приложений
5. ✅ Настройку мониторинга и логирования
6. ✅ Настройку резервного копирования

Для производственной среды рекомендуется:
- Использовать TLS (wss://)
- Настроить балансировку нагрузки
- Настроить мониторинг
- Настроить резервное копирование
- Регулярно обновлять приложение
