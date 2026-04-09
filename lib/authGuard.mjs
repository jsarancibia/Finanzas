/**
 * Comprueba JWT en Authorization; devuelve usuario o envía JSON de error y null.
 */
export async function requireAuth(req, res) {
  const header = req.headers?.authorization ?? req.headers?.Authorization;
  const { verifyBearerToken } = await import('../dist/services/verifySessionToken.js');
  const result = await verifyBearerToken(
    typeof header === 'string' ? header : Array.isArray(header) ? header[0] : undefined,
  );
  if (!result.ok) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(result.status).json({ error: result.message });
  }
  return result.user;
}
