-- ============================================================================
-- MIGRATION 001: Initial Schema
-- Sistema de Reciclaje de Vidrio
-- ============================================================================

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Habilitar extensión para tipos de datos geográficos (futuro)
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- TIPOS ENUMERADOS
-- ============================================================================

-- Tipos de usuario en el sistema
CREATE TYPE user_role AS ENUM (
    'gestor_rutas',      -- Administrador del sistema
    'dueno_establecimiento', -- Propietario del negocio
    'recolector'         -- Operador en campo
);

-- Estados del bote
CREATE TYPE bin_status AS ENUM (
    'activo',            -- En operación normal
    'pendiente_retiro',  -- Solicitud aprobada, pendiente recolección física
    'retirado'           -- Confirmado físicamente como retirado
);

-- Tipos de vidrio
CREATE TYPE glass_type AS ENUM (
    'transparente',
    'verde',
    'ambar',
    'mixto'
);

-- Tipos de solicitudes
CREATE TYPE request_type AS ENUM (
    'instalacion',       -- Nueva instalación de bote
    'retiro',            -- Retiro de bote existente
    'recoleccion_manual', -- Solicitud de recolección fuera de ruta
    'asistencia'         -- Asistencia técnica o telefónica
);

-- Estados de solicitud
CREATE TYPE request_status AS ENUM (
    'pendiente',         -- Recién creada
    'aprobada',          -- Aprobada por gestor
    'completada',        -- Finalizada
    'cancelada'          -- Cancelada
);

-- Tipos de reporte
CREATE TYPE report_type AS ENUM (
    'dano_fisico',       -- Daño en el bote
    'sensor_falla',      -- Problema con el sensor
    'vandalismo',        -- Acto vandálico
    'otro'               -- Otros problemas
);

-- Estados de ruta
CREATE TYPE route_status AS ENUM (
    'planificada',       -- Creada, no asignada
    'asignada',          -- Asignada a recolector
    'en_progreso',       -- Recolector ha iniciado
    'completada',        -- Todos los puntos atendidos
    'cancelada'          -- Cancelada por administrador
);

-- ============================================================================
-- TABLA: users
-- Usuarios del sistema con diferentes roles
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Datos de identificación
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    
    -- Control de acceso
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Datos de contacto
    phone_number VARCHAR(20),
    email VARCHAR(255),
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    
    -- Constraints
    CONSTRAINT users_telegram_id_positive CHECK (telegram_id > 0)
);

-- Índices
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- TABLA: sectores
-- Divisiones geográficas para organizar la recolección
-- ============================================================================

CREATE TABLE sectores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identificación
    nombre VARCHAR(255) NOT NULL,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    
    -- Descripción
    descripcion TEXT,
    
    -- Datos geográficos (opcional para fase 1, útil para futuro)
    area_geografica GEOMETRY(POLYGON, 4326),
    
    -- Control
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT sectores_codigo_format CHECK (codigo ~ '^[A-Z0-9_-]+$')
);

-- Índices
CREATE INDEX idx_sectores_codigo ON sectores(codigo);
CREATE INDEX idx_sectores_active ON sectores(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_sectores_area ON sectores USING GIST(area_geografica);

-- ============================================================================
-- TABLA: establecimientos
-- Lugares físicos donde se instalan los botes
-- ============================================================================

CREATE TABLE establecimientos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relaciones
    sector_id UUID NOT NULL REFERENCES sectores(id) ON DELETE RESTRICT,
    propietario_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Identificación
    nombre VARCHAR(255) NOT NULL,
    tipo VARCHAR(100), -- restaurante, hotel, bar, etc.
    
    -- Ubicación
    direccion TEXT NOT NULL,
    ubicacion GEOMETRY(POINT, 4326),
    referencias TEXT,
    
    -- Contacto
    telefono_contacto VARCHAR(20),
    email_contacto VARCHAR(255),
    
    -- Control
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT establecimientos_sector_fk CHECK (sector_id IS NOT NULL)
);

