/**
 * Índices para la colección sensor_events
 * Optimizados para consultas comunes del sistema
 */

const sensorEventsIndexes = [
    {
        // Buscar eventos por hardware_id ordenados por fecha
        // Uso: Historial de un bote específico
        key: { hardware_id: 1, timestamp: -1 },
        name: 'idx_hardware_timestamp',
        background: true
    },
    {
        // Buscar eventos ordenados por fecha descendente
        // Uso: Timeline general de eventos
        key: { timestamp: -1 },
        name: 'idx_timestamp_desc',
        background: true
    },
    {
        // Buscar eventos pendientes de procesar
        // Uso: Cola de procesamiento, eventos fallidos
        key: { procesado: 1, timestamp: 1 },
        name: 'idx_procesado_timestamp',
        background: true,
        partialFilterExpression: { procesado: false }
    },
    {
        // Buscar por porcentaje crítico
        // Uso: Identificar botes llenos o críticos
        key: { porcentaje_llenado: -1, timestamp: -1 },
        name: 'idx_porcentaje_timestamp',
        background: true
    },
    {
        // Buscar por tipo de vidrio
        // Uso: Análisis por tipo de vidrio, rutas especializadas
        key: { tipo_vidrio: 1, timestamp: -1 },
        name: 'idx_tipo_vidrio_timestamp',
        background: true
    },
    {
        // Índice compuesto para consultas complejas
        // Uso: Eventos de un bote específico que aún no se han procesado
        key: {
            hardware_id: 1,
            procesado: 1,
            timestamp: -1
        },
        name: 'idx_hardware_procesado_timestamp',
        background: true
    },
    {
        // TTL Index - borrar eventos antiguos automáticamente
        // Configurable vía EVENT_RETENTION_DAYS (por defecto 365 días)
        key: { timestamp: 1 },
        name: 'idx_ttl_timestamp',
        expireAfterSeconds: parseInt(process.env.EVENT_RETENTION_DAYS || '365') * 86400,
        background: true
    }
];

/**
 * Obtener estrategia de índice recomendada para una consulta
 */
function getRecommendedIndex(queryType) {
    const recommendations = {
        'by_hardware': 'idx_hardware_timestamp',
        'by_date': 'idx_timestamp_desc',
        'unprocessed': 'idx_procesado_timestamp',
        'by_fill_level': 'idx_porcentaje_timestamp',
        'by_glass_type': 'idx_tipo_vidrio_timestamp',
        'hardware_unprocessed': 'idx_hardware_procesado_timestamp'
    };

    return recommendations[queryType] || null;
}

module.exports = {
    sensorEventsIndexes,
    getRecommendedIndex
};