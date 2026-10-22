import assert from 'node:assert/strict';
import { factoryResetTask, findNewWanInstance, normalizeTemperature, normalizeDevice, parseDeviceDetail, rebootTask, ssidListTask, wanAddObjectName, wanBindingPaths, wanBindingTemplate, wanConnectionDeviceBase, wanPppParent, wanCreateParameterValues, wanPppParameterValues, wifiParameterValues } from './genieacs.js';

assert.deepEqual(rebootTask(), { name: 'reboot' });
assert.deepEqual(factoryResetTask(), { name: 'factoryReset' });
assert.deepEqual(ssidListTask(), { name: 'provisions', provisions: [['SSID-LIST']] });
assert.deepEqual(wanPppParameterValues('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2', { username: 'baru', password: 'rahasia', vlan: 20, vlanEnabled: true }, { X_ZTE_COM_VLANID: { _value: 10 }, X_ZTE_COM_VLANEnable: { _value: false } }), [
  ['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username', 'baru', 'xsd:string'],
  ['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Password', 'rahasia', 'xsd:string'],
  ['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.X_ZTE_COM_VLANID', '20', 'xsd:unsignedInt'],
  ['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.X_ZTE_COM_VLANEnable', 'true', 'xsd:boolean'],
]);
assert.throws(() => wanPppParameterValues('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2', { username: 'baru', vlanEnabled: false }, { X_ZTE_COM_VLANID: { _value: 10 } }), /VLAN enable/);

