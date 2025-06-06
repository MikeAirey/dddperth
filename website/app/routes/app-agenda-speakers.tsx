import type { HeadersFunction } from 'react-router'
import { data } from 'react-router'
import type { TypeOf } from 'zod'
import { conferenceConfig } from '~/config/conference-config'
import { getYearConfig } from '~/lib/get-year-config'
import { CACHE_CONTROL } from '~/lib/http.server'
import type { speakersSchema } from '~/lib/sessionize.server'
import { getConfSpeakers } from '~/lib/sessionize.server'
import type { Route } from './+types/app-agenda-speakers'

export async function loader({ context }: Route.LoaderArgs) {
    const { yearConfig } = getYearConfig(
        context.conferenceState.conference.year,
        context.conferenceState.conference,
        context.dateTimeProvider,
    )

    if (yearConfig.sessions?.kind === 'sessionize' && !yearConfig.sessions.sessionizeEndpoint) {
        throw new Response(JSON.stringify({ message: 'No sessionize endpoint for year' }), { status: 404 })
    }

    const speakers: TypeOf<typeof speakersSchema> =
        yearConfig.sessions?.kind === 'sessionize'
            ? await getConfSpeakers({
                  sessionizeEndpoint: yearConfig.sessions.sessionizeEndpoint,
                  confTimeZone: conferenceConfig.timezone,
              })
            : []

    return data(speakers, {
        headers: {
            'Cache-Control': CACHE_CONTROL.schedule,
            'Access-Control-Allow-Origin': '*',
        },
    })
}

export const headers: HeadersFunction = ({ loaderHeaders }) => {
    // Inherit the caching headers from the loader so we don't cache 404s
    return loaderHeaders
}
