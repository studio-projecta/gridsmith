# Gridsmith

Client-side image toolkit — compose grids, split, resize, and export size-optimized
PNG/JPEG. Everything runs in the browser; images are never uploaded to a server.

## Features

- **Grid compose** — upload images per group type, arrange them into a grid
  (e.g. 5×5), and merge into a single downloadable image. Editing preview (DOM) and
  export (Canvas) share the same layout math, so what you see is what you get.
- **Drag modes** — rearrange (swap cells) or fine-tune (offset/scale within a cell).
- **Split** — cut one image into `cols × rows` tiles, discarding separator lines.
- **Resize** — scale images to fixed web-delivery specs (Mobile / PC variants).
- **Size-optimized export** — lossless PNG via oxipng, with a lossy fallback
  (palette quantization for PNG, quality steps for JPEG) to hit a target file size.
- **Backup / restore** — export and re-import the full workspace as a single ZIP.
- **Local-first** — all state lives in the browser (IndexedDB); no accounts, no server.

## Tech stack

React 18 · Vite · TypeScript · Zustand · @dnd-kit · idb (IndexedDB) · Canvas ·
[@jsquash/oxipng](https://github.com/jamsinclair/jSquash) · libimagequant (WASM)

## Development

```bash
npm install
npm run dev          # start dev server
npm run build        # type-check + production build
npm run preview      # preview the production build
npm run test:e2e     # Playwright end-to-end tests
```

## License

Gridsmith is licensed under the **GNU General Public License v3.0** — see [LICENSE](LICENSE).

It bundles [libimagequant](https://github.com/ImageOptim/libimagequant) (via the
[`imagequant`](https://www.npmjs.com/package/imagequant) WASM package) for palette
quantization, which is **GPL v3**. Because that code is linked into the distributed
build, Gridsmith as a whole is distributed under the GPL v3.