-- Índices
CREATE INDEX idx_establecimientos_sector ON establecimientos(sector_id);
CREATE INDEX idx_establecimientos_propietario ON establecimientos(propietario_id);
CREATE INDEX idx_establecimientos_active ON establecimientos(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_establecimientos_ubicacion ON establecimientos USING GIST(ubicacion);

-- ============================================================================
-- TABLA: botes
-- Contenedores inteligentes de reciclaje
-- ============================================================================

CREATE TABLE botes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identificador único del hardware
    hardware_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Relaciones
    establecimiento_id UUID REFERENCES establecimientos(id) ON DELETE SET NULL,
    sector_id UUID NOT NULL REFERENCES sectores(id) ON DELETE RESTRICT,
    
    -- Características físicas
    capacidad_litros INTEGER NOT NULL,
    tipo_vidrio glass_type DEFAULT 'mixto',
    
    -- Estado operativo
    status bin_status DEFAULT 'activo',
    ultimo_porcentaje INTEGER DEFAULT 0,
    ultima_lectura TIMESTAMP,
    
    -- Información del sensor
    bateria_nivel INTEGER,
    firmware_version VARCHAR(50),
    
    -- Control
    is_active BOOLEAN DEFAULT TRUE,
    motivo_inactividad TEXT,
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    instalado_at TIMESTAMP,
    retirado_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT botes_capacidad_positive CHECK (capacidad_litros > 0),
    CONSTRAINT botes_porcentaje_range CHECK (ultimo_porcentaje BETWEEN 0 AND 100),
    CONSTRAINT botes_bateria_range CHECK (bateria_nivel IS NULL OR (bateria_nivel BETWEEN 0 AND 100)),
    CONSTRAINT botes_hardware_id_format CHECK (hardware_id ~ '^[A-Z0-9_-]+$')
);

-- Índices
CREATE INDEX idx_botes_hardware_id ON botes(hardware_id);
CREATE INDEX idx_botes_establecimiento ON botes(establecimiento_id);
CREATE INDEX idx_botes_sector ON botes(sector_id);
CREATE INDEX idx_botes_status ON botes(status);
CREATE INDEX idx_botes_active ON botes(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_botes_criticos ON botes(ultimo_porcentaje) WHERE ultimo_porcentaje >= 60;
CREATE INDEX idx_botes_pendientes ON botes(status, ultimo_porcentaje) 
    WHERE status = 'activo' AND ultimo_porcentaje >= 60;

-- ============================================================================
-- TABLA: historial_estados_bote
-- Registro histórico de cambios de estado de cada bote
-- ============================================================================

CREATE TABLE historial_estados_bote (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relaciones
    bote_id UUID NOT NULL REFERENCES botes(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Cambio de estado
    estado_anterior bin_status,
    estado_nuevo bin_status NOT NULL,
    motivo TEXT,
    
    -- Datos contextuales
    porcentaje_llenado INTEGER,
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT historial_porcentaje_range CHECK (
        porcentaje_llenado IS NULL OR (porcentaje_llenado BETWEEN 0 AND 100)
    )
);

-- Índices
CREATE INDEX idx_historial_bote ON historial_estados_bote(bote_id, created_at DESC);
CREATE INDEX idx_historial_estado ON historial_estados_bote(estado_nuevo);
CREATE INDEX idx_historial_fecha ON historial_estados_bote(created_at DESC);

-- ============================================================================
-- TABLA: solicitudes
-- Peticiones realizadas por dueños de establecimientos
-- ============================================================================

CREATE TABLE solicitudes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relaciones
    establecimiento_id UUID NOT NULL REFERENCES establecimientos(id) ON DELETE CASCADE,
    solicitante_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    aprobador_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Tipo y estado
    tipo request_type NOT NULL,
    status request_status DEFAULT 'pendiente',
    
    -- Detalles de la solicitud
    descripcion TEXT NOT NULL,
    datos_adicionales JSONB, -- Capacidad, tamaño, detalles específicos
    
    -- Bote relacionado (si aplica)
    bote_id UUID REFERENCES botes(id) ON DELETE SET NULL,
    
    -- Respuesta administrativa
    respuesta_admin TEXT,
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aprobada_at TIMESTAMP,
    completada_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT solicitudes_bote_required_for_retiro CHECK (
        tipo != 'retiro' OR bote_id IS NOT NULL
    )
);

-- Índices
CREATE INDEX idx_solicitudes_establecimiento ON solicitudes(establecimiento_id);
CREATE INDEX idx_solicitudes_solicitante ON solicitudes(solicitante_id);
CREATE INDEX idx_solicitudes_tipo ON solicitudes(tipo);
CREATE INDEX idx_solicitudes_status ON solicitudes(status);
CREATE INDEX idx_solicitudes_pendientes ON solicitudes(status) WHERE status = 'pendiente';
CREATE INDEX idx_solicitudes_fecha ON solicitudes(created_at DESC);

-- ============================================================================
-- TABLA: reportes
-- Reportes de problemas o incidencias
-- ============================================================================

CREATE TABLE reportes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relaciones
    bote_id UUID NOT NULL REFERENCES botes(id) ON DELETE CASCADE,
    reportero_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    atendido_por_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Tipo y estado
    tipo report_type NOT NULL,
    status request_status DEFAULT 'pendiente',
    
    -- Descripción del problema
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    
    -- Evidencia
    imagenes_urls TEXT[], -- URLs de imágenes subidas
    
    -- Resolución
    resolucion TEXT,
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atendido_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT reportes_titulo_not_empty CHECK (LENGTH(TRIM(titulo)) > 0)
);

