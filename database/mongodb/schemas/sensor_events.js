/**
 * Schema de validación para eventos de sensores
 * MongoDB permite validaciones a nivel de colección
 */

const sensorEventSchema = {
    $jsonSchema: {
        bsonType: 'object',
        required: ['hardware_id', 'porcentaje_llenado', 'timestamp'],
        properties: {
            hardware_id: {
                bsonType: 'string',
                description: 'Identificador único del hardware - requerido',
                pattern: '^[A-Z0-9_-]+$'
            },
            porcentaje_llenado: {
                bsonType: 'int',
                minimum: 0,
                maximum: 100,
                description: 'Porcentaje de llenado del bote - requerido'
            },
            tipo_vidrio: {
                enum: ['transparente', 'verde', 'ambar', 'mixto'],
                description: 'Tipo de vidrio contenido'
            },
            nivel_bateria: {
                bsonType: ['int', 'double', 'null'],
                minimum: 0,
                maximum: 100,
                description: 'Nivel de batería del sensor en porcentaje'
            },
            temperatura: {
                bsonType: ['double', 'int', 'null'],
                description: 'Temperatura del sensor en grados Celsius'
            },
            firmware_version: {
                bsonType: ['string', 'null'],
                description: 'Versión del firmware del dispositivo'
            },
            datos_adicionales: {
                bsonType: ['object', 'null'],
                description: 'Cualquier dato adicional del sensor'
            },
            timestamp: {
                bsonType: 'date',
                description: 'Fecha y hora del evento - requerido'
            },
            procesado: {
                bsonType: 'bool',
                description: 'Indica si el evento ya fue procesado por el backend'
            },
            procesado_at: {
                bsonType: ['date', 'null'],
                description: 'Fecha de procesamiento'
            }
        }
    }
};

module.exports = { sensorEventSchema };