import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { init as initMonitoring, setupRequestCorrelation } from './utils/monitoring.client'

initMonitoring()
setupRequestCorrelation()

hydrateRoot(document, <HydratedRouter />)
