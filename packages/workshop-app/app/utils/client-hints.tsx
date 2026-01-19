/**
 * This file contains utilities for using client hints for user preference which
 * are needed by the server, but are only known by the browser.
 */
import { getHintUtils } from '@epic-web/client-hints'
import { clientHint as colorSchemeHint } from '@epic-web/client-hints/color-scheme'
import { clientHint as reducedMotionHint } from '@epic-web/client-hints/reduced-motion'
import { clientHint as timeZoneHint } from '@epic-web/client-hints/time-zone'

export const themeCookieName = 'EpicShop_CH-prefers-color-scheme'
export const motionCookieName = 'EpicShop_CH-reduced-motion'
export const hintsUtils = getHintUtils({
	theme: {
		...colorSchemeHint,
		cookieName: themeCookieName,
	},
	timeZone: {
		...timeZoneHint,
		cookieName: 'EpicShop_CH-time-zone',
	},
	reducedMotion: {
		...reducedMotionHint,
		cookieName: motionCookieName,
	},
	// add other hints here
})

export const { getHints } = hintsUtils
