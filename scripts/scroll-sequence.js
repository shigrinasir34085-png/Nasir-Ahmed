/**
 * Scroll-driven canvas frame sequence engine.
 *
 * Features:
 * - Instant first-frame paint + keyframe-first prioritized parallel preloading
 * - GPU-friendly decoded frames (ImageBitmap where supported, HTMLImageElement fallback)
 * - Frame-rate-independent exponential smoothing (lerp) for silky mouse-wheel & trackpad scrubbing
 * - Subtle sub-frame cross-dissolve eliminating 24fps micro-stepping on slow scrolls
 * - HiDPI cover projection with upper-center focal framing for portraits
 */

(() => {
  'use strict';

  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);

  const CONFIG = {
    frameCount: 94,
    framePath: (index) =>
      `./video-frames-24fps-high-quality-jpg/frame_${String(index + 1).padStart(4, '0')}.jpg`,
    // Slightly tighter damping on touch devices so native swipe momentum feels snappy
    damping: isCoarsePointer ? 11.5 : 9.5,
    // Focal point inside the 1920x1080 frame (keeps eyes/face centered on all aspect ratios)
    focalX: 0.5,
    focalY: isSmallScreen ? 0.38 : 0.42,
    // Tuned parallel fetches to keep mobile RAM & bandwidth smooth
    concurrency: saveData ? 4 : isSmallScreen ? 5 : 8,
    // Cap DPR slightly lower on compact mobile GPUs for locked 60fps
    maxDpr: isSmallScreen ? 1.75 : 2,
  };

  class ScrollFrameSequence {
    constructor({ canvas, stage, preloadTrack, preloadFill, config }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.stage = stage;
      this.preloadTrack = preloadTrack;
      this.preloadFill = preloadFill;
      this.config = config;

      this.frames = new Array(config.frameCount).fill(null);
      this.loadedCount = 0;

      this.targetProgress = 0;
      this.currentProgress = 0;
      this.lastRenderedFloat = -1;
      this.rafId = null;
      this.lastTimestamp = 0;
      this.listeners = new Set();

      // Cached viewport & cover geometry
      this.cssWidth = 0;
      this.cssHeight = 0;
      this.dpr = 1;
      this.imageWidth = 1920;
      this.imageHeight = 1080;
      this.drawRect = { dx: 0, dy: 0, dw: 1920, dh: 1080 };

      this.prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      this.handleScroll = this.handleScroll.bind(this);
      this.handleResize = this.handleResize.bind(this);
      this.tick = this.tick.bind(this);
    }

    init() {
      this.updateCanvasSize();
      this.targetProgress = this.computeScrollProgress();
      this.currentProgress = this.targetProgress;

      window.addEventListener('scroll', this.handleScroll, { passive: true });
      window.addEventListener('resize', this.handleResize, { passive: true });

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.resizeObserver.observe(this.canvas);
      }

      this.preloadAllFrames();
    }

    /**
     * Subscribe future sections/components to normalized [0..1] smoothed scroll progress.
     */
    onProgress(callback) {
      this.listeners.add(callback);
      callback(this.currentProgress);
      return () => this.listeners.delete(callback);
    }

    get progress() {
      return this.currentProgress;
    }

    computeScrollProgress() {
      const stageRect = this.stage.getBoundingClientRect();
      const scrollableDistance = this.stage.offsetHeight - window.innerHeight;
      if (scrollableDistance <= 0) return 0;

      const scrolled = -stageRect.top;
      return Math.min(1, Math.max(0, scrolled / scrollableDistance));
    }

    updateCanvasSize() {
      const rect = this.canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.round(rect.width || window.innerWidth));
      const cssHeight = Math.max(1, Math.round(rect.height || window.innerHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, this.config.maxDpr);

      const backingWidth = Math.round(cssWidth * dpr);
      const backingHeight = Math.round(cssHeight * dpr);

      if (
        this.canvas.width !== backingWidth ||
        this.canvas.height !== backingHeight
      ) {
        this.canvas.width = backingWidth;
        this.canvas.height = backingHeight;
      }

      this.cssWidth = cssWidth;
      this.cssHeight = cssHeight;
      this.dpr = dpr;

      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';

      this.computeCoverRect();
      this.lastRenderedFloat = -1;
      this.renderAtProgress(this.currentProgress, true);
    }

    computeCoverRect() {
      const vw = this.cssWidth;
      const vh = this.cssHeight;
      const iw = this.imageWidth;
      const ih = this.imageHeight;
      const focalY = vw <= 768 ? 0.38 : this.config.focalY;

      const scale = Math.max(vw / iw, vh / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (vw - dw) * this.config.focalX;
      const dy = (vh - dh) * focalY;

      this.drawRect = { dx, dy, dw, dh };
    }

    handleResize() {
      this.updateCanvasSize();
      this.targetProgress = this.computeScrollProgress();
      this.startLoop();
    }

    handleScroll() {
      this.targetProgress = this.computeScrollProgress();
      this.startLoop();
    }

    startLoop() {
      if (this.rafId !== null) return;
      this.lastTimestamp = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }

    tick(now) {
      const dt = Math.min((now - this.lastTimestamp) / 1000, 0.05);
      this.lastTimestamp = now;

      if (this.prefersReducedMotion) {
        this.currentProgress = this.targetProgress;
      } else {
        // Frame-rate-independent exponential smoothing
        const factor = 1 - Math.exp(-this.config.damping * dt);
        this.currentProgress += (this.targetProgress - this.currentProgress) * factor;
      }

      const diff = Math.abs(this.targetProgress - this.currentProgress);
      const settled = diff < 0.00008;

      if (settled) {
        this.currentProgress = this.targetProgress;
      }

      this.renderAtProgress(this.currentProgress, false);

      for (const cb of this.listeners) {
        cb(this.currentProgress);
      }

      if (settled) {
        this.rafId = null;
      } else {
        this.rafId = requestAnimationFrame(this.tick);
      }
    }

    findNearestLoadedFrame(targetIndex) {
      if (this.frames[targetIndex]) return this.frames[targetIndex];
      const maxOffset = this.config.frameCount;
      for (let offset = 1; offset < maxOffset; offset++) {
        const left = targetIndex - offset;
        if (left >= 0 && this.frames[left]) return this.frames[left];
        const right = targetIndex + offset;
        if (right < this.config.frameCount && this.frames[right]) {
          return this.frames[right];
        }
      }
      return null;
    }

    renderAtProgress(progress, force = false) {
      const maxIndex = this.config.frameCount - 1;
      const exactFrame = Math.min(maxIndex, Math.max(0, progress * maxIndex));

      if (!force && Math.abs(exactFrame - this.lastRenderedFloat) < 0.002) {
        return;
      }

      const indexA = Math.floor(exactFrame);
      const indexB = Math.min(maxIndex, indexA + 1);
      const blend = exactFrame - indexA;

      const frameA = this.findNearestLoadedFrame(indexA);
      if (!frameA) return;

      const frameB = this.frames[indexB];
      const { dx, dy, dw, dh } = this.drawRect;

      this.ctx.globalAlpha = 1;
      this.ctx.drawImage(frameA, dx, dy, dw, dh);

      // Subtle sub-frame cross-dissolve between adjacent frames for ultra-fluid slow scrubbing
      if (frameB && frameB !== frameA && blend > 0.015 && blend < 0.985) {
        this.ctx.globalAlpha = blend;
        this.ctx.drawImage(frameB, dx, dy, dw, dh);
        this.ctx.globalAlpha = 1;
      }

      this.lastRenderedFloat = exactFrame;
    }

    updatePreloadIndicator() {
      if (!this.preloadFill || !this.preloadTrack) return;
      const ratio = this.loadedCount / this.config.frameCount;
      this.preloadFill.style.transform = `scaleX(${ratio.toFixed(4)})`;

      if (this.loadedCount >= this.config.frameCount) {
        this.preloadTrack.classList.add('is-ready');
      }
    }

    async loadSingleFrame(index) {
      const img = new Image();
      img.decoding = 'async';
      img.src = this.config.framePath(index);

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      if (typeof img.decode === 'function') {
        try {
          await img.decode();
        } catch {
          // Image is already loaded; safe to proceed
        }
      }

      let source = img;
      if (typeof createImageBitmap === 'function') {
        try {
          source = await createImageBitmap(img);
        } catch {
          // Fallback cleanly to HTMLImageElement (e.g. under file:// origin restrictions)
          source = img;
        }
      }

      if (index === 0 && img.naturalWidth && img.naturalHeight) {
        this.imageWidth = img.naturalWidth;
        this.imageHeight = img.naturalHeight;
        this.computeCoverRect();
      }

      this.frames[index] = source;
      this.loadedCount += 1;
      this.updatePreloadIndicator();

      // Repaint immediately if this frame is near the current scroll position
      const currentIndex = Math.round(
        this.currentProgress * (this.config.frameCount - 1)
      );
      if (Math.abs(index - currentIndex) <= 2 || this.loadedCount === 1) {
        this.renderAtProgress(this.currentProgress, true);
      }
    }

    buildLoadOrder() {
      const total = this.config.frameCount;
      const seen = new Set();
      const order = [];

      const push = (i) => {
        if (i >= 0 && i < total && !seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      };

      // Priority 1: First frame & last frame
      push(0);
      push(total - 1);

      // Priority 2: Sparse keyframes every 4th frame for instant scrubbing readiness
      for (let i = 0; i < total; i += 4) push(i);

      // Priority 3: Remaining in-between frames
      for (let i = 0; i < total; i++) push(i);

      return order;
    }

    async preloadAllFrames() {
      const order = this.buildLoadOrder();

      // Paint frame 0 first before saturating connections
      const first = order.shift();
      if (first !== undefined) {
        try {
          await this.loadSingleFrame(first);
        } catch (err) {
          console.error('Failed to load initial frame:', err);
        }
      }

      // Bounded concurrent worker pool for fast, non-blocking loading
      let cursor = 0;
      const worker = async () => {
        while (cursor < order.length) {
          const idx = order[cursor++];
          try {
            await this.loadSingleFrame(idx);
          } catch (err) {
            console.warn(`Failed to load frame ${idx + 1}:`, err);
          }
        }
      };

      const workers = Array.from(
        { length: Math.min(this.config.concurrency, order.length) },
        () => worker()
      );
      await Promise.all(workers);
      this.renderAtProgress(this.currentProgress, true);
    }
  }

  const canvas = document.getElementById('sequence-canvas');
  const stage = document.getElementById('scroll-stage');
  const preloadTrack = document.getElementById('preload-track');
  const preloadFill = document.getElementById('preload-fill');

  const sequence = new ScrollFrameSequence({
    canvas,
    stage,
    preloadTrack,
    preloadFill,
    config: CONFIG,
  });

  sequence.init();

  // Expose clean hook for future components to sync with the scroll animation
  window.__scrollSequence = sequence;
})();
