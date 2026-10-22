import stylesheet from './netease.css.js'

// NetEase Cloud Music inspired palette
const neteaseRed = {
  300: '#ff6b6b',
  400: '#f75555',
  500: '#ec4141',
  600: '#d92f2f',
  700: '#c20c0c',
  900: '#8f0909',
}

const redTint = 'rgba(236, 65, 65, 0.12)'
const redTintStrong = 'rgba(236, 65, 65, 0.2)'
const surface = '#1c1c1f'
const surfaceRaised = '#242428'
const background = '#141416'

// Shared configuration for album / playlist header sections
const musicListHeader = {
  background: 'linear-gradient(180deg, rgba(236, 65, 65, 0.16), transparent)',
  borderRadius: 0,
  boxShadow: 'none',
}

export default {
  themeName: 'NetEase Cloud Music',
  typography: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      letterSpacing: 0.2,
    },
    h5: {
      fontSize: '1.35rem',
      fontWeight: 700,
    },
    body1: {
      fontSize: '0.875rem',
    },
    body2: {
      fontSize: '0.8125rem',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: 0,
    },
  },
  palette: {
    primary: {
      light: neteaseRed[300],
      main: neteaseRed[500],
      dark: neteaseRed[700],
      contrastText: '#fff',
    },
    secondary: {
      main: neteaseRed[700],
      contrastText: '#fff',
    },
    error: {
      main: neteaseRed[500],
    },
    background: {
      default: background,
      paper: surface,
    },
    text: {
      primary: '#f2f2f3',
      secondary: '#a7a7ad',
      disabled: '#6c6c72',
      hint: '#8b8b91',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
    action: {
      active: '#e6e6e9',
      hover: 'rgba(255, 255, 255, 0.06)',
      selected: redTint,
    },
    type: 'dark',
  },
  overrides: {
    MuiCssBaseline: {
      '@global': {
        body: {
          backgroundColor: background,
        },
        '::selection': {
          backgroundColor: redTintStrong,
        },
        '*::-webkit-scrollbar': {
          width: 8,
          height: 8,
        },
        '*::-webkit-scrollbar-track': {
          backgroundColor: 'transparent',
        },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(255, 255, 255, 0.14)',
          borderRadius: 8,
        },
        '*::-webkit-scrollbar-thumb:hover': {
          backgroundColor: neteaseRed[500],
        },
      },
    },
    MuiAppBar: {
      root: {
        background: `linear-gradient(180deg, ${neteaseRed[600]} 0%, ${neteaseRed[700]} 100%)`,
        boxShadow: '0 1px 0 rgba(0, 0, 0, 0.45)',
        color: '#fff',
      },
      positionFixed: {
        backgroundColor: `${neteaseRed[700]} !important`,
        color: '#fff',
      },
      colorPrimary: {
        backgroundColor: neteaseRed[700],
        color: '#fff',
      },
      colorSecondary: {
        backgroundColor: neteaseRed[700],
        color: '#fff',
      },
    },
    MuiToolbar: {
      root: {
        backgroundColor: 'transparent !important',
        minHeight: 56,
      },
    },
    MuiDrawer: {
      paper: {
        backgroundColor: '#19191c !important',
        backgroundImage: 'none',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
      },
      root: {
        '& .RaSidebar-fixed': {
          backgroundColor: '#19191c',
        },
      },
    },
    MuiListItem: {
      root: {
        borderLeft: '3px solid transparent',
        borderRadius: '0 8px 8px 0',
        marginRight: 6,
        transition: 'background-color 150ms ease, color 150ms ease',
        '&$selected, &$selected:hover': {
          backgroundColor: redTint,
          color: neteaseRed[400],
          borderLeftColor: neteaseRed[500],
        },
        '&$selected $primary, &$selected $secondary': {
          color: neteaseRed[400],
        },
      },
      button: {
        '&:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.045)',
        },
      },
      selected: {},
      primary: {},
      secondary: {},
    },
    MuiListItemIcon: {
      root: {
        minWidth: 42,
        color: 'inherit',
      },
    },
    MuiListItemText: {
      primary: {
        fontSize: '0.875rem',
        fontWeight: 500,
      },
    },
    MuiDivider: {
      root: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        margin: '0.5rem 0',
      },
    },
    MuiButton: {
      root: {
        borderRadius: 999,
        paddingLeft: '1.1rem',
        paddingRight: '1.1rem',
        boxShadow: 'none',
        '@media (max-width: 600px)': {
          minWidth: 0,
          paddingLeft: '0.7rem',
          paddingRight: '0.7rem',
        },
      },
      containedPrimary: {
        backgroundColor: neteaseRed[500],
        color: '#fff',
        boxShadow: `0 6px 16px ${redTint}`,
        '&:hover': {
          backgroundColor: `${neteaseRed[600]} !important`,
          boxShadow: `0 8px 22px ${redTintStrong}`,
        },
      },
      containedSecondary: {
        backgroundColor: neteaseRed[700],
        color: '#fff',
        '&:hover': {
          backgroundColor: `${neteaseRed[900]} !important`,
        },
      },
      outlined: {
        borderColor: 'rgba(255, 255, 255, 0.18)',
        '&:hover': {
          borderColor: neteaseRed[400],
          color: neteaseRed[300],
          backgroundColor: redTint,
        },
      },
      textPrimary: {
        color: neteaseRed[400],
        '&:hover': {
          backgroundColor: redTint,
        },
      },
      textSecondary: {
        color: '#c9c9ce',
      },
    },
    MuiIconButton: {
      root: {
        color: '#dcdce0',
        transition: 'color 150ms ease, background-color 150ms ease',
        '&:hover': {
          color: neteaseRed[400],
          backgroundColor: redTint,
        },
      },
    },
    MuiPaper: {
      root: {
        backgroundImage: 'none',
      },
      rounded: {
        borderRadius: 12,
      },
    },
    MuiCard: {
      root: {
        backgroundColor: surface,
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.05)',
      },
    },
    MuiCardMedia: {
      img: {
        borderRadius: 10,
      },
    },
    MuiCardHeader: {
      title: {
        fontSize: '1rem',
        fontWeight: 600,
      },
    },
    MuiTableCell: {
      root: {
        borderBottom: '1px solid rgba(255, 255, 255, 0.055)',
        padding: '8px 10px',
        color: '#d6d6da',
        fontSize: '0.8125rem',
        '& a': {
          color: '#a7a7ad',
          textDecoration: 'none',
          transition: 'color 120ms ease',
        },
        '& a:hover': {
          color: '#ff6b6b',
          textDecoration: 'underline',
        },
      },
      head: {
        color: '#85858c',
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        borderBottom: '1px solid rgba(255, 255, 255, 0.09)',
      },
    },
    MuiTableRow: {
      root: {
        transition: 'background-color 120ms ease',
        '&:hover': {
          backgroundColor: `${redTint} !important`,
        },
        '&$selected': {
          backgroundColor: `${redTint} !important`,
        },
      },
      selected: {},
    },
    MuiTableSortLabel: {
      root: {
        color: '#85858c !important',
        '&:hover': {
          color: '#fff !important',
        },
        '&$active': {
          color: `${neteaseRed[400]} !important`,
        },
      },
      active: {},
      icon: {
        color: `${neteaseRed[400]} !important`,
      },
    },
    MuiTabs: {
      indicator: {
        backgroundColor: neteaseRed[500],
        height: 2,
      },
    },
    MuiTab: {
      root: {
        textTransform: 'none',
        fontWeight: 500,
        minWidth: 80,
        '&$selected': {
          color: neteaseRed[400],
        },
      },
      selected: {},
      textColorInherit: {
        color: '#a7a7ad',
      },
    },
    MuiChip: {
      root: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 999,
        fontSize: '0.75rem',
      },
      colorPrimary: {
        backgroundColor: redTintStrong,
        color: neteaseRed[300],
      },
      colorSecondary: {
        backgroundColor: redTint,
        color: neteaseRed[300],
      },
      clickable: {
        '&:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
        },
      },
    },
    MuiInputBase: {
      root: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 8,
      },
      input: {
        fontSize: '0.875rem',
      },
    },
    MuiOutlinedInput: {
      notchedOutline: {
        borderColor: 'rgba(255, 255, 255, 0.12)',
      },
      root: {
        '&:hover $notchedOutline': {
          borderColor: 'rgba(255, 255, 255, 0.24)',
        },
        '&$focused $notchedOutline': {
          borderColor: neteaseRed[500],
        },
      },
      focused: {},
    },
    MuiFilledInput: {
      root: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        '&:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.07)',
        },
        '&$focused': {
          backgroundColor: 'rgba(255, 255, 255, 0.07)',
        },
      },
      focused: {},
    },
    MuiInputLabel: {
      root: {
        '&$focused': {
          color: neteaseRed[400],
        },
      },
      focused: {},
    },
    MuiSelect: {
      select: {
        '&:focus': {
          backgroundColor: 'transparent',
        },
      },
    },
    MuiCheckbox: {
      colorSecondary: {
        '&$checked': {
          color: neteaseRed[500],
        },
      },
      checked: {},
    },
    MuiRadio: {
      colorSecondary: {
        '&$checked': {
          color: neteaseRed[500],
        },
      },
      checked: {},
    },
    MuiSwitch: {
      colorSecondary: {
        '&$checked + $track': {
          backgroundColor: neteaseRed[500],
        },
      },
      checked: {},
      track: {},
    },
    MuiLinearProgress: {
      root: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 999,
      },
      barColorPrimary: {
        backgroundColor: neteaseRed[500],
      },
    },
    MuiSlider: {
      thumb: {
        backgroundColor: neteaseRed[500],
      },
      track: {
        backgroundColor: neteaseRed[500],
      },
      rail: {
        backgroundColor: 'rgba(255, 255, 255, 0.16)',
      },
    },
    MuiTooltip: {
      tooltip: {
        backgroundColor: surfaceRaised,
        color: '#f2f2f3',
        fontSize: '0.75rem',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.08)',
      },
    },
    MuiDialog: {
      paper: {
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.08)',
      },
    },
    MuiMenu: {
      paper: {
        borderRadius: 10,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backgroundColor: surfaceRaised,
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
      },
    },
    MuiPopover: {
      paper: {
        borderRadius: 10,
        backgroundColor: surfaceRaised,
      },
    },
    MuiSnackbarContent: {
      root: {
        backgroundColor: surfaceRaised,
        borderRadius: 10,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        color: '#f2f2f3',
      },
    },
    MuiFab: {
      primary: {
        backgroundColor: neteaseRed[500],
        '&:hover': {
          backgroundColor: `${neteaseRed[600]} !important`,
        },
      },
    },
    MuiBadge: {
      colorSecondary: {
        backgroundColor: neteaseRed[500],
      },
    },
    MuiLink: {
      root: {
        color: neteaseRed[400],
      },
    },
    MuiGridListTile: {
      root: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: surface,
      },
    },
    MuiGridListTileBar: {
      root: {
        background: 'linear-gradient(to top, rgba(0, 0, 0, 0.82), transparent)',
      },
    },

    // Navidrome-specific components
    NDMenu: {
      active: {
        color: `${neteaseRed[400]} !important`,
        backgroundColor: redTint,
        borderLeft: `3px solid ${neteaseRed[500]}`,
      },
    },
    NDAppBar: {
      root: {
        color: 'rgba(255, 255, 255, 0.86)',
      },
      active: {
        color: '#fff',
      },
      icon: {
        color: 'inherit',
      },
    },
    NDAlbumGridView: {
      albumContainer: {
        backgroundColor: '#1e1e22',
        borderRadius: 12,
        padding: 10,
        border: '1px solid rgba(255, 255, 255, 0.05)',
        transition:
          'background-color 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
        '&:hover': {
          backgroundColor: '#26262b',
          borderColor: 'rgba(236, 65, 65, 0.35)',
          boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45)',
        },
      },
      albumName: {
        marginTop: 2,
        fontWeight: 600,
        fontSize: 13,
        color: '#f2f2f3',
      },
      albumSubtitle: {
        fontSize: 12,
        color: '#9a9aa0',
      },
      albumArtistName: {
        color: '#b9b9be',
      },
      albumPlayButton: {
        backgroundColor: neteaseRed[500],
        color: '#fff',
        borderRadius: '50%',
        padding: 10,
        boxShadow: `0 6px 16px ${redTintStrong}`,
        transition: 'transform 150ms ease, background-color 150ms ease',
        '&:hover': {
          backgroundColor: `${neteaseRed[600]} !important`,
          transform: 'scale(1.08)',
        },
      },
      tileBar: {
        background:
          'linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.25) 70%, rgba(0, 0, 0, 0) 100%)',
      },
    },
    NDAlbumDetails: {
      root: musicListHeader,
      cardContents: {
        alignItems: 'center',
        paddingTop: '1.5rem',
      },
      cover: {
        borderRadius: 8,
        boxShadow: '0 14px 36px rgba(0, 0, 0, 0.5)',
      },
      recordName: {
        fontSize: 'calc(1rem + 1.5vw)',
        fontWeight: 700,
      },
      recordArtist: {
        fontSize: '0.875rem',
        fontWeight: 600,
        color: neteaseRed[300],
      },
      recordMeta: {
        fontSize: '0.8125rem',
        color: 'rgba(255, 255, 255, 0.72)',
      },
    },
    NDPlaylistDetails: {
      container: musicListHeader,
      cover: {
        borderRadius: 8,
        boxShadow: '0 14px 36px rgba(0, 0, 0, 0.5)',
      },
      title: {
        fontSize: 'calc(1.4rem + 1.4vw)',
        fontWeight: 700,
      },
      details: {
        fontSize: '0.8125rem',
        color: 'rgba(255, 255, 255, 0.72)',
      },
    },
    NDAlbumShow: {
      albumActions: {
        padding: '1rem 0',
        alignItems: 'center',
        '@global': {
          button: {
            border: '1px solid transparent',
            backgroundColor: 'inherit',
            color: '#b9b9be',
            '&:hover': {
              border: '1px solid rgba(255, 255, 255, 0.2)',
              backgroundColor: 'inherit !important',
            },
          },
          'button:first-child:not(:only-child)': {
            transform: 'scale(1.9)',
            margin: '1.5rem',
            minWidth: 0,
            padding: 6,
            transition: 'transform .25s ease, background-color .25s ease',
            background: neteaseRed[500],
            color: '#fff',
            borderRadius: 500,
            border: 0,
            boxShadow: `0 8px 20px ${redTint}`,
            '&:hover': {
              transform: 'scale(2)',
              backgroundColor: `${neteaseRed[600]} !important`,
              border: 0,
            },
            '@media screen and (max-width: 720px)': {
              transform: 'scale(1.5)',
              margin: '1rem',
              '&:hover': {
                transform: 'scale(1.6) !important',
              },
            },
          },
          'button:only-child': {
            margin: '1.5rem',
          },
          'button:first-child>span:first-child': {
            padding: 0,
          },
          'button:first-child>span:first-child>span': {
            display: 'none',
          },
          'button>span:first-child>span, button:not(:first-child)>span:first-child>svg':
            {
              color: '#b9b9be',
            },
        },
      },
    },
    NDCollapsibleComment: {
      commentBlock: {
        fontSize: '0.8125rem',
        color: 'rgba(255, 255, 255, 0.68)',
        borderLeft: `3px solid ${neteaseRed[500]}`,
        paddingLeft: 12,
      },
    },
    NDLogin: {
      main: {
        background:
          'radial-gradient(130% 95% at 50% -25%, #e02828 0%, #a80d0d 34%, #300a0a 68%, #141416 100%) !important',
        backgroundColor: '#141416 !important',
      },
      systemNameLink: {
        color: '#fff',
      },
      icon: {},
      welcome: {
        color: '#eee',
      },
      card: {
        minWidth: 300,
        width: 'min(92vw, 380px)',
        backgroundColor: 'rgba(24, 24, 27, 0.94)',
        borderRadius: 18,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(12px)',
      },
      avatar: {},
      button: {
        boxShadow: `0 8px 22px ${redTint}`,
      },
    },
    NDMobileArtistDetails: {
      bgContainer: {
        background:
          'linear-gradient(to bottom, rgba(236, 65, 65, 0.22), rgb(20, 20, 22))!important',
      },
    },
  },
  player: {
    theme: 'dark',
    stylesheet,
  },
}
