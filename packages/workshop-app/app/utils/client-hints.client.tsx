'use client'

import {
	subscribeToSchemeChange,
} from '@epic-web/client-hints/color-scheme'
import {
	subscribeToMotionChange,
} from '@epic-web/client-hints/reduced-motion'
import * as React from 'react'
import { useRevalidator } from 'react-router'
import {
	hintsUtils,
	motionCookieName,
	themeCookieName,
} from './client-hints.tsx'
import { useRequestInfo } from './root-loader.ts'

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
export function ClientHintCheck() {
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
			dangerouslySetInnerHTML={{
				__html: hintsUtils.getClientHintCheckScript(),
			}}
		/>
	)
}
