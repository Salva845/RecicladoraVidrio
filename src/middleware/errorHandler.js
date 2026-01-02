/**
 * Middleware global de manejo de errores
 */

const ApiResponse = require('../utils/response');

// Tipos de errores personalizados
class ValidationError extends Error {
    constructor(message, errors = null) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
        this.errors = errors;
    }
}

class NotFoundError extends Error {
    constructor(message = 'Recurso no encontrado') {
        super(message);
        this.name = 'NotFoundError';
        this.statusCode = 404;
    }
}

class ConflictError extends Error {
    constructor(message, errors = null) {
        super(message);
        this.name = 'ConflictError';
        this.statusCode = 409;
        this.errors = errors;
    }
}

class UnauthorizedError extends Error {
    constructor(message = 'No autorizado') {
        super(message);
        this.name = 'UnauthorizedError';
        this.statusCode = 401;
    }
}

// Middleware principal
function errorHandler(err, req, res, next) {
    // Logging del error
    console.error('Error capturado:', {
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method
    });

    // Errores de validación de Joi
    if (err.name === 'ValidationError' && err.isJoi) {
        return ApiResponse.badRequest(
            res,
            'Error de validación',
            err.details.map(d => ({
                field: d.path.join('.'),
                message: d.message
            }))
        );
    }

    // Errores personalizados
    if (err.statusCode) {
        return ApiResponse.error(res, err.message, err.statusCode, err.errors);
    }

    // Errores de base de datos PostgreSQL
    if (err.code) {
        switch (err.code) {
            case '23505': // Unique violation
                return ApiResponse.conflict(
                    res,
                    'El registro ya existe',
                    { detail: err.detail }
                );
            case '23503': // Foreign key violation
                return ApiResponse.badRequest(
                    res,
                    'Referencia inválida',
                    { detail: err.detail }
                );
            case '23502': // Not null violation
                return ApiResponse.badRequest(
                    res,
                    'Campo requerido faltante',
                    { column: err.column }
                );
            case '22P02': // Invalid text representation
                return ApiResponse.badRequest(
                    res,
                    'Formato de dato inválido'
                );
        }
    }

    // Error por defecto
    return ApiResponse.serverError(res, 'Error interno del servidor', err);
}

// Middleware para rutas no encontradas
function notFoundHandler(req, res) {
    return ApiResponse.notFound(
        res,
        `Ruta no encontrada: ${req.method} ${req.path}`
    );
}

module.exports = {
    errorHandler,
    notFoundHandler,
    ValidationError,
    NotFoundError,
    ConflictError,
    UnauthorizedError
};