import path from 'node:path'
import {
	getApps,
	isProblemApp,
	setPlayground,
} from '@epic-web/workshop-utils/apps.server'
import { warm } from 'epicshop/warm'
import fsExtra from 'fs-extra'

await warm()
