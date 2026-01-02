require('dotenv').config();
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');

/**
 * Configuración de conexiones a bases de datos
 */

// Configuración PostgreSQL
const pgConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    max: 20, // Máximo de conexiones en el pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// Pool de conexiones PostgreSQL
const pgPool = new Pool(pgConfig);

// Manejadores de eventos del pool
pgPool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
});

pgPool.on('connect', () => {
    console.log('✅ Nueva conexión establecida con PostgreSQL');
});

// Cliente MongoDB (singleton)
let mongoClient = null;
let mongoDb = null;

/**
 * Conectar a MongoDB
 */
async function connectMongoDB() {
    if (mongoClient) {
        return mongoDb;
    }

    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || 'recycling_events';

    mongoClient = new MongoClient(uri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
    });

    await mongoClient.connect();
    mongoDb = mongoClient.db(dbName);

    console.log('✅ Conexión establecida con MongoDB');

    return mongoDb;
}

/**
 * Obtener conexión PostgreSQL
 */
async function getPostgresConnection() {
    return pgPool.connect();
}

/**
 * Obtener base de datos MongoDB
 */
async function getMongoDatabase() {
    if (!mongoDb) {
        await connectMongoDB();
    }
    return mongoDb;
}

/**
 * Cerrar todas las conexiones (útil para testing y shutdown)
 */
async function closeAllConnections() {
    console.log('🔌 Cerrando conexiones...');

    if (pgPool) {
        await pgPool.end();
        console.log('✅ Pool de PostgreSQL cerrado');
    }

    if (mongoClient) {
        await mongoClient.close();
        mongoClient = null;
        mongoDb = null;
        console.log('✅ Conexión de MongoDB cerrada');
    }
}

/**
 * Verificar salud de las conexiones
 */
async function checkDatabaseHealth() {
    const health = {
        postgres: false,
        mongodb: false,
        errors: []
    };

    // Verificar PostgreSQL
    try {
        const client = await pgPool.connect();
        await client.query('SELECT 1');
        client.release();
        health.postgres = true;
    } catch (error) {
        health.errors.push(`PostgreSQL: ${error.message}`);
    }

    // Verificar MongoDB
    try {
        const db = await getMongoDatabase();
        await db.command({ ping: 1 });
        health.mongodb = true;
    } catch (error) {
        health.errors.push(`MongoDB: ${error.message}`);
    }

    return health;
}

module.exports = {
    pgPool,
    getPostgresConnection,
    getMongoDatabase,
    connectMongoDB,
    closeAllConnections,
    checkDatabaseHealth
};