-- Índices
CREATE INDEX idx_reportes_bote ON reportes(bote_id);
CREATE INDEX idx_reportes_reportero ON reportes(reportero_id);
CREATE INDEX idx_reportes_tipo ON reportes(tipo);
CREATE INDEX idx_reportes_status ON reportes(status);
CREATE INDEX idx_reportes_pendientes ON reportes(status) WHERE status = 'pendiente';
CREATE INDEX idx_reportes_fecha ON reportes(created_at DESC);

-- ============================================================================
-- TABLA: rutas
-- Rutas de recolección planificadas
-- ============================================================================

CREATE TABLE rutas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relaciones
    sector_id UUID NOT NULL REFERENCES sectores(id) ON DELETE RESTRICT,
    creador_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recolector_asignado_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Identificación
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    
    -- Estado
    status route_status DEFAULT 'planificada',
    
    -- Programación
    fecha_planificada DATE,
    hora_inicio TIME,
    hora_fin TIME,
    
    -- Métricas
    total_puntos INTEGER DEFAULT 0,
    puntos_completados INTEGER DEFAULT 0,
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    iniciada_at TIMESTAMP,
    completada_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT rutas_puntos_valid CHECK (
        puntos_completados >= 0 AND 
        puntos_completados <= total_puntos
    ),
    CONSTRAINT rutas_nombre_not_empty CHECK (LENGTH(TRIM(nombre)) > 0)
);

-- Índices
CREATE INDEX idx_rutas_sector ON rutas(sector_id);
CREATE INDEX idx_rutas_creador ON rutas(creador_id);
CREATE INDEX idx_rutas_recolector ON rutas(recolector_asignado_id);
CREATE INDEX idx_rutas_status ON rutas(status);
CREATE INDEX idx_rutas_fecha ON rutas(fecha_planificada);
CREATE INDEX idx_rutas_activas ON rutas(status) 
    WHERE status IN ('planificada', 'asignada', 'en_progreso');

-- ============================================================================
-- TABLA: puntos_ruta
-- Puntos individuales dentro de una ruta
-- ============================================================================

