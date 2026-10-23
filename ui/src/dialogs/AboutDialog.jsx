import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import Link from '@material-ui/core/Link'
import Dialog from '@material-ui/core/Dialog'
import TableContainer from '@material-ui/core/TableContainer'
import Table from '@material-ui/core/Table'
import TableBody from '@material-ui/core/TableBody'
import TableRow from '@material-ui/core/TableRow'
import TableCell from '@material-ui/core/TableCell'
import Paper from '@material-ui/core/Paper'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import FileCopyIcon from '@material-ui/icons/FileCopy'
import Button from '@material-ui/core/Button'
import { useGetOne, usePermissions, useTranslate, useNotify } from 'react-admin'
import { Tabs, Tab } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import config from '../config'
import { DialogTitle } from './DialogTitle'
import { DialogContent } from './DialogContent'
import subsonic from '../subsonic/index.js'
import { Typography } from '@material-ui/core'
import TableHead from '@material-ui/core/TableHead'
import { configToToml, separateAndSortConfigs } from './aboutUtils'
import useAboutText from './useAboutText'

const useStyles = makeStyles((theme) => ({
  configNameColumn: {
    maxWidth: '200px',
    width: '200px',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
  },
  envVarColumn: {
    maxWidth: '250px',
    width: '250px',
    fontFamily: 'monospace',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
  },
  copyButton: {
    marginBottom: theme.spacing(2),
    marginTop: theme.spacing(1),
  },
  devSectionHeader: {
    '& td': {
      paddingTop: theme.spacing(2),
      paddingBottom: theme.spacing(2),
      borderTop: `2px solid ${theme.palette.divider}`,
      borderBottom: `1px solid ${theme.palette.divider}`,
      textAlign: 'left',
      fontWeight: 600,
    },
  },
  configContainer: {
    paddingTop: theme.spacing(1),
  },
  tableContainer: {
    maxHeight: '60vh',
    overflow: 'auto',
  },
  devFlagsTitle: {
    fontWeight: 600,
  },
  expandableDialog: {
    transition: 'max-width 300ms ease',
  },
}))

const repositoryURL = 'https://github.com/edwardlewis35/navidrome'

