import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { init as initKeyboardShortcuts } from './utils/keyboard-shortcuts.client'
import { init as initMonitoring } from './utils/monitoring.client'
import { init as initTips } from './routes/resources+/tip.tsx'

initKeyboardShortcuts()
initMonitoring()
initTips()
hydrateRoot(document, <HydratedRouter />)
