/**
 * Script de utilidad para verificar y analizar índices MongoDB
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkIndexes() {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || 'recycling_events';

    console.log('🔍 Analizando índices de MongoDB\n');

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('sensor_events');

        // ================================================================
        // LISTAR ÍNDICES
        // ================================================================
        console.log('📑 Índices existentes:');
        console.log('='.repeat(80));

        const indexes = await collection.indexes();

        for (const idx of indexes) {
            const keys = Object.entries(idx.key)
                .map(([k, v]) => `${k}: ${v === 1 ? 'ASC' : 'DESC'}`)
                .join(', ');

            console.log(`\n📌 ${idx.name}`);
            console.log(`   Campos: ${keys}`);

            if (idx.unique) console.log('   ✓ Único');
            if (idx.sparse) console.log('   ✓ Sparse');
            if (idx.background) console.log('   ✓ Background');
            if (idx.expireAfterSeconds) {
                const days = idx.expireAfterSeconds / 86400;
                console.log(`   ⏰ TTL: ${days} días`);
            }
            if (idx.partialFilterExpression) {
                console.log(`   🔍 Filtro: ${JSON.stringify(idx.partialFilterExpression)}`);
            }
        }

        // ================================================================
        // ESTADÍSTICAS DE ÍNDICES
        // ================================================================
        console.log('\n\n📊 Estadísticas de índices:');
        console.log('='.repeat(80));

        const stats = await db.command({ collStats: 'sensor_events', indexDetails: true });

        console.log(`\n   Total de índices: ${stats.nindexes}`);
        console.log(`   Tamaño de índices: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Tamaño de datos: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Ratio índices/datos: ${((stats.totalIndexSize / stats.size) * 100).toFixed(2)}%`);

        // ================================================================
        // EJEMPLOS DE USO DE ÍNDICES
        // ================================================================
        console.log('\n\n💡 Ejemplos de uso de índices:');
        console.log('='.repeat(80));

        const examples = [
            {
                query: { hardware_id: 'BIN_001' },
                sort: { timestamp: -1 },
                index: 'idx_hardware_timestamp',
                description: 'Historial de eventos de un bote'
            },
            {
                query: { procesado: false },
                sort: { timestamp: 1 },
                index: 'idx_procesado_timestamp',
                description: 'Eventos pendientes de procesar'
            },
            {
                query: { porcentaje_llenado: { $gte: 80 } },
                sort: { porcentaje_llenado: -1 },
                index: 'idx_porcentaje_timestamp',
                description: 'Eventos críticos'
            },
            {
                query: { tipo_vidrio: 'transparente' },
                sort: { timestamp: -1 },
                index: 'idx_tipo_vidrio_timestamp',
                description: 'Eventos por tipo de vidrio'
            }
        ];

        for (const ex of examples) {
            console.log(`\n   ${ex.description}`);
            console.log(`   Query: ${JSON.stringify(ex.query)}`);
            console.log(`   Sort: ${JSON.stringify(ex.sort)}`);
            console.log(`   Índice recomendado: ${ex.index}`);

            // Explicar query
            const explain = await collection
                .find(ex.query)
                .sort(ex.sort)
                .limit(1)
                .explain('executionStats');

            const stage = explain.executionStats.executionStages;
            console.log(`   ✓ Índice usado: ${stage.indexName || 'COLLSCAN'}`);
            console.log(`   ✓ Documentos examinados: ${explain.executionStats.totalDocsExamined}`);
            console.log(`   ✓ Tiempo: ${explain.executionStats.executionTimeMillis}ms`);
        }

        // ================================================================
        // VERIFICAR ÍNDICES FALTANTES
        // ================================================================
        console.log('\n\n🔎 Verificación de índices recomendados:');
        console.log('='.repeat(80));

        const recommendedIndexes = [
            'idx_hardware_timestamp',
            'idx_timestamp_desc',
            'idx_procesado_timestamp',
            'idx_porcentaje_timestamp',
            'idx_tipo_vidrio_timestamp',
            'idx_hardware_procesado_timestamp',
            'idx_ttl_timestamp'
        ];

        const existingIndexNames = indexes.map(idx => idx.name);
        const missingIndexes = recommendedIndexes.filter(
            name => !existingIndexNames.includes(name)
        );

        if (missingIndexes.length === 0) {
            console.log('\n   ✅ Todos los índices recomendados están presentes');
        } else {
            console.log('\n   ⚠️  Índices faltantes:');
            missingIndexes.forEach(name => {
                console.log(`      • ${name}`);
            });
            console.log('\n   Ejecuta: node database/mongodb/init-collections.js');
        }

        // ================================================================
        // ÍNDICES DUPLICADOS O REDUNDANTES
        // ================================================================
        console.log('\n\n🔄 Verificación de redundancia:');
        console.log('='.repeat(80));

        const indexKeys = indexes.map(idx => ({
            name: idx.name,
            keys: Object.keys(idx.key).join(',')
        }));

        const duplicates = indexKeys.filter((item, index) =>
            indexKeys.findIndex(i => i.keys === item.keys && i.name !== item.name) !== -1
        );

        if (duplicates.length === 0) {
            console.log('\n   ✅ No se detectaron índices redundantes');
        } else {
            console.log('\n   ⚠️  Posibles índices redundantes:');
            duplicates.forEach(dup => {
                console.log(`      • ${dup.name} (${dup.keys})`);
            });
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ Análisis completado\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

// Ejecutar
if (require.main === module) {
    checkIndexes()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { checkIndexes };