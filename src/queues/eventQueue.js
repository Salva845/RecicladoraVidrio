/**
 * Cola de procesamiento asíncrono de eventos de sensores
 */

const Bull = require('bull');
const { getMongoDatabase, getPostgresConnection } = require('../config/database');
const { clasificarNivelLlenado, BinStatus } = require('../models/enums');

// Configuración de la cola
const eventQueue = new Bull('sensor-events', {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined
    }
});

// Configuración de reintentos
const queueOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000
    },
    removeOnComplete: true,
    removeOnFail: false
};

/**
 * Agregar evento a la cola
 */
async function addEventToQueue(eventData) {
    return eventQueue.add(eventData, queueOptions);
}

/**
 * Procesador de eventos
 */
eventQueue.process(
    parseInt(process.env.EVENT_PROCESSING_CONCURRENCY || '5'),
    async (job) => {
        const eventData = job.data;

        console.log(`Procesando evento ${job.id} del bote ${eventData.hardware_id}`);

        try {
            // 1. Guardar evento en MongoDB
            const mongoDb = await getMongoDatabase();
            const eventsCollection = mongoDb.collection('sensor_events');

            const eventDocument = {
                ...eventData,
                timestamp: new Date(eventData.timestamp), // Ensure timestamp is Date object (Redis serializes to string)
                procesado: false,
                created_at: new Date()
            };

            const insertResult = await eventsCollection.insertOne(eventDocument);
            console.log(`Evento guardado en MongoDB: ${insertResult.insertedId}`);

            // 2. Actualizar estado del bote en PostgreSQL
            const pgClient = await getPostgresConnection();

            try {
                await pgClient.query('BEGIN');

                // Buscar el bote por hardware_id
                const boteQuery = `
                    SELECT id, status, ultimo_porcentaje, establecimiento_id
                    FROM botes
                    WHERE hardware_id = $1 AND is_active = TRUE
                `;
                const boteResult = await pgClient.query(boteQuery, [eventData.hardware_id]);

                if (boteResult.rows.length === 0) {
                    throw new Error(`Bote no encontrado: ${eventData.hardware_id}`);
                }

                const bote = boteResult.rows[0];
                const estadoAnterior = bote.status;
                const porcentajeAnterior = bote.ultimo_porcentaje;

                // Clasificar nivel de llenado
                const nivelLlenado = clasificarNivelLlenado(eventData.porcentaje_llenado);

                // Actualizar datos del bote
                const updateQuery = `
                    UPDATE botes
                    SET 
                        ultimo_porcentaje = $1,
                        ultima_lectura = $2,
                        bateria_nivel = $3,
                        tipo_vidrio = COALESCE($4, tipo_vidrio),
                        firmware_version = COALESCE($5, firmware_version),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $6
                    RETURNING *
                `;

                await pgClient.query(updateQuery, [
                    eventData.porcentaje_llenado,
                    new Date(),
                    eventData.nivel_bateria || null,
                    eventData.tipo_vidrio || null,
                    eventData.firmware_version || null,
                    bote.id
                ]);

                // Registrar en historial si hay cambio significativo
                if (Math.abs(eventData.porcentaje_llenado - porcentajeAnterior) >= 5) {
                    const historialQuery = `
                        INSERT INTO historial_estados_bote (
                            bote_id,
                            estado_anterior,
                            estado_nuevo,
                            porcentaje_llenado,
                            motivo
                        ) VALUES ($1, $2, $3, $4, $5)
                    `;

                    await pgClient.query(historialQuery, [
                        bote.id,
                        estadoAnterior,
                        estadoAnterior, // No cambia el estado, solo registramos el porcentaje
                        eventData.porcentaje_llenado,
                        `Actualización de sensor: ${nivelLlenado.label}`
                    ]);
                }

                await pgClient.query('COMMIT');
                console.log(`Estado actualizado para bote ${bote.id}`);

                // Marcar evento como procesado en MongoDB
                await eventsCollection.updateOne(
                    { _id: insertResult.insertedId },
                    {
                        $set: {
                            procesado: true,
                            procesado_at: new Date(),
                            bote_id: bote.id
                        }
                    }
                );

                return {
                    success: true,
                    bote_id: bote.id,
                    hardware_id: eventData.hardware_id,
                    nivel_llenado: nivelLlenado.label,
                    porcentaje: eventData.porcentaje_llenado
                };

            } catch (error) {
                await pgClient.query('ROLLBACK');
                throw error;
            } finally {
                pgClient.release();
            }

        } catch (error) {
            console.error(`Error procesando evento ${job.id}:`, error);
            throw error; // Bull reintentará según la configuración
        }
    }
);

// Eventos de la cola
eventQueue.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completado:`, result);
});

eventQueue.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} falló:`, err.message);
});

eventQueue.on('error', (error) => {
    console.error('Error en la cola:', error);
});

module.exports = {
    eventQueue,
    addEventToQueue
};