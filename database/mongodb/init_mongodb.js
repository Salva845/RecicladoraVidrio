require('dotenv').config();
const { MongoClient } = require('mongodb');
const { sensorEventSchema } = require('./schemas/sensor_events');
const { sensorEventsIndexes } = require('./indexes/sensor_events_indexes');

/**
 * Script de inicialización de MongoDB
 * Crea la colección con validación y todos los índices necesarios
 */

async function initMongoDB() {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || 'recycling_events';

    console.log('🚀 Iniciando configuración de MongoDB...');
    console.log(`📦 Base de datos: ${dbName}`);

    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✅ Conexión establecida con MongoDB');

        const db = client.db(dbName);

        // Crear colección con validación
        console.log('\n📋 Creando colección sensor_events con validación...');

        try {
            await db.createCollection('sensor_events', {
                validator: sensorEventSchema,
                validationLevel: 'strict',
                validationAction: 'error'
            });
            console.log('✅ Colección sensor_events creada con validación');
        } catch (error) {
            if (error.codeName === 'NamespaceExists') {
                console.log('⚠️  Colección sensor_events ya existe, actualizando validación...');
                await db.command({
                    collMod: 'sensor_events',
                    validator: sensorEventSchema,
                    validationLevel: 'strict'
                });
                console.log('✅ Validación actualizada');
            } else {
                throw error;
            }
        }

        // Crear índices
        console.log('\n🔍 Creando índices...');
        const collection = db.collection('sensor_events');

        for (const indexSpec of sensorEventsIndexes) {
            const { key, name, ...options } = indexSpec;
            console.log(`   Creando índice: ${name}`);
            await collection.createIndex(key, { name, ...options });
        }

        console.log('✅ Todos los índices creados exitosamente');

        // Verificar índices
        console.log('\n📊 Índices existentes:');
        const indexes = await collection.indexes();
        indexes.forEach(idx => {
            console.log(`   - ${idx.name}`);
        });

        // Estadísticas de la colección
        console.log('\n📈 Estadísticas de la colección:');
        const stats = await db.command({ collStats: 'sensor_events' });
        console.log(`   Documentos: ${stats.count}`);
        console.log(`   Tamaño: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   Índices: ${stats.nindexes}`);

        console.log('\n✅ Configuración de MongoDB completada exitosamente\n');

    } catch (error) {
        console.error('\n❌ Error durante la configuración:', error);
        throw error;
    } finally {
        await client.close();
        console.log('👋 Conexión cerrada');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    initMongoDB()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { initMongoDB };