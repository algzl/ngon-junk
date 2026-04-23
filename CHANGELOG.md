# Changelog

## v0.1.0 - 2026-04-23

Initial GitHub-ready release of `ngon-junk`.

### Added

- Desktop-first 3D preview workflow built with `Electron + React + TypeScript + Three.js`
- Import support for `OBJ`, `FBX`, `3DS`, `STL`, `BLEND`, `SKP`
- Material presets: `original`, `gold`, `obsidian`, `ice`, `concrete`
- Surface controls for color, reflection, refraction, bump and coating
- Texture slots for diffuse, reflection, refraction, bump, roughness, metallic and normal maps
- UV editing with scale, offset, rotation and tile lock
- Smooth shading toggle
- Lighting presets and controls for studio, sun and spot setups
- Motion blur modes: `trail`, `smear`, `silhouette`
- Wireframe controls for visibility, color and thickness
- Optional preview frames for `16:9`, `9:16` and `1:1`
- JPG/PNG image export with long-edge sizing, `2x / 4x` scaling and `72 / 150 / 300 dpi`
- GLB/OBJ model export
- Bake export flow with embedded or separate channel output
- ZIP packaging for separate baked channels

### Notes

- FBX import is supported, but FBX export is not part of this build.
- Bake export intentionally skips bloom and shadow.
