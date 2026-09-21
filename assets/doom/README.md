# Doom character

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
Code copyright above does not replace the third-party model license below.

## Current character

The user supplied `dr_doom_v2.glb`, now preserved as `dr-doom-v2.glb`.
Its embedded metadata credits **Visiion**, **Dr Doom V2**, **CC BY 4.0**:
https://sketchfab.com/3d-models/dr-doom-v2-4c27ab8143b84f07a39c1639c39757c3
https://sketchfab.com/VisiionLovesYou
https://creativecommons.org/licenses/by/4.0/

Source: 10 meshes, 10 materials, 11 embedded images, one skin with 151 joints,
zero animation clips. No geometry was generated to replace this model.

Adaptations: procedural movement mapped to the Bip001 rig; relaxed arms;
randomized left/right/open-hand speaking poses with easing and pauses; attentive
head pose; breathing; cape motion; small oval pacing path with hip/knee/ankle
animation. Rigid belt and cloak clasp objects are attached to the skeleton while
preserving their bind transforms. Runtime cloth materials are darkened toward
the original user reference. Original textures remain intact. These are authored
procedural motions, not motion capture, physics cloth or foot-contact IK.
The face retains its mask; no phoneme lip sync is claimed.

`dr-doom-v2-animated.glb` is a portable derived copy with Idle, Walk and Talk clips
and corrected accessory parents. Walk is in place; the studio adds root travel.
The exported clips are fixed loops; runtime speaking gestures are randomized.
Model attribution and CC BY license are retained in both GLBs and shown in the
studio and Jarvis. Exported materials retain the source colors; runtime applies
the darker cloth treatment. Original files in Downloads are unchanged.

## Runtime

`OmegaDoom.create(host)` now loads the actual V2 model. Both the studio and local
Jarvis load pinned Three.js r128 and GLTFLoader (MIT license retained in
`assets/vendor/three-r128/LICENSE`). No bundler or deployment build is needed.
First-party runtime remains ES5.

Returned controls: `ready`, `setState('idle'|'walk'|'listening'|'speaking')`,
`setEnergy(0..1)`, `setPaused(bool)`, `setSolid(bool)`, `reset()`, `destroy()`.
`createModel(host,arrayBuffer)` imports a self-contained GLB locally, without
upload. External GLB resources are rejected. Custom rigs need their own mapping.
`createPortrait(host)` retains the original user image/depth viewer as an option.

Jarvis uses its existing live audio meter and browser-speech boundary fallback.
The actual authenticated Jarvis voice endpoint has not been exercised in this task.
No changes have been deployed.

## Other retained sources

The source selector still includes the user-selected hosted sculpture by Rui
Barbosa, https://sketchfab.com/models/8c5a5ce64b1a464f997dbdbcfe201d10/embed .
It is displayed only through the official iframe with attribution. Its fixed
pose is not rigged by this code; no mesh was downloaded or extracted.

`doom-articulated.glb/.gltf` and `scripts/build-doom-model.py` are the earlier
rejected geometric prototype, not the current character. Its renderer has been
removed. The previous imagegen pose attempt failed and no generated image is used.

## Verification and regeneration

- `node scripts/test-doom-rig.js`: source structure, accessory binding, actual
  hand movement through joints, gait rotations, finite quaternions, reduced motion.
- `node scripts/test-doom-motion.js`: varied hand choices, bounded smooth
  transitions, pauses and reset behavior.
- `node scripts/check-html-scripts.js doom-hologram.html jarvis.html` and JS syntax.
- Browser inspection: materials, idle, gesture and walking/turning states.
- `node scripts/animate-doom-glb.js`: optional portable clip export from the
  supplied GLB; not part of deployment. External DCC import has not been tested.
