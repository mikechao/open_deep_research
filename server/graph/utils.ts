import type { TavilySearchResponse } from '@tavily/core'
import type { Section } from './state'
import process from 'node:process'
import { tavily } from '@tavily/core'
import { consola } from 'consola'
import { SearchAPI } from './configuration'

export function getSearchParams(searchAPI: SearchAPI, searchAPIConfig: Record<string, any>) {
  // Define accepted parameters for each search API
  const SEARCH_API_PARAMS: Record<SearchAPI, string[]> = {
    [SearchAPI.EXA]: ['max_characters', 'num_results', 'include_domains', 'exclude_domains', 'subpages'],
    [SearchAPI.TAVILY]: [], // Tavily currently accepts no additional parameters
    [SearchAPI.PERPLEXITY]: [], // Perplexity accepts no additional parameters
    [SearchAPI.ARXIV]: ['load_max_docs', 'get_full_documents', 'load_all_available_meta'],
    [SearchAPI.PUBMED]: ['top_k_results', 'email', 'api_key', 'doc_content_chars_max'],
    [SearchAPI.LINKUP]: ['depth'],
    [SearchAPI.DUCKDUCKGO]: [],
    [SearchAPI.GOOGLESEARCH]: [],
  }

  const isEmpty = Object.keys(searchAPIConfig).length === 0
  if (isEmpty) {
    return {}
  }
  // Make sure searchAPI is a valid key in our params object
  if (!(searchAPI in SEARCH_API_PARAMS)) {
    return {} // Or handle invalid search API appropriately
  }

  const acceptedParams = SEARCH_API_PARAMS[searchAPI]
  const filteredConfig: Record<string, any> = {}
  Object.keys(searchAPIConfig).forEach((key) => {
    if (acceptedParams.includes(key)) {
      filteredConfig[key] = searchAPIConfig[key]
    }
  })
  return filteredConfig
}

export async function selectAndExecuteSearch(searchAPI: SearchAPI, queryList: string[], searchParams: Record<string, any>) {
  switch (searchAPI) {
    case SearchAPI.EXA: {
      consola.log('Executing EXA search with params:', searchParams)
      return executeExaSearch(queryList, searchParams)
    }
    case SearchAPI.TAVILY: {
      consola.debug(`Executing Tavily search with params: ${JSON.stringify(searchParams)} for queries: ${queryList}`)
      const searchResults = await executeTavilySearch(queryList, searchParams)
      const deduplicatedResults = deduplicateSources(searchResults)
      const formattedSources = formatSource(deduplicatedResults, true, 4000)
      return formattedSources
    }
    case SearchAPI.PERPLEXITY: {
      consola.log('Executing Perplexity search with params:', searchParams)
      return executePerplexitySearch(queryList, searchParams)
    }
    case SearchAPI.ARXIV: {
      consola.log('Executing ArXiv search with params:', searchParams)
      return executeArxivSearch(queryList, searchParams)
    }
    case SearchAPI.PUBMED: {
      consola.log('Executing PubMed search with params:', searchParams)
      return executePubmedSearch(queryList, searchParams)
    }
    case SearchAPI.LINKUP: {
      consola.log('Executing LinkUp search with params:', searchParams)
      return executeLinkupSearch(queryList, searchParams)
    }
    case SearchAPI.DUCKDUCKGO: {
      consola.log('Executing DuckDuckGo search with params:', searchParams)
      return executeDuckDuckGoSearch(queryList, searchParams)
    }
    case SearchAPI.GOOGLESEARCH: {
      consola.log('Executing Google search with params:', searchParams)
      return executeGoogleSearch(queryList, searchParams)
    }
    default: {
      console.error(`Unsupported search API: ${searchAPI}`)
      throw new Error(`Unsupported search API: ${searchAPI}`)
    }
  }
}

function executeExaSearch(queries: string[], params: Record<string, any>) {
  // Implement Exa search
  consola.error(`Exa search not implemented yet. Called with queries: ${queries} and params: ${params}`)
  throw new Error('Exa search not implemented yet.')
}

