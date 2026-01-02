-- ============================================================================
-- SEEDS 001: Datos Iniciales
-- Sistema de Reciclaje de Vidrio
-- ============================================================================

-- ============================================================================
-- SECTORES
-- ============================================================================

INSERT INTO sectores (id, nombre, codigo, descripcion, is_active) VALUES
    (uuid_generate_v4(), 'Centro Histórico', 'CENTRO', 'Zona centro de la ciudad', TRUE),
    (uuid_generate_v4(), 'Zona Norte', 'NORTE', 'Área comercial norte', TRUE),
    (uuid_generate_v4(), 'Zona Sur', 'SUR', 'Área residencial sur', TRUE),
    (uuid_generate_v4(), 'Zona Este', 'ESTE', 'Zona industrial este', TRUE);

-- ============================================================================
-- USUARIO ADMINISTRADOR
-- ============================================================================

-- Crear un usuario gestor de rutas para pruebas
INSERT INTO users (
    telegram_id,
    username,
    first_name,
    last_name,
    role,
    is_active,
    phone_number,
    email
) VALUES (
    5701353915, -- Reemplazar con tu Telegram ID real
    'admin_test',
    'Administrador',
    'Sistema',
    'gestor_rutas',
    TRUE,
    '+527351385366',
    'RdeReconcy@gmail.com'
);

-- ============================================================================
-- NOTA IMPORTANTE
-- ============================================================================
-- Los datos reales de establecimientos, botes y usuarios se crearán
-- dinámicamente a través del sistema.
-- 
-- Para obtener tu Telegram ID real:
-- 1. Habla con @userinfobot en Telegram
-- 2. El bot te responderá con tu ID
-- 3. Actualiza el valor en el INSERT de users arriba
-- ============================================================================