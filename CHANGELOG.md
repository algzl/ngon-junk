# Changelog

## v1.1.1 - 2026-05-26

Export reliability and release metadata refresh.

### Added

- Added close-time export confirmation with model, image, turntable frames and GIF options.
- Added dedicated release scripts for `release/web app`, `release/windows app` and local `release/itch build`.
- Added YCSWU Tools Hub metadata files and schema context for catalog/update integration.
- Treated `release/web app` as the single web deploy folder for cPanel upload.
- Added PNG background images with cover/tile modes, U/V scale controls and drag positioning.
- Added layered background photo stacking with drag reordering, per-layer blur and scale lock.

### Fixed

- Fixed large binary desktop exports by writing Electron export payloads in chunks before finalizing the target file.
- Restored the missing `gifenc` dependency used by turntable GIF export.
- Corrected GitHub and release download URLs in AI/SEO metadata.
- Rebuilt web and Windows app icons from the official raster `ngonlogos.png` logo.
- Isolated background image blur to the selected layer and balanced multi-image tile layout.
- Clarified the floating background panel add button as `+bg img`.
- Let 3D viewport controls work again when the background image panel is minimized.

### Notes

- The setup/itch executable remains a local release artifact and is ignored by Git to avoid GitHub large-file rejection.

## v1.1.0 - 2026-04-26

UI and sample-flow update for the first public post-release refresh of `ngon-junk`.

### Updated

- Added a compact `load sample` shortcut directly under `load`
- Swapped the built-in sample model to the latest curated FBX example
- Simplified the sample area by removing the large thumbnail card treatment
- Updated the sample flow for both desktop and cPanel/web builds
- Refined image export behavior so preview and exported JPG/PNG match more closely
- Improved loading feedback across long-running material, motion and smoothing actions
- Continued UI cleanup around frame, motion and wire panels

### Notes

- Sample model naming in the UI is now generic and no longer exposes the original source filename.

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
