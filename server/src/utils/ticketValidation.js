export function installationCoordinates(latitude, longitude) {
  const lat = Number(latitude); const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function installationPayload(body = {}) {
  const name = String(body.contact_name || '').trim();
  const phone = String(body.contact_phone || '').trim();
  const address = String(body.installation_address || '').trim();
  const description = String(body.description || '').trim();
  const coordinates = installationCoordinates(body.latitude, body.longitude);
  if (!name || !phone || !address || !description || !coordinates) return null;
  return { name, phone, address, description, ...coordinates };
}