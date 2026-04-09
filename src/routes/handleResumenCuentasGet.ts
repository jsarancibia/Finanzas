import 'dotenv/config';

import { loadReglas } from '../config/loadReglas.js';
import {
  type ResumenDashboard,
  obtenerResumenDashboard,
} from '../services/resumenCuentas.js';

export async function handleResumenCuentasGet(authUserId: string | null): Promise<ResumenDashboard> {
  const reglas = loadReglas();
  if (!authUserId?.trim()) {
    throw new Error('Se requiere usuario autenticado para el resumen.');
  }
  return obtenerResumenDashboard(reglas, authUserId.trim());
}
