/**
 * Enumeraciones del sistema
 * Deben coincidir exactamente con los tipos ENUM de PostgreSQL
 */

const UserRole = Object.freeze({
    GESTOR_RUTAS: 'gestor_rutas',
    DUENO_ESTABLECIMIENTO: 'dueno_establecimiento',
    RECOLECTOR: 'recolector'
});

const BinStatus = Object.freeze({
    ACTIVO: 'activo',
    PENDIENTE_RETIRO: 'pendiente_retiro',
    RETIRADO: 'retirado'
});

const GlassType = Object.freeze({
    TRANSPARENTE: 'transparente',
    VERDE: 'verde',
    AMBAR: 'ambar',
    MIXTO: 'mixto'
});

const RequestType = Object.freeze({
    INSTALACION: 'instalacion',
    RETIRO: 'retiro',
    RECOLECCION_MANUAL: 'recoleccion_manual',
    ASISTENCIA: 'asistencia'
});

const RequestStatus = Object.freeze({
    PENDIENTE: 'pendiente',
    APROBADA: 'aprobada',
    COMPLETADA: 'completada',
    CANCELADA: 'cancelada'
});

const ReportType = Object.freeze({
    DANO_FISICO: 'dano_fisico',
    SENSOR_FALLA: 'sensor_falla',
    VANDALISMO: 'vandalismo',
    OTRO: 'otro'
});

const RouteStatus = Object.freeze({
    PLANIFICADA: 'planificada',
    ASIGNADA: 'asignada',
    EN_PROGRESO: 'en_progreso',
    COMPLETADA: 'completada',
    CANCELADA: 'cancelada'
});

/**
 * Niveles de llenado para clasificación automática
 */
const FillLevel = Object.freeze({
    NORMAL: { min: 0, max: 59, label: 'Normal' },
    PENDIENTE: { min: 60, max: 79, label: 'Pendiente de recolección' },
    CRITICO: { min: 80, max: 100, label: 'Crítico' }
});

/**
 * Clasificar el nivel de llenado según el porcentaje
 */
function clasificarNivelLlenado(porcentaje) {
    if (porcentaje >= FillLevel.CRITICO.min) {
        return FillLevel.CRITICO;
    } else if (porcentaje >= FillLevel.PENDIENTE.min) {
        return FillLevel.PENDIENTE;
    }
    return FillLevel.NORMAL;
}

/**
 * Validar que un valor pertenezca a un enum
 */
function validarEnum(valor, enumObj, nombreEnum) {
    const valoresValidos = Object.values(enumObj);
    if (!valoresValidos.includes(valor)) {
        throw new Error(
            `Valor inválido para ${nombreEnum}: ${valor}. ` +
            `Valores válidos: ${valoresValidos.join(', ')}`
        );
    }
    return true;
}

module.exports = {
    UserRole,
    BinStatus,
    GlassType,
    RequestType,
    RequestStatus,
    ReportType,
    RouteStatus,
    FillLevel,
    clasificarNivelLlenado,
    validarEnum
};