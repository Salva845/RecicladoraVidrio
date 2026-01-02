/**
 * Servicio de gestión de eventos de sensores
 */

const { getMongoDatabase, getPostgresConnection } = require('../config/database');
const { addEventToQueue } = require('../queues/eventQueue');
const { sensorEventSchema } = require('../models/validators');
const { ValidationError } = require('../middleware/errorHandler');

class EventService {
    /**
     * Recibir y validar evento del hardware
     */
    async receiveEvent(eventData) {
        // Validar estructura del evento
        const { error, value } = sensorEventSchema.validate(eventData);

        if (error) {
            throw new ValidationError('Datos de evento inválidos', error.details);
        }

        // Verificar que el porcentaje justifique el envío (>= 60%)
        if (value.porcentaje_llenado < 60) {
            throw new ValidationError(
                'El evento solo debe enviarse cuando el porcentaje es >= 60%',
                [{ field: 'porcentaje_llenado', message: 'Debe ser al menos 60%' }]
            );
        }

        // Verificar que el bote existe y está activo
        const pgClient = await getPostgresConnection();
        try {
            const query = `
                SELECT id, hardware_id, is_active
                FROM botes
                WHERE hardware_id = $1
            `;
            const result = await pgClient.query(query, [value.hardware_id]);

            if (result.rows.length === 0) {
                throw new ValidationError(
                    `Bote no registrado: ${value.hardware_id}`,
                    [{ field: 'hardware_id', message: 'Bote no encontrado en el sistema' }]
                );
            }

            if (!result.rows[0].is_active) {
                throw new ValidationError(
                    `Bote inactivo: ${value.hardware_id}`,
                    [{ field: 'hardware_id', message: 'El bote está marcado como inactivo' }]
                );
            }
        } finally {
            pgClient.release();
        }

        // Agregar a la cola de procesamiento
        const job = await addEventToQueue(value);

        return {
            event_id: job.id,
            hardware_id: value.hardware_id,
            porcentaje_llenado: value.porcentaje_llenado,
            status: 'queued',
            message: 'Evento recibido y en cola de procesamiento'
        };
    }

    /**
     * Obtener historial de eventos de un bote
     * Usa índice: idx_hardware_timestamp
     */
    async getBinEventHistory(hardwareId, options = {}) {
        const {
            limit = 100,
            skip = 0,
            startDate = null,
            endDate = null,
            procesado = null
        } = options;

        const mongoDb = await getMongoDatabase();
        const eventsCollection = mongoDb.collection('sensor_events');

        // Construir filtro
        const filter = { hardware_id: hardwareId };

        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }

        if (procesado !== null) {
            filter.procesado = procesado;
        }

        // Consultar eventos (usa idx_hardware_timestamp o idx_hardware_procesado_timestamp)
        const events = await eventsCollection
            .find(filter)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        const total = await eventsCollection.countDocuments(filter);

