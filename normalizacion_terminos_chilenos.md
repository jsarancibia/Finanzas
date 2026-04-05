# Normalización de términos (Chile)

Los datos viven en **`config/normalizacion_terminos_chilenos.json`** (JSON válido). Edita ese archivo y reinicia el servidor (o `releerNormalizacionTerminosChilenos` si más adelante expones recarga).

## Formato

- **`terminos`**: arreglo de objetos con:
  - **`variantes`**: `string[]` — formas que el usuario puede escribir (sinónimos, tiempos verbales, frases cortas).
  - **`canonico`**: nombre interno / referencia (hoy no cambia el texto al usuario; sirve para documentar).
  - **`tipo`**: `"gasto"` | `"ahorro"` | `"ingreso"` — se usa en el **parser flexible** cuando ninguna regla explícita anterior aplica; gana la **variante más larga** que coincida en el mensaje.

## Uso en el proyecto

- **`parseMessageFlexible`**: tras las reglas fijas, llama a `inferirTipoPorTerminosChilenos`.
- **`consejoLocal`**: `parecePrefijoMovimientoDesdeTerminos` evita tratar como “consejo genérico” mensajes que empiezan como un movimiento según tus variantes.

Si el archivo no existe, el cargador asume lista vacía y todo sigue funcionando con las reglas ya codificadas.
