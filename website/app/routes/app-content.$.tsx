import { trace } from '@opentelemetry/api'
import { data, type HeadersFunction } from 'react-router'
import { CACHE_CONTROL } from '~/lib/http.server'
import { getPage } from '../lib/mdx.server'
import type { Route } from './+types/app-content.$'

export async function loader({ params, request, context }: Route.LoaderArgs) {
    const contentSlug = params['*']
    if (!contentSlug) {
        throw new Error('Expected contentSlug param')
    }

    const requestUrl = new URL(request.url)
    if (requestUrl.pathname.startsWith('/static')) {
        throw new Response('Not Found', { status: 404, statusText: 'Not Found' })
    }

    const post = await getPage(contentSlug, 'page')
    if (!post) {
        throw new Response('Not Found', { status: 404, statusText: 'Not Found' })
    }
    if (post.frontmatter.draft) {
        throw new Response('Not Found', { status: 404, statusText: 'Not Found' })
    }
    if (!post.frontmatter.title) {
        trace.getActiveSpan()?.recordException(new Error(`Missing title in frontmatter for ${contentSlug}`))
        throw new Response('Not Found', { status: 404, statusText: 'Not Found' })
    }

    return data(
        {
            frontmatter: post.frontmatter,
            post: post.code,
            conferenceState: context.conferenceState,
        },
        {
            headers: {
                'Cache-Control': CACHE_CONTROL.doc,
                'Access-Control-Allow-Origin': '*',
            },
        },
    )
}

export const headers: HeadersFunction = ({ loaderHeaders }) => {
    // Inherit the caching headers from the loader so we don't cache 404s
    return loaderHeaders
}
