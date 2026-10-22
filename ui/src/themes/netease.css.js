const stylesheet = `
/* ============================================================
   NetEase Cloud Music player skin for Navidrome
   Brand red: #ec4141 / deep red: #c20c0c
   ============================================================ */

.react-jinke-music-player-main {
  font-family: inherit;
}

/* Player bar */
.react-jinke-music-player-main .music-player-panel {
  background-color: #1b1b1e !important;
  box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.06), 0 -18px 40px rgba(0, 0, 0, 0.45);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  color: #f2f2f3;
}

.react-jinke-music-player-main .music-player-panel .panel-content {
  padding: 0 24px;
}

/* Circular, softly glowing cover art */
.react-jinke-music-player-main .music-player-panel .panel-content .img-content {
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 8px 22px rgba(0, 0, 0, 0.55);
  background-color: #2a2a2e;
  transition: box-shadow 200ms ease;
}

.react-jinke-music-player-main .music-player-panel .panel-content .img-content:hover {
  box-shadow: 0 0 0 2px #ec4141, 0 8px 26px rgba(236, 65, 65, 0.35);
}

/* Progress */
.react-jinke-music-player-main .music-player-panel .panel-content .rc-slider-rail,
.react-jinke-music-player-main .rc-slider-rail {
  background-color: rgba(255, 255, 255, 0.16) !important;
  height: 3px;
  border-radius: 3px;
}

.react-jinke-music-player-main .music-player-panel .panel-content .rc-slider-track,
.react-jinke-music-player-main .rc-slider-track,
.react-jinke-music-player-main .music-player-panel .panel-content .progress-bar .progress {
  background-color: #ec4141 !important;
  background-image: linear-gradient(90deg, #c20c0c, #ff5f5f) !important;
  border-radius: 3px;
}

.react-jinke-music-player-main .music-player-panel .panel-content .rc-slider-handle,
.react-jinke-music-player-main .rc-slider-handle {
  background-color: #fff !important;
  border: 2px solid #ec4141 !important;
  box-shadow: 0 0 0 4px rgba(236, 65, 65, 0.18);
}

.react-jinke-music-player-main .music-player-panel .panel-content .rc-slider-handle:active,
.react-jinke-music-player-main .rc-slider-handle:active {
  box-shadow: 0 0 0 6px rgba(236, 65, 65, 0.25) !important;
}

.react-jinke-music-player-main .music-player-panel .panel-content .progress-bar-content .audio-title {
  font-size: 14px;
  font-weight: 600;
  color: #f2f2f3;
}

.react-jinke-music-player-main .music-player-panel .panel-content .progress-bar-content .audio-title a {
  color: #f2f2f3;
}

.react-jinke-music-player-main .music-player-panel .panel-content .progress-bar-content .audio-title a:hover {
  color: #ff6b6b;
}

.react-jinke-music-player-main .music-player-panel .panel-content .progress-bar-content .audio-main .current-time,
.react-jinke-music-player-main .music-player-panel .panel-content .progress-bar-content .audio-main .duration {
  color: #8f8f96;
  font-variant-numeric: tabular-nums;
}

/* Controls */
.react-jinke-music-player-main svg:active,
.react-jinke-music-player-main svg:hover,
.react-jinke-music-player-main .music-player-panel .panel-content .player-content > .group:hover svg,
.react-jinke-music-player-main .music-player-panel .panel-content .player-content .audio-lists-btn > .group:hover,
.react-jinke-music-player-main .music-player-panel .panel-content .player-content .audio-lists-btn > .group:hover > svg {
  color: #ff5f5f !important;
}

.react-jinke-music-player-main .music-player-panel .panel-content .player-content .loop-btn.active,
.react-jinke-music-player-main .lyric-btn-active,
.react-jinke-music-player-main .lyric-btn-active svg {
  color: #ec4141 !important;
}

.react-jinke-music-player-main .music-player-panel .panel-content .player-content .audio-lists-btn {
  background-color: rgba(255, 255, 255, 0.07) !important;
  border: 1px solid rgba(255, 255, 255, 0.07);
  color: #d9d9dd;
}

/* NetEase-style round play button */
.react-jinke-music-player-main .music-player-panel .panel-content .player-content .play-btn {
  width: 42px;
  height: 42px;
  padding: 0 !important;
  margin: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(145deg, #ff5f5f, #d92f2f);
  box-shadow: 0 6px 18px rgba(236, 65, 65, 0.4);
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.react-jinke-music-player-main .music-player-panel .panel-content .player-content .play-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 8px 24px rgba(236, 65, 65, 0.55);
}

.react-jinke-music-player-main .music-player-panel .panel-content .player-content .play-btn svg {
  color: #fff !important;
  font-size: 22px;
}

.react-jinke-music-player-main .music-player-panel .panel-content .player-content .audio-lists-btn:hover {
  background-color: rgba(236, 65, 65, 0.14) !important;
  border-color: rgba(236, 65, 65, 0.35);
}

/* Queue panel */
.react-jinke-music-player-main .audio-lists-panel,
.react-jinke-music-player-main .audio-lists-panel-mobile {
  background-color: #202024 !important;
  color: #e6e6e9;
  border-radius: 12px 12px 0 0;
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.55);
}

.react-jinke-music-player-main .audio-lists-panel-header {
  background-color: #26262b !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: #f2f2f3;
}

.react-jinke-music-player-main .audio-lists-panel-header-line {
  background: rgba(255, 255, 255, 0.16);
}

.react-jinke-music-player-main .audio-lists-panel-content .audio-item,
.react-jinke-music-player-main .audio-lists-panel .audio-item {
  background-color: transparent !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.react-jinke-music-player-main .audio-lists-panel-content .audio-item:nth-child(odd) {
  background-color: rgba(255, 255, 255, 0.015) !important;
}

.react-jinke-music-player-main .audio-lists-panel-content .audio-item:active,
.react-jinke-music-player-main .audio-lists-panel-content .audio-item:hover {
  background-color: rgba(236, 65, 65, 0.12) !important;
}

.react-jinke-music-player-main .audio-lists-panel-content .audio-item.playing,
.react-jinke-music-player-main .audio-lists-panel-content .audio-item.playing svg,
.react-jinke-music-player-main .audio-lists-panel-content .audio-item.playing .player-singer {
  color: #ff5f5f !important;
}

.react-jinke-music-player-main .audio-lists-panel-content .audio-item.playing {
  background-color: rgba(236, 65, 65, 0.14) !important;
}

.react-jinke-music-player-main .audio-lists-panel-content .audio-item .player-singer {
  color: #8f8f96;
}

/* Lyrics / mode toast */
.react-jinke-music-player-main .music-player-lyric {
  color: #ff5f5f;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.8);
}

.react-jinke-music-player-main .play-mode-title {
  background-color: rgba(32, 32, 36, 0.92);
  color: #ff5f5f;
  border: 1px solid rgba(236, 65, 65, 0.25);
  border-radius: 8px;
}

/* Mobile full-screen player */
.react-jinke-music-player-main .react-jinke-music-player-mobile {
  background: radial-gradient(120% 80% at 50% 0%, rgba(194, 12, 12, 0.45), #141416 62%) !important;
  color: #f2f2f3;
  backdrop-filter: blur(18px);
}

.react-jinke-music-player-main .react-jinke-music-player-mobile-cover {
  border: 6px solid rgba(236, 65, 65, 0.22);
  box-shadow: 0 0 60px rgba(236, 65, 65, 0.25);
}

.react-jinke-music-player-main .react-jinke-music-player-mobile-progress .rc-slider-rail {
  background-color: rgba(255, 255, 255, 0.18);
}

.react-jinke-music-player-main .react-jinke-music-player-mobile-progress .rc-slider-handle,
.react-jinke-music-player-main .react-jinke-music-player-mobile-progress .rc-slider-track {
  background-color: #ec4141 !important;
}

.react-jinke-music-player-main .react-jinke-music-player-mobile .current-time,
.react-jinke-music-player-main .react-jinke-music-player-mobile .duration {
  color: rgba(255, 255, 255, 0.6);
}

.react-jinke-music-player-main .react-jinke-music-player-mobile-play-model-tip {
  background-color: #c20c0c;
}

/* Floating controller (when the queue bar is collapsed) */
.react-jinke-music-player .music-player-controller {
  background-color: #1f1f23;
  border-color: rgba(255, 255, 255, 0.08);
  color: #ec4141;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.react-jinke-music-player .music-player-controller .music-player-controller-setting {
  background: rgba(236, 65, 65, 0.35);
}

.react-jinke-music-player .audio-circle-process-bar circle[class='stroke'] {
  stroke: #ec4141;
}

/* Scrollbar inside the player */
.react-jinke-music-player-main ::-webkit-scrollbar {
  background-color: transparent;
  width: 6px;
}

.react-jinke-music-player-main ::-webkit-scrollbar-thumb {
  background-color: rgba(236, 65, 65, 0.55);
  border-radius: 6px;
}
`

export default stylesheet
