import path from 'node:path'

import {
  FOOTER_FILENAME,
  SECTION_FILENAME,
  createBackupDirectory,
  getShopAndMainTheme,
  getThemeFiles,
  loadAuthToken,
  writeBackupFiles,
  writeBackupMetadata,
} from './shopify-common.mjs'

const token = loadAuthToken()
const { destinationUrl, mainTheme } = await getShopAndMainTheme(token)
const files = await getThemeFiles(token, mainTheme.id, [SECTION_FILENAME, FOOTER_FILENAME])

const backupDirectory = createBackupDirectory('coach-login')
writeBackupFiles(backupDirectory, files)

const availableFiles = Object.entries(files)
  .filter(([, content]) => typeof content === 'string')
  .map(([filename, content]) => ({
    filename,
    bytes: Buffer.byteLength(content, 'utf8'),
  }))
const missingFiles = Object.entries(files)
  .filter(([, content]) => typeof content !== 'string')
  .map(([filename]) => filename)

if (!availableFiles.length) {
  throw new Error('No live Shopify theme files were returned for backup')
}

const summary = {
  createdAt: new Date().toISOString(),
  destinationUrl,
  theme: mainTheme,
  backupDirectory,
  availableFiles,
  missingFiles,
}

writeBackupMetadata(backupDirectory, summary)

console.log(
  JSON.stringify(
    {
      ...summary,
      backupDirectoryRelativeToRepo: path.relative(process.cwd(), backupDirectory),
    },
    null,
    2
  )
)
