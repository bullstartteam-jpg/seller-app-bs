# BullStart Seller

Desktop app for BullStart sellers — manage orders, wallet, and tracking.

Built with Electron + React + Tailwind. Talks to the BullStart API at
`https://bullstart.us/api`.

## Development

```bash
npm install
npx webpack --config webpack.renderer.config.js --mode development
npx electron .
```

## Build

```bash
npm run build:win    # Windows installer (.exe)
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
```

## Releases

Tag a new version to trigger a CI build + GitHub Release with auto-update
artifacts:

```bash
npm version patch
git push --follow-tags
```

See [`AUTO_UPDATE_SETUP.md`](./AUTO_UPDATE_SETUP.md) for the auto-update flow.

## License

Proprietary — © BullStart Team. All rights reserved.
