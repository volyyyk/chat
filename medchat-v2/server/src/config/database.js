const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_DIALECT, NODE_ENV } = process.env;

const databaseConfig = {
  development: {
    username: DB_USER || 'postgres',
    password: DB_PASSWORD || 'postgres',
    database: DB_NAME || 'medchat_v2',
    host: DB_HOST || 'localhost',
    port: DB_PORT || 5432,
    dialect: DB_DIALECT || 'postgres',
    dialectOptions: {
      ssl: false,
    },
    logging: NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 20,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    retry: {
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /ESOCKETTIMEDOUT/,
        /EHOSTUNREACH/,
        /EPIPE/,
        /EAI_AGAIN/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
      ],
      max: 5,
    },
  },
  test: {
    username: DB_USER || 'postgres',
    password: DB_PASSWORD || 'postgres',
    database: `${DB_NAME || 'medchat_v2'}_test`,
    host: DB_HOST || 'localhost',
    port: DB_PORT || 5432,
    dialect: DB_DIALECT || 'postgres',
    dialectOptions: {
      ssl: false,
    },
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  },
  production: {
    username: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME || 'medchat_v2',
    host: DB_HOST,
    port: DB_PORT || 5432,
    dialect: DB_DIALECT || 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    logging: false,
    pool: {
      max: 50,
      min: 10,
      acquire: 30000,
      idle: 10000,
    },
    retry: {
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /ESOCKETTIMEDOUT/,
        /EHOSTUNREACH/,
        /EPIPE/,
        /EAI_AGAIN/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
      ],
      max: 10,
    },
  },
};

const env = NODE_ENV || 'development';
const config = databaseConfig[env];

const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: config.dialect,
  dialectOptions: config.dialectOptions,
  logging: config.logging,
  pool: config.pool,
  retry: config.retry,
  define: {
    timestamps: true,
    underscored: true,
    paranoid: true,
    freezeTableName: true,
  },
});

// Test connection
sequelize
  .authenticate()
  .then(() => {
    console.log(`✅ Database connection has been established successfully (${env}).`);
  })
  .catch((err) => {
    console.error('❌ Unable to connect to the database:', err);
  });

module.exports = sequelize;
