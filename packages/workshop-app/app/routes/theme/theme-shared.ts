import { z } from 'zod'

export const ROUTE_PATH = '/theme'

export const ThemeFormSchema = z.object({
	theme: z.enum(['system', 'light', 'dark']),
})
