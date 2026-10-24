import stylesheet from './cloudMusic.css.js'

const accent = '#ec4141'
const ink = '#30313a'
const muted = '#8a8c94'
const line = '#eeeef0'

const details = {
  root: {
    background: 'transparent',
    boxShadow: 'none',
    borderRadius: 0,
    minWidth: '0 !important',
  },
  cardContents: {
    alignItems: 'center',
  },
  coverParent: {
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0 8px 26px rgba(42, 28, 28, 0.09)',
  },
}

export default {
  themeName: 'Cloud Music',
  cloudMusic: true,
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    h5: { fontWeight: 700, letterSpacing: '-0.5px' },
    h6: { fontWeight: 650, fontSize: '1.1rem' },
    button: { textTransform: 'none', fontWeight: 500 },
    body1: { fontSize: '0.875rem' },
    body2: { fontSize: '0.8125rem' },
  },
  palette: {
    type: 'light',
    primary: {
      light: '#ff7676',
      main: accent,
      dark: '#d43333',
      contrastText: '#fff',
    },
    secondary: {
      light: '#f8f8fa',
      main: '#f3f3f5',
      dark: '#e9e9ec',
      contrastText: ink,
    },
    background: { default: '#fff', paper: '#fff' },
    text: { primary: ink, secondary: '#767881', disabled: '#a4a5ad' },
    divider: line,
    action: {
      active: '#676974',
      hover: '#f7f7f9',
      selected: '#fceaea',
      disabledBackground: '#f3f3f5',
    },
  },
  shape: { borderRadius: 10 },
  sidebar: { width: 224, closedWidth: 55 },
  overrides: {
    MuiCssBaseline: {
      '@global': {
        '*': { scrollbarWidth: 'thin', scrollbarColor: '#dddde1 transparent' },
        '*::-webkit-scrollbar': { width: 6, height: 6 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: '#dddde1',
          borderRadius: 8,
        },
        '::selection': { backgroundColor: '#fbdcdc', color: ink },
      },
    },
    MuiAppBar: {
      colorSecondary: { backgroundColor: accent, color: '#fff' },
      positionFixed: { boxShadow: 'none' },
    },
    MuiDrawer: {
      paper: { backgroundColor: '#f6f6f7', borderRight: `1px solid ${line}` },
    },
    MuiPaper: {
      elevation1: { boxShadow: 'none' },
      elevation8: { boxShadow: '0 8px 36px rgba(30, 30, 50, 0.1)' },
    },
    MuiButton: {
      root: { borderRadius: 20, boxShadow: 'none', padding: '6px 16px' },
      contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
      outlined: { borderColor: '#dedee3' },
      textSecondary: { color: '#666873' },
      containedPrimary: {
        backgroundColor: accent,
        '&:hover': { backgroundColor: '#d93636' },
      },
    },
    MuiIconButton: {
      root: { color: '#777985' },
      colorPrimary: { color: accent },
    },
    MuiChip: {
      root: { backgroundColor: '#f5f5f7', borderRadius: 6, color: '#747681' },
      colorPrimary: { backgroundColor: '#fff0f0', color: '#d93636' },
    },
    MuiMenu: { paper: { border: `1px solid ${line}`, padding: 4 } },
    MuiMenuItem: {
      root: { borderRadius: 6, fontSize: '0.875rem', minHeight: 38 },
    },
    MuiTooltip: { tooltip: { borderRadius: 6, backgroundColor: '#3a3a42' } },
    MuiTab: { root: { textTransform: 'none', fontSize: '0.9375rem' } },
    MuiTabs: { indicator: { height: 3, borderRadius: 3 } },
    MuiFilledInput: {
      root: {
        backgroundColor: '#f6f6f8',
        borderRadius: '8px 8px 0 0',
        '&:hover': { backgroundColor: '#f1f1f4' },
        '&$focused': { backgroundColor: '#f6f6f8' },
      },
    },
    MuiOutlinedInput: {
      root: { borderRadius: 9 },
      notchedOutline: { borderColor: '#e5e5e9' },
    },
    MuiTableBody: {
      root: { '& > tr:nth-child(odd)': { backgroundColor: '#fafafb' } },
    },
    MuiTableRow: {
      root: {
        '&$hover:hover': { backgroundColor: '#f4f4f6' },
        '&$selected, &$selected:hover': { backgroundColor: '#fceeee' },
      },
    },
    MuiTableCell: {
      root: { borderBottom: 0, padding: '12px 16px', color: '#62646f' },
      head: {
        backgroundColor: '#fff',
        color: muted,
        fontSize: '0.75rem',
        fontWeight: 400,
        borderBottom: `1px solid ${line}`,
      },
    },
    RaLayout: {
      root: { minWidth: 0 },
      appFrame: { marginTop: '64px !important' },
      content: {
        backgroundColor: '#fff',
        padding: '0 !important',
        minWidth: 0,
      },
    },
    RaAppBar: {
      toolbar: {
        minHeight: 64,
        '& > button': { color: 'inherit' },
        '& > .MuiIconButton-root': { color: 'inherit' },
      },
      menuButton: { color: 'inherit' },
    },
    RaSidebar: {
      root: { height: 'calc(100vh - 64px)', flexShrink: 0 },
      fixed: {
        top: 64,
        bottom: 0,
        height: 'auto',
        width: 'inherit',
        boxSizing: 'border-box',
        backgroundColor: '#f6f6f7',
        borderRight: `1px solid ${line}`,
        overflowY: 'auto',
        overscrollBehaviorY: 'contain',
      },
      drawerPaper: {
        backgroundColor: '#f6f6f7',
        borderRight: `1px solid ${line}`,
        // Desktop menus are fixed; the relative drawer only reserves their width.
        '@media (min-width: 600px)': {
          backgroundColor: 'transparent',
          borderRight: 'none',
        },
      },
    },
    RaList: {
      main: { minWidth: 0 },
      content: {
        borderRadius: 12,
        backgroundColor: '#fff',
        minWidth: 0,
        overflowX: 'auto',
      },
    },
    RaListToolbar: {
      toolbar: {
        '&&': {
          padding: '16px 24px 8px',
          minHeight: 64,
          gap: '8px 16px',
          flexWrap: 'wrap',
          alignItems: 'center',
          boxSizing: 'border-box',
          '@media (max-width: 599px)': { padding: '12px 16px 8px' },
        },
      },
      actions: { '&&': { paddingTop: 0, flexWrap: 'wrap' } },
    },
    RaBulkActionsToolbar: {
      toolbar: {
        height: 'auto',
        flexWrap: 'wrap',
        gap: '4px 12px',
        paddingTop: 8,
        paddingBottom: 8,
      },
      collapsed: { height: 0, paddingTop: 0, paddingBottom: 0 },
      topToolbar: {
        '&&': {
          flexWrap: 'wrap',
          flex: '1 1 auto',
          minWidth: 0,
          maxWidth: '100%',
          padding: 0,
          gap: '4px 8px',
          backgroundColor: 'transparent',
          '@media (max-width: 599px)': { justifyContent: 'flex-start' },
        },
      },
    },
    RaFilterForm: {
      form: {
        '&&': {
          marginTop: 0,
          minHeight: 0,
          minWidth: 0,
          maxWidth: '100%',
          flex: '1 1 auto',
          '& .filter-field': { minWidth: 0, maxWidth: '100%' },
          '& .MuiFormControl-root': { maxWidth: '100%' },
        },
      },
    },
    RaSearchInput: {
      input: {
        '& .MuiInputBase-root': {
          backgroundColor: '#f5f5f7',
          borderRadius: 20,
        },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
      },
    },
    RaPaginationActions: {
      currentPageButton: { color: accent, backgroundColor: '#fff0f0' },
      button: { borderRadius: 8, minWidth: 32, margin: '0 3px' },
    },
    NDAlbumGridView: {
      root: { margin: '20px 24px 28px' },
      link: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#f5f5f7',
        boxShadow: '0 3px 14px rgba(35, 30, 45, 0.045)',
        transition: 'box-shadow 180ms ease, transform 180ms ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: '0 8px 22px rgba(35, 30, 45, 0.12)',
        },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      },
      albumName: {
        marginTop: 12,
        marginBottom: 4,
        color: ink,
        fontWeight: 500,
        fontSize: 14,
        lineHeight: 1.5,
      },
      albumSubtitle: { color: muted, fontSize: 12, lineHeight: 1.5 },
      albumVersion: { color: muted, fontSize: 12 },
      tileBar: {
        background:
          'linear-gradient(transparent, rgba(22, 22, 30, 0.08) 40%, rgba(22, 22, 30, 0.4))',
      },
      albumPlayButton: {
        borderRadius: '50%',
        padding: 6,
        backgroundColor: '#fff',
        color: accent,
        '&:hover': { backgroundColor: '#fff0f0' },
      },
    },
    NDAlbumDetails: {
      ...details,
      recordName: { fontWeight: 700, color: ink },
      recordArtist: { color: '#62646f', marginTop: 6 },
      recordMeta: { color: muted, fontSize: 12, marginTop: 8 },
    },
    NDPlaylistDetails: {
      ...details,
      title: { fontWeight: 700, color: ink },
      stats: { color: muted, fontSize: 12 },
    },
    NDDesktopArtistDetails: {
      artistName: { fontWeight: 700, color: ink },
    },
    NDMobileArtistDetails: {
      bgContainer: { background: 'linear-gradient(transparent, #fff)' },
    },
    NDAudioPlayer: {
      audioTitle: { color: ink, fontSize: '0.8125rem' },
      songTitle: { fontWeight: 500 },
      songInfo: { color: muted, fontSize: '0.6875rem' },
      songAlbum: { fontStyle: 'normal' },
    },
    NDLogin: {
      main: {
        justifyContent: 'center',
        boxSizing: 'border-box',
        padding: '56px 20px',
        background:
          'radial-gradient(ellipse at 15% 15%, rgba(248, 205, 194, 0.4), transparent 45%), radial-gradient(ellipse at 90% 90%, rgba(236, 65, 65, 0.07), transparent 50%), #fcf8f4',
      },
      card: {
        width: 400,
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        marginTop: 0,
        padding: '32px 30px 28px',
        borderRadius: 20,
        border: '1px solid rgba(231, 221, 216, 0.7)',
        backgroundColor: '#fff',
        boxShadow: '0 18px 64px rgba(105, 58, 45, 0.07)',
        '@media (max-width: 420px)': { padding: '28px 22px 24px' },
      },
      avatar: { margin: '0 auto 16px', width: 76, height: 76 },
      icon: {
        width: 76,
        height: 76,
        filter: 'hue-rotate(145deg) saturate(1.2)',
      },
      systemName: { marginTop: 0, fontSize: 24, fontWeight: 700 },
      systemNameLink: { color: accent, letterSpacing: '-0.6px' },
      welcome: {
        marginTop: 12,
        padding: 0,
        color: '#8a7770',
        textAlign: 'center',
        lineHeight: 1.7,
        fontSize: 14,
      },
      form: { padding: '8px 0 24px' },
      input: { marginTop: 20 },
      actions: { padding: 0 },
      button: {
        minHeight: 44,
        borderRadius: 22,
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 5px 14px rgba(236, 65, 65, 0.14)',
      },
      message: {
        padding: 0,
        marginTop: 20,
        color: '#aaa0a0',
        fontSize: 11,
        lineHeight: 1.7,
      },
    },
  },
  player: { theme: 'light', stylesheet },
}
