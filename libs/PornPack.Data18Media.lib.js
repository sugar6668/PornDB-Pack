/**
 * @name         PornPack Data18 Media Library
 * @description  Fetches Data18 trailers and preview images for ThePornDB scene detail pages.
 * @version      1.0.1
 */

(function () {
    "use strict";

    const CACHE_PREFIX = "data18_media_v1_";
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    const DATA18_ORIGIN = "https://www.data18.com";
    const IMAGE_PROBE_MAX = 40;
    const IMAGE_PROBE_STOP_MISSES = 5;
    const DEBUG = false;

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

        buildSearchUrl(keyword) {
            const clean = safeString(keyword);
            const keyfull = clean.toLowerCase().replace(/\s+/g, "--");
            const params = new URLSearchParams({
                index: "",
                key: clean,
                key2: clean,
                keyfull,
                t: "0",
                b: "1",
                page: "1",
                back: "undefined",
                scenesource: "1"
            });
            return `${DATA18_ORIGIN}/sys/live.php?${params.toString()}`;
        },

        async findMedia(details) {
            const keywords = this.buildSearchKeywords(details);

            for (const keyword of keywords) {
                try {
                    const searchUrl = this.buildSearchUrl(keyword);
                    this.debug("search url", searchUrl);

                    const searchHtml = await this.fetchFromData18(searchUrl, {
                        referer: `${DATA18_ORIGIN}/`,
                        accept: "text/html, */*; q=0.01",
                        ajax: true
                    });
                    const results = this.parseSearchResults(searchHtml);
                    this.debug("search results", results);

                    const best = this.pickBestResult(results, details);
                    this.debug("best result", best);
                    if (!best || !best.url) continue;

                    const detailHtml = await this.fetchFromData18(best.url, {
                        referer: `${DATA18_ORIGIN}/`,
                        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        ajax: true
                    });
                    const media = await this.collectMediaFromDetail(detailHtml, best.url);
                    this.debug("final media", media);

                    if (media.videoUrl || media.images.length) {
                        return {
                            keyword,
                            sourceUrl: best.url,
                            sceneId: best.sceneId,
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
            const links = [...dom.querySelectorAll('a[href*="/scenes/"]')];
            const seen = new Set();

            return links
                .map((a) => {
                    const href = a.getAttribute("href");
                    if (!href) return null;

                    const url = new URL(href, DATA18_ORIGIN).href;
                    const match = url.match(/\/scenes\/(\d+)(?:[/?#]|$)/i);
                    if (!match) return null;

                    const sceneId = match[1];
                    if (seen.has(sceneId)) return null;
                    seen.add(sceneId);

                    return {
                        url,
                        sceneId,
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

        async collectMediaFromDetail(html, detailUrl) {
            const direct = this.extractMedia(html, detailUrl);
            this.debug("direct media", direct);

            const directCandidates = this.buildImageCandidates(direct.images);
            this.debug("image candidates", directCandidates);
            const existingDirectImages = await this.filterExistingImages(directCandidates, detailUrl);
            this.debug("existing images", existingDirectImages);

            const lazyUrls = this.extractLazyUrls(html, detailUrl);
            this.debug("lazy urls", lazyUrls);
            const lazyMedia = await this.fetchLazyMedia(lazyUrls, detailUrl);

            const lazyCandidates = this.buildImageCandidates(lazyMedia.images);
            const existingLazyImages = lazyCandidates.length ? await this.filterExistingImages(lazyCandidates, detailUrl) : [];

            const videos = unique([...direct.videos, ...lazyMedia.videos]);
            const images = this.sortImages(unique([...existingDirectImages, ...existingLazyImages]));

            return {
                videoUrl: videos[0] || "",
                images
            };
        },

        parseMedia(html) {
            const media = this.extractMedia(html, DATA18_ORIGIN);
            return {
                videoUrl: media.videos[0] || "",
                images: this.sortImages(media.images)
            };
        },

        extractMedia(html, baseUrl) {
            const source = this.normalizeHtml(html);
            const videos = [];
            const images = [];

            try {
                const dom = new DOMParser().parseFromString(source, "text/html");
                dom.querySelectorAll("source[src], video[src]").forEach((node) => {
                    const url = this.absoluteUrl(node.getAttribute("src"), baseUrl);
                    if (this.isMp4Url(url)) videos.push(url);
                });
                dom.querySelectorAll("img[src]").forEach((node) => {
                    const url = this.absoluteUrl(node.getAttribute("src"), baseUrl);
                    if (this.isPreviewImageUrl(url)) images.push(url);
                });
            } catch (err) {
                console.warn("[PornData18Media] DOM media parse failed:", err);
            }

            const mp4Patterns = [
                /https?:\/\/vs\.dt18\.com[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi,
                /https?:\/\/[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi
            ];
            mp4Patterns.forEach((pattern) => {
                const matches = source.match(pattern) || [];
                matches.forEach((url) => {
                    const normalized = this.cleanUrl(url);
                    if (this.isMp4Url(normalized)) videos.push(normalized);
                });
            });

            const imagePatterns = [
                /https?:\/\/bdn\.dt18\.com[^\s"'<>\\]+?\/t\d{2}\.jpg(?:\?[^\s"'<>\\]*)?/gi,
                /https?:\/\/[^\s"'<>\\]+?\/t\d{2}\.jpg(?:\?[^\s"'<>\\]*)?/gi
            ];
            imagePatterns.forEach((pattern) => {
                const matches = source.match(pattern) || [];
                matches.forEach((url) => {
                    const normalized = this.cleanUrl(url);
                    if (this.isPreviewImageUrl(normalized)) images.push(normalized);
                });
            });

            return {
                videos: unique(videos),
                images: this.sortImages(unique(images))
            };
        },

        buildImageCandidates(images) {
            const candidates = new Set();
            images.forEach((imageUrl) => {
                const clean = this.stripQuery(imageUrl);
                const match = clean.match(/^(.*\/t)(\d{2})(\.jpg)$/i);
                if (!match) {
                    candidates.add(imageUrl);
                    return;
                }

                for (let i = 1; i <= IMAGE_PROBE_MAX; i++) {
                    candidates.add(`${match[1]}${String(i).padStart(2, "0")}${match[3]}`);
                }
            });

            return this.sortImages([...candidates]);
        },

        async filterExistingImages(candidates, referer) {
            const existing = [];
            let consecutiveMisses = 0;

            for (const url of this.sortImages(unique(candidates))) {
                const exists = await this.imageExists(url, referer);
                if (exists) {
                    existing.push(url);
                    consecutiveMisses = 0;
                } else {
                    consecutiveMisses += 1;
                    if (existing.length && consecutiveMisses >= IMAGE_PROBE_STOP_MISSES) break;
                }
            }

            return this.sortImages(unique(existing));
        },

        async imageExists(url, referer) {
            try {
                const head = await this.fetchFromData18(url, {
                    method: "HEAD",
                    referer,
                    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    returnResponse: true,
                    timeout: 10000
                });
                if (this.isOkStatus(head.status)) return true;
                if (head.status && ![403, 405, 0].includes(Number(head.status))) return false;
            } catch (err) {}

            try {
                const get = await this.fetchFromData18(url, {
                    method: "GET",
                    referer,
                    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    returnResponse: true,
                    timeout: 12000
                });
                return this.isOkStatus(get.status);
            } catch (err) {
                return false;
            }
        },

        extractLazyUrls(html, detailUrl) {
            const source = this.normalizeHtml(html);
            const urls = new Set();
            const attrPattern = /\b(?:href|src|data-url|data-src|data-href)\s*=\s*["']([^"']+)["']/gi;
            const jsPatterns = [
                /\b(?:url|ajaxurl)\s*[:=]\s*["']([^"']+)["']/gi,
                /fetch\(\s*["']([^"']+)["']/gi,
                /\$\.get\(\s*["']([^"']+)["']/gi,
                /\$\.ajax\(\s*\{[^}]*\burl\s*:\s*["']([^"']+)["']/gi
            ];

            const collect = (pattern) => {
                let match;
                while ((match = pattern.exec(source))) {
                    const url = this.absoluteUrl(match[1], detailUrl);
                    if (this.isLazyMediaUrl(url)) urls.add(url);
                }
            };

            collect(attrPattern);
            jsPatterns.forEach(collect);
            return [...urls];
        },

        async fetchLazyMedia(urls, referer) {
            const videos = [];
            const images = [];

            for (const url of urls.slice(0, 12)) {
                try {
                    const html = await this.fetchFromData18(url, {
                        referer,
                        accept: "text/html,application/json,*/*;q=0.8",
                        ajax: true,
                        timeout: 15000
                    });
                    const media = this.extractMedia(html, url);
                    videos.push(...media.videos);
                    images.push(...media.images);
                } catch (err) {
                    console.warn("[PornData18Media] lazy request failed:", url, err);
                }
            }

            return {
                videos: unique(videos),
                images: this.sortImages(unique(images))
            };
        },

        isLazyMediaUrl(url) {
            if (!url || !/^https?:\/\//i.test(url)) return false;
            let parsed;
            try {
                parsed = new URL(url);
            } catch (err) {
                return false;
            }

            const host = parsed.hostname.toLowerCase();
            if (!/(^|\.)data18\.com$|(^|\.)dt18\.com$/.test(host)) return false;

            const text = `${parsed.pathname} ${parsed.search}`.toLowerCase();
            return /trailer|preview|photo|photos|image|images|gallery|video|media|scene/.test(text);
        },

        isPreviewImageUrl(url) {
            return /^https?:\/\/bdn\.dt18\.com\/.*\/t\d{2}\.jpg(?:\?.*)?$/i.test(url || "");
        },

        isMp4Url(url) {
            return /^https?:\/\/[^\s"'<>]+\.mp4(?:\?.*)?$/i.test(url || "");
        },

        isOkStatus(status) {
            const code = Number(status);
            return code >= 200 && code < 300;
        },

        sortImages(images) {
            return [...images].sort((a, b) => this.imageSortKey(a) - this.imageSortKey(b) || String(a).localeCompare(String(b)));
        },

        imageSortKey(url) {
            const match = String(url || "").match(/\/t(\d{2})\.jpg/i);
            return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
        },

        normalizeHtml(html) {
            return this.decodeHtmlEntities(String(html || ""))
                .replace(/\\\//g, "/")
                .replace(/\\u002[fF]/g, "/")
                .replace(/\\x2[fF]/g, "/");
        },

        decodeHtmlEntities(value) {
            const raw = String(value || "");
            const named = raw
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&#39;|&apos;/g, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">");

            return named.replace(/&#(x?[0-9a-f]+);/gi, (all, code) => {
                const value = code.charAt(0).toLowerCase() === "x"
                    ? parseInt(code.slice(1), 16)
                    : parseInt(code, 10);
                return Number.isFinite(value) ? String.fromCodePoint(value) : all;
            });
        },

        cleanUrl(url) {
            return this.decodeHtmlEntities(String(url || ""))
                .replace(/\\\//g, "/")
                .replace(/\\u002[fF]/g, "/")
                .trim();
        },

        stripQuery(url) {
            return String(url || "").split("?")[0];
        },

        absoluteUrl(url, baseUrl) {
            if (!url) return "";
            try {
                return new URL(this.cleanUrl(url), baseUrl || DATA18_ORIGIN).href;
            } catch (err) {
                return "";
            }
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

        fetchFromData18(url, options = {}) {
            const {
                method = "GET",
                referer = `${DATA18_ORIGIN}/`,
                accept = "text/html, */*; q=0.01",
                ajax = false,
                returnResponse = false,
                timeout = 20000
            } = options;

            return new Promise((resolve, reject) => {
                const headers = {
                    "User-Agent": navigator.userAgent,
                    "Accept": accept,
                    "Referer": referer
                };
                if (ajax) headers["X-Requested-With"] = "XMLHttpRequest";

                GM_xmlhttpRequest({
                    method,
                    url,
                    headers,
                    timeout,
                    onload: (res) => {
                        if (returnResponse) {
                            resolve(res);
                            return;
                        }
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

        clearData18Cache() {
            if (typeof GM_listValues !== "function" || typeof GM_deleteValue !== "function") {
                console.warn("[PornData18Media] GM cache APIs are unavailable");
                return 0;
            }

            const keys = GM_listValues().filter((key) => String(key).startsWith(CACHE_PREFIX));
            keys.forEach((key) => GM_deleteValue(key));
            console.info(`[PornData18Media] cleared ${keys.length} Data18 cache item(s)`);
            return keys.length;
        },

        debug(label, payload) {
            if (DEBUG) console.log(`[PornData18Media] ${label}:`, payload);
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
