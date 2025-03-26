import type { RunnableConfig } from '@langchain/core/runnables'
import type { SectionState } from './state'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { PromptTemplate } from '@langchain/core/prompts'
import { Command, END, interrupt, Send, START, StateGraph } from '@langchain/langgraph'
import { initChatModel } from 'langchain/chat_models/universal'
import { ensureDeepResearchConfiguration } from './configuration'
import { query_writer_instructions, report_planner_instructions, report_planner_query_writer_instructions } from './prompts'
import { ReportState } from './state'
import { QueriesOutput, SectionsOutput } from './structuredOutputs'
import { getSearchParams, selectAndExecuteSearch } from './utils'

/**
 * Generate the initial report plan with sections.
 * This node:
 * 1. Gets configuration for the report structure and search parameters
 * 2. Generates search queries to gather context for planning
 * 3. Performs web searches using those queries
 * 4. Uses an LLM to generate a structured plan with sections
 *
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
  const structuredLLM = writerModel.withStructuredOutput(QueriesOutput)

  const systemContent = await PromptTemplate.fromTemplate(report_planner_query_writer_instructions)
    .format({ topic, report_organization: reportStructure, number_of_queries: numberOfQueries })

  const results = await structuredLLM.invoke([
    new SystemMessage(systemContent),
    new HumanMessage('Generate search queries that will help with planning the sections of the report.'),
  ])
  // web search
  const queryList = results.queries.map(q => q.searchQuery)

  // search the web with parameters
  const sourceStr = await selectAndExecuteSearch(searchAPI, queryList, searchParamsToPass)

  // format the system instructions
  const systemInstructionSections = await PromptTemplate.fromTemplate(report_planner_instructions)
    .format({ topic, report_organization: reportStructure, context: sourceStr, feedback: feedbackOnReportPlan })

  // Set the planner
  const plannerProvider = configurable.planner_provider
  const plannerModel = configurable.planner_model

  const plannerMessage = `Generate the sections of the report. Your response must include a 'sections' field containing a list of sections. 
                      Each section must have: name, description, plan, research, and content fields.`

  let plannerLLM
  if (plannerModel === 'claude-3-7-sonnet-latest') {
    plannerLLM = await initChatModel(plannerModel, { modelProvider: plannerProvider, maxTokens: 20000, thinking: { type: 'enabled', budget_tokens: 16000 } })
  }
  else {
    plannerLLM = await initChatModel(plannerModel, { modelProvider: plannerProvider })
  }
  const structuredPlannerLLM = plannerLLM.withStructuredOutput(SectionsOutput)
  const reportSections = await structuredPlannerLLM.invoke([
    new SystemMessage(systemInstructionSections),
    new HumanMessage(plannerMessage),
  ])

  const sections = reportSections.sections
  return { sections }
}

/**
 * Get human feedback on the report plan and route to next steps.
 * This node:
    1. Formats the current report plan for human review
    2. Gets feedback via an interrupt
    3. Routes to either:
       - Section writing if plan is approved
       - Plan regeneration if feedback is provided
 * @param state Current graph state with sections to review
 * @param _config Configuration for the workflow
 */
function humanFeedback(state: typeof ReportState.State, _config: RunnableConfig) {
  const topic = state.topic
  const sections = state.sections
  const sectionsStr = sections.map(s =>
    `Section: ${s.name}\n
    Description: ${s.description}\n
    Research Needed: ${s.research ? 'Yes' : 'No'}\n`,
  ).join('\n')

  const interruptMessage = `Please provide feedback on the following report plan.\n
  \n${sectionsStr}\n
  Does the report plan meet your needs?\nPass 'true' to approve the report plan.\nOr, provide feedback to regenerate the report plan`

  const feedback = interrupt(interruptMessage)
  if (feedback.toLowerCase() === 'true') {
    const sends: Send[] = []
    for (const section of sections) {
      if (section.research) {
        sends.push(new Send('buildSectionWithWebResearch', { topic, section, search_iterations: 0 }))
      }
    }
    return new Command({
      goto: sends,
    })
  }
  else {
    return new Command({
      goto: 'generateReportPlan',
      update: { feedbackOnReportPlan: feedback },
    })
  }
}

/**
 * Generate search queries for researching a specific section.
 *
 * This node uses an LLM to generate targeted search queries based on the
 * section topic and description.
 * @param state Current state containing section details
 * @param config Configuration including number of queries to generate
 */
async function generateQueries(state: typeof SectionState.State, config: RunnableConfig) {
  const topic = state.topic
  const section = state.section

  const configurable = ensureDeepResearchConfiguration(config)
  const numberOfQueries = configurable.number_of_queries

  // Generate Queries
  const writerProvider = configurable.writer_provider
  const writerModelName = configurable.writer_model
  const writerModel = await initChatModel(writerModelName, { modelProvider: writerProvider })
  const structuredLLM = writerModel.withStructuredOutput(QueriesOutput)

  // format the system instructions
  const systemContent = await PromptTemplate.fromTemplate(query_writer_instructions).format({
    topic,
    section_topic: section.description,
    number_of_queries: numberOfQueries,
  })

  // generate queries
  const queries = await structuredLLM.invoke([
    new SystemMessage(systemContent),
    new HumanMessage('Generate search queries on the provided topic.'),
  ])
  return { search_queries: queries }
}

function buildSectionWithWebResearch(_state: typeof ReportState.State, _config: RunnableConfig) {
  // doing thing
  return {}
}

const builder = new StateGraph(ReportState)
// Add nodes
  .addNode('generateReportPlan', generateReportPlan)
  .addNode('humanFeedback', humanFeedback, {
    ends: ['generateReportPlan', 'buildSectionWithWebResearch'],
  })
  .addNode('buildSectionWithWebResearch', buildSectionWithWebResearch)

// Add edges
builder.addEdge(START, 'generateReportPlan')
builder.addEdge('generateReportPlan', 'humanFeedback')
builder.addEdge('buildSectionWithWebResearch', END)

export const graph = builder.compile()
