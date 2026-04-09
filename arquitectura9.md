# Persistencia inteligente del historial de chat y botón para limpiar chat

Este documento define cómo guardar el chat de forma útil para el usuario, sin romper la lógica financiera ni llenar el sistema de datos innecesarios.

La decisión es la siguiente:

* **sí se guarda el historial del chat**
* **no se guarda todo sin control**
* **se agrega un botón para limpiar el chat**

---

## 🎯 Objetivo

Hacer que la conversación no desaparezca al recargar la página, para que el usuario pueda ver lo que habló antes y sentir el sistema como una app real.

Además, se debe incluir un botón para borrar la vista del chat cuando el usuario quiera empezar de cero.

---

## 🧠 Principio principal

El historial del chat sirve para experiencia de usuario.

La verdad financiera sigue estando en la base de datos de movimientos, balances y cuentas.

Por eso:

* el chat se guarda para contexto visual e histórico
* los cálculos financieros NO dependen del chat
* el bot no debe usar todo el historial como memoria completa para razonar

---

## ✅ Qué se debe guardar

Se deben guardar solo mensajes útiles del chat, por ejemplo:

* mensajes del usuario
* respuestas del asistente
* confirmaciones de movimientos
* correcciones
* mensajes de ayuda o aclaración si aportan contexto

---

## ❌ Qué no se debe guardar como historial útil

No conviene guardar como parte principal del historial:

* mensajes vacíos
* errores técnicos repetidos
* mensajes que no aportan contexto
* respuestas temporales de carga
* ruido innecesario

---

## 🗄️ Estructura recomendada de almacenamiento

Crear una tabla simple para el historial del chat.

### Tabla: chat_messages

Campos sugeridos:

* id
* session_id opcional
* role (`user` | `assistant` | `system`)
* message
* created_at
* visible (`true` / `false`, opcional)

---

## 🧩 Cómo debe funcionar

### 1. Al enviar un mensaje

* el mensaje del usuario se guarda
* el backend procesa la intención
* el asistente responde
* la respuesta del asistente también se guarda
* la UI se actualiza con ambos mensajes

### 2. Al recargar la página

* se cargan los mensajes guardados
* el usuario ve el historial reciente
* el chat no se borra automáticamente

### 3. Al limpiar el chat

* solo se limpia la conversación visible
* el historial financiero importante no se borra
* la base de movimientos sigue intacta

---

## 🔄 Diferencia entre chat e ისტორial financiero

### Chat

Sirve para ver la conversación.

Ejemplos:

* “gané 100 mil”
* “ok, registrado”
* “corrige eso”

### Historial financiero

Sirve para guardar lo real.

Ejemplos:

* ingresos
* gastos
* ahorros
* asignaciones
* transferencias internas

El chat ayuda a conversar.
La base de datos financiera ayuda a calcular.

---

## 🧠 Regla de uso del historial para el modelo

Aunque el chat se guarde, el modelo no debe recibir todo el historial cada vez.

Debe usarse solo:

* el mensaje actual
* contexto mínimo relevante
* un resumen breve si hace falta

Esto evita gastar tokens de más.

---

## 🔘 Botón “Limpiar chat”

### Objetivo del botón

Permitir al usuario borrar la conversación visible para comenzar de nuevo sin tocar sus finanzas reales.

### Qué hace

* limpia la interfaz del chat
* puede borrar los mensajes visibles de la sesión actual
* no borra los movimientos financieros
* no borra los balances
* no borra los ahorros

### Texto sugerido del botón

* “Limpiar chat”
* “Borrar conversación”
* “Nuevo chat”

La opción más clara es: **Limpiar chat**.

---

## ⚠️ Reglas importantes

1. El botón de limpiar chat no debe borrar datos financieros.
2. El chat guardado debe ser independiente de los movimientos reales.
3. El sistema no debe depender del historial del chat para calcular saldos.
4. El historial debe poder verse al recargar la página.
5. Si el usuario limpia el chat, la app no debe perder su información financiera.

---

## 🎨 Recomendación de UX

El botón de limpiar chat debe estar visible pero no molestar.

Sugerencias:

* ubicarlo cerca del input o del encabezado del chat
* estilo simple
* acción clara
* pedir confirmación si se quiere evitar borrados accidentales

Ejemplo de confirmación:

* “¿Quieres limpiar solo el chat visible?”

---

## 📱 Comportamiento esperado en la interfaz

### Al abrir la página

* se muestran los últimos mensajes guardados
* se muestra el estado financiero actual desde la base de datos

### Al hablar con el asistente

* se agrega el mensaje al historial
* se guarda la respuesta del asistente
* el panel financiero se actualiza si hubo movimientos

### Al limpiar chat

* desaparece la conversación visible
* la información financiera sigue intacta
* el usuario puede comenzar otra conversación

---

## 🧪 Casos de prueba

### Caso 1

El usuario recarga la página.

**Esperado:**

* el chat sigue visible
* no se pierde la conversación

### Caso 2

El usuario presiona “Limpiar chat”.

**Esperado:**

* se borra la conversación visible
* no se borra el saldo
* no se borra el historial financiero

### Caso 3

El usuario registra un ingreso y luego limpia el chat.

**Esperado:**

* el ingreso sigue existiendo en la base de datos
* solo se limpia la conversación

---

## 🚫 Prohibido

* no usar el chat como fuente de verdad financiera
* no borrar movimientos al limpiar el chat
* no cargar todo el historial en cada llamada al modelo
* no mezclar conversación con saldos

---

## 🎯 Resultado final

Con esta implementación, el sistema tendrá:

* historial visible persistente
* mejor experiencia de usuario
* botón para empezar de cero en la conversación
* finanzas seguras en la base de datos
* menos pérdida de contexto visual

---

## Orden de implementación

1. Crear tabla de mensajes del chat
2. Guardar mensajes del usuario y asistente
3. Cargar historial al abrir la página
4. Agregar botón “Limpiar chat”
5. Limpiar solo la conversación visible
6. Mantener intactos los datos financieros

---

## Regla final

Cursor solo debe implementar lo definido en este documento.
No debe borrar información financiera al limpiar el chat.
