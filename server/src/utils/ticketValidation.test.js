import assert from 'node:assert/strict';
import test from 'node:test';
import { installationCoordinates, installationPayload } from './ticketValidation.js';

test('koordinat pemasangan menerima posisi GPS valid', () => {
  assert.deepEqual(installationCoordinates('-6.914744', '107.609810'), { latitude: -6.914744, longitude: 107.60981 });
});

test('payload pemasangan menolak koordinat dan data wajib tidak valid', () => {
  assert.equal(installationCoordinates('91', '107'), null);
  assert.equal(installationPayload({ contact_name: 'Budi', contact_phone: '0812', installation_address: 'Jl. Mawar', latitude: '-6', longitude: '107' }), null);
});