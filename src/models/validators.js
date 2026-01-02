const Joi = require('joi');
const {
    UserRole,
    BinStatus,
    GlassType,
    RequestType,
    RequestStatus,
    ReportType,
    RouteStatus
} = require('./enums');

/**
 * Validadores usando Joi para entrada de datos
 */

// Helper para crear enum schema
const enumSchema = (enumObj) => Joi.string().valid(...Object.values(enumObj));

// Validación de Usuario
const userSchema = Joi.object({
    telegram_id: Joi.number().integer().positive().required(),
    username: Joi.string().max(255).optional(),
    first_name: Joi.string().max(255).required(),
    last_name: Joi.string().max(255).optional(),
    role: enumSchema(UserRole).required(),
    phone_number: Joi.string().max(20).optional(),
    email: Joi.string().email().max(255).optional(),
    is_active: Joi.boolean().default(true)
});

// Validación de Sector
const sectorSchema = Joi.object({
    nombre: Joi.string().max(255).required(),
    codigo: Joi.string().regex(/^[A-Z0-9_-]+$/).max(50).required(),
    descripcion: Joi.string().optional(),
    is_active: Joi.boolean().default(true)
});

// Validación de Establecimiento
const establecimientoSchema = Joi.object({
    sector_id: Joi.string().uuid().required(),
    propietario_id: Joi.string().uuid().optional(),
    nombre: Joi.string().max(255).required(),
    tipo: Joi.string().max(100).optional(),
    direccion: Joi.string().required(),
    referencias: Joi.string().optional(),
    telefono_contacto: Joi.string().max(20).optional(),
    email_contacto: Joi.string().email().max(255).optional(),
    is_active: Joi.boolean().default(true)
});

// Validación de Bote
const boteSchema = Joi.object({
    hardware_id: Joi.string().regex(/^[A-Z0-9_-]+$/).max(100).required(),
    establecimiento_id: Joi.string().uuid().optional(),
    sector_id: Joi.string().uuid().required(),
    capacidad_litros: Joi.number().integer().positive().required(),
    tipo_vidrio: enumSchema(GlassType).default('mixto'),
    status: enumSchema(BinStatus).default('activo'),
    ultimo_porcentaje: Joi.number().integer().min(0).max(100).default(0),
    bateria_nivel: Joi.number().integer().min(0).max(100).optional(),
    firmware_version: Joi.string().max(50).optional(),
    is_active: Joi.boolean().default(true),
    motivo_inactividad: Joi.string().optional()
});

// Validación de Evento de Sensor
const sensorEventSchema = Joi.object({
    hardware_id: Joi.string().regex(/^[A-Z0-9_-]+$/).required(),
    porcentaje_llenado: Joi.number().integer().min(0).max(100).required(),
    tipo_vidrio: enumSchema(GlassType).optional(),
    nivel_bateria: Joi.number().integer().min(0).max(100).optional(),
    temperatura: Joi.number().optional(),
    firmware_version: Joi.string().max(50).optional(),
    datos_adicionales: Joi.object().optional(),
    timestamp: Joi.date().default(() => new Date())
});

// Validación de Solicitud
const solicitudSchema = Joi.object({
    establecimiento_id: Joi.string().uuid().required(),
    solicitante_id: Joi.string().uuid().required(),
    tipo: enumSchema(RequestType).required(),
    descripcion: Joi.string().required(),
    datos_adicionales: Joi.object().optional(),
    bote_id: Joi.string().uuid().when('tipo', {
        is: RequestType.RETIRO,
        then: Joi.required(),
        otherwise: Joi.optional()
    })
});

// Validación de Reporte
const reporteSchema = Joi.object({
    bote_id: Joi.string().uuid().required(),
    reportero_id: Joi.string().uuid().required(),
    tipo: enumSchema(ReportType).required(),
    titulo: Joi.string().max(255).required(),
    descripcion: Joi.string().required(),
    imagenes_urls: Joi.array().items(Joi.string().uri()).optional()
});

// Validación de Ruta
const rutaSchema = Joi.object({
    sector_id: Joi.string().uuid().required(),
    creador_id: Joi.string().uuid().required(),
    nombre: Joi.string().max(255).required(),
    descripcion: Joi.string().optional(),
    fecha_planificada: Joi.date().optional(),
    hora_inicio: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    hora_fin: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional()
});

// Validación de Punto de Ruta
const puntoRutaSchema = Joi.object({
    ruta_id: Joi.string().uuid().required(),
    bote_id: Joi.string().uuid().required(),
    orden: Joi.number().integer().positive().required(),
    notas: Joi.string().optional()
});

module.exports = {
    userSchema,
    sectorSchema,
    establecimientoSchema,
    boteSchema,
    sensorEventSchema,
    solicitudSchema,
    reporteSchema,
    rutaSchema,
    puntoRutaSchema
};