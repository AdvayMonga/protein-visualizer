# 🧬 Protein Structure Visualizer

A web app to visualize protein backbone structures in 3D. Upload a structure file and explore the protein with interactive controls.

## Features

- Reads every RCSB coordinate format: Legacy PDB, PDBx/mmCIF, BinaryCIF and
  Biological Assembly downloads, compressed (`.gz`) or not
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

The repo ships without sample data. Grab a structure from the
[RCSB Protein Data Bank](https://www.rcsb.org) — e.g. [1CRN](https://files.rcsb.org/download/1CRN.pdb)
(crambin, small and fast to render) — then upload it in the app.

Any coordinate download from an RCSB entry's *Download Files* menu works, in any
of these encodings:

| Download | Notes |
| --- | --- |
| Legacy PDB | The classic fixed-width format. Not available for very large structures. |
| PDBx/mmCIF | The current standard. Use this when a structure has no PDB file. |
| BinaryCIF | Same data, much faster to parse. Fetch from `models.rcsb.org`. |
| Biological Assembly | The functional molecule (e.g. the full hemoglobin tetramer) rather than the crystallographic asymmetric unit. |

The other menu entries are not structures and will be rejected with an
explanation: FASTA is sequence only, Structure Factors are raw diffraction data,
and the Validation reports describe a structure's quality rather than its shape.
