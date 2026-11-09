# DEPLOY: прод-контур MedChat v2 (medchat-v2/deploy/)

> Однонодовый контур: nginx (статика веб-клиента + reverse proxy) + Node-сервер + PostgreSQL 16 + Redis 7 + MinIO — один docker compose. TLS-сертификаты, прод-пароли, платёжные шлюзы, магазины приложений и SMS-гейты (149-ФЗ) — операторские позиции: в репо только примеры и плейсхолдеры.

## Состав

- docker-compose.prod.yml — postgres / redis / minio / server / nginx, healthcheck-и, named-тома
- nginx/medchat.conf — SPA-статика, /api/ и /socket.io/ (websocket upgrade), /health, закомментированный TLS-блок
- .env.prod.example — все переменные окружения плейсхолдерами (копировать в .env.prod)
- backup.sh — pg_dump | gzip с ротацией копий (14 дней)
- ../server/Dockerfile — образ сервера (node:18-alpine, HEALTHCHECK /health)

## Требования

- Linux-хост с Docker Engine >= 24 и compose-плагином v2
- репозиторий medchat-v2 на хосте
- домен (для TLS; без TLS контур работает на http)

## 1. Секреты: .env.prod

    cd medchat-v2/deploy
    cp .env.prod.example .env.prod
    # заполнить CHANGE_ME: пароли БД, JWT_SECRET (openssl rand -hex 32),
    # ENCRYPTION_SECRET, SESSION_SECRET, ключи MinIO, шлюзы/SMTP — по необходимости

Файл .env.prod живёт только на хосте: в git он не попадает, в образ сервера — тоже (.dockerignore).

## 2. Статика веб-клиента: deploy/web

Веб-клиент (CRA) вшивает адрес API при сборке:

    cd medchat-v2/web
    REACT_APP_API_URL=http://your-domain
    npm install && npm run build
    mkdir -p ../deploy/web && cp -r build/* ../deploy/web/

Или возьмите готовый артефакт релиза MedChat-Web-static.zip (GitHub Releases) и распакуйте его в deploy/web/.

## 3. Запуск

    cd medchat-v2/deploy
    docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

Порядок: сначала поднимаются postgres/redis/minio (healthcheck-и), затем server, затем nginx.
Схема БД: примените миграции (sequelize-cli db:migrate) — см. server/package.json.
Бакет medchat-files (MINIO_BUCKET) при необходимости создайте вручную: docker compose --env-file .env.prod -f docker-compose.prod.yml exec minio mc mb /data/medchat-files.

## 4. Проверка

    curl -f http://127.0.0.1/health          # сквозной nginx -> server
    docker compose --env-file .env.prod -f docker-compose.prod.yml ps
    docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f server

Откройте http://your-domain: страница входа веб-клиента должна грузиться, логин — идти через /api/.

## 5. TLS (оператор)

Внутри контура TLS нет (DB_SSL=false). Внешний TLS: certbot / Let's Encrypt на хосте.
Раскомментируйте TLS-блок в nginx/medchat.conf, смонтируйте ./certs, откройте 443 в docker-compose.prod.yml, перезапустите nginx. После этого обновите CORS_ORIGIN и REACT_APP_API_URL на https-домен и пересоберите статику (шаг 2).

## 6. Бэкапы

    chmod +x backup.sh
    ./backup.sh                       # разовый: backups/medchat-<дата>.sql.gz
    # cron: 15 3 * * * cd /path/deploy && ./backup.sh >> backups/backup.log 2>&1

Ротация — 14 дней. Восстановление: gunzip < backups/medchat-<дата>.sql.gz | docker compose exec -T postgres psql -U medchat medchat_v2.

## 7. Обновление

    git pull
    docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

## 8. Ограничения (честно)

- Один хост: нет K8s/кластера, вертикальное масштабирование — по мере надобности.
- PostgreSQL/MinIO без репликации: бэкапы — единственная защита от потери данных.
- TLS, прод-пароли, подписи приложений, SMS-гейт — оператор; в репо только плейсхолдеры.
- Живность контура: /health проверяет связку nginx -> server.