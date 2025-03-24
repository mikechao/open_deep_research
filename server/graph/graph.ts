import { RunnableConfig } from "@langchain/core/runnables";
import { ReportState } from "./state";
import { ensureDeepResearchConfiguration } from "./configuration";
import { getSearchParams } from "./utils";
import { initChatModel } from 'langchain/chat_models/universal'

/**
 * Generate the initial report plan with sections.
    
    This node:
    1. Gets configuration for the report structure and search parameters
    2. Generates search queries to gather context for planning
    3. Performs web searches using those queries
    4. Uses an LLM to generate a structured plan with sections

 * @param state Current graph state containing the report topic
 * @param config Configuration for models, search APIs, etc.
 */
async function generateReportPlan(state: typeof ReportState.State, config: RunnableConfig) {
  const topic = state.topic
  const feedbackOnReportPlan = state.feedbackOnReportPlan

  const configurable = ensureDeepResearchConfiguration(config)
  const reportStructure = configurable.report_structure
  const numberOfQueries = configurable.number_of_queries
  const searchAPI = configurable.search_api
  const searchAPIConfig = configurable.search_api_config
  const searchParamsToPass = getSearchParams(searchAPI, searchAPIConfig)

  const writerProvider = configurable.writer_provider
  const writerModelName = configurable.writer_model
  const writerModel = await initChatModel(writerModelName, { modelProvider: writerProvider })
}