import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { init as initMonitoring } from './utils/monitoring.client'

initMonitoring()

hydrateRoot(document, <HydratedRouter />)
