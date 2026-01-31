const authService = require('./src/services/authService');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function test() {
    console.log('Testing JWT generation...');
    try {
        const token = authService._generateToken('user-uuid', 12345, 'test_role');
        console.log('Token generated:', token);

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Token verified with jsonwebtoken:', decoded);

        if (decoded.telegramId === 12345 && decoded.role === 'test_role') {
            console.log('✅ JWT logic is CORRECT');
        } else {
            console.log('❌ JWT payload mismatch');
        }
    } catch (e) {
        console.error('❌ Error:', e);
    }
}

test();
