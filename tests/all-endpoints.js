/*
 * Ejecuta pruebas de smoke para todos los endpoints del API.
 *
 * Uso:
 *   API_URL=http://localhost:3000 \
 *   ADMIN_TOKEN=... \
 *   RECOLECTOR_TOKEN=... \
 *   DUENO_TOKEN=... \
 *   node tests/all-endpoints.js
 */

const crypto = require('crypto');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const RECOLECTOR_TOKEN = process.env.RECOLECTOR_TOKEN || '';
const DUENO_TOKEN = process.env.DUENO_TOKEN || '';

const results = [];

function authHeader(token) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request({ name, method, path, token, body, allowedStatuses }) {
    const url = `${BASE_URL}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        ...authHeader(token)
    };

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        const text = await response.text();
        let json = null;

        try {
            json = text ? JSON.parse(text) : null;
        } catch (error) {
            json = { raw: text };
        }

        const isAllowed = Array.isArray(allowedStatuses)
            ? allowedStatuses.includes(response.status)
            : false;
        const ok = response.ok || isAllowed;
        const entry = {
            name,
            method,
            path,
            status: response.status,
            ok,
            allowed: isAllowed,
            body: json
        };

        results.push(entry);
        const statusIcon = response.ok ? '✅' : isAllowed ? '⚠️' : '❌';
        console.log(`${statusIcon} ${name} -> ${response.status}`);
        return entry;
    } catch (error) {
        const entry = {
            name,
            method,
            path,
            status: 'ERROR',
            ok: false,
            error: error.message
        };
        results.push(entry);
        console.log(`❌ ${name} -> ERROR (${error.message})`);
        return entry;
    }
}

function getFirstItem(data, key) {
    if (!data || !data[key] || !Array.isArray(data[key]) || data[key].length === 0) {
        return null;
    }
    return data[key][0];
}

async function getUserProfile(token, label) {
    if (!token) {
        console.log(`⚠️  Token no configurado para ${label}.`);
        return null;
    }

    const response = await request({
        name: `GET /api/auth/me (${label})`,
        method: 'GET',
        path: '/api/auth/me',
        token
    });

    return response.ok ? response.body?.data?.user : null;
}

async function run() {
    console.log(`🚀 Ejecutando smoke tests en ${BASE_URL}`);

    await request({ name: 'GET /', method: 'GET', path: '/' });
    await request({ name: 'GET /health', method: 'GET', path: '/health' });

    const adminUser = await getUserProfile(ADMIN_TOKEN, 'admin');
    const duenoUser = await getUserProfile(DUENO_TOKEN, 'dueno');
    const recolectorUser = await getUserProfile(RECOLECTOR_TOKEN, 'recolector');

    if (ADMIN_TOKEN) {
        await request({
            name: 'POST /api/auth/verify',
            method: 'POST',
            path: '/api/auth/verify',
            body: { token: ADMIN_TOKEN }
        });

        await request({
            name: 'PATCH /api/auth/me',
            method: 'PATCH',
            path: '/api/auth/me',
            token: ADMIN_TOKEN,
            body: { username: `admin_test_${Date.now()}` }
        });

        const listUsers = await request({
            name: 'GET /api/auth/users',
            method: 'GET',
            path: '/api/auth/users',
            token: ADMIN_TOKEN
        });

        const firstUser = getFirstItem(listUsers.body?.data, 'users');
        const userId = firstUser?.id;

        if (userId && userId !== adminUser?.id) {
            await request({
                name: 'GET /api/auth/users/:id',
                method: 'GET',
                path: `/api/auth/users/${userId}`,
                token: ADMIN_TOKEN
            });

            await request({
                name: 'POST /api/auth/users/:id/deactivate',
                method: 'POST',
                path: `/api/auth/users/${userId}/deactivate`,
                token: ADMIN_TOKEN,
                body: { motivo: 'smoke-test' }
            });

            await request({
                name: 'POST /api/auth/users/:id/reactivate',
                method: 'POST',
                path: `/api/auth/users/${userId}/reactivate`,
                token: ADMIN_TOKEN
            });
        }

        await request({
            name: 'POST /api/auth/register',
            method: 'POST',
            path: '/api/auth/register',
            token: ADMIN_TOKEN,
            body: {
                telegram_id: Math.floor(Math.random() * 1000000000),
                role: 'dueno_establecimiento',
                first_name: 'Usuario',
                last_name: 'SmokeTest',
                username: `smoke_${crypto.randomUUID().slice(0, 8)}`
            }
        });
    }

    const establecimientosResponse = await request({
        name: 'GET /api/establecimientos',
        method: 'GET',
        path: '/api/establecimientos',
        token: ADMIN_TOKEN || DUENO_TOKEN
    });

    const firstEstablecimiento = getFirstItem(establecimientosResponse.body?.data, 'establecimientos');
    const establecimientoId = firstEstablecimiento?.id;
    const sectorId = firstEstablecimiento?.sector_id;

    if (establecimientoId) {
        await request({
            name: 'GET /api/establecimientos/:id',
            method: 'GET',
            path: `/api/establecimientos/${establecimientoId}`,
            token: ADMIN_TOKEN || DUENO_TOKEN
        });

        await request({
            name: 'PATCH /api/establecimientos/:id',
            method: 'PATCH',
            path: `/api/establecimientos/${establecimientoId}`,
            token: ADMIN_TOKEN || DUENO_TOKEN,
            body: { referencias: 'Actualizado por smoke test' }
        });
    }

    if (establecimientoId && ADMIN_TOKEN) {
        await request({
            name: 'POST /api/establecimientos/:id/deactivate',
            method: 'POST',
            path: `/api/establecimientos/${establecimientoId}/deactivate`,
            token: ADMIN_TOKEN,
            body: { motivo: 'smoke-test' }
        });

        await request({
            name: 'POST /api/establecimientos/:id/reactivate',
            method: 'POST',
            path: `/api/establecimientos/${establecimientoId}/reactivate`,
            token: ADMIN_TOKEN
        });
    }

    if (sectorId && (ADMIN_TOKEN || DUENO_TOKEN)) {
        await request({
            name: 'POST /api/establecimientos',
            method: 'POST',
            path: '/api/establecimientos',
            token: ADMIN_TOKEN || DUENO_TOKEN,
            body: {
                sector_id: sectorId,
                propietario_id: duenoUser?.id,
                nombre: `Establecimiento ${crypto.randomUUID().slice(0, 6)}`,
                direccion: 'Av. Principal 123'
            }
        });
    }

    const binsResponse = await request({
        name: 'GET /api/bins',
        method: 'GET',
        path: '/api/bins',
        token: ADMIN_TOKEN || RECOLECTOR_TOKEN || DUENO_TOKEN
    });

    const firstBin = getFirstItem(binsResponse.body?.data, 'botes');
    const binId = firstBin?.id;
    const binHardware = firstBin?.hardware_id;
    const binSectorId = firstBin?.sector_id || sectorId;
    const binStatus = firstBin?.status;
    let createdBinId = null;
    let createdBinHardware = null;
    let createdBinStatus = null;

    let updatedBinStatus = binStatus;

    if (binSectorId && establecimientoId && ADMIN_TOKEN) {
        const createBinResponse = await request({
            name: 'POST /api/bins',
            method: 'POST',
            path: '/api/bins',
            token: ADMIN_TOKEN,
            body: {
                hardware_id: `BIN_${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                establecimiento_id: establecimientoId,
                sector_id: binSectorId,
                capacidad_litros: 120,
                tipo_vidrio: 'mixto'
            }
        });

        if (createBinResponse.ok) {
            createdBinId = createBinResponse.body?.data?.id || null;
            createdBinHardware = createBinResponse.body?.data?.hardware_id || null;
            createdBinStatus = createBinResponse.body?.data?.status || null;
        }
    }

    const statusTargetBinId = createdBinId || binId;
    const statusTargetBinStatus = createdBinStatus || binStatus;
    const statusTargetHardware = createdBinHardware || binHardware;

    if (statusTargetBinId) {
        await request({
            name: 'GET /api/bins/:id',
            method: 'GET',
            path: `/api/bins/${statusTargetBinId}`,
            token: ADMIN_TOKEN || RECOLECTOR_TOKEN
        });

        await request({
            name: 'GET /api/bins/:id/history',
            method: 'GET',
            path: `/api/bins/${statusTargetBinId}/history`,
            token: ADMIN_TOKEN || RECOLECTOR_TOKEN
        });

        const nextStatusByCurrent = {
            activo: 'pendiente_retiro',
            pendiente_retiro: 'retirado',
            retirado: 'activo'
        };
        const nextStatus = nextStatusByCurrent[statusTargetBinStatus];

        if (nextStatus) {
            const statusChangeResponse = await request({
                name: 'POST /api/bins/:id/status',
                method: 'POST',
                path: `/api/bins/${statusTargetBinId}/status`,
                token: ADMIN_TOKEN,
                body: { nuevo_estado: nextStatus, motivo: 'smoke-test' }
            });
            if (statusChangeResponse.ok) {
                updatedBinStatus = statusChangeResponse.body?.data?.status || updatedBinStatus;
            }
        }

        await request({
            name: 'POST /api/bins/:id/deactivate',
            method: 'POST',
            path: `/api/bins/${statusTargetBinId}/deactivate`,
            token: ADMIN_TOKEN,
            body: { motivo: 'smoke-test' }
        });

        await request({
            name: 'POST /api/bins/:id/reactivate',
            method: 'POST',
            path: `/api/bins/${statusTargetBinId}/reactivate`,
            token: ADMIN_TOKEN
        });
    }

    if (statusTargetHardware) {
        await request({
            name: 'GET /api/bins/hardware/:hardwareId',
            method: 'GET',
            path: `/api/bins/hardware/${statusTargetHardware}`,
            token: ADMIN_TOKEN || RECOLECTOR_TOKEN
        });

        await request({
            name: 'POST /api/events',
            method: 'POST',
            path: '/api/events',
            body: {
                hardware_id: statusTargetHardware,
                porcentaje_llenado: 65,
                tipo_vidrio: 'transparente',
                nivel_bateria: 80
            }
        });

        if (ADMIN_TOKEN) {
            await request({
                name: 'GET /api/events/bin/:hardwareId',
                method: 'GET',
                path: `/api/events/bin/${statusTargetHardware}`,
                token: ADMIN_TOKEN
            });

            await request({
                name: 'GET /api/events/bin/:hardwareId/last',
                method: 'GET',
                path: `/api/events/bin/${statusTargetHardware}/last`,
                token: ADMIN_TOKEN
            });

            await request({
                name: 'GET /api/events/bin/:hardwareId/stats',
                method: 'GET',
                path: `/api/events/bin/${statusTargetHardware}/stats`,
                token: ADMIN_TOKEN
            });
        }
    }

    await request({
        name: 'GET /api/bins/status/pending',
        method: 'GET',
        path: '/api/bins/status/pending',
        token: ADMIN_TOKEN || RECOLECTOR_TOKEN
    });

    await request({
        name: 'GET /api/bins/status/critical',
        method: 'GET',
        path: '/api/bins/status/critical',
        token: ADMIN_TOKEN || RECOLECTOR_TOKEN
    });

    if (statusTargetBinId && establecimientoId && ADMIN_TOKEN && updatedBinStatus === 'retirado') {
        await request({
            name: 'POST /api/bins/:id/reassign',
            method: 'POST',
            path: `/api/bins/${statusTargetBinId}/reassign`,
            token: ADMIN_TOKEN,
            body: {
                establecimiento_id: establecimientoId,
                sector_id: binSectorId
            }
        });

        await request({
            name: 'PATCH /api/bins/:id',
            method: 'PATCH',
            path: `/api/bins/${statusTargetBinId}`,
            token: ADMIN_TOKEN,
            body: { capacidad_litros: 140 }
        });
    }

    if (ADMIN_TOKEN) {
        await request({
            name: 'GET /api/events/unprocessed',
            method: 'GET',
            path: '/api/events/unprocessed',
            token: ADMIN_TOKEN
        });

        await request({
            name: 'GET /api/events/critical',
            method: 'GET',
            path: '/api/events/critical',
            token: ADMIN_TOKEN
        });

        await request({
            name: 'GET /api/events/glass-type/:type',
            method: 'GET',
            path: '/api/events/glass-type/transparente',
            token: ADMIN_TOKEN
        });

        await request({
            name: 'GET /api/events/stats/global',
            method: 'GET',
            path: '/api/events/stats/global',
            token: ADMIN_TOKEN
        });
    }

    const requestsResponse = await request({
        name: 'GET /api/requests',
        method: 'GET',
        path: '/api/requests',
        token: ADMIN_TOKEN || DUENO_TOKEN
    });

    const firstRequest = getFirstItem(requestsResponse.body?.data, 'solicitudes');
    const requestId = firstRequest?.id;

    if (requestId && ADMIN_TOKEN) {
        await request({
            name: 'GET /api/requests/:id',
            method: 'GET',
            path: `/api/requests/${requestId}`,
            token: ADMIN_TOKEN
        });

        await request({
            name: 'POST /api/requests/:id/approve',
            method: 'POST',
            path: `/api/requests/${requestId}/approve`,
            token: ADMIN_TOKEN,
            body: { aprobador_id: adminUser?.id }
        });

        await request({
            name: 'POST /api/requests/:id/complete',
            method: 'POST',
            path: `/api/requests/${requestId}/complete`,
            token: ADMIN_TOKEN,
            body: { usuario_id: adminUser?.id }
        });

        await request({
            name: 'POST /api/requests/:id/cancel',
            method: 'POST',
            path: `/api/requests/${requestId}/cancel`,
            token: ADMIN_TOKEN,
            body: { usuario_id: adminUser?.id, motivo: 'smoke-test' }
        });
    }

    if (ADMIN_TOKEN) {
        await request({
            name: 'GET /api/requests/pending',
            method: 'GET',
            path: '/api/requests/pending',
            token: ADMIN_TOKEN
        });

        await request({
            name: 'GET /api/requests/stats',
            method: 'GET',
            path: '/api/requests/stats',
            token: ADMIN_TOKEN
        });
    }

    if (DUENO_TOKEN && establecimientoId && duenoUser?.id) {
        await request({
            name: 'POST /api/requests',
            method: 'POST',
            path: '/api/requests',
            token: DUENO_TOKEN,
            body: {
                establecimiento_id: establecimientoId,
                solicitante_id: duenoUser.id,
                tipo: 'retiro',
                descripcion: 'Solicitud creada por smoke test',
                bote_id: binId
            }
        });
    }

    const reportsResponse = await request({
        name: 'GET /api/reports',
        method: 'GET',
        path: '/api/reports',
        token: ADMIN_TOKEN || DUENO_TOKEN
    });

    const firstReport = getFirstItem(reportsResponse.body?.data, 'reportes');
    const reportId = firstReport?.id;

    if (reportId) {
        await request({
            name: 'GET /api/reports/:id',
            method: 'GET',
            path: `/api/reports/${reportId}`,
            token: ADMIN_TOKEN || DUENO_TOKEN
        });

        if (ADMIN_TOKEN) {
            await request({
                name: 'POST /api/reports/:id/attend',
                method: 'POST',
                path: `/api/reports/${reportId}/attend`,
                token: ADMIN_TOKEN,
                body: { usuario_id: adminUser?.id, completar: false }
            });
        }
    }

    if (ADMIN_TOKEN) {
        await request({
            name: 'GET /api/reports/pending',
            method: 'GET',
            path: '/api/reports/pending',
            token: ADMIN_TOKEN
        });

        await request({
            name: 'GET /api/reports/critical',
            method: 'GET',
            path: '/api/reports/critical',
            token: ADMIN_TOKEN
        });
    }

    await request({
        name: 'GET /api/reports/stats',
        method: 'GET',
        path: '/api/reports/stats',
        token: ADMIN_TOKEN || DUENO_TOKEN
    });

    if (binId) {
        await request({
            name: 'GET /api/reports/bin/:boteId',
            method: 'GET',
            path: `/api/reports/bin/${binId}`,
            token: ADMIN_TOKEN || DUENO_TOKEN
        });
    }

    if (DUENO_TOKEN && binId && duenoUser?.id) {
        await request({
            name: 'POST /api/reports',
            method: 'POST',
            path: '/api/reports',
            token: DUENO_TOKEN,
            body: {
                bote_id: binId,
                reportero_id: duenoUser.id,
                tipo: 'dano_fisico',
                titulo: 'Reporte de prueba',
                descripcion: 'Descripción de prueba'
            }
        });
    }

    const routesResponse = await request({
        name: 'GET /api/routes',
        method: 'GET',
        path: '/api/routes',
        token: ADMIN_TOKEN || RECOLECTOR_TOKEN
    });

    const firstRoute = getFirstItem(routesResponse.body?.data, 'rutas');
    const routeSectorId = firstRoute?.sector_id || binSectorId || sectorId;

    if (ADMIN_TOKEN) {
        await request({
            name: 'GET /api/routes/available',
            method: 'GET',
            path: '/api/routes/available',
            token: ADMIN_TOKEN
        });
    }

    let flowRouteId = null;
    let cancelRouteId = null;
    let pointId = null;

    if (ADMIN_TOKEN && routeSectorId && adminUser?.id) {
        const createFlowRoute = await request({
            name: 'POST /api/routes',
            method: 'POST',
            path: '/api/routes',
            token: ADMIN_TOKEN,
            body: {
                sector_id: routeSectorId,
                creador_id: adminUser.id,
                nombre: `Ruta smoke ${crypto.randomUUID().slice(0, 6)}`
            }
        });

        flowRouteId = createFlowRoute.ok ? createFlowRoute.body?.data?.id : null;

        const createCancelRoute = await request({
            name: 'POST /api/routes (cancel)',
            method: 'POST',
            path: '/api/routes',
            token: ADMIN_TOKEN,
            body: {
                sector_id: routeSectorId,
                creador_id: adminUser.id,
                nombre: `Ruta cancel ${crypto.randomUUID().slice(0, 6)}`
            }
        });

        cancelRouteId = createCancelRoute.ok ? createCancelRoute.body?.data?.id : null;
    }

    const routeIdForDetail = flowRouteId || firstRoute?.id;

    if (routeIdForDetail) {
        const routeDetail = await request({
            name: 'GET /api/routes/:id',
            method: 'GET',
            path: `/api/routes/${routeIdForDetail}`,
            token: ADMIN_TOKEN || RECOLECTOR_TOKEN
        });

        pointId = routeDetail.ok ? routeDetail.body?.data?.puntos?.[0]?.id : null;
    }

    const pointBinId = createdBinId || binId;
    const pointBinSectorId = binSectorId;

    if (flowRouteId && ADMIN_TOKEN && pointBinId && pointBinSectorId === routeSectorId) {
        const addPointResponse = await request({
            name: 'POST /api/routes/:id/points',
            method: 'POST',
            path: `/api/routes/${flowRouteId}/points`,
            token: ADMIN_TOKEN,
            body: { bote_id: pointBinId }
        });

        pointId = addPointResponse.ok ? addPointResponse.body?.data?.id : pointId;

        await request({
            name: 'POST /api/routes/:id/assign',
            method: 'POST',
            path: `/api/routes/${flowRouteId}/assign`,
            token: ADMIN_TOKEN,
            body: { recolector_id: recolectorUser?.id }
        });
    }

    if (cancelRouteId && ADMIN_TOKEN) {
        await request({
            name: 'POST /api/routes/:id/cancel',
            method: 'POST',
            path: `/api/routes/${cancelRouteId}/cancel`,
            token: ADMIN_TOKEN,
            body: { usuario_id: adminUser?.id, motivo: 'smoke-test' }
        });
    }

    if (flowRouteId && RECOLECTOR_TOKEN) {
        const startResponse = await request({
            name: 'POST /api/routes/:id/start',
            method: 'POST',
            path: `/api/routes/${flowRouteId}/start`,
            token: RECOLECTOR_TOKEN,
            body: { recolector_id: recolectorUser?.id }
        });

        if (startResponse.ok && pointId) {
            await request({
                name: 'POST /api/collection/points/:puntoId/complete',
                method: 'POST',
                path: `/api/collection/points/${pointId}/complete`,
                token: RECOLECTOR_TOKEN,
                body: { recolector_id: recolectorUser?.id }
            });

            await request({
                name: 'POST /api/collection/points/bulk-complete',
                method: 'POST',
                path: '/api/collection/points/bulk-complete',
                token: RECOLECTOR_TOKEN,
                body: {
                    recolector_id: recolectorUser?.id,
                    puntos: [{ punto_id: pointId, porcentaje_recolectado: 100 }]
                }
            });
        }

        await request({
            name: 'GET /api/collection/routes/:rutaId/progress',
            method: 'GET',
            path: `/api/collection/routes/${flowRouteId}/progress`,
            token: RECOLECTOR_TOKEN
        });

        if (startResponse.ok && pointId) {
            await request({
                name: 'POST /api/collection/routes/:rutaId/complete',
                method: 'POST',
                path: `/api/collection/routes/${flowRouteId}/complete`,
                token: RECOLECTOR_TOKEN,
                body: { recolector_id: recolectorUser?.id }
            });
        }
    }

    if (routeSectorId && ADMIN_TOKEN) {
        await request({
            name: 'POST /api/routes/generate',
            method: 'POST',
            path: '/api/routes/generate',
            token: ADMIN_TOKEN,
            body: {
                sector_id: routeSectorId,
                creador_id: adminUser?.id,
                config: { nombre: `Ruta auto ${crypto.randomUUID().slice(0, 6)}`, nivelMinimo: 0 }
            }
        });
    }

    if (RECOLECTOR_TOKEN) {
        await request({
            name: 'GET /api/collection/stats',
            method: 'GET',
            path: '/api/collection/stats',
            token: RECOLECTOR_TOKEN
        });
    }

    if (statusTargetBinId && RECOLECTOR_TOKEN && (updatedBinStatus === 'pendiente_retiro' || statusTargetBinStatus === 'pendiente_retiro')) {
        await request({
            name: 'POST /api/collection/bins/:boteId/confirm-retirement',
            method: 'POST',
            path: `/api/collection/bins/${statusTargetBinId}/confirm-retirement`,
            token: RECOLECTOR_TOKEN,
            body: { recolector_id: recolectorUser?.id }
        });
    }

    console.log('\n📊 Resumen');
    const failed = results.filter((entry) => !entry.ok);
    console.log(`Total: ${results.length}`);
    console.log(`Fallidos: ${failed.length}`);

    if (failed.length > 0) {
        console.log('Detalle de fallos:');
        failed.forEach((entry) => {
            const message = entry.body?.message || entry.body?.error || entry.error || '';
            const suffix = message ? ` - ${message}` : '';
            console.log(` - ${entry.name} (${entry.method} ${entry.path}): ${entry.status}${suffix}`);
        });
        process.exit(1);
    }
}

run().catch((error) => {
    console.error('❌ Error inesperado en el runner:', error);
    process.exit(1);
});
