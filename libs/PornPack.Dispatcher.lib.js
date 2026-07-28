/**
 * @name         PornPack Dispatcher Library
 * @description  Deduplicated 115 match dispatcher with durable hit/miss state.
 * @version      1.1.0
 */

window.PornDispatcher = class PornDispatcher {
    constructor(options) {
        this.getReq = options.getReq;
        this.getWestCache = options.getWestCache;
        this.getMatchState = options.getMatchState || ((key) => {
            const data = this.getWestCache(key);
            return data === null ? null : { data, revision: 0, needsResolve: false };
        });
        this.commitMatchState = options.commitMatchState || ((key, patch) => ({
            committed: true,
            state: options.setWestCache(key, patch.data),
        }));
        this.applyMatchTagState = options.applyMatchTagState;
        this.onStateCommitted = options.onStateCommitted || null;
        this.sleep = options.sleep;
        this.waitMap = {};
        this.searchQueue = [];
        this.isSearching = false;
    }

    dispatch(item, details, force = false) {
        const prefix = details.matchPrefix || details.dateStr;
        if (!prefix) return;

        const state = this.getMatchState(prefix);
        if (!force && state && !state.needsResolve) {
            this.applyMatchTagState(item, state.data);
            return;
        }

        if (!this.waitMap[prefix]) this.waitMap[prefix] = [];
        this.waitMap[prefix].push({ item, details, force });
        if (!this.searchQueue.includes(prefix)) {
            this.searchQueue.push(prefix);
            void this.processQueue();
        }
    }

    // Kept for existing callers. Revision checks, rather than a global invalidation set,
    // reject stale remote responses after delete/offline/rename mutations.
    invalidate() { }

    async findVideos(sampleDetails) {
        const req = this.getReq();
        let res = await req.filesSearchAllVideos(sampleDetails.matchPrefix || sampleDetails.dateStr);
        if (res?.state === false) throw new Error(res.error_msg || '115 \u641c\u7d22\u63a5\u53e3\u5f02\u5e38');
        let videos = window.PornMatcher.getMatchedVideos(res?.data || [], sampleDetails);
        if (videos.length) return videos;

        const fullYear = sampleDetails.dateStr ? `20${sampleDetails.dateStr.split(/[-.]/)[0]}` : '';
        const firstActor = sampleDetails.actors?.[0] || (sampleDetails.actor !== 'Unknown_Actor' ? String(sampleDetails.actor || '').split('&')[0].trim() : '');
        const makerFirst = String(sampleDetails.maker || '').split(/[^a-zA-Z0-9]/)[0];
        const titleKeyword = sampleDetails.titleKeyword || '';
        const fallbacks = [
            [firstActor, titleKeyword].filter(Boolean).join(' '),
            [makerFirst, titleKeyword].filter(Boolean).join(' '),
            titleKeyword,
            [firstActor, fullYear].filter(Boolean).join(' '),
        ];

        for (const keyword of fallbacks) {
            if (!keyword || keyword.trim().length < 3) continue;
            res = await req.filesSearchAllVideos(keyword);
            if (res?.state === false) throw new Error(res.error_msg || '115 \u641c\u7d22\u63a5\u53e3\u5f02\u5e38');
            videos = window.PornMatcher.getMatchedVideos(res?.data || [], sampleDetails);
            if (videos.length) break;
        }
        return videos;
    }

    async processQueue() {
        if (this.isSearching || !this.searchQueue.length) return;
        this.isSearching = true;
        while (this.searchQueue.length) {
            const prefix = this.searchQueue.shift();
            const pendingItems = this.waitMap[prefix] || [];
            delete this.waitMap[prefix];
            const sampleDetails = pendingItems[0]?.details;
            const expectedRevision = this.getMatchState(prefix)?.revision || 0;

            try {
                const videos = sampleDetails ? await this.findVideos(sampleDetails) : [];
                const result = this.commitMatchState(prefix, {
                    data: videos,
                    status: videos.length ? 'matched' : 'unmatched',
                    source: 'search',
                    needsResolve: false,
                    expectedRevision,
                });
                const state = result.state || this.getMatchState(prefix);
                pendingItems.forEach(({ item }) => this.applyMatchTagState(item, state?.data || []));
                if (result.committed && this.onStateCommitted) this.onStateCommitted(prefix, state);
            } catch (e) {
                // A failed 115 request never becomes a durable miss.
                const current = this.getMatchState(prefix);
                pendingItems.forEach(({ item }) => this.applyMatchTagState(item, current?.data || []));
                console.warn('[PornDB-115] match search failed', e?.message || e);
            }

            if (this.searchQueue.length) await this.sleep(300);
        }
        this.isSearching = false;
    }
};
