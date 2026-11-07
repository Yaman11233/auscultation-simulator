# Auscultation Simulator

Browser-based auscultation trainer: drag a stethoscope chest piece over an interactive 3D manikin and hear heart and lung sounds that change with position (12 heart cases, 6 lung cases, teaching / quiz / presentation modes).

**Use it:** open `index.html` (double-click works offline; no server or network needed). Use headphones.

**Build from source:** `npm install` once, then `npm run build` — bundles `src/` (+ Three.js r160) into the single-file `index.html`. Do not edit `index.html` directly.

- `src/app.js` – audio engine (Web Audio synthesis), cases, spatial sound model, 2D view, UI
- `src/body.js` – SDF manikin, marching cubes, 2D↔3D surface mapping
- `src/three-view.js` – Three.js scene, camera presets, 3D stethoscope, labels
- `src/template.html` – HTML/CSS
- `RAPPORT.md` – full report (Swedish): design, how to add cases, test results

All sounds are synthesized; no audio files.
