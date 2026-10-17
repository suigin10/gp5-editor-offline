(function (root) {
  'use strict';
  const PROFILES = Object.freeze({
    gp5: Object.freeze({ key: 'gp5', name: 'GP-5', fileLength: 507, bodyLength: 466, fileNameLength: 10, tag: [10,69,77,81], settingsLength: 16, fsLength: 8, usb: 'index.html', bluetooth: 'bluetooth.html' }),
    gp50: Object.freeze({ key: 'gp50', name: 'GP-50', fileLength: 552, bodyLength: 511, fileNameLength: 16, tag: [71,80,53,48], settingsLength: 59, fsLength: 10, usb: 'gp50-usb.html', bluetooth: 'gp50-bluetooth.html' })
  });
  function get(key = 'gp5') { if (!PROFILES[key]) throw Error('未対応の機種です。'); return PROFILES[key]; }
  function matchesName(key, name) { return new RegExp(`\\bGP[ -]?${key === 'gp50' ? '50' : '5'}(?![0-9])`, 'i').test(name || ''); }
  const API = { PROFILES, get, matchesName };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else {
    root.GPProfiles = API;
    root.GPDevice = get(document.documentElement.dataset.device || 'gp5');
    root.GPTransport = document.documentElement.dataset.transport || 'usb';
  }
})(globalThis);
