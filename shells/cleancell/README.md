# shell: cleancell

The three-tile dashboard a Clean Cell designer subscriber lands on. Loaded
instead of the root index when `omega_orgs/cleancell.us.shell == 'cleancell'`.

It is a THIN WRAPPER, never a fork of the root index: same scripts, three
tiles instead of forty-one. What a user may actually open is decided by
`billing/current.toolAccess = ['editor','gridatlas']`, which every `api/`
endpoint enforces on its own — this page is the front door, not the lock.

The editor it opens is the SAME `editor.html` as everybody else's, cut down by
`omega_orgs/{orgId}.editorMode = 'bess-lite'`. See `omega-editor-mode.js` for
why that is a mode rather than a second 11 MB file.
