/**
 * This file contains utilities for using client hints for user preference which
 * are needed by the server, but are only known by the browser.
 */
import { getHintUtils } from '@epic-web/client-hints'
import {
	clientHint as colorSchemeHint,
	subscribeToSchemeChange,
} from '@epic-web/client-hints/color-scheme'
import {
	clientHint as reducedMotionHint,
	subscribeToMotionChange,
} from '@epic-web/client-hints/reduced-motion'
import { clientHint as timeZoneHint } from '@epic-web/client-hints/time-zone'
import { useRevalidator } from '@remix-run/react'
import * as React from 'react'
import { useRequestInfo } from './request-info.ts'

const themeCookieName = 'KCDShop_CH-prefers-color-scheme'
const motionCookieName = 'KCDShop_CH-reduced-motion'
const hintsUtils = getHintUtils({
	theme: {
		...colorSchemeHint,
		cookieName: themeCookieName,
	},
	timeZone: {
		...timeZoneHint,
		cookieName: 'KCDShop_CH-time-zone',
	},
	reducedMotion: {
		...reducedMotionHint,
		cookieName: motionCookieName,
	},
	// add other hints here
})

export const { getHints } = hintsUtils

/**
 * @returns an object with the client hints and their values
 */
export function useHints() {
	const requestInfo = useRequestInfo()
	return requestInfo.hints
}

/**
 * @returns inline script element that checks for client hints and sets cookies
 * if they are not set then reloads the page if any cookie was set to an
 * inaccurate value.
 */
export function ClientHintCheck({ nonce }: { nonce: string }) {
	const { revalidate } = useRevalidator()
	React.useEffect(
		() => subscribeToSchemeChange(() => revalidate(), themeCookieName),
		[revalidate],
	)
	React.useEffect(
		() => subscribeToMotionChange(() => revalidate(), motionCookieName),
		[revalidate],
	)

	return (
		<script
			nonce={nonce}
			dangerouslySetInnerHTML={{
				__html: hintsUtils.getClientHintCheckScript(),
			}}
		/>
	)
}
