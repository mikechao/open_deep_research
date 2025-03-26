import type { z } from 'zod'
import type { SearchQueryOutput, SectionOutput } from './structuredOutputs'
import { Annotation } from '@langchain/langgraph'

export type Section = z.infer<typeof SectionOutput>
export type SearchQuery = z.infer<typeof SearchQueryOutput>

export const ReportState = Annotation.Root({
  /**
   * Report topic
   */
  topic: Annotation<string>(),
  /**
   * Feedback on the report plan
   */
  feedbackOnReportPlan: Annotation<string>(),
  /**
   * List of report sections
   */
  sections: Annotation<Section[]>(),

  completedSections: Annotation<Section[]>(),

  reportSectionsFromResearch: Annotation<string>(),

  finalReport: Annotation<string>(),
})

export const SectionState = Annotation.Root({
  /**
   * Report topic
   */
  topic: Annotation<string>(),
  /**
   * Report Section
   */
  section: Annotation<Section>(),
  /**
   * Number of search iterations done
   */
  search_iterations: Annotation<number>(),
  /**
   * List of search queries
   */
  search_queries: Annotation<SearchQuery[]>(),
  /**
   * String of formatted source content from web search
   */
  source_str: Annotation<string>(),
  /**
   * String of any completed sections from research to write final sections
   */
  report_sections_from_research: Annotation<string>(),
  /**
   * Final key we duplicate in outer state for Send() API
   */
  completed_sections: Annotation<Section[]>(),
  /**
   * The model provider for the writer
   */
  writer_provider: Annotation<string>(),
  /**
   * The model name for the writer
   */
  writer_model: Annotation<string>(),
})

export const SectionOutputState = Annotation.Root({
  /**
   * Final key we duplicate in outer state for Send() API
   */
  completed_sections: Annotation<Section[]>(),
})
