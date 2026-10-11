Add 3 artwork files you own or have the artist's permission to use, and credit the artist.

These files are served exactly as uploaded: nothing resizes, crops, recolors or re-encodes them, so give the browser files sized for the web. Name them in `../fancyape.config.js` under `gallery` (for example `image: 'my-piece.jpg'`), with the image's pixel `width` and `height`, a title, the `artist` and an optional link. Use jpg, png, webp or avif. `node scripts/build-showcase.js` checks the sizes against the files. Until a file is added, the page shows an "Artwork image" placeholder frame.
