window.gp5Bluetooth.onDevices(devices => {
  const list = document.getElementById('devices');
  list.replaceChildren();
  if (!devices.length) {
    const message = document.createElement('p');
    message.textContent = '検索中… GP-5のBluetoothが有効か確認してください。';
    list.append(message);
  }
  for (const device of devices) {
    const button = document.createElement('button');
    button.textContent = device.deviceName || '名前のないBLE MIDI機器';
    const id = document.createElement('small');
    id.textContent = device.deviceId;
    button.append(id);
    button.onclick = () => window.gp5Bluetooth.select(device.deviceId);
    list.append(button);
  }
});
document.getElementById('cancel').onclick = () => window.gp5Bluetooth.cancel();
