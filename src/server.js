/**
 * Servidor HTTP
 */

const { app, initializeApp } = require('./app');
const { closeAllConnections } = require('./config/database');
const { eventQueue } = require('./queues/eventQueue');

const PORT = process.env.PORT || 3000;

let server;

async function startServer() {
    try {
        // Inicializar aplicación
        await initializeApp();

        // Iniciar servidor
        server = app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
            console.log(`📍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
        });

        // Manejo de señales de terminación
        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);

    } catch (error) {
        console.error('❌ Error iniciando servidor:', error);
        process.exit(1);
    }
}

async function gracefulShutdown() {
    console.log('\n🛑 Señal de terminación recibida. Cerrando servidor...');

    // Cerrar servidor HTTP
    if (server) {
        server.close(async () => {
            console.log('✅ Servidor HTTP cerrado');

            // Cerrar conexiones de base de datos
            await closeAllConnections();

            // Cerrar cola de eventos
            await eventQueue.close();
            console.log('✅ Cola de eventos cerrada');

            console.log('👋 Proceso terminado correctamente');
            process.exit(0);
        });

        // Forzar cierre después de 10 segundos
        setTimeout(() => {
            console.error('⚠️  Forzando cierre del servidor');
            process.exit(1);
        }, 10000);
    } else {
        process.exit(0);
    }
}

// Iniciar si se ejecuta directamente
if (require.main === module) {
    startServer();
}

module.exports = { startServer, gracefulShutdown };