        return {
            events,
            pagination: {
                total,
                limit,
                skip,
                hasMore: total > (skip + limit)
            }
        };
    }

    /**
     * Obtener último evento de un bote
     */
    async getLastEvent(hardwareId) {
        const mongoDb = await getMongoDatabase();
        const eventsCollection = mongoDb.collection('sensor_events');

        const lastEvent = await eventsCollection
            .findOne(
                { hardware_id: hardwareId },
                { sort: { timestamp: -1 } }
            );

        if (!lastEvent) {
            throw new ValidationError(`No hay eventos para el bote ${hardwareId}`);
        }

        return lastEvent;
    }

    /**
     * Obtener estadísticas de eventos por período
     */
    async getEventStats(hardwareId, days = 7) {
        const mongoDb = await getMongoDatabase();
        const eventsCollection = mongoDb.collection('sensor_events');

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const stats = await eventsCollection.aggregate([
            {
                $match: {
                    hardware_id: hardwareId,
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    total_eventos: { $sum: 1 },
                    porcentaje_promedio: { $avg: '$porcentaje_llenado' },
                    porcentaje_maximo: { $max: '$porcentaje_llenado' },
                    porcentaje_minimo: { $min: '$porcentaje_llenado' },
                    ultimo_evento: { $max: '$timestamp' },
                    primer_evento: { $min: '$timestamp' }
                }
            }
        ]).toArray();

        return stats[0] || {
            total_eventos: 0,
            porcentaje_promedio: 0,
            porcentaje_maximo: 0,
            porcentaje_minimo: 0,
            mensaje: 'No hay eventos en el período especificado'
        };
    }

    /**
     * Obtener eventos no procesados
     * Usa índice: idx_procesado_timestamp
     */
    async getUnprocessedEvents(limit = 100) {
        const mongoDb = await getMongoDatabase();
        const eventsCollection = mongoDb.collection('sensor_events');

        const events = await eventsCollection
            .find({ procesado: false })
            .sort({ timestamp: 1 })
            .limit(limit)
            .toArray();

        return events;
    }

    /**
     * Obtener eventos críticos recientes
     * Usa índice: idx_porcentaje_timestamp
     */
    async getCriticalEvents(hours = 24, limit = 50) {
        const mongoDb = await getMongoDatabase();
        const eventsCollection = mongoDb.collection('sensor_events');

        const startDate = new Date();
        startDate.setHours(startDate.getHours() - hours);

        const events = await eventsCollection
            .find({
                porcentaje_llenado: { $gte: 80 },
                timestamp: { $gte: startDate }
            })
            .sort({ porcentaje_llenado: -1, timestamp: -1 })
            .limit(limit)
            .toArray();

        return events;
    }

    /**
     * Obtener eventos por tipo de vidrio
     * Usa índice: idx_tipo_vidrio_timestamp
     */
    async getEventsByGlassType(tipoVidrio, options = {}) {
        const {
            limit = 100,
            skip = 0,
            startDate = null,
            endDate = null
        } = options;

        const mongoDb = await getMongoDatabase();
        const eventsCollection = mongoDb.collection('sensor_events');

        const filter = { tipo_vidrio: tipoVidrio };

        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }

        const events = await eventsCollection
            .find(filter)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        const total = await eventsCollection.countDocuments(filter);

        return {
            events,
            pagination: {
                total,
                limit,
                skip,
                hasMore: total > (skip + limit)
            }
        };
    }

    /**
     * Obtener estadísticas globales de eventos
     */
    async getGlobalStats(days = 30) {
        const mongoDb = await getMongoDatabase();
        const eventsCollection = mongoDb.collection('sensor_events');

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const stats = await eventsCollection.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    total_eventos: { $sum: 1 },
                    eventos_procesados: {
                        $sum: { $cond: ['$procesado', 1, 0] }
                    },
                    eventos_pendientes: {
                        $sum: { $cond: ['$procesado', 0, 1] }
                    },
                    botes_unicos: { $addToSet: '$hardware_id' },
                    porcentaje_promedio: { $avg: '$porcentaje_llenado' },
                    eventos_criticos: {
                        $sum: { $cond: [{ $gte: ['$porcentaje_llenado', 80] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    total_eventos: 1,
                    eventos_procesados: 1,
                    eventos_pendientes: 1,
                    total_botes: { $size: '$botes_unicos' },
                    porcentaje_promedio: { $round: ['$porcentaje_promedio', 2] },
                    eventos_criticos: 1,
                    tasa_procesamiento: {
                        $round: [
                            {
                                $multiply: [
                                    { $divide: ['$eventos_procesados', '$total_eventos'] },
                                    100
                                ]
                            },
                            2
                        ]
                    }
                }
            }
        ]).toArray();

        return stats[0] || {
            total_eventos: 0,
            eventos_procesados: 0,
            eventos_pendientes: 0,
            total_botes: 0,
            porcentaje_promedio: 0,
            eventos_criticos: 0,
            tasa_procesamiento: 0
        };
    }
}

module.exports = new EventService();