const wifiRaw = {
  InternetGatewayDevice: { LANDevice: { '1': { WLANConfiguration: { '1': {
    SSID: { _value: 'lama' },
    PreSharedKey: { '1': { PreSharedKey: { _value: 'lama1234' }, KeyPassphrase: { _value: 'lama1234' } } },
  } } } } },
};
assert.deepEqual(wifiParameterValues(wifiRaw, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1', 'Baru', 'password8'), [
  ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID', 'Baru', 'xsd:string'],
  ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey', 'password8', 'xsd:string'],
  ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase', 'password8', 'xsd:string'],
]);
assert.equal(wanAddObjectName('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1', 'ppp'), 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection');
assert.equal(wanAddObjectName(wanConnectionDeviceBase('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1'), 'ppp'), 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection');
assert.equal(wanAddObjectName('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1', 'bridge'), 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection');
assert.equal(wanConnectionDeviceBase('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2'), 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1');
assert.equal(wanConnectionDeviceBase('Device.WANDevice.2.WANConnectionDevice.3.WANIPConnection.7', 'Device'), 'Device.WANDevice.2.WANConnectionDevice.3');
const wanRoot = 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice';
const wanRaw = { InternetGatewayDevice: { WANDevice: { '1': { WANConnectionDevice: {
  '1': { _object: true, WANIPConnection: { '1': { Name: { _value: '1_TR069_R_VID_100' } } } },
  '2': { _object: true, WANPPPConnection: { _object: true } },
} } } } };
const tr069 = { base_path: `${wanRoot}.1.WANIPConnection.1`, management: true };
assert.equal(wanPppParent(wanRaw, { root: 'InternetGatewayDevice', wan_ip: [tr069], wan_ppp: [] }), `${wanRoot}.2`);
assert.equal(wanPppParent(wanRaw, { root: 'InternetGatewayDevice', wan_ip: [tr069], wan_ppp: [{ base_path: `${wanRoot}.2.WANPPPConnection.1`, active: true, username: 'user' }] }), `${wanRoot}.2`);
assert.equal(wanPppParent(wanRaw, { root: 'InternetGatewayDevice', wan_ip: [tr069], wan_ppp: [{ base_path: `${wanRoot}.1.WANPPPConnection.1`, active: true, username: 'user' }] }), `${wanRoot}.2`);
// Saat hanya parent TR069 yang ada, PPP harus memakai parent internet baru, bukan .1.
assert.equal(wanPppParent({ InternetGatewayDevice: { WANDevice: { '1': { WANConnectionDevice: { _object: true, '1': wanRaw.InternetGatewayDevice.WANDevice['1'].WANConnectionDevice['1'] } } } } }, { root: 'InternetGatewayDevice', wan_ip: [tr069], wan_ppp: [] }), null);
const wanObject = 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection';
assert.equal(findNewWanInstance([
  { base_path: `${wanObject}.1` },
  { base_path: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANPPPConnection.2' },
], wanObject, new Set([`${wanObject}.2`])), `${wanObject}.1`);
assert.equal(findNewWanInstance([
  { base_path: `${wanObject}.1` }, { base_path: `${wanObject}.3` },
], wanObject, new Set([`${wanObject}.1`])), `${wanObject}.3`);
assert.throws(() => findNewWanInstance([{ base_path: `${wanObject}.2.extra` }], wanObject), /0 instance baru/);
assert.throws(() => findNewWanInstance([{ base_path: `${wanObject}.2` }, { base_path: `${wanObject}.4` }], wanObject), /2 instance baru/);
assert.deepEqual(wanBindingPaths(), []);
assert.deepEqual(wanBindingPaths(['InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.2', 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1']), [
  'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.2',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1',
]);
assert.deepEqual(wanBindingPaths(['bad.path', 'Device.LANDevice.1.LANEthernetInterfaceConfig.1']), ['Device.LANDevice.1.LANEthernetInterfaceConfig.1']);
const parsedBindings = parseDeviceDetail({
  InternetGatewayDevice: {
    WANDevice: {
      '1': {
        WANConnectionDevice: {
          '1': {
            WANPPPConnection: {
              '1': {
                Username: { _value: 'user' },
                X_VENDOR_LANBind: { _value: 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1, InternetGatewayDevice.LANDevice.1.WLANConfiguration.2' },
              },
            },
          },
        },
      },
    },
    LANDevice: {
      '1': {
        LANEthernetInterfaceConfig: { '1': { Name: { _value: 'eth0' } } },
        WLANConfiguration: { '2': { SSID: { _value: 'wifi' } } },
      },
    },
  },
});
assert.deepEqual(parsedBindings.wan_ppp[0].bindings, [
  'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2',
]);
const wanPath = `${wanObject}.3`;
const bindingRaw = { InternetGatewayDevice: { WANDevice: { '1': { WANConnectionDevice: { '1': {
  WANPPPConnection: { '1': { Username: { _value: 'existing' } }, '2': { X_FH_LanInterface: { _value: '' } } },
} } } } } };
const bindingDetail = { wan_ppp: [
  { base_path: `${wanObject}.1` }, { base_path: `${wanObject}.2` },
], wan_ip: [] };
assert.deepEqual(wanBindingTemplate(bindingRaw, bindingDetail), { X_FH_LanInterface: { _value: '' } });
assert.deepEqual(wanCreateParameterValues(wanPath, 'ppp', {
  username: 'user', vlanEnabled: false, bindings: [
    'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2',
  ],
}, {
  Username: { _value: 'existing' }, X_VENDOR_VLANID: { _value: 1 }, X_VENDOR_VLANEnable: { _value: true },
  ...wanBindingTemplate(bindingRaw, bindingDetail),
}).find(([path]) => path.endsWith('.X_FH_LanInterface')), [
  `${wanPath}.X_FH_LanInterface`,
  'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1,InternetGatewayDevice.LANDevice.1.WLANConfiguration.2',
  'xsd:string',
]);
assert.deepEqual(wanCreateParameterValues(wanPath, 'ppp', { name: 'INTERNET', username: 'user', password: 'secret', vlan: 20, vlanEnabled: true }, {
  ConnectionType: { _value: 'PPPoE_Routed' },
  X_FH_ServiceList: { _value: 'TR069,INTERNET' },
  X_FH_VLANID: { _value: 10 },
  X_FH_VLANEnable: { _value: true },
}), [
  [`${wanPath}.Enable`, 'true', 'xsd:boolean'],
  [`${wanPath}.Name`, 'INTERNET', 'xsd:string'],
  [`${wanPath}.ConnectionType`, 'PPPoE_Routed', 'xsd:string'],
  [`${wanPath}.NATEnabled`, 'true', 'xsd:boolean'],
  [`${wanPath}.Username`, 'user', 'xsd:string'],
  [`${wanPath}.Password`, 'secret', 'xsd:string'],
  [`${wanPath}.X_FH_ServiceList`, 'INTERNET', 'xsd:string'],
  [`${wanPath}.X_FH_VLANID`, '20', 'xsd:unsignedInt'],
  [`${wanPath}.X_FH_VLANEnable`, 'true', 'xsd:boolean'],
]);
assert.deepEqual(wanCreateParameterValues(wanPath, 'ppp', {
  name: 'INTERNET', username: 'user', vlanEnabled: false,
  bindings: ['InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1', 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2'],
}, {
  ConnectionType: { _value: 'PPPoE_Routed' },
  X_VENDOR_LANBind: { _value: '' },
  X_VENDOR_VLANID: { _value: 1 },
  X_VENDOR_VLANEnable: { _value: true },
}).find(([path]) => path.endsWith('.X_VENDOR_LANBind')), [
  `${wanPath}.X_VENDOR_LANBind`,
  'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1,InternetGatewayDevice.LANDevice.1.WLANConfiguration.2',
  'xsd:string',
]);
assert.equal(wanCreateParameterValues(wanPath, 'ppp', { name: '2_INTERNET_R_VID_20', username: 'user', vlan: 20, vlanEnabled: true }, {
  X_ZTE_ServiceList: { _value: 'INTERNET' }, X_ZTE_VLANID: { _value: 1 }, X_ZTE_VLANEnable: { _value: true },
}).find(([path]) => path.endsWith('.Name'))[1], '2_INTERNET_R_VID_20');
assert.deepEqual(wanCreateParameterValues(wanPath, 'ppp', { username: 'user', vlanEnabled: false }, {
  ConnectionType: { _value: 'PPPoE_Routed' },
  X_ZTE_COM_VLANID: { _value: 10 },
  X_ZTE_COM_VLANEnable: { _value: true },
}).slice(-1), [[`${wanPath}.X_ZTE_COM_VLANEnable`, 'false', 'xsd:boolean']]);
assert.throws(() => wanCreateParameterValues(wanPath, 'ppp', { username: 'user', vlan: 20, vlanEnabled: true }, {
  X_ZTE_COM_VLANID: { _value: 10 },
}), /VLAN ID\/Enable/);
assert.equal(normalizeTemperature(0), null);
assert.equal(normalizeDevice({
  _id: '000AC2-HG6145D2-SENTINEL',
  _lastInform: new Date().toISOString(),
  InternetGatewayDevice: { X_ZTE_TransceiverTemperature: { _value: 0 } },
}).temperature, null);
assert.equal(normalizeTemperature(42.08), 42.08);
assert.equal(normalizeDevice({
  _id: '000AC2-HG6145D2-FHTTC1F73776',
  _lastInform: new Date().toISOString(),
  InternetGatewayDevice: {
    DeviceInfo: {},
    WANDevice: { '1': { WANPONInterfaceConfig: {} } },
    X_ZTE_CU_Temperature: { _value: 0 },
    X_ZTE_TransceiverTemperature: { _value: 11006 },
  },
}).temperature, 42.99);

console.log('genieacs temperature self-check passed');