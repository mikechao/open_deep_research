import type { RunnableConfig } from '@langchain/core/runnables'
import { Annotation } from '@langchain/langgraph'

const DEFAULT_REPORT_STRUCTURE = `Use this structure to create a report on the user-provided topic:

1. Introduction (no research needed)
   - Brief overview of the topic area

2. Main Body Sections:
   - Each section should focus on a sub-topic of the user-provided topic
   
3. Conclusion
   - Aim for 1 structural element (either a list of table) that distills the main body sections 
   - Provide a concise summary of the report
`

export enum SearchAPI {
  PERPLEXITY = 'perplexity',
  TAVILY = 'tavily',
  EXA = 'exa',
  ARXIV = 'arxiv',
  PUBMED = 'pubmed',
  LINKUP = 'linkup',
  DUCKDUCKGO = 'duckduckgo',
  GOOGLESEARCH = 'googlesearch',
}

export const DeepResearchConfiguration = Annotation.Root({
  /**
   * Defaults to the default report structure
   */
  report_structure: Annotation<string>(),

  /**
   * Number of search queries to generate per iteration
   * Defaults to 2
   */
  number_of_queries: Annotation<number>(),

  /**
   * Maximum number of reflection + search iterations
   * Defaults to 2
   */
  max_search_depth: Annotation<number>(),

  /**
   * Defaults to Anthropic as provider
   */
  planner_provider: Annotation<string>(),

  /**
   * Defaults to claude-3-7-sonnet-latest
   */
  planner_model: Annotation<string>(),

  /**
   * Defaults to Anthropic as provider
   */
  writer_provider: Annotation<string>(),

  /**
   * Defaults to claude-3-5-sonnet-latest
   */
  writer_model: Annotation<string>(),

  /**
   * Default to TAVILY
   */
  search_api: Annotation<SearchAPI>(),

  search_api_config: Annotation<Record<string, any>>(),
})

export function ensureDeepResearchConfiguration(config: RunnableConfig): typeof DeepResearchConfiguration.State {
  const configurable = (config?.configurable || {}) as Partial<typeof DeepResearchConfiguration.State>
  return {
    report_structure: configurable.report_structure || DEFAULT_REPORT_STRUCTURE,
    number_of_queries: configurable.number_of_queries || 2,
    max_search_depth: configurable.max_search_depth || 2,
    planner_provider: configurable.planner_provider || 'anthropic',
    planner_model: configurable.planner_model || 'claude-3-7-sonnet-latest',
    writer_provider: configurable.writer_provider || 'anthropic',
    writer_model: configurable.writer_model || 'claude-3-5-sonnet-latest',
    search_api: configurable.search_api || SearchAPI.TAVILY,
    search_api_config: configurable.search_api_config || {},
  }
}