async function executeTavilySearch(queries: string[], _params: Record<string, any>): Promise<TavilySearchResponse[]> {
  try {
    const tavilyClient = tavily({
      apiKey: process.env.TAVILY_API_KEY,
    })
    const searchTasks: Promise<TavilySearchResponse>[] = []
    for (const query of queries) {
      searchTasks.push(tavilyClient.search(query, {
        maxResults: 5,
        includeRawContent: true,
        topic: 'general',
      }))
    }
    const searchResults = await Promise.all(searchTasks)
    return searchResults
  }
  catch (error) {
    consola.error('Error executing Tavily search:', error)
    return []
  }
}

function executePerplexitySearch(queries: string[], params: Record<string, any>) {
  consola.error(`Perplexity search not implemented yet. Called with queries: ${queries} and params: ${params}`)
  throw new Error('Perplexity search not implemented yet.')
}

function executeArxivSearch(queries: string[], params: Record<string, any>) {
  // Implement ArXiv search
  consola.error(`ArXiv search not implemented yet. Called with queries: ${queries} and params: ${params}`)
  throw new Error('ArXiv search not implemented yet.')
}

function executePubmedSearch(queries: string[], params: Record<string, any>) {
  // Implement PubMed search
  consola.error(`PubMed search not implemented yet. Called with queries: ${queries} and params: ${params}`)
  throw new Error('PubMed search not implemented yet.')
}

function executeLinkupSearch(queries: string[], params: Record<string, any>) {
  // Implement LinkUp search
  consola.error(`LinkUp search not implemented yet. Called with queries: ${queries} and params: ${params}`)
  throw new Error('LinkUp search not implemented yet.')
}

function executeDuckDuckGoSearch(queries: string[], params: Record<string, any>) {
  // Implement DuckDuckGo search
  consola.error(`DuckDuckGo search not implemented yet. Called with queries: ${queries} and params: ${params}`)
  throw new Error('DuckDuckGo search not implemented yet.')
}

function executeGoogleSearch(queries: string[], params: Record<string, any>) {
  // Implement Google search
  consola.error(`Google search not implemented yet. Called with queries: ${queries} and params: ${params}`)
  throw new Error('Google search not implemented yet.')
}

/**
 * Not export in @tavily/core
 */
interface TavilySearchResult {
  title: string
  url: string
  content: string
  rawContent?: string
  score: number
  publishedDate: string
}

function deduplicateSources(searchResponses: TavilySearchResponse[]) {
  const sourceList = []
  for (const response of searchResponses) {
    if (response.results && response.results.length > 0) {
      sourceList.push(...response.results)
    }
  }
  const uniqueURLS = new Set()
  const uniqueSources = []
  for (const source of sourceList) {
    if (!uniqueURLS.has(source.url)) {
      uniqueURLS.add(source.url)
      uniqueSources.push(source)
    }
  }
  return uniqueSources
}

function formatSource(sourceList: TavilySearchResult[], includeRawContent: boolean = true, maxTokensPerSource: number = 1000) {
  let formattedText = 'Sources:\n\n'
  for (const source of sourceList) {
    formattedText += `Source ${source.title}:\n===\n`
    formattedText += `URL: ${source.url}\n===\n`
    formattedText += `Most relevant content from source: ${source.content}\n===\n`
    if (includeRawContent) {
      // Using rough estimate of 4 characters per token
      const charLimit = maxTokensPerSource * 4
      let rawContent = source.rawContent || ''
      if (rawContent.length > charLimit) {
        rawContent = `${rawContent.slice(0, charLimit)}...[truncated]`
      }
      formattedText += `Full source content limited to ${maxTokensPerSource} tokens: ${rawContent}\n\n`
    }
  }
  return formattedText
}

export function formatSections(sections: Section[]) {
  const formattedStr = sections.map((section, index) =>
    `${'='.repeat(60)}\n`
    + `Section ${index + 1}: ${section.name}\n`
    + `${'='.repeat(60)}\n`
    + `Description:\n${section.description}\n`
    + `Requires Research:\n${section.research}\n\n`
    + `Content:\n${section.content}\n`,
  ).join('\n')
  return formattedStr
}
