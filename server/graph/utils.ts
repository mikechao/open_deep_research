import { SearchAPI } from "./configuration";

export function getSearchParams(searchAPI: SearchAPI, searchAPIConfig: Record<string, any>) {
  // Define accepted parameters for each search API
  const SEARCH_API_PARAMS: Record<SearchAPI, string[]> = {
      [SearchAPI.EXA]: ["max_characters", "num_results", "include_domains", "exclude_domains", "subpages"],
      [SearchAPI.TAVILY]: [],  // Tavily currently accepts no additional parameters
      [SearchAPI.PERPLEXITY]: [],  // Perplexity accepts no additional parameters
      [SearchAPI.ARXIV]: ["load_max_docs", "get_full_documents", "load_all_available_meta"],
      [SearchAPI.PUBMED]: ["top_k_results", "email", "api_key", "doc_content_chars_max"],
      [SearchAPI.LINKUP]: ["depth"],
      [SearchAPI.DUCKDUCKGO]: [],
      [SearchAPI.GOOGLESEARCH]: [],
  }

  const isEmpty = Object.keys(searchAPIConfig).length === 0
  if (isEmpty) {
    return {}
  }
  // Make sure searchAPI is a valid key in our params object
  if (!(searchAPI in SEARCH_API_PARAMS)) {
    return {}; // Or handle invalid search API appropriately
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