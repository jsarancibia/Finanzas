# Fix — Separar chats por usuario autenticado (correo)

Este documento corrige el problema de mezcla de conversaciones entre distintos usuarios.

Aunque el login ya funciona, actualmente los chats pueden quedar mezclados porque la persistencia del historial no está suficientemente vinculada al usuario autenticado.

El objetivo es que cada conversación quede asociada de forma clara y segura al correo o identificador del usuario que inició sesión.

---

## 🎯 Objetivo

Separar completamente el historial de chat por usuario autenticado, de manera que:

* cada usuario vea solo sus propios mensajes
* no se mezclen conversaciones entre distintas cuentas
* el botón de limpiar chat afecte solo al usuario actual
* el historial al recargar corresponda al usuario logueado
* la API nunca devuelva mensajes de otra cuenta

---

## 🧠 Problema actual

El sistema ya tiene login, pero el historial del chat sigue dependiendo demasiado de la sesión visual o de un identificador que no está suficientemente amarrado al usuario.

Eso puede causar que:

* varios usuarios compartan la misma conversación
* un chat recargado muestre mensajes de otro usuario
* el backend guarde mensajes sin una separación real por cuenta

---

## ✅ Regla principal

Cada mensaje y cada historial de chat debe pertenecer a un usuario autenticado específico.

La separación debe estar basada en uno de estos identificadores, en este orden de preferencia:

1. `user_id` de Supabase Auth
2. `email` del usuario autenticado
3. `session_id` solo como complemento dentro del usuario

La regla importante es:

👉 **session_id por sí solo no basta para aislar usuarios**.

---

## 🧩 Estructura recomendada

### Opción preferida

Agregar a la tabla de mensajes del chat un campo que relacione el mensaje con el usuario autenticado.

Campos recomendados:

* `id`
* `user_id` o `auth_user_id`
* `email`
* `session_id`
* `role`
* `message`
* `created_at`
* `visible`

---

## 🗄️ Modelo de separación

### 1. Usuario autenticado

Cada usuario debe tener un identificador único que venga de la autenticación.

### 2. Sesión de chat

Dentro de ese usuario, puede haber una o varias sesiones de chat.

### 3. Mensajes

Cada mensaje debe guardarse con:

* a qué usuario pertenece
* a qué sesión pertenece

Así se evita mezclar historiales.

---

## 🔒 Principio de seguridad

El backend nunca debe confiar solo en el frontend para decidir qué chat cargar.

Debe verificar:

* quién está autenticado
* qué correo o user_id tiene
* qué mensajes le corresponden realmente

---

## 📁 Cambios necesarios en la base de datos

### Tabla `chat_messages`

Se debe ampliar para incluir el usuario dueño del mensaje.

Campos mínimos sugeridos:

* `id`
* `user_id` o `auth_user_id`
* `email`
* `session_id`
* `role`
* `message`
* `created_at`
* `visible`

### Índices recomendados

Agregar índices por:

* `user_id`
* `email`
* `session_id`
* `created_at`

Para que las consultas de historial sean rápidas y no mezclen datos.

---

## 🔄 Flujo correcto de guardado

### Cuando el usuario envía un mensaje

1. Se obtiene el usuario autenticado actual.
2. Se toma su `user_id` y/o `email`.
3. Se guarda el mensaje del usuario con esos datos.
4. Se procesa la respuesta del backend.
5. Se guarda también la respuesta del asistente con el mismo `user_id` y la misma `session_id`.

### Resultado

Todo el turno de conversación queda amarrado al mismo usuario.

---

## 🔎 Flujo correcto de lectura

Cuando la UI carga el historial:

1. El frontend pide los mensajes del chat.
2. El backend identifica al usuario autenticado.
3. El backend devuelve solo los mensajes de ese usuario.
4. Nunca devuelve mensajes de otra cuenta.

---

## 🧠 Uso de `session_id`

El `session_id` sigue siendo útil, pero solo como agrupador interno de una conversación.

No debe ser la única llave para definir a quién pertenece el chat.

### Regla

* `session_id` = conversación concreta
* `user_id` / `email` = dueño de la conversación

---

## 🧱 Reglas del backend

### 1. Guardado

Antes de insertar mensajes:

* validar usuario autenticado
* obtener su correo o id
* asociar el mensaje a ese usuario

### 2. Lectura

Al listar historial:

* filtrar por usuario autenticado
* luego por `session_id` si corresponde

### 3. Limpieza

El botón “Limpiar chat” debe limpiar solo la conversación del usuario actual.

No puede borrar mensajes de otro usuario.

---

## 🚫 Prohibido

* no usar un solo `session_id` global para todos los usuarios
* no listar mensajes sin filtrar por usuario
* no confiar solo en localStorage para separar chats
* no permitir que el frontend decida qué mensajes pertenecen a quién
* no mezclar historial de login distinto

---

## 🧪 Casos de prueba obligatorios

### Caso 1

Usuario A inicia sesión y escribe mensajes.

**Esperado:**

* ve solo sus mensajes
* no ve mensajes del Usuario B

### Caso 2

Usuario B inicia sesión en otro navegador.

**Esperado:**

* ve solo su propio historial
* no ve nada del Usuario A

### Caso 3

Usuario A recarga la página.

**Esperado:**

* su historial sigue ahí
* no se mezcla con otros usuarios

### Caso 4

Usuario A limpia el chat.

**Esperado:**

* solo se limpia su conversación
* no se afecta el historial de otros usuarios

---

## 🎨 Reglas para la UI

La UI debe seguir usando la sesión actual, pero ahora debe cargar historial filtrado por el usuario autenticado.

### Comportamiento esperado

* al entrar, la UI consulta solo los mensajes del usuario actual
* al enviar un mensaje, se guarda con ese usuario
* al limpiar el chat, se limpia solo el historial del usuario actual

---

## 🔐 Reglas de autenticación y acceso

Si el usuario no está autenticado:

* no debe poder cargar historial
* no debe poder escribir mensajes persistentes
* no debe poder leer chats guardados

Si el usuario sí está autenticado:

* solo accede a sus datos

---

## 🛠️ Cambios esperados en el backend

Cursor debe revisar y ajustar:

* el endpoint de guardar chat
* el endpoint de listar historial
* el endpoint de limpiar chat
* la lógica de `session_id`
* la estructura de la tabla `chat_messages`
* la forma en que el frontend envía el usuario autenticado o cómo el backend lo recupera desde la sesión

---

## 🧠 Recomendación de implementación

La forma más sólida es:

* usar el usuario autenticado de Supabase Auth como dueño real
* guardar `user_id` y `email` en `chat_messages`
* usar `session_id` solo para agrupar conversaciones del mismo usuario

Así se evita mezclar chats incluso si dos usuarios usan el mismo navegador o si localStorage se comparte.

---

## 🎯 Resultado esperado

Después del arreglo:

* cada correo tendrá su propio historial
* no se mezclarán conversaciones
* el chat será privado por usuario
* el botón limpiar chat afectará solo al usuario actual
* el backend devolverá solo mensajes correctos

---

## Orden de implementación

1. Agregar relación del chat con usuario autenticado.
2. Ajustar tabla `chat_messages`.
3. Guardar `user_id` y/o `email` en cada mensaje.
4. Filtrar historial por usuario autenticado.
5. Ajustar limpieza de chat por usuario.
6. Probar con dos usuarios distintos.

---

## Regla final

Cursor solo debe implementar lo definido en este documento.

Si un mensaje no tiene usuario autenticado asociado, no debe guardarse ni leerse como historial privado.
