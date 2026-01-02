/**
 * Pruebas de integración para eventos
 */

const request = require('supertest');
const { app, initializeApp } = require('../../src/app');
const { closeAllConnections } = require('../../src/config/database');

describe('Event API Integration Tests', () => {
    beforeAll(async () => {
        await initializeApp();
    });

    afterAll(async () => {
        await closeAllConnections();
    });

    describe('POST /api/events', () => {
        it('debe recibir un evento válido', async () => {
            const eventData = {
                hardware_id: 'TEST_BIN_001',
                porcentaje_llenado: 65,
                tipo_vidrio: 'transparente',
                nivel_bateria: 85
            };

            const response = await request(app)
                .post('/api/events')
                .send(eventData)
                .expect('Content-Type', /json/)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('event_id');
            expect(response.body.data.hardware_id).toBe('TEST_BIN_001');
            expect(response.body.data.status).toBe('queued');
        });

        it('debe rechazar eventos con porcentaje < 60%', async () => {
            const eventData = {
                hardware_id: 'TEST_BIN_001',
                porcentaje_llenado: 45
            };

            const response = await request(app)
                .post('/api/events')
                .send(eventData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('60%');
        });

        it('debe validar datos requeridos', async () => {
            const response = await request(app)
                .post('/api/events')
                .send({})
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /health', () => {
        it('debe retornar estado saludable', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
            expect(response.body.databases).toHaveProperty('postgres');
            expect(response.body.databases).toHaveProperty('mongodb');
        });
    });
});