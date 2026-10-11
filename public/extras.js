// Optional features, fetched only when the config turns them on (gallery, config viewer).
// The default page never downloads this file. All text goes through textContent.

// Gallery: images are local files; a missing or broken one becomes a placeholder frame.
// The first image loads eagerly, the others lazily. Alt text names the title, artist and collection.
export function galleryStrip({ el, cfg, c, lang }) {
  if (!cfg.gallery?.length) return null;
  const title = cfg.galleryTitle?.[lang];
  const collection = cfg.galleryCollection?.[lang];
  const artists = [...new Set(cfg.gallery.map((g) => g.artist).filter(Boolean))].join(', ');
  const credit = cfg.galleryCredit?.[lang] ?? artists;
  const list = el('ul', { class: 'gallery', 'aria-label': title || c.galleryLabel }, cfg.gallery.map((g, i) => {
    const name = g.title[lang];
    const frame = el('span', { class: 'frame' });
    const item = el('li', {});
    // Frames share one height; each takes its image's own shape (4:3 when the size is unknown).
    item.style.setProperty('--r', (g.width && g.height ? g.width / g.height : 4 / 3).toFixed(4));
    const cap = el('span', { class: 'cap', 'aria-hidden': g.image ? 'true' : false }, el('span', { class: 't', text: name }), g.artist ? el('span', { class: 'by', text: g.artist }) : null);
    const placeholder = () => {
      frame.replaceChildren(el('span', { class: 'ph', text: c.galleryPlaceholder }));
      cap.removeAttribute('aria-hidden'); // the caption is the only name left
    };
    if (g.image) {
      const alt = g.artist ? `${name}, ${c.galleryBy} ${g.artist}${collection ? `, ${c.galleryFrom} ${collection}` : ''}.` : name;
      const img = el('img', { src: g.image, alt, loading: i ? 'lazy' : 'eager' });
      img.addEventListener('error', placeholder);
      frame.append(img);
    } else placeholder();
    const inner = [frame, cap];
    item.append(g.link ? el('a', { href: g.link, rel: 'noopener', target: '_blank' }, inner) : el('span', { class: 'item' }, inner));
    return item;
  }));
  return [title ? el('h2', { class: 'gallery-title', text: title }) : null, list, credit ? el('p', { class: 'gallery-credit', text: credit }) : null];
}

// "How this page is built": shows the example's config file, read-only.
export function configViewer({ el, c }) {
  const pre = el('pre', { class: 'source', tabindex: '0' });
  let loaded = false;
  const details = el('details', { class: 'howbuilt' }, el('summary', { text: c.showConfigTitle }), el('p', { class: 'note', text: c.showConfigNote }), pre);
  details.addEventListener('toggle', async () => {
    if (!details.open || loaded) return;
    loaded = true;
    pre.textContent = c.showConfigLoading;
    try {
      const res = await fetch('/config-source.txt');
      if (!res.ok) throw new Error('missing');
      pre.textContent = await res.text();
    } catch {
      loaded = false;
      pre.textContent = c.showConfigError;
    }
  });
  return details;
}
