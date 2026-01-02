/**
 * Script para generar datos de prueba en MongoDB
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function seedTestData() {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || 'recycling_events';

    console.log('🌱 Generando datos de prueba...\n');

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('sensor_events');

        // Limpiar datos existentes de prueba (opcional)
        const shouldClean = process.argv.includes('--clean');
        if (shouldClean) {
            console.log('🗑️  Limpiando datos de prueba anteriores...');
            await collection.deleteMany({
                hardware_id: { $regex: /^TEST_BIN_/ }
            });
            console.log('✅ Datos anteriores eliminados\n');
        }

        // ================================================================
        // GENERAR EVENTOS DE PRUEBA
        // ================================================================
        console.log('📝 Generando eventos de prueba...');

        const testBins = ['TEST_BIN_001', 'TEST_BIN_002', 'TEST_BIN_003'];
        const glassTypes = ['transparente', 'verde', 'ambar', 'mixto'];
        const events = [];

        const now = new Date();
        const daysAgo = 30;

        for (const binId of testBins) {
            // Generar 50 eventos por bote en los últimos 30 días
            for (let i = 0; i < 50; i++) {
                const daysBack = Math.floor(Math.random() * daysAgo);
                const hoursBack = Math.floor(Math.random() * 24);
                const minutesBack = Math.floor(Math.random() * 60);

                const eventDate = new Date(now);
                eventDate.setDate(eventDate.getDate() - daysBack);
                eventDate.setHours(eventDate.getHours() - hoursBack);
                eventDate.setMinutes(eventDate.getMinutes() - minutesBack);

                // Simular llenado progresivo
                const basePercentage = 60 + Math.floor((i / 50) * 40); // 60% a 100%
                const variation = Math.floor(Math.random() * 10) - 5; // +/- 5%
                const percentage = Math.max(60, Math.min(100, basePercentage + variation));

                events.push({
                    hardware_id: binId,
                    porcentaje_llenado: percentage,
                    tipo_vidrio: glassTypes[Math.floor(Math.random() * glassTypes.length)],
                    nivel_bateria: 70 + Math.floor(Math.random() * 30), // 70-100%
                    temperatura: 15 + Math.random() * 15, // 15-30°C
                    firmware_version: '1.0.0',
                    timestamp: eventDate,
                    procesado: Math.random() > 0.1, // 90% procesados
                    procesado_at: Math.random() > 0.1 ? new Date(eventDate.getTime() + 60000) : null,
                    datos_adicionales: {
                        signal_strength: -50 - Math.floor(Math.random() * 40), // -50 a -90 dBm
                        test_data: true
                    }
                });
            }
        }

        // Insertar eventos
        if (events.length > 0) {
            const result = await collection.insertMany(events);
            console.log(`✅ ${result.insertedCount} eventos insertados`);
        }

        // ================================================================
        // ESTADÍSTICAS DE DATOS GENERADOS
        // ================================================================
        console.log('\n📊 Estadísticas de datos de prueba:');
        console.log('='.repeat(60));

        for (const binId of testBins) {
            const count = await collection.countDocuments({ hardware_id: binId });
            const lastEvent = await collection
                .findOne(
                    { hardware_id: binId },
                    { sort: { timestamp: -1 } }
                );

            console.log(`\n   ${binId}:`);
            console.log(`   • Total eventos: ${count}`);
            console.log(`   • Último porcentaje: ${lastEvent.porcentaje_llenado}%`);
            console.log(`   • Tipo vidrio: ${lastEvent.tipo_vidrio}`);
            console.log(`   • Batería: ${lastEvent.nivel_bateria}%`);
        }

        // Eventos críticos
        const criticalCount = await collection.countDocuments({
            hardware_id: { $regex: /^TEST_BIN_/ },
            porcentaje_llenado: { $gte: 80 }
        });
        console.log(`\n   📍 Eventos críticos (≥80%): ${criticalCount}`);

        // Eventos sin procesar
        const unprocessedCount = await collection.countDocuments({
            hardware_id: { $regex: /^TEST_BIN_/ },
            procesado: false
        });
        console.log(`   ⏳ Eventos sin procesar: ${unprocessedCount}`);

        // Por tipo de vidrio
        console.log('\n   🔷 Distribución por tipo de vidrio:');
        for (const type of glassTypes) {
            const typeCount = await collection.countDocuments({
                hardware_id: { $regex: /^TEST_BIN_/ },
                tipo_vidrio: type
            });
            console.log(`      • ${type}: ${typeCount}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ Datos de prueba generados exitosamente\n');

        // ================================================================
        // EJEMPLOS DE CONSULTAS
        // ================================================================
        console.log('💡 Puedes probar estos endpoints:');
        console.log('='.repeat(60));
        console.log('\n   GET /api/events/bin/TEST_BIN_001');
        console.log('   GET /api/events/bin/TEST_BIN_001/stats?days=30');
        console.log('   GET /api/events/critical?hours=24');
        console.log('   GET /api/events/unprocessed?limit=10');
        console.log('   GET /api/events/glass-type/transparente');
        console.log('   GET /api/events/stats/global?days=30\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

// Ejecutar
if (require.main === module) {
    seedTestData()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { seedTestData };