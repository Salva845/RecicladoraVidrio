#!/bin/bash

echo "🚀 Test de Flujo de Autenticación"
echo "================================"

# 1. Registrar usuario gestor
echo -e "\n1️⃣  Registrando usuario gestor de rutas..."
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": 111111111,
    "role": "gestor_rutas",
    "first_name": "Admin",
    "last_name": "Test",
    "username": "admin_test"
  }')

echo "$REGISTER_RESPONSE" | jq '.'

# Extraer token
TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.token')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
    echo -e "\n✅ Token obtenido: ${TOKEN:0:50}..."
    
    # 2. Ver perfil
    echo -e "\n2️⃣  Consultando perfil con token..."
    curl -s http://localhost:3000/api/auth/me \
      -H "Authorization: Bearer $TOKEN" | jq '.'
    
    # 3. Listar botes (requiere autenticación)
    echo -e "\n3️⃣  Listando botes (requiere auth)..."
    curl -s http://localhost:3000/api/bins \
      -H "Authorization: Bearer $TOKEN" | jq '.'
    
    # 4. Guardar token en archivo
    echo "$TOKEN" > .token
    echo -e "\n💾 Token guardado en archivo .token"
    
else
    echo -e "\n⚠️  Usuario probablemente ya existe. Intentando login..."
    
    LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"telegram_id": 111111111}')
    
    echo "$LOGIN_RESPONSE" | jq '.'
    
    TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token')
    
    if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
        echo -e "\n✅ Token obtenido vía login: ${TOKEN:0:50}..."
        echo "$TOKEN" > .token
        
        # Ver perfil
        echo -e "\n2️⃣  Consultando perfil..."
        curl -s http://localhost:3000/api/auth/me \
          -H "Authorization: Bearer $TOKEN" | jq '.'
    fi
fi

echo -e "\n✅ Test completado"