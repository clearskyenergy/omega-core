#!/usr/bin/env python3
"""© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
Run from the Omega repo after copying this overlay. Makes backups and idempotent edits.
"""
import json,pathlib,sys
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
atlas=root/'grid-atlas.html'
text=atlas.read_text()
marker='window.OmegaFiberAtlasHost'
script='<script src="/omega-fiber-atlas.js"></script>'
updated=text
if marker not in text:
    anchor='buildRail(); updateRailCounts();\nbuildPresets();'
    if updated.count(anchor)!=1:
        raise SystemExit('Atlas host anchor changed. Add window.OmegaFiberAtlasHost={map:map,L:L}; inside its map closure, and load /omega-fiber-atlas.js after the closing inline script. No files changed.')
    updated=updated.replace(anchor,'window.OmegaFiberAtlasHost = {map: map, L: L};\n'+anchor)
if script not in updated:
    if updated.count('</body>')!=1:raise SystemExit('Missing unique body close; no files changed.')
    updated=updated.replace('</body>',script+'\n</body>')
config_path=root/'vercel.json';config=json.loads(config_path.read_text())
config.setdefault('functions',{})['api/fiber-screen.js']={'maxDuration':30,'includeFiles':'data/fiber/**'}
ignore_path=root/'.gitignore';ignore=ignore_path.read_text() if ignore_path.exists() else ''
for rule in ['.fiber-cache/','private-fiber/','*.fiber-backup']:
    if rule not in ignore.splitlines():ignore+='\n'+rule+'\n'
vi_path=root/'.vercelignore';vi=vi_path.read_text() if vi_path.exists() else ''
for rule in ['.fiber-cache/','private-fiber/','*.fiber-backup','tests/']:
    if rule not in vi.splitlines():vi+='\n'+rule+'\n'
for target,content in [(atlas,updated),(config_path,json.dumps(config,indent=2)+'\n'),(ignore_path,ignore),(vi_path,vi)]:
    if target.exists() and target.read_text()==content:continue
    backup=target.with_name(target.name+'.fiber-backup')
    if target.exists() and not backup.exists():backup.write_bytes(target.read_bytes())
    target.write_text(content)
print('Installed Fiber Evidence control and /api/fiber-screen data inclusion. Existing authentication helper preserved.')
