/**
 * Aplicación principal del backend
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Rutas
const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const binRoutes = require('./routes/binRoutes');
const requestRoutes = require('./routes/requestRoutes');
const reportRoutes = require('./routes/reportRoutes');
const routeRoutes = require('./routes/routeRoutes');
const collectionRoutes = require('./routes/collectionRoutes');

// Middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Database
const { checkDatabaseHealth, connectMongoDB } = require('./config/database');

// Crear aplicación
const app = express();

// Middleware global
app.use(helmet()); // Seguridad HTTP headers
app.use(cors()); // CORS
app.use(express.json({ limit: '10mb' })); // Body parser
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
}

// Health check
app.get('/health', async (req, res) => {
    try {
        const health = await checkDatabaseHealth();

        if (health.postgres && health.mongodb) {
            return res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                databases: {
                    postgres: 'connected',
                    mongodb: 'connected'
                }
            });
        } else {
            return res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                databases: {
                    postgres: health.postgres ? 'connected' : 'disconnected',
                    mongodb: health.mongodb ? 'connected' : 'disconnected'
                },
                errors: health.errors
            });
        }
    } catch (error) {
        return res.status(503).json({
            status: 'error',
            message: error.message
        });
    }
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bins', binRoutes);
app.use('/api/requests', requestRoutes);         // Fase 3.1
app.use('/api/reports', reportRoutes);           // Fase 3.1
app.use('/api/routes', routeRoutes);             // Fase 3.2
app.use('/api/collection', collectionRoutes);    // Fase 3.3

// Ruta raíz
app.get('/', (req, res) => {
    res.json({
        message: 'Sistema de Reciclaje de Vidrio - API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            auth: '/api/auth',
            events: '/api/events',
            bins: '/api/bins',
            requests: '/api/requests',
            reports: '/api/reports',
            routes: '/api/routes',
            collection: '/api/collection'
        }
    });
});

// Manejadores de error
app.use(notFoundHandler);
app.use(errorHandler);

// Inicializar conexiones
async function initializeApp() {
    try {
        console.log('🔌 Conectando a bases de datos...');
        await connectMongoDB();

        const health = await checkDatabaseHealth();
        if (!health.postgres || !health.mongodb) {
            throw new Error('Fallo en conexión de base de datos: ' + health.errors.join(', '));
        }

        console.log('✅ Todas las conexiones establecidas correctamente');
    } catch (error) {
        console.error('❌ Error inicializando aplicación:', error);
        process.exit(1);
    }
}

module.exports = { app, initializeApp };