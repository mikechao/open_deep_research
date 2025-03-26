import type { RunnableConfig } from '@langchain/core/runnables'
import type { SectionState } from './state'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { PromptTemplate } from '@langchain/core/prompts'
import { Command, END, interrupt, Send, START, StateGraph } from '@langchain/langgraph'
import { initChatModel } from 'langchain/chat_models/universal'
import { ensureDeepResearchConfiguration } from './configuration'
import { final_section_writer_instructions, report_planner_instructions, report_planner_query_writer_instructions } from './prompts'
import { graph as sectionGraph } from './section/graph'
import { ReportState } from './state'
import { QueriesOutput, SectionsOutput } from './structuredOutputs'
import { formatSections, getSearchParams, selectAndExecuteSearch } from './utils'
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
        const send = new Send('buildSectionWithWebResearch', {
          topic,
          section,
          search_iterations: 0,
          writer_provider: 'openai',
          writer_model: 'gpt-4o-mini',
        })
        sends.push(send)
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
 * Write sections that don't require research using completed sections as context.
 *
 * This node handles sections like conclusions or summaries that build on
 * the researched sections rather than requiring direct research.
 *
 * @param state Current state with completed sections as context
 * @param config Configuration for the writing model
 */
async function writeFinalSections(state: typeof SectionState.State, config: RunnableConfig) {
  const configurable = ensureDeepResearchConfiguration(config)

  const topic = state.topic
  const section = state.section
  const completedReportSections = state.report_sections_from_research

  const systemInstructions = await PromptTemplate.fromTemplate(final_section_writer_instructions).format({
    topic,
    section_name: section.name,
    section_topic: section.description,
    context: completedReportSections,
  })

  const writerProvider = configurable.writer_provider
  const writerModelName = configurable.writer_model
  const writerModel = await initChatModel(writerModelName, { modelProvider: writerProvider })

  const sectionContent = await writerModel.invoke([
    new SystemMessage(systemInstructions),
    new HumanMessage(`Generate a report section based on the provided sources.`),
  ])

  // not sure if sectionContent.content or sectionContent.text
  section.content = sectionContent.text

  return { completed_sections: section }
}

/**
 * Format completed sections as context for writing final sections
 *
 * This node takes all completed research sections and formats them into
    a single context string for writing summary sections.
 * @param state Current state with completed sections
 */
function gatherCompletedSections(state: typeof ReportState.State) {
  const completedSections = state.completedSections
  const completeReportSections = formatSections(completedSections)
  return { report_sections_from_research: completeReportSections }
}

/**
 * Compile all sections into the final report.
 *
 * This node:
    1. Gets all completed sections
    2. Orders them according to original plan
    3. Combines them into the final report
 * @param state
 */
function compileFinalReport(state: typeof ReportState.State) {
  const sections = state.sections
  const completedSections: Record<string, string> = {}
  for (const s of state.completedSections) {
    completedSections[s.name] = s.content
  }

  for (const section of sections) {
    if (completedSections[section.name]) {
      section.content = completedSections[section.name]
    }
  }

  const allSections = sections.map(s => s.content).join('\n\n')
  return { finalReport: allSections }
}

/**
 * Create parallel tasks for writing non-research sections.
 *
 * This edge function identifies sections that don't need research and
    creates parallel writing tasks for each one.
 * @param state
 */
function initiateFinalSectionWriting(state: typeof ReportState.State) {
  const topic = state.topic
  const sections = state.sections

  const sends: Send[] = []

  for (const s of sections) {
    if (!s.research) {
      sends.push(new Send('writeFinalSections', { topic, section: s, report_sections_from_research: state.reportSectionsFromResearch }))
    }
  }

  return new Command({
    goto: sends,
  })
}

const builder = new StateGraph(ReportState)
// Add nodes
  .addNode('generateReportPlan', generateReportPlan)
  .addNode('humanFeedback', humanFeedback, {
    ends: ['generateReportPlan', 'buildSectionWithWebResearch'],
  })
  .addNode('buildSectionWithWebResearch', sectionGraph)
  .addNode('gatherCompletedSections', gatherCompletedSections)
  .addNode('initiateFinalSectionWriting', initiateFinalSectionWriting, {
    ends: ['writeFinalSections'],
  })
  .addNode('writeFinalSections', writeFinalSections)
  .addNode('compileFinalReport', compileFinalReport)

// Add edges
builder.addEdge(START, 'generateReportPlan')
builder.addEdge('generateReportPlan', 'humanFeedback')
builder.addEdge('buildSectionWithWebResearch', 'gatherCompletedSections')
builder.addEdge('gatherCompletedSections', 'initiateFinalSectionWriting')
builder.addEdge('writeFinalSections', 'compileFinalReport')
builder.addEdge('compileFinalReport', END)

export const graphBuilder = builder

export const graph = builder.compile()
