/**
 * Script de inicialización de colecciones MongoDB
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { sensorEventSchema } = require('./schemas/sensor_events');
const { sensorEventsIndexes } = require('./indexes/sensor_events_indexes');

async function initializeCollections() {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || 'recycling_events';

    console.log('🔌 Conectando a MongoDB...');
    console.log(`📍 Base de datos: ${dbName}`);

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);

        console.log('✅ Conexión establecida\n');

        // ================================================================
        // CREAR COLECCIÓN CON VALIDACIÓN
        // ================================================================
        console.log('📦 Configurando colección sensor_events...');

        try {
            await db.createCollection('sensor_events', {
                validator: sensorEventSchema,
                validationLevel: 'strict',
                validationAction: 'error'
            });
            console.log('✅ Colección sensor_events creada con validación estricta');
        } catch (error) {
            if (error.code === 48) {
                console.log('ℹ️  Colección sensor_events ya existe');

                // Actualizar validación si la colección ya existe
                try {
                    await db.command({
                        collMod: 'sensor_events',
                        validator: sensorEventSchema,
                        validationLevel: 'strict'
                    });
                    console.log('✅ Validación de colección actualizada');
                } catch (modError) {
                    console.warn('⚠️  No se pudo actualizar la validación:', modError.message);
                }
            } else {
                throw error;
            }
        }

        const eventsCollection = db.collection('sensor_events');

        // ================================================================
        // CREAR ÍNDICES
        // ================================================================
        console.log('\n📑 Creando índices optimizados...');

        for (const indexSpec of sensorEventsIndexes) {
            try {
                const { key, name, ...options } = indexSpec;

                await eventsCollection.createIndex(key, { name, ...options });

                // Mostrar descripción del índice
                const description = getIndexDescription(name, key, options);
                console.log(`✅ ${name}: ${description}`);

            } catch (error) {
                if (error.code === 85) {
                    console.log(`ℹ️  ${indexSpec.name} ya existe`);
                } else {
                    console.warn(`⚠️  Error creando ${indexSpec.name}:`, error.message);
                }
            }
        }

        // ================================================================
        // VERIFICAR ÍNDICES CREADOS
        // ================================================================
        console.log('\n🔍 Verificando índices...');
        const indexes = await eventsCollection.indexes();

        console.log(`\n📊 Total de índices: ${indexes.length}`);
        indexes.forEach(idx => {
            const keys = Object.keys(idx.key).join(', ');
            const ttl = idx.expireAfterSeconds
                ? ` (TTL: ${idx.expireAfterSeconds / 86400} días)`
                : '';
            console.log(`   • ${idx.name}: ${keys}${ttl}`);
        });

        // ================================================================
        // ESTADÍSTICAS DE LA COLECCIÓN
        // ================================================================
        console.log('\n📈 Estadísticas de la colección:');
        const stats = await db.command({ collStats: 'sensor_events' });

        console.log(`   • Documentos: ${stats.count}`);
        console.log(`   • Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   • Índices: ${stats.nindexes}`);
        console.log(`   • Tamaño índices: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);

        // ================================================================
        // CONFIGURACIÓN DE RETENCIÓN
        // ================================================================
        const retentionDays = parseInt(process.env.EVENT_RETENTION_DAYS || '365');
        console.log(`\n⏰ Retención de datos: ${retentionDays} días`);
        console.log('   Los eventos antiguos se eliminarán automáticamente (TTL Index)');

        console.log('\n🎉 Inicialización de MongoDB completada exitosamente\n');

    } catch (error) {
        console.error('\n❌ Error inicializando MongoDB:', error);
        console.error('Detalles:', error.message);
        process.exit(1);
    } finally {
        await client.close();
        console.log('👋 Conexión cerrada\n');
    }
}

/**
 * Obtener descripción legible de un índice
 */
function getIndexDescription(name, key, options) {
    const descriptions = {
        'idx_hardware_timestamp': 'Eventos por hardware_id ordenados por fecha',
        'idx_timestamp_desc': 'Todos los eventos ordenados por fecha descendente',
        'idx_procesado_timestamp': 'Eventos pendientes de procesar',
        'idx_porcentaje_timestamp': 'Eventos por nivel de llenado',
        'idx_tipo_vidrio_timestamp': 'Eventos por tipo de vidrio',
        'idx_hardware_procesado_timestamp': 'Consultas complejas hardware + procesado',
        'idx_ttl_timestamp': `Limpieza automática (${options.expireAfterSeconds / 86400} días)`
    };

    return descriptions[name] || Object.keys(key).join(' + ');
}

// Ejecutar si se llama directamente
if (require.main === module) {
    initializeCollections()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { initializeCollections };