/**
 * @name         PornPack Data18 Media Library
 * @description  Fetches Data18 trailers and preview images for ThePornDB scene detail pages.
 * @version      1.0.0
 */

(function () {
    "use strict";

    const CACHE_PREFIX = "data18_media_v1_";
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    const DATA18_ORIGIN = "https://www.data18.com";

    const safeString = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const unique = (items) => [...new Set(items.filter(Boolean))];

    const Data18Media = {
        async ensurePanel(doc = document) {
            try {
                if (!doc || !doc.querySelector) return;
                if (!this.isScenePage(doc)) return;
                if (!window.PornParser || typeof window.PornParser.parseWestDetails !== "function") return;

                const details = window.PornParser.parseWestDetails(doc);
                if (!details || !details.isValid) return;

                const pageKey = this.getPageKey(details, doc);
                if (!pageKey) return;

                const oldPanel = doc.querySelector(".x-data18-wrap");
                if (oldPanel) {
                    if (oldPanel.dataset.key === pageKey) return;
                    oldPanel.remove();
                }

                const panel = this.createPanel(doc, pageKey);
                if (!this.insertPanel(doc, panel)) return;

                this.setStatus(panel, "正在搜索 Data18...");

                const cacheKey = CACHE_PREFIX + pageKey;
                const cached = this.getCache(cacheKey);
                if (cached) {
                    this.renderMedia(panel, cached);
                    return;
                }

                const media = await this.findMedia(details);
                if (!media) {
                    this.setStatus(panel, "Data18 未找到媒体");
                    return;
                }

                this.setCache(cacheKey, media);
                this.renderMedia(panel, media);
            } catch (err) {
                console.warn("[PornData18Media] ensurePanel failed:", err);
            }
        },

        isScenePage(doc) {
            const href = doc.location && doc.location.href ? doc.location.href : location.href;
            return /\/scenes\//.test(href);
        },

        getPageKey(details, doc = document) {
            const href = doc.location && doc.location.href ? doc.location.href : location.href;
            return safeString(details.matchPrefix || details.fullTitle || href);
        },

        createPanel(doc, key) {
            const panel = doc.createElement("section");
            panel.className = "x-data18-wrap";
            panel.dataset.key = key;
            panel.innerHTML = `
                <div class="x-data18-head">
                    <div class="x-data18-title">Data18 预览</div>
                    <div class="x-data18-status">准备搜索...</div>
                </div>
                <div class="x-data18-body"></div>
            `;
            return panel;
        },

        insertPanel(doc, panel) {
            const westPanel = doc.querySelector(".x-west-wrap");
            if (westPanel && westPanel.parentElement) {
                westPanel.parentElement.insertBefore(panel, westPanel);
                return true;
            }

            const fallbackTarget =
                doc.querySelector("video")?.parentElement?.parentElement ||
                doc.querySelector("div.bg-black.text-white") ||
                doc.querySelector("div.w-full.bg-white");

            if (fallbackTarget) {
                fallbackTarget.insertAdjacentElement("afterend", panel);
                return true;
            }

            return false;
        },

        setStatus(panel, text) {
            const node = panel && panel.querySelector ? panel.querySelector(".x-data18-status") : null;
            if (node) node.textContent = text;
        },

        buildSearchKeywords(details) {
            const raw = [
                details.fullTitle,
                [details.actor, details.titleKeyword].filter(Boolean).join(" "),
                details.titleKeyword,
                details.matchPrefix,
                [details.baseAlpha, details.dateStr].filter(Boolean).join(" ")
            ];

            return unique(raw.map(safeString).filter((value) => value.length >= 3));
        },

        async findMedia(details) {
            const keywords = this.buildSearchKeywords(details);

            for (const keyword of keywords) {
                try {
                    const searchUrl = `${DATA18_ORIGIN}/sys/live.php?index=&key=${encodeURIComponent(keyword)}&t=0&b=1&page=1`;
                    const searchHtml = await this.fetchFromData18(searchUrl);
                    const results = this.parseSearchResults(searchHtml);
                    const best = this.pickBestResult(results, details);
                    if (!best || !best.url) continue;

                    const detailHtml = await this.fetchFromData18(best.url);
                    const media = this.parseMedia(detailHtml);
                    if (media.videoUrl || media.images.length) {
                        return {
                            keyword,
                            sourceUrl: best.url,
                            videoUrl: media.videoUrl,
                            images: media.images
                        };
                    }
                } catch (err) {
                    console.warn("[PornData18Media] search failed:", keyword, err);
                }
            }

            return null;
        },

        parseSearchResults(html) {
            const dom = new DOMParser().parseFromString(String(html || ""), "text/html");
            const links = [...dom.querySelectorAll('a[href*="/scenes/"], a[href*="/movies/"], a[href*="/video/"]')];

            return links
                .map((a) => {
                    const href = a.getAttribute("href");
                    if (!href) return null;

                    return {
                        url: new URL(href, DATA18_ORIGIN).href,
                        text: safeString(a.textContent)
                    };
                })
                .filter(Boolean);
        },

        scoreResult(result, details) {
            const text = `${result.text} ${result.url}`.toLowerCase();
            let score = 0;

            const fullTitle = safeString(details.fullTitle).toLowerCase();
            const titleKeyword = safeString(details.titleKeyword).toLowerCase();
            const actor = safeString(details.actor).toLowerCase();
            const dateStr = safeString(details.dateStr).toLowerCase();
            const baseAlpha = safeString(details.baseAlpha).toLowerCase();

            if (fullTitle && text.includes(fullTitle)) score += 60;
            if (titleKeyword && text.includes(titleKeyword)) score += 40;
            if (actor && text.includes(actor)) score += 25;
            if (dateStr && text.includes(dateStr)) score += 20;
            if (baseAlpha && text.includes(baseAlpha)) score += 20;

            return score;
        },

        pickBestResult(results, details) {
            if (!results || !results.length) return null;
            return results
                .map((item) => ({ ...item, score: this.scoreResult(item, details) }))
                .sort((a, b) => b.score - a.score)[0] || null;
        },

        parseMedia(html) {
            const source = String(html || "").replace(/\\\//g, "/");
            const videos = source.match(/https:\/\/vs\.dt18\.com[^\s"'<>]+?\.mp4(?:\?[^\s"'<>]*)?/gi) || [];
            const images = source.match(/https:\/\/bdn\.dt18\.com[^\s"'<>]+?t0[1-9]\.jpg(?:\?[^\s"'<>]*)?/gi) || [];

            return {
                videoUrl: unique(videos)[0] || "",
                images: unique(images)
            };
        },

        renderMedia(panel, media) {
            const body = panel.querySelector(".x-data18-body");
            if (!body) return;

            const items = [];
            if (media.videoUrl) items.push({ type: "video", src: media.videoUrl });
            if (Array.isArray(media.images)) {
                media.images.forEach((url) => items.push({ type: "image", src: url }));
            }

            if (!items.length) {
                this.setStatus(panel, "Data18 未找到媒体");
                body.innerHTML = "";
                return;
            }

            const videoCount = media.videoUrl ? 1 : 0;
            const imageCount = Array.isArray(media.images) ? media.images.length : 0;
            this.setStatus(panel, `已找到 ${videoCount} 个预告片 / ${imageCount} 张预览图`);

            body.innerHTML = `
                <div class="x-data18-media-strip" aria-label="Data18 预告片和预览图">
                    ${items.map((item) => this.renderMediaCard(item)).join("")}
                </div>
            `;
            this.bindPreviewEvents(panel);
        },

        renderMediaCard(item) {
            const src = this.escapeAttr(item.src);
            if (item.type === "video") {
                return `
                    <button class="x-data18-media-card x-data18-video-card" type="button" data-type="video" data-src="${src}">
                        <video class="x-data18-thumb-video" src="${src}" preload="metadata" muted playsinline referrerpolicy="no-referrer"></video>
                        <span class="x-data18-play-badge">▶</span>
                    </button>
                `;
            }

            return `
                <button class="x-data18-media-card x-data18-image-card" type="button" data-type="image" data-src="${src}">
                    <img class="x-data18-thumb-img" src="${src}" loading="lazy" referrerpolicy="no-referrer">
                </button>
            `;
        },

        bindPreviewEvents(panel) {
            panel.querySelectorAll(".x-data18-media-card").forEach((card) => {
                card.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const type = card.dataset.type;
                    const src = card.dataset.src;
                    if (type && src) this.openLightbox(type, src, panel.ownerDocument || document);
                });
            });
        },

        openLightbox(type, src, doc = document) {
            this.closeLightbox(doc);

            const box = doc.createElement("div");
            box.className = "x-data18-lightbox";
            box.setAttribute("role", "dialog");
            box.setAttribute("aria-modal", "true");
            box.innerHTML = `
                <button class="x-data18-lightbox-close" type="button" aria-label="关闭">×</button>
                <div class="x-data18-lightbox-inner"></div>
            `;

            const inner = box.querySelector(".x-data18-lightbox-inner");
            const safeSrc = this.escapeAttr(src);
            if (type === "video") {
                inner.innerHTML = `
                    <video class="x-data18-lightbox-video" src="${safeSrc}" controls preload="metadata" playsinline referrerpolicy="no-referrer"></video>
                `;
            } else {
                inner.innerHTML = `
                    <img class="x-data18-lightbox-img" src="${safeSrc}" referrerpolicy="no-referrer">
                `;
            }

            const onKeyDown = (event) => {
                if (event.key === "Escape") this.closeLightbox(doc);
            };
            box.__data18Keydown = onKeyDown;

            box.addEventListener("click", (event) => {
                if (event.target === box) this.closeLightbox(doc);
            });
            box.querySelector(".x-data18-lightbox-close")?.addEventListener("click", () => this.closeLightbox(doc));
            doc.addEventListener("keydown", onKeyDown);
            doc.body.appendChild(box);
        },

        closeLightbox(doc = document) {
            const old = doc.querySelector(".x-data18-lightbox");
            if (!old) return;

            if (old.__data18Keydown) doc.removeEventListener("keydown", old.__data18Keydown);
            old.querySelectorAll("video").forEach((video) => {
                try {
                    video.pause();
                    video.removeAttribute("src");
                    video.load();
                } catch (err) {}
            });
            old.remove();
        },

        fetchFromData18(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url,
                    headers: {
                        "User-Agent": navigator.userAgent,
                        "Accept": "text/html, */*; q=0.01",
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    timeout: 20000,
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve(res.responseText || "");
                        } else {
                            reject(new Error(`Data18 HTTP Error: ${res.status}`));
                        }
                    },
                    onerror: () => reject(new Error("Data18 request error")),
                    ontimeout: () => reject(new Error("Data18 request timeout"))
                });
            });
        },

        getCache(key) {
            if (typeof GM_getValue !== "function") return null;
            const data = GM_getValue(key, null);
            if (!data || !data.ts) return null;
            if (Date.now() - data.ts > CACHE_TTL) {
                if (typeof GM_deleteValue === "function") GM_deleteValue(key);
                return null;
            }
            return data;
        },

        setCache(key, data) {
            if (typeof GM_setValue !== "function") return;
            GM_setValue(key, { ...data, ts: Date.now() });
        },

        escapeAttr(str) {
            return String(str || "")
                .replace(/&/g, "&amp;")
                .replace(/"/g, "&quot;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
        }
    };

    window.PornData18Media = Data18Media;
})();
