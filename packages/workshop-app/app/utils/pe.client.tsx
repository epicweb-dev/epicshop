'use client'

import { useLocation } from 'react-router'
import { ServerOnly } from 'remix-utils/server-only'
import { PE_REDIRECT_INPUT_NAME } from '#app/utils/pe-constants.ts'

export function usePERedirectInput() {
	const location = useLocation()
	return (
		<ServerOnly>
			{() => (
				<input
					type="hidden"
					name={PE_REDIRECT_INPUT_NAME}
					value={location.pathname}
				/>
			)}
		</ServerOnly>
	)
}
