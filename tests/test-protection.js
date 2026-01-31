/**
 * Test rápido de protección
 */

const API_URL = 'http://localhost:3000';

async function test() {
    console.log('\n🔒 VERIFICANDO PROTECCIÓN DEL SISTEMA\n');

    // Intentar registrar sin token
    console.log('Intentando registrar usuario sin token...\n');

    const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            telegram_id: 999999999,
            role: 'dueno_establecimiento',
            first_name: 'Intruso',
            last_name: 'Test'
        })
    });

    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Respuesta:', JSON.stringify(data, null, 2));

    if (response.status === 401) {
        console.log('\n✅ SISTEMA PROTEGIDO CORRECTAMENTE');
        console.log('   Solo gestores pueden crear usuarios\n');
    } else if (response.status === 201) {
        console.log('\n❌ PROBLEMA: El registro está ABIERTO');
        console.log('   Necesitas aplicar los cambios de seguridad\n');
    }
}

test().catch(console.error);