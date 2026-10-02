// Slide viewer built on PDF.js: one page at a time in a fixed window.
//
// Usage:
//   <div class="pdf-viewer" data-src="files/x.pdf" data-download="true"></div>
//   <script type="module" src="../pdf-viewer.js"></script>
//
// data-download="true" shows a download icon; omit it to hide it.
// Link to a page with #page=N (applies to the first viewer on the page).

import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const ICONS = {
  prev: '<path d="M15 18l-6-6 6-6"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
  expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  shrink: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "html") node.innerHTML = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function iconButton(name, label, extra = {}) {
  return el("button", { type: "button", class: "pdf-icon", "aria-label": label, title: label, html: icon(name), ...extra });
}

function pageFromHash() {
  const match = location.hash.match(/^#page=(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function initViewer(root, isPrimary) {
  const src = root.dataset.src;

  const slot = el("div", { class: "pdf-slot" });
  const status = el("p", { class: "pdf-status", text: "Loading slides…" });
  const sidePrev = iconButton("prev", "Previous slide", { class: "pdf-side pdf-side-prev" });
  const sideNext = iconButton("next", "Next slide", { class: "pdf-side pdf-side-next" });
  const grid = el("div", { class: "pdf-grid", hidden: "" });
  const stage = el("div", { class: "pdf-stage" }, [slot, status, sidePrev, sideNext, grid]);

  const progress = el("div", { class: "pdf-progress" }, [el("span")]);
  const prev = iconButton("prev", "Previous slide");
  const next = iconButton("next", "Next slide");
  const counter = el("span", { class: "pdf-counter", text: "– / –" });
  const gridButton = iconButton("grid", "All slides");
  const fullButton = iconButton("expand", "Full screen");
  const tools = [gridButton, fullButton];
  if (root.dataset.download === "true") {
    tools.push(el("a", { class: "pdf-icon", href: src, download: "", "aria-label": "Download PDF", title: "Download PDF", html: icon("download") }));
  }
  const bar = el("div", { class: "pdf-bar" }, [
    el("span"),
    el("div", { class: "pdf-nav" }, [prev, counter, next]),
    el("div", { class: "pdf-tools" }, tools),
  ]);
  root.replaceChildren(stage, progress, bar);

  let doc;
  try {
    doc = await pdfjsLib.getDocument(src).promise;
  } catch (err) {
    status.textContent = "Could not load these slides.";
    console.error(err);
    return;
  }
  const count = doc.numPages;
  const first = await doc.getPage(1);
  const { width: w1, height: h1 } = first.getViewport({ scale: 1 });
  root.style.setProperty("--ratio", `${w1 / h1}`);

  // Rendering. Finished slides are cached per (page, size) so flipping back and
  // forth, and prefetching the neighbours, is instant.
  const cache = new Map();
  function renderSlide(i, boxW, boxH) {
    const key = `${i}@${boxW}x${boxH}`;
    if (cache.has(key)) return cache.get(key);
    const job = (async () => {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(boxW / base.width, boxH / base.height);
      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;

      const node = el("div", { class: "pdf-slide" });
      node.style.width = `${viewport.width}px`;
      node.style.height = `${viewport.height}px`;
      node.style.setProperty("--scale-factor", String(scale));

      const canvas = el("canvas");
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      }).promise;

      const textLayer = el("div", { class: "textLayer" });
      await new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport }).render();

      const links = el("div", { class: "pdf-links" });
      for (const annot of await page.getAnnotations()) {
        if (annot.subtype !== "Link") continue;
        const [x1, y1, x2, y2] = pdfjsLib.Util.normalizeRect(annot.rect);
        const a = el("a");
        a.style.left = `${((x1 - base.viewBox[0]) / base.width) * 100}%`;
        a.style.top = `${((base.viewBox[3] - y2) / base.height) * 100}%`;
        a.style.width = `${((x2 - x1) / base.width) * 100}%`;
        a.style.height = `${((y2 - y1) / base.height) * 100}%`;
        if (annot.url) {
          Object.assign(a, { href: annot.url, target: "_blank", rel: "noopener" });
        } else if (annot.dest) {
          a.href = "#";
          a.addEventListener("click", async (e) => {
            e.preventDefault();
            const dest = typeof annot.dest === "string" ? await doc.getDestination(annot.dest) : annot.dest;
            if (dest) show((await doc.getPageIndex(dest[0])) + 1);
          });
        } else {
          continue;
        }
        links.append(a);
      }
      node.append(canvas, textLayer, links);
      return node;
    })();
    cache.set(key, job);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    return job;
  }

  let current = 0;
  let showToken = 0;
  async function show(n, { force = false } = {}) {
    n = Math.min(Math.max(1, n), count);
    if (n === current && !force) return;
    current = n;
    const token = ++showToken;

    counter.textContent = `${n} / ${count}`;
    prev.disabled = sidePrev.disabled = n <= 1;
    next.disabled = sideNext.disabled = n >= count;
    progress.firstChild.style.width = `${(n / count) * 100}%`;
    if (isPrimary) history.replaceState(null, "", n > 1 ? `#page=${n}` : location.pathname + location.search);

    const boxW = Math.round(stage.clientWidth);
    const boxH = Math.round(stage.clientHeight);
    const node = await renderSlide(n, boxW, boxH);
    if (token !== showToken) return;
    status.remove();
    slot.replaceChildren(node);
    for (const k of [n + 1, n - 1, n + 2]) {
      if (k >= 1 && k <= count) renderSlide(k, boxW, boxH);
    }
  }

  const step = (d) => show(current + d);
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  sidePrev.addEventListener("click", () => step(-1));
  sideNext.addEventListener("click", () => step(1));

  // Swipe on touch screens.
  let touchX = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") touchX = e.clientX;
  });
  stage.addEventListener("pointerup", (e) => {
    if (touchX === null) return;
    const dx = e.clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40 && grid.hidden) step(dx < 0 ? 1 : -1);
  });

  // Keyboard: arrows work anywhere on the page for the main viewer, and
  // always while this viewer is focused or full screen.
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const active = document.fullscreenElement === root || root.contains(document.activeElement) || (isPrimary && !document.fullscreenElement);
    if (!active) return;
    const moves = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 };
    if (e.key === "Escape" && !grid.hidden) toggleGrid(false);
    else if (e.key === "Home") show(1);
    else if (e.key === "End") show(count);
    else if (moves[e.key]) {
      e.preventDefault();
      step(moves[e.key]);
    }
  });

  // Overview grid with lazily rendered thumbnails.
  let gridBuilt = false;
  function buildGrid() {
    gridBuilt = true;
    const thumbObserver = new IntersectionObserver(async (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        thumbObserver.unobserve(entry.target);
        const page = await doc.getPage(Number(entry.target.dataset.page));
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (entry.target.clientWidth * 2) / base.width });
        const canvas = el("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        entry.target.prepend(canvas);
      }
    }, { root: grid, rootMargin: "200px 0px" });
    for (let i = 1; i <= count; i++) {
      const thumb = el("button", { type: "button", class: "pdf-thumb", "data-page": String(i), "aria-label": `Slide ${i}` }, [
        el("span", { text: String(i) }),
      ]);
      thumb.addEventListener("click", () => {
        toggleGrid(false);
        show(i);
      });
      grid.append(thumb);
      thumbObserver.observe(thumb);
    }
  }
  function toggleGrid(open = grid.hidden) {
    if (open && !gridBuilt) buildGrid();
    grid.hidden = !open;
    gridButton.classList.toggle("is-active", open);
    if (open) {
      grid.querySelectorAll(".pdf-thumb").forEach((t) => t.classList.toggle("is-current", Number(t.dataset.page) === current));
      const cur = grid.querySelector(".is-current");
      if (cur) grid.scrollTop = cur.offsetTop - (grid.clientHeight - cur.offsetHeight) / 2;
    }
  }
  gridButton.addEventListener("click", () => toggleGrid());

  fullButton.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.();
  });
  document.addEventListener("fullscreenchange", () => {
    const on = document.fullscreenElement === root;
    fullButton.innerHTML = icon(on ? "shrink" : "expand");
    fullButton.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
    fullButton.title = fullButton.getAttribute("aria-label");
  });
  if (!document.fullscreenEnabled) fullButton.hidden = true;

  // Re-render at the new size when the window changes (resize, full screen).
  let resizeTimer;
  let lastSize = "";
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const size = `${stage.clientWidth}x${stage.clientHeight}`;
      if (size !== lastSize) {
        lastSize = size;
        show(current, { force: true });
      }
    }, 100);
  }).observe(stage);

  lastSize = `${stage.clientWidth}x${stage.clientHeight}`;
  show((isPrimary && pageFromHash()) || 1);
}

document.querySelectorAll(".pdf-viewer").forEach((root, i) => initViewer(root, i === 0));
