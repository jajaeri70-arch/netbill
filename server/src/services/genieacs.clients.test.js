import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDevice, parseDeviceDetail, wifiClientCount, activeWifiDevices } from './genieacs.js';

const raw = (wlans, root = 'InternetGatewayDevice') => ({
  _id: 'test-ont',
  [root]: { LANDevice: { '1': { WLANConfiguration: wlans } } },
});

test('jumlah device tiap SSID dan total ONT dibaca dari parameter asosiasi', () => {
  const device = raw({
    '1': { SSID: { _value: 'Rumah' }, TotalAssociations: { _value: 2 } },
    '2': { SSID: { _value: 'Tamu' }, AssociatedDeviceNumberOfEntries: { _value: 0 } },
  });
  assert.deepEqual(parseDeviceDetail(device).wlan.map((w) => w.device_count), [2, 0]);
  assert.equal(wifiClientCount(device), 2);
  assert.equal(normalizeDevice(device).wifi_clients, 2);
});

test('fallback menghitung entri klien aktif saja, bukan metadata', () => {
  const device = raw({ '1': { AssociatedDevice: {
    _object: true,
    '1': { Active: { _value: true } },
    '2': { Active: { _value: false } },
    '3': { AssociatedDeviceMACAddress: { _value: '00:11:22:33:44:55' } },
  } } }, 'Device');
  assert.equal(parseDeviceDetail(device).wlan[0].device_count, 2);
  assert.equal(wifiClientCount(device), 2);
});

test('jumlah yang tidak dilaporkan tetap N/A, bukan nol atau total parsial', () => {
  const device = raw({
    '1': { TotalAssociations: { _value: '3' } },
    '2': { AssociatedDeviceNumberOfEntries: { _value: 'invalid' } },
  });
  assert.deepEqual(parseDeviceDetail(device).wlan.map((w) => w.device_count), [3, null]);
  assert.equal(wifiClientCount(device), null);
  assert.equal(wifiClientCount(raw({})), null);
  assert.equal(normalizeDevice(device).wifi_clients, null);
});

test('SSID nonaktif tanpa data asosiasi tidak menghilangkan total SSID aktif', () => {
  const device = raw({
    '1': { Enable: { _value: true }, TotalAssociations: { _value: 4 } },
    '2': { Enable: { _value: false } },
  });
  assert.deepEqual(parseDeviceDetail(device).wlan.map((w) => w.device_count), [4, 0]);
  assert.equal(wifiClientCount(device), 4);
});

test('monitor klien menampilkan asosiasi aktif dan melengkapi identitas dari daftar host', () => {
  const device = raw({
    '1': { SSID: { _value: 'Rumah' }, AssociatedDevice: {
      '1': { Active: { _value: true }, AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:DD:EE:FF' } },
      '2': { Active: { _value: false }, AssociatedDeviceMACAddress: { _value: '00:00:00:00:00:01' } },
      '3': { Active: { _value: true }, AssociatedDeviceMACAddress: { _value: '00:00:00:00:00:02' } },
    } },
    '2': { Enable: { _value: false }, AssociatedDevice: { '1': { Active: { _value: true } } } },
  });
  device.InternetGatewayDevice.Hosts = { Host: {
    '1': { MACAddress: { _value: 'aa:bb:cc:dd:ee:ff' }, HostName: { _value: 'Galaxy-A02' }, IPAddress: { _value: '192.168.1.6' } },
  } };
  assert.deepEqual(activeWifiDevices(device), [
    { key: '1-1-1', ssid: 'Rumah', name: 'Galaxy-A02', ip: '192.168.1.6', mac: 'AA:BB:CC:DD:EE:FF' },
    { key: '1-1-3', ssid: 'Rumah', name: null, ip: null, mac: '00:00:00:00:00:02' },
  ]);
  assert.equal(wifiClientCount(device), 2);
  device.InternetGatewayDevice.LANDevice['1'].Hosts = device.InternetGatewayDevice.Hosts;
  delete device.InternetGatewayDevice.Hosts;
  assert.equal(activeWifiDevices(device)[0].name, 'Galaxy-A02');
});