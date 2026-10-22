const stylesheet = `
.react-jinke-music-player-main.light-theme {
    color: #30313a;
}
.react-jinke-music-player-main.light-theme .music-player-panel {
    background: rgba(255, 255, 255, 0.98);
    border-top: 1px solid #eeeef0;
    box-shadow: 0 -4px 24px rgba(28, 28, 40, 0.035);
    color: #30313a;
}
.react-jinke-music-player-main.light-theme .music-player-panel svg {
    color: #62646f;
}
.react-jinke-music-player-main.light-theme .music-player-panel svg:hover,
.react-jinke-music-player-main.light-theme .music-player-panel .play-btn svg,
.react-jinke-music-player-main.light-theme .loading svg,
.react-jinke-music-player-main.light-theme .lyric-btn-active svg {
    color: #ec4141;
}
.react-jinke-music-player-main .music-player-panel button:disabled svg {
    opacity: 0.35;
}
.react-jinke-music-player-main.light-theme .music-player-panel .panel-content .rc-slider-handle,
.react-jinke-music-player-main.light-theme .music-player-panel .panel-content .rc-slider-track,
.react-jinke-music-player-mobile-progress .rc-slider-track,
.react-jinke-music-player-mobile-progress .rc-slider-handle {
    background-color: #ec4141;
}
.react-jinke-music-player-main.light-theme .rc-slider-rail,
.react-jinke-music-player-main.light-theme .music-player-panel .progress-load-bar {
    background-color: #eeeef0 !important;
}
.react-jinke-music-player-main.light-theme .music-player-panel .panel-content .rc-slider-handle:active {
    box-shadow: 0 0 0 4px rgba(236, 65, 65, 0.12);
}
.react-jinke-music-player-main.light-theme .music-player-panel .panel-content .img-content {
    border-radius: 8px;
    box-shadow: none;
    overflow: hidden;
}
.react-jinke-music-player-main.light-theme .music-player-panel .panel-content .img-rotate {
    animation: none !important;
    border-radius: 8px !important;
}
.react-jinke-music-player-main.light-theme .music-player-controller {
    background-color: #ec4141;
    border-color: #ec4141;
}
.react-jinke-music-player-main.light-theme .music-player-controller svg {
    color: #fff;
}
.react-jinke-music-player-main.light-theme .audio-lists-btn {
    background-color: #f6f6f8 !important;
    border-radius: 8px;
}
.react-jinke-music-player-main.light-theme .audio-lists-panel {
    background-color: #fff;
    border: 1px solid #eeeef0;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 40px rgba(28, 28, 40, 0.08);
    color: #30313a;
}
.react-jinke-music-player-main.light-theme .audio-lists-panel .audio-item {
    background-color: #fff;
}
.react-jinke-music-player-main.light-theme .audio-lists-panel .audio-item:nth-child(odd) {
    background-color: #fafafb !important;
}
.react-jinke-music-player-main.light-theme .audio-lists-panel .audio-item.playing {
    background-color: #fff0f0 !important;
}
.react-jinke-music-player-main.light-theme .audio-lists-panel .audio-item.playing,
.react-jinke-music-player-main.light-theme .audio-lists-panel .audio-item.playing svg,
.react-jinke-music-player-main.light-theme .audio-item.playing .player-singer,
.react-jinke-music-player-main.light-theme .audio-lists-panel .audio-item:hover svg {
    color: #ec4141 !important;
}
.react-jinke-music-player-main.light-theme .rc-switch-checked {
    background-color: #ec4141 !important;
    border-color: #ec4141;
}
.react-jinke-music-player-mobile {
    background: #fcf9f8;
    color: #30313a;
}
.react-jinke-music-player-mobile .react-jinke-music-player-mobile-cover img.cover {
    border-radius: 16px;
}
.react-jinke-music-player-mobile-play-model-tip {
    background-color: #ec4141;
}
`

export default stylesheet
