import test from 'node:test';
import assert from 'node:assert/strict';
import devices from './devices.js';

test('endpoint hitung klien terdaftar sebelum rute perangkat dinamis', () => {
  const layers = devices.stack.filter((layer) => layer.route);
  const clients = layers.findIndex((layer) => layer.route.path === '/clients');
  const detail = layers.findIndex((layer) => layer.route.path === '/:id/detail');
  assert.ok(clients >= 0 && clients < detail);
  assert.equal(layers[clients].route.methods.get, true);
  assert.equal(layers[clients].route.stack.length, 2); // can('devices') + handler
});

test('monitor perangkat aktif adalah GET read-only dengan hak akses perangkat', () => {
  const layer = devices.stack.find((item) => item.route?.path === '/:id/active-devices');
  assert.ok(layer);
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack.length, 2);
});