const LinkToVersion = ({ version }) => {
  // Custom image versions can be plain labels or include a Git commit.
  const commit = version?.match(/\(([0-9a-f]{7,40})\)/i)?.[1]
  if (!commit) return <>{version || '—'}</>
  return (
    <Link
      href={`${repositoryURL}/commit/${commit}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {version}
    </Link>
  )
}

const ShowVersion = ({ uiVersion, serverVersion }) => {
  const translate = useTranslate()
  const showRefresh = Boolean(serverVersion) && uiVersion !== serverVersion

  return (
    <>
      <TableRow>
        <TableCell align="right" component="th" scope="row">
          {translate('menu.version')}:
        </TableCell>
        <TableCell align="left">
          <LinkToVersion version={serverVersion} />
        </TableCell>
      </TableRow>
      {showRefresh && (
        <TableRow>
          <TableCell align="right" component="th" scope="row">
            UI {translate('menu.version')}:
          </TableCell>
          <TableCell align="left">
            <div>
              <LinkToVersion version={uiVersion} />
            </div>
            <div>
              <Link onClick={() => window.location.reload()}>
                <Typography variant={'caption'}>
                  {translate('ra.notification.new_version')}
                </Typography>
              </Link>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

const AboutTabContent = ({ uiVersion, serverVersion, status, permissions }) => {
  const text = useAboutText()
  const rows = [
    [text.app, text.appName],
    [text.status, text[status]],
    [text.compatibility, 'Subsonic / OpenSubsonic'],
    [text.collection, text.collectionValue],
    ...(permissions === 'admin'
      ? [[text.management, text.managementValue]]
      : []),
    [
      text.source,
      <Link
        href={repositoryURL}
        target="_blank"
        rel="noopener noreferrer"
        key="source"
      >
        edwardlewis35/navidrome
      </Link>,
    ],
    [
      text.issues,
      <Link
        href={`${repositoryURL}/issues`}
        target="_blank"
        rel="noopener noreferrer"
        key="issues"
      >
        {text.issues}
      </Link>,
    ],
  ]
  return (
    <Table aria-label={text.title} size="small">
      <TableBody>
        <ShowVersion uiVersion={uiVersion} serverVersion={serverVersion} />
        {rows.map(([label, value]) => (
          <TableRow key={label}>
            <TableCell align="right" component="th" scope="row">
              {label}:
            </TableCell>
            <TableCell align="left">{value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const ConfigTabContent = ({ configData }) => {
  const classes = useStyles()
  const translate = useTranslate()
  const notify = useNotify()

  if (!configData || !configData.config) {
    return null
  }

  // Use the shared separation and sorting logic
  const { regularConfigs, devConfigs } = separateAndSortConfigs(
    configData.config,
  )

  const handleCopyToml = async () => {
    try {
      const tomlContent = configToToml(configData, translate)
      await navigator.clipboard.writeText(tomlContent)
      notify(translate('about.config.exportSuccess'), 'info')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to copy TOML:', err)
      notify(translate('about.config.exportFailed'), 'error')
    }
  }

  const handleDownloadToml = () => {
    const tomlContent = configToToml(configData, translate)
    const tomlFile = new File([tomlContent], 'navidrome.toml', {
      type: 'text/plain',
    })

    const tomlFileLink = document.createElement('a')
    const tomlFileUrl = URL.createObjectURL(tomlFile)
    tomlFileLink.href = tomlFileUrl
    tomlFileLink.download = tomlFile.name
    tomlFileLink.click()

    URL.revokeObjectURL(tomlFileUrl)
  }

  return (
    <div className={classes.configContainer}>
      <Button
        variant="outlined"
        startIcon={<FileCopyIcon />}
        onClick={handleCopyToml}
        className={classes.copyButton}
        disabled={
          !configData || !navigator.clipboard || !window.isSecureContext
        }
        size="small"
      >
        {translate('about.config.exportToml')}
      </Button>
      <Button
        variant="outlined"
        startIcon={<CloudDownloadIcon />}
        onClick={handleDownloadToml}
        className={classes.copyButton}
        disabled={!configData}
        size="small"
      >
        {translate('about.config.downloadToml')}
      </Button>
      <TableContainer className={classes.tableContainer}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell
                align="left"
                component="th"
                scope="col"
                className={classes.configNameColumn}
              >
                {translate('about.config.configName')}
              </TableCell>
              <TableCell align="left" component="th" scope="col">
                {translate('about.config.environmentVariable')}
              </TableCell>
              <TableCell align="left" component="th" scope="col">
                {translate('about.config.currentValue')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {configData?.configFile && (
              <TableRow>
                <TableCell
                  align="left"
                  component="th"
                  scope="row"
                  className={classes.configNameColumn}
                >
                  {translate('about.config.configurationFile')}
                </TableCell>
                <TableCell align="left" className={classes.envVarColumn}>
                  ND_CONFIGFILE
                </TableCell>
                <TableCell align="left">{configData.configFile}</TableCell>
              </TableRow>
            )}
            {regularConfigs.map(({ key, envVar, value }) => (
              <TableRow key={key}>
                <TableCell
                  align="left"
                  component="th"
                  scope="row"
                  className={classes.configNameColumn}
                >
                  {key}
                </TableCell>
                <TableCell align="left" className={classes.envVarColumn}>
                  {envVar}
                </TableCell>
                <TableCell align="left">{String(value)}</TableCell>
              </TableRow>
            ))}
            {devConfigs.length > 0 && (
              <TableRow className={classes.devSectionHeader}>
                <TableCell colSpan={3}>
                  <Typography
                    variant="subtitle1"
                    component="div"
                    className={classes.devFlagsTitle}
                  >
                    🚧 {translate('about.config.devFlagsHeader')}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {devConfigs.map(({ key, envVar, value }) => (
              <TableRow key={key}>
                <TableCell
                  align="left"
                  component="th"
                  scope="row"
                  className={classes.configNameColumn}
                >
                  {key}
                </TableCell>
                <TableCell align="left" className={classes.envVarColumn}>
                  {envVar}
                </TableCell>
                <TableCell align="left">{String(value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  )
}

const TabContent = ({
  tab,
  setTab,
  showConfigTab,
  uiVersion,
  serverVersion,
  status,
  permissions,
  configData,
}) => {
  const translate = useTranslate()

  return (
    <TableContainer component={Paper}>
      {showConfigTab && (
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab
            label={translate('about.tabs.about')}
            id="about-tab"
            aria-controls="about-panel"
          />
          <Tab
            label={translate('about.tabs.config')}
            id="config-tab"
            aria-controls="config-panel"
          />
        </Tabs>
      )}
      <div
        id="about-panel"
        role="tabpanel"
        aria-labelledby="about-tab"
        hidden={showConfigTab && tab === 1}
      >
        <AboutTabContent
          uiVersion={uiVersion}
          serverVersion={serverVersion}
          status={status}
          permissions={permissions}
        />
      </div>
      {showConfigTab && (
        <div
          id="config-panel"
          role="tabpanel"
          aria-labelledby="config-tab"
          hidden={tab === 0}
        >
          <ConfigTabContent configData={configData} />
        </div>
      )}
    </TableContainer>
  )
}

const AboutDialog = ({ open, onClose }) => {
  const classes = useStyles()
  const { permissions } = usePermissions()
  const text = useAboutText()
  const [status, setStatus] = useState('checking')
  const [serverVersion, setServerVersion] = useState('')
  const showConfigTab = permissions === 'admin' && config.devUIShowConfig
  const [tab, setTab] = useState(0)
  const { data: configData } = useGetOne('config', 'config', {
    enabled: showConfigTab,
  })
  const expanded = showConfigTab && tab === 1
  const uiVersion = config.version

  useEffect(() => {
    if (!open) return
    let active = true
    setStatus('checking')
    setServerVersion('')
    subsonic
      .ping()
      .then((resp) => resp.json['subsonic-response'])
      .then((data) => {
        if (!active) return
        if (data.status !== 'ok') throw new Error('Server unavailable')
        setServerVersion(data.serverVersion || config.version)
        setStatus('online')
      })
      .catch(() => {
        if (active) setStatus('offline')
      })
    return () => {
      active = false
    }
  }, [open])

  return (
    <Dialog
      onClose={onClose}
      aria-labelledby="about-dialog-title"
      open={open}
      fullWidth={true}
      maxWidth={expanded ? 'lg' : 'sm'}
      className={classes.expandableDialog}
    >
      <DialogTitle id="about-dialog-title" onClose={onClose}>
        {text.title}
      </DialogTitle>
      <DialogContent dividers>
        <TabContent
          tab={tab}
          setTab={setTab}
          showConfigTab={showConfigTab}
          uiVersion={uiVersion}
          serverVersion={serverVersion}
          status={status}
          permissions={permissions}
          configData={configData}
        />
      </DialogContent>
    </Dialog>
  )
}

AboutDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
}

export { AboutDialog, LinkToVersion }
