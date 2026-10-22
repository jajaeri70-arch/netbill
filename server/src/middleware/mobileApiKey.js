import { validateMobileApiKey } from '../services/mobileApiKey.js';

export async function requireMobileApiKey(req, res, next) {
  try {
    const key = req.get('X-API-Key');
    if (!key || !(await validateMobileApiKey(key))) {
      return res.status(401).json({ message: 'API key tidak valid' });
    }
    next();
  } catch (err) {
    next(err);
  }
}