CREATE TABLE puntos_ruta (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relaciones
    ruta_id UUID NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
    bote_id UUID NOT NULL REFERENCES botes(id) ON DELETE CASCADE,
    
    -- Orden en la ruta
    orden INTEGER NOT NULL,
    
    -- Estado
    completado BOOLEAN DEFAULT FALSE,
    
    -- Datos al momento de la recolección
    porcentaje_al_recolectar INTEGER,
    notas TEXT,
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completado_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT puntos_ruta_orden_positive CHECK (orden > 0),
    CONSTRAINT puntos_ruta_porcentaje_range CHECK (
        porcentaje_al_recolectar IS NULL OR 
        (porcentaje_al_recolectar BETWEEN 0 AND 100)
    ),
    CONSTRAINT puntos_ruta_unique_order UNIQUE (ruta_id, orden)
);

-- Índices
CREATE INDEX idx_puntos_ruta_ruta ON puntos_ruta(ruta_id, orden);
CREATE INDEX idx_puntos_ruta_bote ON puntos_ruta(bote_id);
CREATE INDEX idx_puntos_ruta_pendientes ON puntos_ruta(ruta_id, completado) 
    WHERE completado = FALSE;

-- ============================================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================================

-- Función para actualizar timestamp de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas relevantes
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sectores_updated_at BEFORE UPDATE ON sectores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_establecimientos_updated_at BEFORE UPDATE ON establecimientos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_botes_updated_at BEFORE UPDATE ON botes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_solicitudes_updated_at BEFORE UPDATE ON solicitudes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reportes_updated_at BEFORE UPDATE ON reportes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rutas_updated_at BEFORE UPDATE ON rutas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para actualizar contadores de ruta
CREATE OR REPLACE FUNCTION update_route_counters()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE rutas 
        SET total_puntos = total_puntos + 1 
        WHERE id = NEW.ruta_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE rutas 
        SET total_puntos = total_puntos - 1,
            puntos_completados = CASE 
                WHEN OLD.completado THEN puntos_completados - 1 
                ELSE puntos_completados 
            END
        WHERE id = OLD.ruta_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.completado IS DISTINCT FROM NEW.completado THEN
        UPDATE rutas 
        SET puntos_completados = puntos_completados + CASE 
                WHEN NEW.completado THEN 1 
                ELSE -1 
            END
        WHERE id = NEW.ruta_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_route_point_counters 
    AFTER INSERT OR UPDATE OR DELETE ON puntos_ruta
    FOR EACH ROW EXECUTE FUNCTION update_route_counters();

-- Función para auto-completar ruta cuando todos los puntos están atendidos
CREATE OR REPLACE FUNCTION auto_complete_route()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.total_puntos > 0 AND NEW.puntos_completados = NEW.total_puntos THEN
        UPDATE rutas 
        SET status = 'completada',
            completada_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id AND status != 'completada';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_route_completion 
    AFTER UPDATE ON rutas
    FOR EACH ROW EXECUTE FUNCTION auto_complete_route();

-- ============================================================================
-- COMENTARIOS EN TABLAS (Documentación)
-- ============================================================================

COMMENT ON TABLE users IS 'Usuarios del sistema con acceso vía Telegram';
COMMENT ON TABLE sectores IS 'Divisiones geográficas para organización de recolección';
COMMENT ON TABLE establecimientos IS 'Lugares físicos donde se instalan botes';
COMMENT ON TABLE botes IS 'Contenedores inteligentes con sensores IoT';
COMMENT ON TABLE historial_estados_bote IS 'Registro histórico de cambios de estado';
COMMENT ON TABLE solicitudes IS 'Peticiones de instalación, retiro o asistencia';
COMMENT ON TABLE reportes IS 'Reportes de problemas o daños en botes';
COMMENT ON TABLE rutas IS 'Rutas de recolección planificadas por sector';
COMMENT ON TABLE puntos_ruta IS 'Puntos individuales que conforman una ruta';

COMMENT ON COLUMN botes.hardware_id IS 'Identificador único del circuito electrónico';
COMMENT ON COLUMN botes.ultimo_porcentaje IS 'Último porcentaje reportado por el sensor';
COMMENT ON COLUMN botes.status IS 'Estado operativo: activo, pendiente_retiro, retirado';

-- ============================================================================
-- FIN DE MIGRATION 001
-- ============================================================================
