import type { RunnableConfig } from '@langchain/core/runnables'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { PromptTemplate } from '@langchain/core/prompts'
import { Command, END, START, StateGraph } from '@langchain/langgraph'
import consola from 'consola'
import { initChatModel } from 'langchain/chat_models/universal'
import { ensureDeepResearchConfiguration } from '../configuration'
import { query_writer_instructions, section_grader_instructions, section_writer_inputs, section_writer_instructions } from '../prompts'
import { SectionOutputState, SectionState } from '../state'
import { FeedbackOutput, QueriesOutput } from '../structuredOutputs'
import { getSearchParams, selectAndExecuteSearch } from '../utils'

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
  consola.debug({ tag: 'generateQueries', message: `${new Date().toISOString()} Generating queries for section: ${section.name}` })
  const configurable = ensureDeepResearchConfiguration(config)
  const numberOfQueries = configurable.number_of_queries

  // Generate Queries
  const writerProvider = state.writer_provider
  const writerModelName = state.writer_model
  const writerModel = await initChatModel(writerModelName, { modelProvider: writerProvider })
  const structuredLLM = writerModel.withStructuredOutput(QueriesOutput)

  // format the system instructions
  const systemContent = await PromptTemplate.fromTemplate(query_writer_instructions).format({
    topic,
    section_topic: section.description,
    number_of_queries: numberOfQueries,
  })

  const sLLMWithRetry = structuredLLM.withRetry({
    stopAfterAttempt: 2,
  })
  // generate queries
  const result = await sLLMWithRetry.invoke([
    new SystemMessage(systemContent),
    new HumanMessage('Generate search queries on the provided topic.'),
  ])
  return { search_queries: result.queries }
}

/**
 * Execute web searches for the section queries.
 *
 *This node:
    1. Takes the generated queries
    2. Executes searches using configured search API
    3. Formats results into usable context
 * @param state Current state with search queries
 * @param config Search API configuration
 */
async function searchWeb(state: typeof SectionState.State, config: RunnableConfig) {
  const searchQueries = state.search_queries
  consola.debug({ tag: 'searchWeb', message: `${new Date().toISOString()} Searching the web for section queries` })
  const configurable = ensureDeepResearchConfiguration(config)
  const searchAPI = configurable.search_api
  const searchAPIConfig = configurable.search_api_config
  const searchParamsToPass = getSearchParams(searchAPI, searchAPIConfig)

  const queryList = []
  for (const query of searchQueries) {
    queryList.push(query.searchQuery)
  }
  const sourceStr = await selectAndExecuteSearch(searchAPI, queryList, searchParamsToPass)

  const search_iterations = state.search_iterations + 1
  return { source_str: sourceStr, search_iterations }
}

/**
 * Write a section of the report and evaluate if more research is needed.
 * This node:
    1. Writes section content using search results
    2. Evaluates the quality of the section
    3. Either:
       - Completes the section if quality passes
       - Triggers more research if quality fails
 * @param state Current state with search results and section info
 * @param config Configuration for writing and evaluation
 */
async function writeSection(state: typeof SectionState.State, config: RunnableConfig) {
  const topic = state.topic
  const section = state.section
  consola.debug({ tag: 'writeSection', message: `${section.name}` })
  const sourceStr = state.source_str

  // format system instructions
  const sectionWriterInputsFormatted = await PromptTemplate.fromTemplate(section_writer_inputs).format({
    topic,
    section_name: section.name,
    section_topic: section.description,
    context: sourceStr,
    section_content: section.content,
  })

  const configurable = ensureDeepResearchConfiguration(config)
  // generate section
  const writerProvider = state.writer_provider
  const writerModelName = state.writer_model
  const writerModel = await initChatModel(writerModelName, { modelProvider: writerProvider })

  const sectionContent = await writerModel.invoke([
    new SystemMessage(section_writer_instructions),
    new HumanMessage(sectionWriterInputsFormatted),
  ])
  // Write content to the section object
  // not sure it is section.content or sectionContent.text
  section.content = sectionContent.text

  // grade the section
  // grade prompt
  const sectionGraderMessage = `Grade the report and consider follow-up questions for missing information. 
If the grade is 'pass', return empty strings for all follow-up queries. 
If the grade is 'fail', provide specific search queries to gather missing information.`

  const sectionGraderInstructionsFormatted = await PromptTemplate.fromTemplate(section_grader_instructions).format({
    topic,
    section_topic: section.description,
    section: section.content,
    number_of_follow_up_queries: configurable.number_of_queries,
  })

  const plannerProvider = configurable.planner_provider
  const plannerModel = configurable.planner_model
  let reflectionLLM
  if (plannerModel === 'claude-3-7-sonnet-latest') {
    reflectionLLM = await initChatModel(plannerModel, {
      modelProvider: plannerProvider,
      maxTokens: 20000,
      thinking: {
        type: 'enabled',
        budget_tokens: 16000,
      },
    })
  }
  else {
    reflectionLLM = await initChatModel(plannerModel, {
      modelProvider: plannerProvider,
    })
  }
  const structuredLLM = reflectionLLM.withStructuredOutput(FeedbackOutput)

  const feedback = await structuredLLM.invoke([
    new SystemMessage(sectionGraderInstructionsFormatted),
    new HumanMessage(sectionGraderMessage),
  ])
  consola.debug({ tag: 'writeSection', message: `Feedback: ${feedback.grade}` })
  // if the section is passing or max search depth is reached, publish the section to completed sections
  if (feedback.grade === 'pass' || state.search_iterations >= configurable.max_search_depth) {
    return new Command({
      goto: END,
      update: { completed_sections: section },
    })
  }
  else {
    return new Command({
      goto: 'searchWeb',
      update: { search_queries: feedback.followUpQueries, section },
    })
  }
}

const sectionBuilder = new StateGraph({
  input: SectionState,
  output: SectionOutputState,
})
  .addNode('generateQueries', generateQueries)
  .addNode('searchWeb', searchWeb)
  .addNode('writeSection', writeSection)

sectionBuilder.addEdge(START, 'generateQueries')
sectionBuilder.addEdge('generateQueries', 'searchWeb')
sectionBuilder.addEdge('searchWeb', 'writeSection')

export const graph = sectionBuilder.compile()
