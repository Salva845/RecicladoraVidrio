-- ============================================================================
-- MIGRATION 002: Enforce establecimiento owner role
-- Sistema de Reciclaje de Vidrio
-- ============================================================================

-- Validar que el propietario sea dueño de establecimiento
CREATE OR REPLACE FUNCTION enforce_establecimiento_owner_role()
RETURNS TRIGGER AS $$
DECLARE
    owner_role user_role;
BEGIN
    -- Permitir establecimientos sin propietario asignado
    IF NEW.propietario_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT role INTO owner_role
    FROM users
    WHERE id = NEW.propietario_id;

    IF owner_role IS NULL THEN
        RAISE EXCEPTION 'propietario_id % no existe en users', NEW.propietario_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF owner_role <> 'dueno_establecimiento' THEN
        RAISE EXCEPTION 'propietario_id % debe tener rol dueno_establecimiento', NEW.propietario_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_establecimiento_owner_role ON establecimientos;

CREATE TRIGGER validate_establecimiento_owner_role
BEFORE INSERT OR UPDATE OF propietario_id ON establecimientos
FOR EACH ROW
EXECUTE FUNCTION enforce_establecimiento_owner_role();
