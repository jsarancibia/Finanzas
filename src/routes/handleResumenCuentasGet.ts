import 'dotenv/config';

import { loadReglas } from '../config/loadReglas.js';
import {
  type ResumenDashboard,
  obtenerResumenDashboard,
} from '../services/resumenCuentas.js';

export async function handleResumenCuentasGet(): Promise<ResumenDashboard> {
  const reglas = loadReglas();
  return obtenerResumenDashboard(reglas);
}
