# Login básico y bonito por fases

Este documento define cómo agregar un sistema de inicio de sesión simple al proyecto para que solo tú puedas acceder a la aplicación cuando esté desplegada en Vercel.

La idea es mantenerlo:

* básico
* bonito
* seguro
* fácil de mantener
* sin romper la lógica financiera existente

---

## Objetivo

Proteger la aplicación con login para que no quede pública para cualquiera en Vercel.

El login debe permitir:

* entrar solo con usuario autorizado
* cerrar sesión
* mantener una interfaz limpia y agradable
* bloquear el acceso al dashboard si no hay sesión iniciada

---

## Principios obligatorios

1. **La seguridad va antes que la UI**

   * si no hay login válido, no se muestra el sistema financiero

2. **No tocar la lógica financiera**

   * el login solo protege el acceso
   * no cambia saldos, movimientos ni reglas

3. **Simple primero**

   * un solo método de acceso
   * sin complicar con múltiples roles al inicio

4. **Bonito pero sobrio**

   * diseño limpio
   * buena tipografía
   * tarjeta central
   * botones claros

5. **Sesión persistente**

   * si el usuario ya inició sesión, no debe loguearse cada vez que recarga

---

# Fase 1 — Definir la estrategia de autenticación

## Objetivo

Elegir una forma simple y segura de login para uso personal.

## Recomendación

Usar **Supabase Auth** porque ya existe Supabase en el proyecto.

### Por qué

* evita construir autenticación desde cero
* ya maneja sesiones
* ya da funciones de login/logout
* es fácil de integrar con Vercel

## Qué debe quedar definido

* correo permitido
* acceso con contraseña
* opción de recordar sesión
* cierre de sesión manual

## Reglas

* solo una cuenta principal al inicio
* no crear sistema de registro público
* no permitir que cualquiera se cree cuenta si no lo necesitas

## Resultado esperado

Queda claro cómo se va a autenticar el usuario y qué proveedor manejará la sesión.

---

# Fase 2 — Proteger el acceso a la aplicación

## Objetivo

No mostrar el dashboard financiero ni el chat si no hay sesión iniciada.

## Comportamiento esperado

### Si NO hay sesión

Mostrar una pantalla de login con:

* fondo limpio
* tarjeta central
* título corto
* campo de correo o usuario
* campo de contraseña
* botón “Entrar”

### Si SÍ hay sesión

Mostrar la app normal:

* panel de tarjetas
* chat
* historial
* botón de salir

## Reglas

* el frontend debe revisar la sesión al cargar
* si no hay sesión, redirigir o mostrar login
* no cargar datos financieros antes de validar el login

## Resultado esperado

La aplicación queda bloqueada para cualquier persona que no tenga sesión válida.

---

# Fase 3 — Crear la pantalla de login

## Objetivo

Hacer un login simple y bonito.

## Diseño sugerido

### Elementos

* tarjeta central
* título principal
* subtítulo corto
* input de correo
* input de contraseña
* botón principal
* mensaje de error limpio
* estado de carga al enviar

### Estilo visual

* fondo suave
* sombra ligera
* bordes redondeados
* tipografía clara
* botón destacado
* diseño minimalista

### Texto sugerido

* “Acceso privado”
* “Inicia sesión para entrar a tu panel financiero”

## Reglas de UX

* el login debe verse serio y simple
* no debe parecer una pantalla improvisada
* debe sentirse como una app real
* mostrar errores de forma clara
* evitar exceso de texto

## Resultado esperado

Una pantalla de login que se vea bien en escritorio y móvil.

---

# Fase 4 — Cerrar sesión y mantener la sesión

## Objetivo

Permitir salir de la cuenta y conservar el acceso mientras la sesión esté activa.

## Comportamiento esperado

### Mantener sesión

* si el usuario ya inició sesión, no volver a pedir login cada vez que recarga

### Cerrar sesión

* agregar botón “Salir” o “Cerrar sesión”
* al pulsarlo, borrar sesión activa
* volver a mostrar login

## Reglas

* el botón de salir debe estar visible pero discreto
* cerrar sesión no debe borrar datos financieros
* cerrar sesión no debe borrar el historial real

## Resultado esperado

El usuario puede entrar y salir de forma limpia sin perder información.

---

# Fase 5 — Proteger también las rutas del backend

## Objetivo

No basta con esconder la UI. También hay que proteger las rutas del backend.

## Qué debe pasar

Cada endpoint importante debe verificar que el usuario esté autenticado.

Ejemplos:

* chat
* historial del chat
* limpiar chat
* resumen financiero
* movimientos

## Regla principal

Si no hay sesión válida:

* no responder datos privados
* no exponer movimientos
* no devolver historial financiero

## Resultado esperado

Aunque alguien intente llamar la API directamente, no debería acceder a información privada.

---

# Fase 6 — Ajustar la experiencia visual del área privada

## Objetivo

Cuando el usuario ya esté autenticado, la app debe verse más ordenada.

## Qué mejorar

* header superior con nombre simple de la app
* botón de cerrar sesión
* estado de usuario conectado
* diseño limpio del dashboard
* transición suave entre login y panel privado

## Reglas

* no recargar la lógica financiera
* no agregar complejidad innecesaria
* mantener la interfaz sobria

## Resultado esperado

La app se siente privada, ordenada y lista para uso diario.

---

# Orden obligatorio de implementación

Cursor debe seguir este orden exacto:

1. Definir estrategia de autenticación
2. Proteger el acceso a la aplicación
3. Crear la pantalla de login
4. Cerrar sesión y persistir sesión
5. Proteger rutas del backend
6. Ajustar la experiencia visual final

No empezar por el diseño antes de definir la autenticación.
No mostrar datos privados antes de validar sesión.
No tocar la lógica financiera existente.

---

# Recomendación práctica

Para este proyecto, lo más simple y limpio es:

* usar Supabase Auth
* permitir solo una cuenta principal
* diseño bonito pero sobrio
* acceso privado persistente
* logout manual visible

---

# Resultado final esperado

La aplicación quedará:

* protegida con login
* bonita y simple
* segura para uso personal
* lista para desplegar en Vercel sin exponer el sistema financiero

---

# Regla final

Cursor solo debe implementar lo definido en este documento.
Si algo no está aquí, no debe añadirse por iniciativa propia.
