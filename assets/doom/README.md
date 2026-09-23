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

## Talking mask option

The user supplied `doctor_dooms_mask.glb`, preserved as
`doctor-dooms-mask.glb`. Its embedded metadata credits **Nicolas_Laube**,
**Doctor Doom's Mask**, **CC BY 4.0**:
https://sketchfab.com/3d-models/doctor-dooms-mask-8db5464072f341a994ad1c729d9080f7
https://sketchfab.com/Nicolas_Laube
https://creativecommons.org/licenses/by/4.0/

This source contains separate lower-lip, lower-head, chin and teeth meshes,
but no skeleton, morph targets or animation clips. `OmegaDoom.createMask()`
opens those authored lower-mouth parts in response to speech state and audio
energy. It is a speech-driven jaw motion, not phoneme-level lip sync.
The same authored lower-mouth materials receive a brief green emissive glow
while he speaks.

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
`createMask(host)` loads the talking mask option.
`createFigure(host, key)` loads any entry of `OmegaDoom.figures`; `credit(key)`
returns the attribution line a page shows for it.

## Statue and prop figures

Three more user-supplied Sketchfab downloads, none with a skeleton, morph
targets or clips. `createFigure()` gives them speech presence without a rig:
a statue breathes, leans in while listening and nods while speaking; a prop
turns, faster while the voice is active. Each pulses its own emissive toward
a per-figure colour on speech energy. Textures were reduced with
gltf-transform (resize + WebP), which the vendored GLTFLoader r128 reads via
`EXT_texture_webp`; the originals are not in the repo.

| key | file | source | licence |
|---|---|---|---|
| `ironman` | `iron-man.glb` (1K WebP, from 31 MB) | Iron Man — Grant Riley, https://sketchfab.com/3d-models/iron-man-69dde1ad49e94852984e3d83928efd65 | **CC BY-NC 4.0** |
| `witchking` | `witch-king.glb` (1K WebP, from 440 MB) | Lord of the Rings: The Witch-king of Angmar — AndreOrla, https://sketchfab.com/3d-models/lord-of-the-rings-the-witch-king-of-angmar-063e0e96abea42c3a25b0fa64ba1440a | CC BY 4.0 |
| `onering` | `the-one-ring.glb` (as downloaded) | The One Ring (Lord of The Rings) — Anthony Yanez, https://sketchfab.com/3d-models/the-one-ring-lord-of-the-rings-39eb401be92c49d39520fadd5ecff8d3 | CC BY 4.0 |

The Iron Man model is licensed **non-commercial**. Jarvis is a product page
of a commercial platform; that licence has to be resolved (a commercial
licence from the author, or a replacement asset) before this figure ships
to a customer-facing host. The Witch-king and Ring are Tolkien Estate and
Marvel likenesses regardless of the model licence; internal use only.


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
