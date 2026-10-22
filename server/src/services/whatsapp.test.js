import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePhone, renderTemplate, isTemporaryMiberFailure, miberConfigurationStatus, miberEndpoint, miberErrorMessage, miberTemplates } from './whatsapp.js';

test('normalizes Indonesian WhatsApp numbers and renders all template variables', () => {
  assert.equal(normalizePhone('0812-3456-7890'), '6281234567890');
  assert.equal(normalizePhone('+62 812 3456 7890'), '6281234567890');
  assert.equal(renderTemplate('Halo {nama}, {tagihan}', { nama: 'Ani', tagihan: 'Rp10.000' }), 'Halo Ani, Rp10.000');
  assert.equal(normalizePhone('81234567890'), null);
  assert.equal(isTemporaryMiberFailure(429), true);
  assert.equal(isTemporaryMiberFailure(500), true);
  assert.equal(isTemporaryMiberFailure(400), false);
});

test('Miber configuration status never returns API key', () => {
  const status = miberConfigurationStatus({
    baseUrl: 'https://meta.miber.id/api/v1/external', apiKey: 'wag_secret', whatsappAccountId: 'account-id', languageCode: 'id', templates: {}, components: {},
  });
  assert.equal('api_key' in status, false);
  assert.equal(typeof status.api_key_configured, 'boolean');
  assert.equal(Array.isArray(status.configured_templates), true);
});

test('Miber endpoints retain configured API base path', () => {
  const baseUrl = 'https://meta.miber.id/api/v1/external/';
  assert.equal(miberEndpoint(baseUrl, 'templates'), 'https://meta.miber.id/api/v1/external/templates');
  assert.equal(miberEndpoint(baseUrl, 'whatsapp/accounts'), 'https://meta.miber.id/api/v1/external/whatsapp/accounts');
  assert.equal(miberEndpoint(baseUrl, '/messages/send/template'), 'https://meta.miber.id/api/v1/external/messages/send/template');
});

test('normalizes Miber template and error response formats', () => {
  assert.deepEqual(miberTemplates({ data: { templates: [{ name: 'invoice' }] } }), [{ name: 'invoice' }]);
  assert.deepEqual(miberTemplates({ rows: [{ name: 'paid' }] }), [{ name: 'paid' }]);
  assert.equal(miberErrorMessage({ detail: 'API key tidak valid' }, 'fallback'), 'API key tidak valid');
  assert.equal(miberErrorMessage({ errors: { api_key: ['Wajib diisi'] } }, 'fallback'), 'Wajib diisi');
});