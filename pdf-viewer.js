// Inline PDF viewer built on PDF.js.
//
// Usage:
//   <div class="pdf-viewer" data-src="files/x.pdf" data-download="true"></div>
//   <script type="module" src="../pdf-viewer.js"></script>
//
// data-download="true" shows a download button; omit it (or "false") to hide it.
// Link to a page with #page=N (applies to the first viewer on the page).

import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function pageFromHash() {
  const match = location.hash.match(/^#page=(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function initViewer(root, isPrimary) {
  const src = root.dataset.src;
  const allowDownload = root.dataset.download === "true";

  const prev = el("button", { type: "button", "aria-label": "Previous page", text: "‹" });
  const next = el("button", { type: "button", "aria-label": "Next page", text: "›" });
  const input = el("input", { type: "number", min: "1", value: "1", "aria-label": "Page number" });
  const total = el("span", { class: "pdf-total", text: "/ …" });
  const fullscreen = el("button", { type: "button", "aria-label": "Full screen", text: "⛶" });
  const tools = [prev, input, total, next, el("span", { class: "pdf-spacer" }), fullscreen];
  if (allowDownload) {
    tools.push(el("a", { class: "pdf-download", href: src, download: "", text: "Download PDF" }));
  }
  const toolbar = el("div", { class: "pdf-toolbar" }, tools);
  const pagesEl = el("div", { class: "pdf-pages" }, [
    el("p", { class: "pdf-status", text: "Loading…" }),
  ]);
  root.replaceChildren(toolbar, pagesEl);

  let doc;
  try {
    doc = await pdfjsLib.getDocument(src).promise;
  } catch (err) {
    pagesEl.replaceChildren(el("p", { class: "pdf-status", text: "Could not load this PDF." }));
    console.error(err);
    return;
  }

  const count = doc.numPages;
  input.max = String(count);
  total.textContent = `/ ${count}`;

  const pages = await Promise.all(
    Array.from({ length: count }, (_, i) => doc.getPage(i + 1))
  );
  const pageEls = pages.map((page, i) => {
    const { width, height } = page.getViewport({ scale: 1 });
    const node = el("div", { class: "pdf-page" });
    node.style.aspectRatio = `${width} / ${height}`;
    node.dataset.index = String(i);
    return node;
  });
  pagesEl.replaceChildren(...pageEls);

  let current = 1;
  const goTo = (n, smooth = true) => {
    n = Math.min(Math.max(1, n), count);
    pageEls[n - 1].scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  };
  const setCurrent = (n) => {
    current = n;
    if (document.activeElement !== input) input.value = String(n);
    prev.disabled = n <= 1;
    next.disabled = n >= count;
    if (isPrimary) history.replaceState(null, "", n > 1 ? `#page=${n}` : location.pathname + location.search);
  };

  prev.addEventListener("click", () => goTo(current - 1));
  next.addEventListener("click", () => goTo(current + 1));
  input.addEventListener("change", () => goTo(Number(input.value)));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") goTo(Number(input.value));
  });
  fullscreen.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.().then(() => goTo(current, false));
  });
  root.addEventListener("keydown", (e) => {
    if (e.target === input) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goTo(current + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goTo(current - 1); }
  });
  root.tabIndex = -1;

  // Render pages lazily as they approach the viewport.
  const rendered = new Map(); // index -> CSS width it was rendered at
  async function render(i) {
    const node = pageEls[i];
    const cssWidth = node.clientWidth;
    if (!cssWidth || rendered.get(i) === cssWidth) return;
    rendered.set(i, cssWidth);

    const page = pages[i];
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: cssWidth / base.width });
    const dpr = window.devicePixelRatio || 1;

    const canvas = el("canvas");
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
    }).promise;

    const textLayer = el("div", { class: "textLayer" });
    node.style.setProperty("--scale-factor", String(viewport.scale));
    await new pdfjsLib.TextLayer({
      textContentSource: page.streamTextContent(),
      container: textLayer,
      viewport,
    }).render();

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
        a.href = annot.url;
        a.target = "_blank";
        a.rel = "noopener";
      } else if (annot.dest) {
        a.href = "#";
        a.addEventListener("click", async (e) => {
          e.preventDefault();
          const dest = typeof annot.dest === "string" ? await doc.getDestination(annot.dest) : annot.dest;
          if (dest) goTo((await doc.getPageIndex(dest[0])) + 1);
        });
      } else {
        continue;
      }
      links.append(a);
    }

    node.replaceChildren(canvas, textLayer, links);
  }

  const renderObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) render(Number(entry.target.dataset.index));
      }
    },
    { rootMargin: "100% 0px" }
  );

  for (const node of pageEls) renderObserver.observe(node);

  // Track which page is "current": the topmost one still showing below the toolbar.
  let scrollQueued = false;
  const updateCurrent = () => {
    scrollQueued = false;
    const viewerRect = root.getBoundingClientRect();
    if (viewerRect.bottom < 0 || viewerRect.top > innerHeight) return;
    const line = Math.max(viewerRect.top, 0) + toolbar.offsetHeight + 24;
    const i = pageEls.findIndex((node) => node.getBoundingClientRect().bottom > line);
    if (i >= 0 && i + 1 !== current) setCurrent(i + 1);
  };
  document.addEventListener("scroll", () => {
    if (!scrollQueued) {
      scrollQueued = true;
      requestAnimationFrame(updateCurrent);
    }
  }, { capture: true, passive: true });

  // Re-render visible pages at the new size after a resize or fullscreen toggle.
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const node of pageEls) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom > -innerHeight && rect.top < 2 * innerHeight) render(Number(node.dataset.index));
      }
    }, 150);
  }).observe(pagesEl);

  const target = Math.min(isPrimary ? pageFromHash() ?? 1 : 1, count);
  setCurrent(target);
  if (target > 1) goTo(target, false);
}

document.querySelectorAll(".pdf-viewer").forEach((root, i) => initViewer(root, i === 0));
