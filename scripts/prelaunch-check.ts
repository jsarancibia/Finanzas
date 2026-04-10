/**
 * Comprobaciones manuales pre-lanzamiento (sin vitest/jest en el proyecto).
 * Ejecutar: npx tsx scripts/prelaunch-check.ts
 */
import assert from 'node:assert/strict';
import { bloqueaIngresoPorPalabraTengo, tieneSenalOrigenDineroExistente } from '../src/services/contextoNoEsIngresoNuevo.js';
import { parseAsignarDesdeDisponibleSinCuenta } from '../src/services/parseMessageDisponibleSinCuenta.js';
import { detectBanco, enriquecerBancoYProducto, parseMessageFlexible } from '../src/services/parseMessageFlexible.js';
import { inferCategoriaGasto } from '../src/services/categoriasMovimiento.js';
import { parseMessageRegex } from '../src/services/parseMessage.js';
import { parseTraspaso, mapExtremoTraspaso } from '../src/services/parseMessageTraspaso.js';
import { corregirTypos } from '../src/services/corregirTypos.js';

function ok(name: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

ok('del dinero a repartir: señal de dinero existente', () => {
  const t = 'del dinero a repartir, tengo 1.500.000 en fondo mutuo bando estado';
  assert.equal(tieneSenalOrigenDineroExistente(t), true);
  assert.equal(bloqueaIngresoPorPalabraTengo(t), true);
});

ok('del dinero a repartir: parse asignación + banco typo bando', () => {
  const t = 'del dinero a repartir, tengo 1.500.000 en fondo mutuo bando estado';
  const p = parseAsignarDesdeDisponibleSinCuenta(t);
  assert.ok(p, 'debe parsear asignación');
  assert.equal(p!.monto, 1_500_000);
  assert.equal(p!.banco, 'Banco Estado');
  assert.equal(p!.cuentaProducto, 'Fondo mutuo');
});

ok('detectBanco: bando estado', () => {
  assert.equal(detectBanco('cuenta en bando estado'), 'Banco Estado');
});

ok('ingreso coloquial sin señal de colchón: no es asignación', () => {
  const t = 'hola tengo 3.100.000';
  assert.equal(parseAsignarDesdeDisponibleSinCuenta(t), null);
  assert.equal(tieneSenalOrigenDineroExistente(t), false);
});

ok('pendiente de repartir: asignación', () => {
  const t = 'pendiente de repartir tengo 50000 en cuenta rut';
  const p = parseAsignarDesdeDisponibleSinCuenta(t);
  assert.ok(p);
  assert.equal(p!.monto, 50_000);
  assert.equal(p!.banco, 'Banco Estado');
  assert.equal(p!.cuentaProducto, 'Cuenta RUT');
});

ok('flexible: tengo 3M sin señal → ingreso', () => {
  const p = parseMessageFlexible('hola tengo 3.100.000');
  assert.ok(p);
  assert.equal(p!.tipo, 'ingreso');
});

ok('regex no rompe en vacío', () => {
  assert.equal(parseMessageRegex(''), null);
});

// === NUEVOS: ahorro, saldo disponible, panel ===

ok('del saldo disponible 400k en ahorro fondo mutuo banco estado → ahorro', () => {
  const t = 'del saldo disponible, 400000 los tengo en ahorro fondo mutuo banco estado';
  assert.equal(tieneSenalOrigenDineroExistente(t), true);
  const reg = parseMessageRegex(t);
  assert.equal(reg, null, 'regex NO debe capturar como ingreso');
  const p = parseMessageFlexible(t);
  assert.ok(p, 'flexible debe parsear');
  assert.equal(p!.tipo, 'ahorro');
  assert.equal(p!.monto, 400_000);
  assert.equal(p!.banco, 'Banco Estado');
  assert.ok(p!.cuentaProducto, 'debe tener cuentaProducto');
});

ok('tengo ademas un ahorro de 500000 en reservas mercado pago → ahorro', () => {
  const t = 'tengo ademas un ahorro de 500000 en reservas mercado pago';
  const reg = parseMessageRegex(t);
  assert.equal(reg, null, 'regex NO debe capturar como ingreso');
  const p = parseMessageFlexible(t);
  assert.ok(p, 'flexible debe parsear');
  assert.equal(p!.tipo, 'ahorro');
  assert.equal(p!.monto, 500_000);
  assert.equal(p!.banco, 'Mercado Pago');
});

ok('tengo 1200000 → ingreso (sin mención de ahorro)', () => {
  const p = parseMessageRegex('tengo 1200000');
  assert.ok(p);
  assert.equal(p!.tipo, 'ingreso');
  assert.equal(p!.monto, 1_200_000);
});

ok('del salgo disponible (typo) con ahorro → ahorro', () => {
  const t = 'del salgo disponible, 400000 los tengo en ahorro fondo mutuo banco estado';
  const p = parseMessageFlexible(t);
  assert.ok(p, 'flexible debe parsear');
  assert.equal(p!.tipo, 'ahorro');
});

ok('gasté 15000 en transporte → gasto', () => {
  const p = parseMessageRegex('gasté 15000 en transporte');
  assert.ok(p);
  assert.equal(p!.tipo, 'gasto');
  assert.equal(p!.monto, 15_000);
});

ok('tengo un gasto de 14000 en poleron del dinero de mercado libre → gasto (no ingreso)', () => {
  const t = 'tengo un gasto de 14000 en poleron del dinero de mercado libre';
  const reg = parseMessageRegex(t);
  assert.equal(reg, null, 'regex no debe ser ingreso por «tengo»');
  const p = parseMessageFlexible(t);
  assert.ok(p);
  assert.equal(p!.tipo, 'gasto');
  assert.equal(p!.monto, 14_000);
  assert.equal(p!.categoria, 'ropa');
  assert.equal(p!.banco, 'Mercado Pago');
});

ok('inferCategoriaGasto: poleron y mercado libre (compra) → ropa / otros', () => {
  assert.equal(inferCategoriaGasto('poleron'), 'ropa');
  assert.equal(inferCategoriaGasto('un libro en mercado libre'), 'otros');
});

ok('ahorré 200000 en fondo mutuo → ahorro (regex)', () => {
  const p = parseMessageRegex('ahorré 200000 en fondo mutuo banco estado');
  assert.ok(p);
  assert.equal(p!.tipo, 'ahorro');
  assert.equal(p!.monto, 200_000);
});

ok('tengo 500000 en ahorro mercado pago → ahorro (no ingreso)', () => {
  const t = 'tengo 500000 en ahorro mercado pago';
  const reg = parseMessageRegex(t);
  assert.equal(reg, null, 'regex no debe ser ingreso');
  const p = parseMessageFlexible(t);
  assert.ok(p, 'flexible debe parsear');
  assert.equal(p!.tipo, 'ahorro');
  assert.equal(p!.monto, 500_000);
  assert.equal(p!.banco, 'Mercado Pago');
});

// === TYPOS ===

ok('typo "ahrro" → corregido a "ahorro"', () => {
  assert.equal(corregirTypos('tengo un ahrro de 140000'), 'tengo un ahorro de 140000');
});

ok('tengo un ahrro de 140000 → ahorro tras corrección', () => {
  const fixed = corregirTypos('tengo un ahrro de 140000');
  const reg = parseMessageRegex(fixed);
  assert.equal(reg, null, 'regex no debe capturar como ingreso');
  const p = parseMessageFlexible(fixed);
  assert.ok(p, 'flexible debe parsear');
  assert.equal(p!.tipo, 'ahorro');
  assert.equal(p!.monto, 140_000);
});

ok('ademas tengo un ahrro de 140000 en mercado pago reservas → ahorro tras corrección', () => {
  const fixed = corregirTypos('ademas tengo un ahrro de 140000 en mercado pago reservas');
  const p = parseMessageFlexible(fixed);
  assert.ok(p, 'flexible debe parsear');
  assert.equal(p!.tipo, 'ahorro');
  assert.equal(p!.monto, 140_000);
  assert.equal(p!.banco, 'Mercado Pago');
});

ok('typo "bando estado" se corrige', () => {
  const fixed = corregirTypos('tengo 500000 en ahorro bando estado');
  assert.ok(/banco estado/i.test(fixed));
});

// === ASIGNACIÓN: dinero disponible está en cuenta ===

ok('el dinero 136000 disponible esta todo en mercado pago → asignación', () => {
  const t = 'el dinero 136000 disponible esta todo en mercado pago';
  assert.equal(tieneSenalOrigenDineroExistente(t), true);
  const p = parseAsignarDesdeDisponibleSinCuenta(t);
  assert.ok(p, 'debe parsear como asignación');
  assert.equal(p!.monto, 136_000);
  assert.equal(p!.banco, 'Mercado Pago');
});

ok('el dinero disponible 200000 esta en cuenta rut → asignación', () => {
  const p = parseAsignarDesdeDisponibleSinCuenta('el dinero disponible 200000 esta en cuenta rut');
  assert.ok(p);
  assert.equal(p!.monto, 200_000);
  assert.equal(p!.banco, 'Banco Estado');
  assert.equal(p!.cuentaProducto, 'Cuenta RUT');
});

ok('lo disponible 50000 esta en mercado pago → asignación', () => {
  const p = parseAsignarDesdeDisponibleSinCuenta('lo disponible 50000 esta en mercado pago');
  assert.ok(p);
  assert.equal(p!.monto, 50_000);
  assert.equal(p!.banco, 'Mercado Pago');
});

ok('del dinero disponible tengo 9601 en mercado pago para gastar → asignación (no gasto)', () => {
  const t = 'del dinero disponible, tengo 9601 en mercado pago para gastar';
  const p = parseAsignarDesdeDisponibleSinCuenta(t);
  assert.ok(p, 'debe ser asignación desde sin cuenta, no confundir con origen MP');
  assert.equal(p!.monto, 9601);
  assert.equal(p!.banco, 'Mercado Pago');
  assert.equal(p!.cuentaProducto, 'Disponible');
});

// === GASTOS: categoría limpia sin banco ===

ok('gasto de 70000 en zapatillas del dinero de mercado pago → ropa + sin banco en cola', () => {
  const p = parseMessageFlexible('hice un gasto de 70000 en zapatillas del dinero de mercado pago');
  assert.ok(p);
  assert.equal(p!.tipo, 'gasto');
  assert.equal(p!.monto, 70_000);
  assert.equal(p!.categoria, 'ropa');
  assert.equal(p!.descripcion, '');
  assert.equal(p!.banco, 'Mercado Pago');
});

ok('gasté 20000 en comida de banco estado → categoría comida', () => {
  const p = parseMessageRegex('gasté 20000 en comida de banco estado');
  assert.ok(p);
  assert.equal(p!.tipo, 'gasto');
  assert.equal(p!.categoria, 'comida');
  assert.equal(p!.descripcion, '');
});

// === TRASPASOS: subcuentas del mismo banco ===

ok('saque 15000 de reservas de mercado pago, y lo pase a la cuenta → traspaso', () => {
  const t = 'saque 15000 de reservas de mercado pago, y lo pase a la cuenta de mercado pago';
  const regex = parseMessageRegex(t);
  assert.equal(regex, null, 'regex debe dejar pasar al traspaso');
  const tr = parseTraspaso(t);
  assert.ok(tr, 'debe parsear como traspaso');
  assert.equal(tr!.monto, 15_000);
  assert.equal(tr!.origenBanco, 'Mercado Pago');
  assert.equal(tr!.origenCuenta, 'Reservas');
  assert.equal(tr!.destinoBanco, 'Mercado Pago');
  assert.equal(tr!.destinoCuenta, 'Disponible');
});

ok('mapExtremoTraspaso: reservas de mercado pago → Reservas', () => {
  const m = mapExtremoTraspaso('reservas de mercado pago');
  assert.ok(m);
  assert.equal(m!.banco, 'Mercado Pago');
  assert.equal(m!.cuenta, 'Reservas');
});

ok('mapExtremoTraspaso: la cuenta de mercado pago → Disponible', () => {
  const m = mapExtremoTraspaso('la cuenta de mercado pago');
  assert.ok(m);
  assert.equal(m!.banco, 'Mercado Pago');
  assert.equal(m!.cuenta, 'Disponible');
});

ok('MP disponible → pasa a ahorro reservas: no asignación sin cuenta; ahorro con origen', () => {
  const t =
    'del dinero de mercado pago disponible, pasa 30000 a un ahorro en reservas mercado pago';
  assert.equal(parseAsignarDesdeDisponibleSinCuenta(t), null);
  const p0 = parseMessageFlexible(t);
  assert.ok(p0);
  assert.equal(p0!.tipo, 'ahorro');
  assert.equal(p0!.monto, 30_000);
  const p = enriquecerBancoYProducto(t, p0!);
  assert.equal(p.origen, 'Mercado Pago · Disponible');
  assert.ok(p.banco?.includes('Mercado'));
});

ok('MP disponible → pasa a cuenta rut: traspaso (no sin cuenta)', () => {
  const t = 'del dinero de mercado pago disponible, pasa 25000 a cuenta rut';
  assert.equal(parseAsignarDesdeDisponibleSinCuenta(t), null);
  const tr = parseTraspaso(t);
  assert.ok(tr);
  assert.equal(tr!.monto, 25_000);
  assert.equal(tr!.origenBanco, 'Mercado Pago');
  assert.equal(tr!.origenCuenta, 'Disponible');
  assert.equal(tr!.destinoBanco, 'Banco Estado');
  assert.equal(tr!.destinoCuenta, 'Cuenta RUT');
});

// === FIX: "de ahorro" no debe ser asignación sin cuenta ===

ok('del dinero disponible, tengo 50000 de ahorro en reserva mercado libre → NO asignación', () => {
  const t = 'del dinero disponible, tengo 50000 de ahorro en reserva mercado libre';
  assert.equal(parseAsignarDesdeDisponibleSinCuenta(t), null, 'NO debe ser asignación, es ahorro');
});

ok('del dinero disponible, tengo 50000 de ahorro en reserva mercado libre → ahorro flexible', () => {
  const t = 'del dinero disponible, tengo 50000 de ahorro en reserva mercado libre';
  const p = parseMessageFlexible(t);
  assert.ok(p, 'flexible debe parsear');
  assert.equal(p!.tipo, 'ahorro');
  assert.equal(p!.monto, 50_000);
  assert.equal(p!.banco, 'Mercado Pago', '"mercado libre" se mapea a Mercado Pago');
});

ok('del dinero disponible, tengo 50000 de ahorro en reserva mercado libre → enriquecido con Reserva', () => {
  const t = 'del dinero disponible, tengo 50000 de ahorro en reserva mercado libre';
  const p0 = parseMessageFlexible(t);
  assert.ok(p0);
  const p = enriquecerBancoYProducto(t, p0!);
  assert.equal(p.banco, 'Mercado Pago');
  assert.ok(
    p.cuentaProducto && /reserva/i.test(p.cuentaProducto),
    `cuentaProducto debe contener "reserva", got: ${p.cuentaProducto}`,
  );
});

ok('del dinero disponible, tengo 50000 en ahorro reservas mercado libre → NO asignación', () => {
  const t = 'del dinero disponible, tengo 50000 en ahorro reservas mercado libre';
  assert.equal(parseAsignarDesdeDisponibleSinCuenta(t), null, 'en ahorro → bloqueado');
});

ok('del dinero disponible, tengo 50000 en ahorro reservas mercado libre → ahorro flexible', () => {
  const t = 'del dinero disponible, tengo 50000 en ahorro reservas mercado libre';
  const p = parseMessageFlexible(t);
  assert.ok(p, 'flexible debe parsear');
  assert.equal(p!.tipo, 'ahorro');
  assert.equal(p!.monto, 50_000);
  assert.equal(p!.banco, 'Mercado Pago');
});

ok('tengo un ahorro en reserva mercado pago → NO asignación', () => {
  const t = 'del dinero disponible, tengo un ahorro de 80000 en reserva mercado pago';
  assert.equal(parseAsignarDesdeDisponibleSinCuenta(t), null);
});

// === FIX: "para gastar en mercado libre" con señal dinero existente → gasto ===

ok('del dinero disponible, tengo 79698 para gastar en mercado libre → gasto flexible', () => {
  const t = 'del dinero disponible, tengo 79698 para gastar en mercado libre';
  assert.equal(parseAsignarDesdeDisponibleSinCuenta(t), null, 'NO debe ser asignación');
  const p = parseMessageFlexible(t);
  assert.ok(p, 'flexible debe parsear');
  assert.equal(p!.tipo, 'gasto');
  assert.equal(p!.monto, 79_698);
});

// === Mercado Libre detectado como banco (alias de Mercado Pago) ===

ok('detectBanco: mercado libre → Mercado Pago', () => {
  assert.equal(detectBanco('ahorro en mercado libre'), 'Mercado Pago');
});

ok('mapExtremoTraspaso: reserva mercado libre → Mercado Pago · Reserva', () => {
  const m = mapExtremoTraspaso('reserva mercado libre');
  assert.ok(m);
  assert.equal(m!.banco, 'Mercado Pago');
  assert.equal(m!.cuenta, 'Reserva');
});

// === Tests existentes siguen pasando ===

ok('del dinero disponible tengo 9601 en mercado pago para gastar → sigue siendo asignación', () => {
  const t = 'del dinero disponible, tengo 9601 en mercado pago para gastar';
  const p = parseAsignarDesdeDisponibleSinCuenta(t);
  assert.ok(p, 'debe ser asignación (no afectado por fixes)');
  assert.equal(p!.monto, 9601);
  assert.equal(p!.banco, 'Mercado Pago');
});

console.log('\nTodas las comprobaciones pasaron.');
