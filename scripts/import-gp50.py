"""Prepare the archived rvalladares GP-50 pages for this offline wrapper."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent

def remove_div(source, element_id):
    match = re.search(r'<div\b[^>]*\bid=["\']' + re.escape(element_id) + r'["\'][^>]*>', source)
    if not match:
        return source
    depth = 1
    for tag in re.finditer(r'</?div\b[^>]*>', source[match.end():]):
        depth += -1 if tag.group().startswith('</') else 1
        if not depth:
            return source[:match.start()] + source[match.end()+tag.end():]
    raise ValueError(element_id)

for transport in ('usb', 'bluetooth'):
    source = (ROOT / 'upstream' / f'gp50-{transport}.html').read_text(encoding='utf-8')
    source = re.sub(r'<footer\b[\s\S]*?</footer>', '', source, flags=re.I)
    source = remove_div(source, 'helpModal')
    source = re.sub(r'^\s*<meta property="og:[^\n]+\n', '', source, flags=re.M)
    source = source.replace('<html lang="en"', f'<html data-device="gp50" data-transport="{transport}" lang="en"')
    source = source.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'none\'; font-src \'self\' data:; object-src \'none\'; base-uri \'none\'; frame-src \'none\'">\n<script src="device-profiles.js"></script>')
    source = source.replace('iconogp5.png', 'assets/app-icon.png')
    if '<link rel="icon"' not in source:
        source = source.replace('</head>', '<link rel="icon" href="assets/app-icon.png"></head>')
    source = source.replace('<button id="btn_connect"', '<nav id="connection-mode" class="btn-group me-2" aria-label="Connection mode"><a id="mode-usb" class="btn btn-outline-secondary" href="gp50-usb.html">USB</a><a id="mode-bluetooth" class="btn btn-outline-secondary" href="gp50-bluetooth.html">Bluetooth</a></nav><button id="btn_connect"',1)
    active = f'id="mode-{transport}"'
    source = source.replace(active, active+' aria-current="page"')
    source = source.replace(active+' aria-current="page" class="btn btn-outline-secondary"',active+' aria-current="page" class="btn btn-primary"')
    source = re.sub(r'<div class="[^"]*">(?=<nav id="connection-mode")', '<div class="order-0 order-md-0 col-12 col-md-5 col-xl-4 p-3 d-flex align-items-center gap-2 flex-wrap">',source,count=1)
    source = re.sub(r'<div class="[^"]*">(?=\s*<div class="input-group">\s*<select id="listPatches")','<div class="order-2 order-md-1 col-12 col-md-5 col-xl-6 p-3">',source,count=1)
    source = source.replace("typeof disconnected.close", "typeof outputPort.close")
    source = re.sub(r'GP50 Editor - v[\d.]+b?', 'GP Editor Offline — v0.3.0', source)
    source = re.sub(r'Editor for the GP50[^"<]*', 'Offline GP-5 / GP-50 editor', source)
    start = source.rfind('\n',0,source.index('patchNR  = Boolean(data[227]')) + 1
    end = start + re.search(r'^\s*if \(initialSync\)\{', source[start:], re.M).start()
    assignments = source[start:end]
    source = source[:start]+'                    applyPatchData(data);\n'+source[end:]
    source = source.replace('        function refreshGUI(){','        function applyPatchData(data){\n            window.GP5Patches?.observed(data);\n'+assignments+'        }\n        function refreshGUI(){')
    needle = 'for (let i = 0; i < value.byteLength; i++) bytes.push(value.getUint8(i));' if transport == 'bluetooth' else 'for (let i = 0; i < value.byteLength; i++) bytes.push(value[(i)]);'
    source = source.replace(needle, needle+'\n            if (window.GP5Patches?.receive(bytes)) return;')
    if transport == 'usb':
        source = source.replace('element.name.includes("GP-50")', 'GPProfiles.matchesName(GPDevice.key,element.name)')
    else:
        source = source.replace('const server = await device.gatt.connect();','if (!GPProfiles.matchesName(GPDevice.key,device.name)) throw Error("GP-50を選択してください。");\n                const server = await device.gatt.connect();')
    source = source.replace('</html>', '<script src="preset-codec.js"></script>\n<script src="preset-session.js"></script>\n<script src="patch-tools.js"></script>\n</html>')
    (ROOT/'app'/f'gp50-{transport}.html').write_text(source,encoding='utf-8')
