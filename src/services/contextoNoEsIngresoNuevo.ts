/**
 * Señales de que el mensaje habla de dinero ya existente (asignación / reparto),
 * no de ingreso nuevo. arquitectura7 + arquitectura8.
 */

export function tieneSenalOrigenDineroExistente(text: string): boolean {
  const t = text.trim().normalize('NFC').toLowerCase();
  if (/\bdel\s+dinero\s+para\s+asignar\b/.test(t)) {
    return true;
  }
  if (/\bdinero\s+para\s+asignar\b/.test(t)) {
    return true;
  }
  if (/\bpara\s+asignar\b/.test(t)) {
    return true;
  }
  if (/\bdel\s+dinero\s+disponible\b/.test(t)) {
    return true;
  }
  if (/\bdel\s+(?:saldo|salgo|plata)\s+disponible\b/.test(t)) {
    return true;
  }
  if (/\bdel\s+disponible\b/.test(t) && !/\bdel\s+disponible\s+sin\s+cuenta\b/.test(t)) {
    return true;
  }
  if (/\bdesde\s+(?:el\s+)?(?:dinero\s+)?disponible\b/.test(t)) {
    return true;
  }
  if (/\bdel\s+pendiente\b/.test(t)) {
    return true;
  }
  if (/\bpendiente\s+de\s+repartir\b/.test(t)) {
    return true;
  }
  if (/\bdel\s+dinero\s+a\s+repartir\b/.test(t)) {
    return true;
  }
  if (/\bdinero\s+a\s+repartir\b/.test(t)) {
    return true;
  }
  if (/\blo\s+que\s+tengo\s+para\s+repartir\b/.test(t)) {
    return true;
  }
  if (/\bde\s+ese\s+dinero\b/.test(t) && /\bdisponible\b/.test(t)) {
    return true;
  }
  if (/\bdinero\s+disponible\b/.test(t)) {
    return true;
  }
  if (/\b(?:el\s+)?dinero\b/.test(t) && /\bdisponible\b/.test(t) && /\ben\s+\S/.test(t)) {
    return true;
  }
  if (/\blo\s+disponible\b/.test(t)) {
    return true;
  }
  if (/\bdisponible\s+est[aá]\b/.test(t)) {
    return true;
  }
  if (/\btengo\s+disponible\b/.test(t) && /\ben\s+\S/.test(t) && /\btodo\b/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Si el usuario dice «tengo» pero el mensaje indica colchón / asignación, no es ingreso nuevo (arquitectura8).
 */
export function bloqueaIngresoPorPalabraTengo(text: string): boolean {
  return tieneSenalOrigenDineroExistente(text);
}
