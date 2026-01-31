/**
 * Script de prueba de autenticación
 * Ejecutar con: node test/auth-test.js
 */

require('dotenv').config();

const authTests = {
    baseUrl: process.env.API_URL || 'http://localhost:3000',

    async testRegister() {
        console.log('\n🧪 Test: Registro de usuario');

        const userData = {
            telegram_id: 123456789,
            role: 'gestor_rutas',
            first_name: 'Admin',
            last_name: 'Sistema',
            username: 'admin_test',
            phone_number: '+527771234567',
            email: 'admin@recycling.com'
        };

        try {
            const response = await fetch(`${this.baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok) {
                console.log('✅ Usuario registrado:', data.data.user);
                console.log('🔑 Token generado:', data.data.token.substring(0, 50) + '...');
                return data.data.token;
            } else {
                console.log('❌ Error:', data.message);
                return null;
            }
        } catch (error) {
            console.log('❌ Error de conexión:', error.message);
            return null;
        }
    },

    async testLogin(telegramId) {
        console.log('\n🧪 Test: Login');

        try {
            const response = await fetch(`${this.baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegram_id: telegramId })
            });

            const data = await response.json();

            if (response.ok) {
                console.log('✅ Login exitoso:', data.data.user);
                console.log('🔑 Token:', data.data.token.substring(0, 50) + '...');
                return data.data.token;
            } else {
                console.log('❌ Error:', data.message);
                return null;
            }
        } catch (error) {
            console.log('❌ Error de conexión:', error.message);
            return null;
        }
    },

    async testGetMe(token) {
        console.log('\n🧪 Test: Obtener perfil');

        try {
            const response = await fetch(`${this.baseUrl}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                console.log('✅ Perfil obtenido:', data.data.user);
            } else {
                console.log('❌ Error:', data.message);
            }
        } catch (error) {
            console.log('❌ Error de conexión:', error.message);
        }
    },

    async testProtectedRoute(token) {
        console.log('\n🧪 Test: Ruta protegida (listar botes)');

        try {
            const response = await fetch(`${this.baseUrl}/api/bins`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                console.log('✅ Acceso autorizado. Botes encontrados:', data.data.botes.length);
            } else {
                console.log('❌ Error:', data.message);
            }
        } catch (error) {
            console.log('❌ Error de conexión:', error.message);
        }
    },

    async testUnauthorized() {
        console.log('\n🧪 Test: Acceso sin token');

        try {
            const response = await fetch(`${this.baseUrl}/api/bins`);
            const data = await response.json();

            if (response.status === 401) {
                console.log('✅ Acceso denegado correctamente:', data.message);
            } else {
                console.log('❌ Error: Debería denegar acceso');
            }
        } catch (error) {
            console.log('❌ Error de conexión:', error.message);
        }
    },

    async runAll() {
        console.log('🚀 Iniciando tests de autenticación...');
        console.log('📡 URL:', this.baseUrl);

        // Test 1: Registro
        const token = await this.testRegister();
        if (!token) {
            console.log('\n⚠️  Probablemente el usuario ya existe. Intentando login...');
            const loginToken = await this.testLogin(123456789);
            if (loginToken) {
                await this.testGetMe(loginToken);
                await this.testProtectedRoute(loginToken);
            }
        } else {
            // Test 2: Obtener perfil
            await this.testGetMe(token);

            // Test 3: Ruta protegida
            await this.testProtectedRoute(token);
        }

        // Test 4: Sin autorización
        await this.testUnauthorized();

        console.log('\n✅ Tests completados\n');
    }
};

// Ejecutar si se llama directamente
if (require.main === module) {
    authTests.runAll();
}

module.exports = authTests;