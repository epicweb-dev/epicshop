import dayjs from 'dayjs'
import relativeTimePlugin from 'dayjs/plugin/relativeTime.js'
import timeZonePlugin from 'dayjs/plugin/timezone.js'
import utcPlugin from 'dayjs/plugin/utc.js'

dayjs.extend(utcPlugin)
dayjs.extend(timeZonePlugin)
dayjs.extend(relativeTimePlugin)

export { dayjs }
