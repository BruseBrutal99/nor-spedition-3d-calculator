# Nor Spedition — 3D Load Calculator

Browser-baseret lastplanlægger til Nor Spedition. Indtast colli/pakker/paller, vælg lastbil eller container, og se en optimeret 3D-lastplan.

Inspireret af [Pier2Pier 3D Load Calculator](https://www.pier2pier.com/loadcalc/).

## Kør lokalt

```bash
npm install
npm run dev
```

## V1-fokus

1. Indtast gods (mål, vægt, antal, rotation, stabling)
2. Vælg udstyr (lastbil, trailer, container-presets)
3. Beregn og inspicér 3D-lastplan + fyldnings-/vægtstatistik

## Stack

- React + TypeScript + Vite
- Three.js via `@react-three/fiber` + `@react-three/drei`
- Extreme-point first-fit decreasing packing
