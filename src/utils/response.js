/**
 * Utilidades para respuestas HTTP estandarizadas
 */

class ApiResponse {
    static success(res, data = null, message = 'Operación exitosa', statusCode = 200) {
        return res.status(statusCode).json({
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    static created(res, data = null, message = 'Recurso creado exitosamente') {
        return this.success(res, data, message, 201);
    }

    static error(res, message = 'Error en la operación', statusCode = 500, errors = null) {
        return res.status(statusCode).json({
            success: false,
            message,
            errors,
            timestamp: new Date().toISOString()
        });
    }

    static badRequest(res, message = 'Solicitud inválida', errors = null) {
        return this.error(res, message, 400, errors);
    }

    static unauthorized(res, message = 'No autorizado') {
        return this.error(res, message, 401);
    }

    static forbidden(res, message = 'Acceso prohibido') {
        return this.error(res, message, 403);
    }

    static notFound(res, message = 'Recurso no encontrado') {
        return this.error(res, message, 404);
    }

    static conflict(res, message = 'Conflicto con el estado actual', errors = null) {
        return this.error(res, message, 409, errors);
    }

    static serverError(res, message = 'Error interno del servidor', error = null) {
        // En producción, no exponer detalles del error
        const errors = process.env.NODE_ENV === 'development' && error
            ? { details: error.message, stack: error.stack }
            : null;

        return this.error(res, message, 500, errors);
    }
}

module.exports = ApiResponse;