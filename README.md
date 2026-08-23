# 🧬 Protein Structure Visualizer

A web app to visualize protein backbone structures in 3D. Upload a PDB file and explore the protein with interactive controls.

## Features

- Upload and parse PDB files
- 3D visualization with React Three Fiber
- Toggle backbone line and atom spheres
- Orbit controls (rotate, zoom, pan)

## Run Locally

Requires [Node.js](https://nodejs.org) 18+ (developed on v22).

```bash
git clone https://github.com/AdvayMonga/protein-visualizer.git
cd protein-visualizer
npm install
npm start
```

Opens at http://localhost:3000.

## Usage

The repo ships without sample data. Grab a `.pdb` file from the
[RCSB Protein Data Bank](https://www.rcsb.org) — e.g. [1CRN](https://files.rcsb.org/download/1CRN.pdb)
(crambin, small and fast to render) — then upload it in the app.
