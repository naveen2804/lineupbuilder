# Lineup Builder

Build football lineups on a full-width pitch and export them as share-ready images.

- 11v11, 9v9, 7v7 and 5v5 formats with a range of formations
- Drag players anywhere; drop onto a teammate or substitute to swap
- Outfield and goalkeeper kits (solid, stripes, hoops, halves, sash) plus per-player custom kits
- Unlimited substitutes, captain armband, four pitch styles, shirt or disc tokens
- Export PNGs in 21:9, 16:9, 4:3, 1:1, 4:5, 9:16 and phone (iPhone / Android) sizes, at 1× or 2×
- **Analysis mode**: freehand, lines, arrows, distance measuring, box/oval/custom zones, player runs with
  animated playback, player links, spotlights, opposition markers, the ball, text labels, and thirds /
  5-lane / 18-zone overlays — with undo/redo and keyboard shortcuts. Markings can be included in exports.
- **Saved lineups**: keep any number of lineups in the browser with thumbnails; open, rename, duplicate,
  delete, and export/import a JSON backup. <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>S</kbd> saves the open lineup.
- Everything is saved in your browser

## Run locally

It's a static site with no build step:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which publishes the site to GitHub Pages.
In the repository settings, set **Pages → Source** to **GitHub Actions**.
