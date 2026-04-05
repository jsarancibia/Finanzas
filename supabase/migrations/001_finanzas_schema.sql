-- BASE DE DATOS (SUPABASE) — según arquitectura.md
-- Tablas mínimas: movimientos, balances, cuentas.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.movimiento_tipo AS ENUM ('ingreso', 'gasto', 'ahorro');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.cuenta_tipo AS ENUM ('ahorro', 'disponible');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- Tabla: movimientos
-- id, tipo (ingreso | gasto | ahorro), monto, categoria, descripcion,
-- origen (opcional), destino (opcional), fecha
CREATE TABLE IF NOT EXISTS public.movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.movimiento_tipo NOT NULL,
  monto numeric NOT NULL,
  categoria text NOT NULL DEFAULT '',
  descripcion text NOT NULL DEFAULT '',
  origen text,
  destino text,
  fecha timestamptz NOT NULL DEFAULT now()
);

-- Tabla: balances
-- saldo_disponible, saldo_ahorrado, ultima_actualizacion
CREATE TABLE IF NOT EXISTS public.balances (
  saldo_disponible numeric NOT NULL,
  saldo_ahorrado numeric NOT NULL,
  ultima_actualizacion timestamptz NOT NULL DEFAULT now()
);

-- Tabla: cuentas (opcional pero recomendada en arquitectura)
-- id, nombre (ej: Banco Estado, efectivo), tipo (ahorro / disponible), saldo
CREATE TABLE IF NOT EXISTS public.cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo public.cuenta_tipo NOT NULL,
  saldo numeric NOT NULL DEFAULT 0
);
