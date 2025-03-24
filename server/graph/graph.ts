import { RunnableConfig } from "@langchain/core/runnables";
import { ReportState, Sections } from "./state";
import { ensureDeepResearchConfiguration } from "./configuration";
import { getSearchParams, selectAndExecuteSearch } from "./utils";
import { initChatModel } from 'langchain/chat_models/universal'
import { Queries } from "./state";
import { report_planner_query_writer_instructions, report_planner_instructions} from "./prompts"
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts'
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

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

  // Set writer model (model used for query writing)
  const writerProvider = configurable.writer_provider
  const writerModelName = configurable.writer_model
  const writerModel = await initChatModel(writerModelName, { modelProvider: writerProvider })
  const structuredLLM = writerModel.withStructuredOutput(Queries)

  const systemContent = await PromptTemplate.fromTemplate(report_planner_query_writer_instructions)
    .format({ topic, report_organization: reportStructure, number_of_queries: numberOfQueries })

  const results = await structuredLLM.invoke([
    new SystemMessage(systemContent),
    new HumanMessage("Generate search queries that will help with planning the sections of the report.")
  ])
  // web search
  const queryList = results.queries.map(q => q.searchQuery)

  // search the web with parameters
  const sourceStr = selectAndExecuteSearch(searchAPI, queryList, searchParamsToPass)

  // format the system instructions
  const systemInstructionSections = await PromptTemplate.fromTemplate(report_planner_instructions)
    .format({topic, report_organization: reportStructure, context: sourceStr, feedback: feedbackOnReportPlan})

  // Set the planner
  const plannerProvider = configurable.planner_provider
  const plannerModel = configurable.planner_model

  const plannerMessage = `Generate the sections of the report. Your response must include a 'sections' field containing a list of sections. 
                      Each section must have: name, description, plan, research, and content fields.`
  
  let plannerLLM
  if (plannerModel === 'claude-3-7-sonnet-latest') {
    plannerLLM = await initChatModel(plannerModel, { modelProvider: plannerProvider, maxTokens: 20000, thinking: {"type": "enabled", "budget_tokens": 16000} })
  } else {
    plannerLLM = await initChatModel(plannerModel, { modelProvider: plannerProvider })
  }
  const structuredPlannerLLM = plannerLLM.withStructuredOutput(Sections)
  const reportSections = await structuredPlannerLLM.invoke([
    new SystemMessage(systemInstructionSections),
    new HumanMessage(plannerMessage)
  ])

  const sections = reportSections.sections
  return { sections: sections}
}