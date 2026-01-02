require('dotenv').config();
const { checkDatabaseHealth, closeAllConnections } = require('../src/config/database');

/**
 * Script de prueba de conexiones a bases de datos
 */

async function testConnections() {
    console.log('🧪 Probando conexiones a bases de datos...\n');

    try {
        const health = await checkDatabaseHealth();

        console.log('📊 Resultados:');
        console.log(`   PostgreSQL: ${health.postgres ? '✅ OK' : '❌ FALLO'}`);
        console.log(`   MongoDB: ${health.mongodb ? '✅ OK' : '❌ FALLO'}`);

        if (health.errors.length > 0) {
            console.log('\n❌ Errores encontrados:');
            health.errors.forEach(error => console.log(`   - ${error}`));
            process.exit(1);
        } else {
            console.log('\n✅ Todas las conexiones funcionan correctamente');
            process.exit(0);
        }

    } catch (error) {
        console.error('\n❌ Error durante las pruebas:', error);
        process.exit(1);
    } finally {
        await closeAllConnections();
    }
}

testConnections();